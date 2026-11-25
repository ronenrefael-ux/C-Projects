import assert from "node:assert/strict";
import test from "node:test";
import { requestUrlCheck } from "../lib/requestUrlCheck.ts";

test("does not make a lookup request without opt-in or without URLs", async () => {
  let requestCount = 0;
  const fetcher: typeof fetch = async () => {
    requestCount += 1;
    return Response.json({ results: [] });
  };

  assert.equal(await requestUrlCheck(["https://example.test/a"], false, fetcher), null);
  assert.equal(await requestUrlCheck([], true, fetcher), null);
  assert.equal(requestCount, 0);
});

test("sends only extracted URLs to the app lookup endpoint", async () => {
  const url = "https://example.test/path?ref=123";
  let sentPayload: unknown;
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "/api/check-domains");
    sentPayload = JSON.parse(String(init?.body));
    return Response.json({
      results: [{ url, status: "no_match" }],
    });
  };

  const result = await requestUrlCheck([url], true, fetcher);

  assert.deepEqual(sentPayload, { urls: [url] });
  assert.ok(result?.kind === "results");
  assert.equal(result.results.get(url), "no_match");
});

test("reports a failed URL lookup as unavailable", async () => {
  const result = await requestUrlCheck(
    ["https://example.test/failure"],
    true,
    async () => Response.json({ error: "provider_unavailable" }, { status: 502 }),
  );

  assert.equal(result?.kind, "unavailable");
  if (result?.kind === "unavailable") {
    assert.match(result.message, /אינו זמין/);
  }
});
