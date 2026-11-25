import type { ReputationStatus } from "./analyzeMessage.ts";

type UrlLookupStatus = Extract<
  ReputationStatus,
  "listed" | "no_match" | "unavailable"
>;

type UrlLookupResult =
  | { kind: "results"; results: Map<string, UrlLookupStatus> }
  | { kind: "unavailable"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResults(
  value: unknown,
  requestedUrls: string[],
): Map<string, UrlLookupStatus> | null {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return null;
  }

  const parsed = new Map<string, UrlLookupStatus>();

  for (const result of value.results) {
    if (
      !isRecord(result) ||
      typeof result.url !== "string" ||
      (result.status !== "listed" &&
        result.status !== "no_match" &&
        result.status !== "unavailable") ||
      !requestedUrls.includes(result.url)
    ) {
      return null;
    }

    parsed.set(result.url, result.status);
  }

  return requestedUrls.every((url) => parsed.has(url)) ? parsed : null;
}

export async function requestUrlCheck(
  urls: string[],
  allowExternalLookup: boolean,
  fetcher: typeof fetch = fetch,
): Promise<UrlLookupResult | null> {
  if (!allowExternalLookup || urls.length === 0) {
    return null;
  }

  let response: Response;
  try {
    response = await fetcher("/api/check-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ urls }),
    });
  } catch {
    return {
      kind: "unavailable",
      message: "לא ניתן להתחבר לשירות בדיקת הדומיינים. מוצגת הערכה מקומית בלבד.",
    };
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return {
      kind: "unavailable",
      message:
        "שירות בדיקת הדומיינים החזיר תשובה לא תקינה. מוצגת הערכה מקומית בלבד.",
    };
  }

  if (!response.ok) {
    const isProviderNotConfigured =
      isRecord(responseBody) &&
      responseBody.error === "provider_not_configured";
    return {
      kind: "unavailable",
      message: isProviderNotConfigured
        ? "מפתח Google Safe Browsing לא הוגדר בשרת. מוצגת הערכה מקומית בלבד."
        : "שירות בדיקת הדומיינים אינו זמין כרגע. מוצגת הערכה מקומית בלבד.",
    };
  }

  const results = parseResults(responseBody, urls);
  if (!results) {
    return {
      kind: "unavailable",
      message:
        "שירות בדיקת הדומיינים החזיר תוצאה לא תקינה. מוצגת הערכה מקומית בלבד.",
    };
  }

  return { kind: "results", results };
}
