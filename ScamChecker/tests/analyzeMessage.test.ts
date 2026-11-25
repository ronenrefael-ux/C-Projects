import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMessage } from "../lib/analyzeMessage.ts";

test("reports insufficient information for a short message", () => {
  const result = analyzeMessage("היי");

  assert.equal(result.hasEnoughInformation, false);
  assert.equal(result.riskLevel, null);
  assert.match(result.explanation ?? "", /קצר מדי/);
  assert.ok(result.nextSteps.length > 0);
});

test("identifies a request for a verification code as high risk", () => {
  const result = analyzeMessage(
    "שלח את קוד האימות שלך עכשיו כדי למנוע חסימת חשבון",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.equal(result.riskLevel, "high");
  assert.ok(result.warningSigns.some((sign) => sign.code === "sensitive_request"));
  assert.ok(result.nextSteps.some((step) => step.includes("אל תמסור")));
});

test("reports a link without checking or opening it", () => {
  const result = analyzeMessage(
    "הודעה חשובה, לפרטים נוספים בקרו בקישור https://example.invalid",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.ok(result.warningSigns.some((sign) => sign.code === "link"));
  assert.ok(
    result.warningSigns
      .find((sign) => sign.code === "link")
      ?.explanation.includes("לא פתחה"),
  );
});

test("identifies urgency as a warning sign", () => {
  const result = analyzeMessage(
    "פעלו תוך 10 דקות כדי למנוע חסימת החשבון שלכם באופן מיידי.",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.equal(result.riskLevel, "medium");
  assert.ok(result.warningSigns.some((sign) => sign.code === "urgency"));
});

test("a password or one-time-code request with urgency is high risk", () => {
  const result = analyzeMessage(
    "שלח את קוד האימות שלך עכשיו כדי למנוע חסימת חשבון",
  );

  assert.equal(result.riskLevel, "high");
  assert.ok(
    result.warningSigns.some((sign) => sign.code === "sensitive_request"),
  );
  assert.ok(result.warningSigns.some((sign) => sign.code === "urgency"));
  assert.ok(result.nextSteps.some((step) => /לעולם אל תמסור/.test(step)));
});

test("combined job offer, unusual earnings, upfront fee, and urgency are high risk", () => {
  const result = analyzeMessage(
    "הצעת עבודה מהבית: הרוויחו 9000₪ ביום! דמי הרשמה 50₪ — רק היום.",
  );
  const codes = result.warningSigns.map((sign) => sign.code);

  assert.equal(result.riskLevel, "high");
  assert.ok(codes.includes("job_task_offer"));
  assert.ok(codes.includes("unusual_earnings"));
  assert.ok(codes.includes("upfront_payment"));
  assert.ok(codes.includes("urgency"));
  assert.ok(
    result.warningSigns.some((sign) =>
      /הצעת עבודה/.test(sign.title + sign.explanation),
    ),
  );
  assert.ok(
    result.warningSigns.some((sign) =>
      /רווחים או הכנסה חריגים/.test(sign.title + sign.explanation),
    ),
  );
  assert.ok(result.nextSteps.some((step) => /אל תשלם עמלה/.test(step)));
  assert.ok(result.nextSteps.some((step) => /אל תפעל תחת לחץ/.test(step)));
});

test("an ordinary interview invitation is not suspicious just for mentioning a job", () => {
  const result = analyzeMessage(
    "בהמשך לשיחתנו נשמח להזמין אותך לראיון לתפקיד מנתח נתונים ביום שלישי בשעה עשר.",
  );

  assert.equal(result.riskLevel, "low");
  assert.equal(result.warningSigns.length, 0);
});

test("an ordinary payment confirmation is not suspicious just for mentioning payment", () => {
  const result = analyzeMessage(
    "אישור: התשלום בסך 40.00 דולר התקבל בהצלחה. הקבלה זמינה באפליקציה.",
  );

  assert.equal(result.riskLevel, "low");
  assert.equal(result.warningSigns.length, 0);
  assert.ok(!result.warningSigns.some((sign) => sign.code === "payment_request"));
});

test("flags an unexpected refund offer with a bare domain as high risk", () => {
  const result = analyzeMessage(
    "יתכן ויש לך 9424₪ ממתינים מהחזר המס שלך, לחץ- fkvd.me הסר fkvd.me/r",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.equal(result.riskLevel, "high");
  assert.ok(result.warningSigns.some((sign) => sign.code === "financial_lure"));
  assert.ok(result.warningSigns.some((sign) => sign.code === "link"));
  assert.ok(result.warningSigns.some((sign) => sign.code === "click_action"));
  assert.ok(result.nextSteps.some((step) => step.includes("אל תלחץ על קישור")));
});

test("does not mistake the word 'מידע' for urgency in a transaction alert", () => {
  const result = analyzeMessage(
    "ב 24/11 התקבלה בקשה לעסקה בכרטיס ויזה המסתיים ב 0000 בסך 40.00 $. אפשר לראות מידע נוסף על העסקה באפליקציה https://example.invalid/mobile",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.equal(result.riskLevel, "low");
  assert.ok(result.warningSigns.some((sign) => sign.code === "link"));
  assert.ok(!result.warningSigns.some((sign) => sign.code === "urgency"));
  assert.ok(
    result.warningSigns[0].explanation.includes("לא נמצא ברשימה המקומית"),
  );
});

test("recognizes an allowlisted domain locally without calling it safe", () => {
  const result = analyzeMessage(
    "כאל, ניתן לראות פרטים באפליקציה https://www.cal-online.co.il/mobile?link=example",
  );

  assert.equal(result.riskLevel, "low");
  assert.deepEqual(result.linkChecks, [
    {
      url: "https://www.cal-online.co.il/mobile?link=example",
      domain: "cal-online.co.il",
      matchesLocalList: true,
      isWhatsAppChat: false,
      reputationStatus: "not_checked",
    },
  ]);
  assert.match(result.warningSigns[0].explanation, /אינה מוכיחה/);
});

test("does not trust a lookalike subdomain of an allowlisted domain", () => {
  const result = analyzeMessage(
    "בדקו פרטים ב https://cal-online.co.il.example.com/account",
  );

  assert.deepEqual(result.linkChecks, [
    {
      url: "https://cal-online.co.il.example.com/account",
      domain: "cal-online.co.il.example.com",
      matchesLocalList: false,
      isWhatsAppChat: false,
      reputationStatus: "not_checked",
    },
  ]);
});

test("explains that wa.me links open a chat but do not verify its recipient", () => {
  const result = analyzeMessage(
    "לפרטים נוספים https://wa.me/972541234567?text=hello",
  );

  assert.equal(result.linkChecks.length, 1);
  assert.equal(result.linkChecks[0].isWhatsAppChat, true);
  assert.equal(
    result.linkChecks[0].url,
    "https://wa.me/972541234567?text=hello",
  );
});

test("a message with no detected signs is not described as safe", () => {
  const result = analyzeMessage(
    "שלום, רצינו לעדכן אותך שהפגישה שנקבעה למחר הועברה לשעה מאוחרת יותר.",
  );

  assert.equal(result.hasEnoughInformation, true);
  assert.equal(result.riskLevel, "low");
  assert.equal(result.warningSigns.length, 0);
  assert.ok(result.nextSteps.some((step) => step.includes("אין בכך הוכחה")));
  assert.match(result.uncertaintyNotice, /אינה יכולה לקבוע בוודאות/);
});
