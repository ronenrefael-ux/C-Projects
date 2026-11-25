import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getLinkSafetyNotes,
  getOverallReputationStatus,
  getOverallVerdict,
} from "../lib/assessmentSummary.ts";
import { analyzeMessage } from "../lib/analyzeMessage.ts";

test("a known Google threat produces a high-risk verdict and says not to open", () => {
  const analysis = analyzeMessage(
    "עדכון לגבי הפגישה שלך זמין כאן https://example.test/notice",
  );
  const linkChecks = analysis.linkChecks.map((link) => ({
    ...link,
    reputationStatus: "listed" as const,
  }));
  const status = getOverallReputationStatus(linkChecks);
  const verdict = getOverallVerdict({ ...analysis, linkChecks }, status);

  assert.equal(status, "listed");
  assert.equal(verdict.tone, "high");
  assert.match(verdict.title, /HIGH RISK/i);
  assert.match(verdict.title, /אל תפתח/);
  assert.match(verdict.detail, /Google Safe Browsing/);
});

test("no-match never lowers a suspicious local assessment or calls it safe", () => {
  const analysis = analyzeMessage(
    "שלח את קוד האימות שלך עכשיו כדי למנוע חסימת חשבון https://example.test/x",
  );
  const linkChecks = analysis.linkChecks.map((link) => ({
    ...link,
    reputationStatus: "no_match" as const,
  }));
  const verdict = getOverallVerdict(
    { ...analysis, linkChecks },
    getOverallReputationStatus(linkChecks),
  );

  assert.equal(analysis.riskLevel, "high");
  assert.equal(verdict.tone, "high");
  assert.match(verdict.detail, /לא מצא איום מוכר/);
  assert.match(verdict.detail, /אינה הוכחה/);
  assert.doesNotMatch(verdict.title, /בטוח|safe/i);
});

test("not-checked statuses remain explicit when no URL or no lookup exists", async () => {
  assert.equal(getOverallReputationStatus([]), "not_checked");

  const analysis = analyzeMessage(
    "הודעה רגילה עם קישור https://example.test/info",
  );
  assert.equal(
    getOverallReputationStatus(analysis.linkChecks),
    "not_checked",
  );

  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /לא נבדק — לא זוהה קישור בהודעה/);
  assert.match(source, /לא נבדק — המשתמש לא בחר באפשרות הבדיקה/);
});

test("unavailable lookups produce an uncertain, non-safe overall verdict", () => {
  const analysis = analyzeMessage(
    "עדכון רגיל לגבי הפגישה שנקבעה ליום שלישי בשעה עשר.",
  );
  const linkChecks = [
    {
      url: "https://example.test/info",
      domain: "example.test",
      matchesLocalList: false,
      isWhatsAppChat: false,
      reputationStatus: "unavailable" as const,
    },
  ];
  const status = getOverallReputationStatus(linkChecks);
  const verdict = getOverallVerdict({ ...analysis, linkChecks }, status);

  assert.equal(status, "unavailable");
  assert.equal(verdict.tone, "uncertain");
  assert.match(verdict.detail, /לא זמינה/);
  assert.doesNotMatch(verdict.title, /נמוך|בטוח|safe/i);
});

test("a threat overrides ordinary-looking text without changing text analysis", async () => {
  const message =
    "תזכורת: הפגישה שלנו נקבעה ליום שלישי בשעה עשר https://example.test/info";
  const analysis = analyzeMessage(message);
  const originalRisk = analysis.riskLevel;
  const linkChecks = analysis.linkChecks.map((link) => ({
    ...link,
    reputationStatus: "listed" as const,
  }));
  const verdict = getOverallVerdict(
    { ...analysis, linkChecks },
    getOverallReputationStatus(linkChecks),
  );
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(originalRisk, "low");
  assert.equal(analysis.riskLevel, originalRisk);
  assert.equal(verdict.tone, "high");
  assert.match(source, /Message text analysis only\./);
  assert.match(source, /תוצאת Google Safe Browsing/);
  assert.doesNotMatch(source, /risk-pill-low/);
});

test("wa.me advice describes the chat and does not vouch for its recipient", () => {
  const result = analyzeMessage(
    "פרטים נוספים https://wa.me/972541234567?text=hello",
  );
  const notes = getLinkSafetyNotes(result.linkChecks[0]);

  assert.equal(result.linkChecks[0].isWhatsAppChat, true);
  assert.match(notes.join(" "), /פותח צ'אט WhatsApp עם מספר טלפון/);
  assert.match(notes.join(" "), /אינה מאמתת/);
  assert.match(notes.join(" "), /אמין/);
});

test("shortened links have an unknown destination and analysis does not fetch them", () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("Analyzer must not fetch links");
  };

  try {
    const result = analyzeMessage(
      "פתחו את הקישור לפרטים https://bit.ly/abc123",
    );
    const notes = getLinkSafetyNotes(result.linkChecks[0]);

    assert.ok(
      result.warningSigns.some((sign) => sign.code === "shortened_link"),
    );
    assert.match(notes.join(" "), /קישור מקוצר/);
    assert.match(notes.join(" "), /יעדו הסופי לא הוערך/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
