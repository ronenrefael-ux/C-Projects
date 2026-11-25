import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/check-domains/route.ts";

test("sends complete URLs to v5 and distinguishes threat and no-match results", async () => {
  const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const originalFetch = globalThis.fetch;
  const submittedUrls: string[] = [];

  process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    const requestUrl = new URL(String(input));
    const submittedUrl = requestUrl.searchParams.get("urls");
    assert.ok(submittedUrl);
    submittedUrls.push(submittedUrl);

    assert.equal(requestUrl.pathname, "/v5/urls:search");
    assert.equal(requestUrl.hostname, "safebrowsing.googleapis.com");
    assert.equal(requestUrl.searchParams.has("key"), false);
    assert.equal(init?.method, "GET");
    assert.equal(
      init?.headers && new Headers(init.headers).get("X-Goog-Api-Key"),
      "test-key",
    );
    assert.equal(init?.body, undefined);

    return Response.json(
      submittedUrl.startsWith("https://bad.example/")
        ? {
            threats: [
              {
                url: submittedUrl,
                threatTypes: ["SOCIAL_ENGINEERING"],
              },
            ],
          }
        : { threats: [] },
    );
  };

  try {
    const response = await POST(
      new Request("http://localhost/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [
            "https://good.example/order?id=12",
            "https://bad.example/promo?campaign=7",
          ],
        }),
      }),
    );

    assert.deepEqual(submittedUrls.sort(), [
      "https://bad.example/promo?campaign=7",
      "https://good.example/order?id=12",
    ]);
    assert.deepEqual(await response.json(), {
      results: [
        { url: "https://good.example/order?id=12", status: "no_match" },
        {
          url: "https://bad.example/promo?campaign=7",
          status: "listed",
        },
      ],
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    } else {
      process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
    }
  }
});

test("parses a v5 protobuf threat response", async () => {
  const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const originalFetch = globalThis.fetch;
  const url = "https://bad.example/phishing";
  const encodedUrl = new TextEncoder().encode(url);
  const threatUrl = Uint8Array.from([
    0x0a,
    encodedUrl.length,
    ...encodedUrl,
    0x12,
    0x01,
    0x02,
  ]);
  const responseBytes = Uint8Array.from([
    0x0a,
    threatUrl.length,
    ...threatUrl,
  ]);

  process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(responseBytes, {
      headers: { "Content-Type": "application/x-protobuf" },
    });

  try {
    const response = await POST(
      new Request("http://localhost/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      }),
    );

    assert.deepEqual(await response.json(), {
      results: [{ url, status: "listed" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    } else {
      process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
    }
  }
});

test("reports provider lookup failures as unavailable instead of no-match", async () => {
  const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test-key";
  globalThis.fetch = async () => Response.json({}, { status: 503 });

  try {
    const response = await POST(
      new Request("http://localhost/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://example.com/account?id=12"] }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      results: [
        {
          url: "https://example.com/account?id=12",
          status: "unavailable",
        },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    } else {
      process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
    }
  }
});

test("keeps the API key server-side and does not log or forward message text", async () => {
  const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const apiKey = "mock-server-only-key";
  const url = "https://example.test/only-url?ref=123";
  const logCalls: unknown[][] = [];
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = apiKey;
  console.log = (...args) => logCalls.push(args);
  console.warn = (...args) => logCalls.push(args);
  console.error = (...args) => logCalls.push(args);
  globalThis.fetch = async (input, init) => {
    const requestUrl = new URL(String(input));
    assert.equal(requestUrl.searchParams.get("urls"), url);
    assert.equal(requestUrl.searchParams.has("message"), false);
    assert.equal(requestUrl.searchParams.has("key"), false);
    assert.equal(
      new Headers(init?.headers).get("X-Goog-Api-Key"),
      apiKey,
    );
    return Response.json({ threats: [] });
  };

  try {
    const response = await POST(
      new Request("http://localhost/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      }),
    );
    const responseText = await response.text();

    assert.equal(response.status, 200);
    assert.match(responseText, /no_match/);
    assert.ok(!responseText.includes(apiKey));
    assert.ok(!responseText.includes("private message text"));
    assert.deepEqual(logCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    } else {
      process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
    }
  }
});

test("rejects malformed or non-http URL entries", async () => {
  const response = await POST(
    new Request("http://localhost/api/check-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: ["javascript:alert(1)"],
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_urls" });
});

test("reports missing provider configuration instead of claiming no threats", async () => {
  const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("Provider must not be called without a configured key");
  };

  try {
    const response = await POST(
      new Request("http://localhost/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["https://example.com/account?id=12"] }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "provider_not_configured",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
    }
  }
});
