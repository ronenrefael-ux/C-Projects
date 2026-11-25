const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu;
const maxUrlsPerRequest = 10;
const maxUrlLength = 4096;

const responseHeaders = {
  "Cache-Control": "no-store",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, { status, headers: responseHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > maxUrlLength) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      hostnamePattern.test(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isUrlList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxUrlsPerRequest &&
    value.every(isHttpUrl)
  );
}

function isThreatUrl(value: unknown): value is {
  url: string;
  threatTypes: string[];
} {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    Array.isArray(value.threatTypes) &&
    value.threatTypes.every((threatType) => typeof threatType === "string")
  );
}

function readVarint(
  bytes: Uint8Array,
  offset: number,
): { value: number; nextOffset: number } {
  let value = 0;
  let shift = 0;

  while (offset < bytes.length && shift <= 49) {
    const byte = bytes[offset];
    offset += 1;
    value += (byte & 0x7f) * 2 ** shift;

    if (byte < 0x80) {
      return { value, nextOffset: offset };
    }

    shift += 7;
  }

  throw new Error("Invalid protobuf varint");
}

function readDelimited(
  bytes: Uint8Array,
  offset: number,
): { value: Uint8Array; nextOffset: number } {
  const length = readVarint(bytes, offset);
  const endOffset = length.nextOffset + length.value;

  if (endOffset > bytes.length) {
    throw new Error("Invalid protobuf length");
  }

  return {
    value: bytes.subarray(length.nextOffset, endOffset),
    nextOffset: endOffset,
  };
}

function skipProtobufField(
  bytes: Uint8Array,
  offset: number,
  wireType: number,
): number {
  if (wireType === 0) {
    return readVarint(bytes, offset).nextOffset;
  }
  if (wireType === 1) {
    if (offset + 8 > bytes.length) {
      throw new Error("Invalid protobuf field");
    }
    return offset + 8;
  }
  if (wireType === 2) {
    return readDelimited(bytes, offset).nextOffset;
  }
  if (wireType === 5) {
    if (offset + 4 > bytes.length) {
      throw new Error("Invalid protobuf field");
    }
    return offset + 4;
  }

  throw new Error("Unsupported protobuf wire type");
}

function parseThreatUrl(bytes: Uint8Array): {
  url: string;
  threatTypes: string[];
} {
  let offset = 0;
  let url: string | null = null;
  const threatTypes: string[] = [];

  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.nextOffset;
    const fieldNumber = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;

    if (fieldNumber === 1 && wireType === 2) {
      const field = readDelimited(bytes, offset);
      url = new TextDecoder().decode(field.value);
      offset = field.nextOffset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const field = readDelimited(bytes, offset);
      let packedOffset = 0;

      while (packedOffset < field.value.length) {
        const threatType = readVarint(field.value, packedOffset);
        threatTypes.push(String(threatType.value));
        packedOffset = threatType.nextOffset;
      }

      offset = field.nextOffset;
    } else if (fieldNumber === 2 && wireType === 0) {
      const threatType = readVarint(bytes, offset);
      threatTypes.push(String(threatType.value));
      offset = threatType.nextOffset;
    } else {
      offset = skipProtobufField(bytes, offset, wireType);
    }
  }

  if (!url || threatTypes.length === 0) {
    throw new Error("Invalid protobuf threat URL");
  }

  return { url, threatTypes };
}

function parseProtobufThreats(bytes: Uint8Array): {
  url: string;
  threatTypes: string[];
}[] {
  const threats: { url: string; threatTypes: string[] }[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.nextOffset;
    const fieldNumber = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;

    if (fieldNumber === 1 && wireType === 2) {
      const field = readDelimited(bytes, offset);
      threats.push(parseThreatUrl(field.value));
      offset = field.nextOffset;
    } else {
      offset = skipProtobufField(bytes, offset, wireType);
    }
  }

  return threats;
}

async function readThreats(
  response: Response,
): Promise<{ url: string; threatTypes: string[] }[] | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase();

  if (contentType?.includes("json")) {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      return null;
    }

    if (
      !isRecord(body) ||
      ("threats" in body && !Array.isArray(body.threats))
    ) {
      return null;
    }

    const threats = Array.isArray(body.threats) ? body.threats : [];
    return threats.every(isThreatUrl) ? threats : null;
  }

  if (contentType?.includes("protobuf")) {
    try {
      return parseProtobufThreats(
        new Uint8Array(await response.arrayBuffer()),
      );
    } catch {
      return null;
    }
  }

  return null;
}

async function checkUrl(
  url: string,
  apiKey: string,
): Promise<"listed" | "no_match" | "unavailable"> {
  const endpoint = new URL(
    "https://safebrowsing.googleapis.com/v5/urls:search",
  );
  endpoint.searchParams.append("urls", url);

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { "X-Goog-Api-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return "unavailable";
  }

  if (!response.ok) {
    return "unavailable";
  }

  const threats = await readThreats(response);

  if (!threats) {
    return "unavailable";
  }

  return threats.length > 0 ? "listed" : "no_match";
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (
    !isRecord(body) ||
    !isUrlList(body.urls)
  ) {
    return jsonResponse({ error: "invalid_urls" }, 400);
  }

  const urls = Array.from(new Set(body.urls.map((url) => new URL(url).href)));
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

  if (!apiKey) {
    return jsonResponse({ error: "provider_not_configured" }, 503);
  }

  const statuses = await Promise.all(
    urls.map((url) => checkUrl(url, apiKey)),
  );

  return jsonResponse({
    results: urls.map((url, index) => ({
      url,
      status: statuses[index],
    })),
  });
}
