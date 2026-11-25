export type RiskLevel = "low" | "medium" | "high";

export type WarningSign = {
  code: string;
  title: string;
  explanation: string;
};

export type ReputationStatus =
  | "not_checked"
  | "checking"
  | "listed"
  | "no_match"
  | "unavailable";

export type LinkCheck = {
  url: string;
  domain: string;
  matchesLocalList: boolean;
  isWhatsAppChat: boolean;
  reputationStatus: ReputationStatus;
};

type AnalysisBase = {
  warningSigns: WarningSign[];
  nextSteps: string[];
  uncertaintyNotice: string;
  linkChecks: LinkCheck[];
};

export type AnalysisResult =
  | (AnalysisBase & {
      hasEnoughInformation: true;
      riskLevel: RiskLevel;
      explanation: null;
    })
  | (AnalysisBase & {
      hasEnoughInformation: false;
      riskLevel: null;
      explanation: string;
    });

const uncertaintyNotice =
  "הבדיקה מבוססת על כללים פשוטים ואינה יכולה לקבוע בוודאות אם ההודעה אמיתית או הונאה.";

const sensitiveRequestPattern =
  /(?:שלח(?:י|ו)?|מסור(?:י)?|הזן(?:י)?|הקלד(?:י)?|אשר(?:י)?|עדכן(?:י)?|תמסור(?:י)?|בקש(?:י|ו)?|מבקש(?:ים)?|דרשו?|נדרש|enter|provide|share|send|give)[\s\S]{0,55}(?:סיסמה|קוד(?:\s+(?:אימות|חד[\s־-]?פעמי|שקיבלת))?|קוד\s+שנשלח|פרטי\s+(?:אשראי|חשבון|התחברות|תשלום|אישי(?:ים)?|זהות|פיננסיים?)|מידע\s+אישי|מספר\s+(?:כרטיס|זהות|חשבון)|תעודת\s+זהות|one[ -]time\s+code|verification\s+code|password|bank\s+details|personal\s+information|identity details|passport number)/iu;

const paymentRequestPattern =
  /(?:העבר(?:י|ו)?|שלם(?:י)?|בצע(?:י|ו)?\s+תשלום|שלח(?:י|ו)?\s+(?:תשלום|כסף)|הפקד(?:י|ו)?)[\s\S]{0,55}(?:₪|שקל|כסף|אשראי|חשבון|תשלום|העברה|pay|transfer|money|deposit)|(?:pay|transfer|send)\s+(?:the\s+)?(?:money|fee|payment|funds)/iu;

const jobTaskOfferPattern =
  /(?:עבודה\s+מהבית|עבודת\s+(?:הקלדה|אונליין|אינטרנט)|הצעת\s+עבודה|(?:מציעים|מוצעת|קיבלנו|קיבלת|מגייסים)[\s\S]{0,25}(?:עבודה|משרה|תפקיד|משימה)|משרה\s+(?:חלקית|מלאה|גמישה)|(?:משימות?|מטלות)\s+(?:בתשלום|מהבית|פשוטות)|עבודה\s+(?:קלה|גמישה)|(?:job|work)[ -]?(?:offer|from home)|remote job|part[ -]time job|paid tasks?)/iu;

const upfrontPaymentPattern =
  /(?:דמי\s+(?:הרשמה|רישום|הצטרפות|פתיחה|הכשרה)|מקדמה|פיקדון|תשלום\s+מראש|שלם(?:י|ו)?\s+מראש|העבר(?:י|ו)?\s+מראש|כדי\s+(?:להתחיל|לקבל)[\s\S]{0,35}(?:תשלום|דמי|מקדמה)|(?:upfront|registration|training)\s+fee|pay\s+in\s+advance|deposit\s+required)/iu;

const urgencyPattern =
  /(?:^|[^\p{L}\p{N}])(?:דחוף|בהקדם|מייד(?:ית)?|מיד|עכשיו|תוך\s*\d+\s*(?:דקות|שעות|ימים)|היום\s+(?:האחרון|בלבד)|רק\s+היום|עד\s+סוף\s+היום|(?:נדרש|חובה|יש\s+לבצע)[\s\S]{0,15}היום|יפוג|להיחסם|חסימת\s+החשבון|החשבון\s+(?:י?יחסם|י?ינעל|ננעל)|urgent|immediately|act\s+now|right\s+away|today\s+only|within\s+\d+\s+(?:minutes?|hours?|days?))(?=$|[^\p{L}\p{N}])/iu;

const unusualEarningsPattern =
  /(?:\d{3,}\s*(?:₪|ש״ח|שח|שקל(?:ים)?)\s*(?:ליום|ביום|לשעה|בשעה|למשימה)|(?:להרוויח|הכנסה|שכר|רווח)[\s\S]{0,30}(?:גבוה|מובטח|קל|מהיר|מהירה|אלפי)|(?:earn|income|pay)[\s\S]{0,30}(?:high|guaranteed|easy|daily))/iu;

const giftLurePattern =
  /(?:מתנה|פרס)[\s\S]{0,30}(?:חינם|יקר|בשווי|מובטח|זכית|מגיע\s+לך)|(?:זכית|מגיע\s+לך)[\s\S]{0,30}(?:מתנה|פרס)|(?:free gift|you won|free prize|claim your prize)/iu;

const financialLurePattern =
  /(?:\d{4,}\s*(?:₪|ש״ח|שח|שקל(?:ים)?)|החזר\s+(?:המס|מס)|זיכוי|כספים?\s+ממתינים|ממתינים?\s+לך)/iu;

const shortenedLinkDomains = new Set([
  "bit.ly",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "tiny.cc",
  "tinyurl.com",
]);

const linkPattern =
  /(?:https?:\/\/|www\.)\S+|(?:^|[\s(<])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s]*)?/iu;

const linkCandidatePattern =
  /(?<![\p{L}\p{N}@_-])(?:(?:https?:\/\/)?(?:www\.)?)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s]*)?/giu;
const locallyRecognizedDomains = new Set(["cal-online.co.il"]);
const clickActionPattern = /(?:לחץ|לחצי|לחצו|היכנס|היכנסי|היכנסו)/iu;

const nextStepBySign: Record<string, string> = {
  sensitive_request:
    "לעולם אל תמסור סיסמה או קוד חד-פעמי. אל תשלח פרטי זהות, מידע אישי או פרטים פיננסיים בעקבות הודעה; אמת בקשה בערוץ רשמי שמצאת בעצמך.",
  payment_request:
    "אל תשלם או תעביר כסף בעקבות ההודעה לפני שאימתת את הבקשה ופרטי התשלום בערוץ רשמי שמצאת בעצמך.",
  job_task_offer:
    "הצעת עבודה או משימה אינה מוכיחה הונאה. אמת את זהות המציע ואת התנאים בערוץ עצמאי לפני מסירת פרטים או תשלום.",
  upfront_payment:
    "אל תשלם עמלה, פיקדון או תשלום מראש עבור עבודה או משימה לפני שאימתת את המציע ואת התנאים בערוץ עצמאי.",
  urgency:
    "אל תפעל תחת לחץ. עצור ובדוק את הבקשה מול הארגון דרך ערוץ רשמי.",
  financial_lure:
    "אל תסתמך על הבטחת החזר או כסף שממתין לך. בדוק זאת ישירות מול הגוף הרשמי, בלי להשתמש בקישור שבהודעה.",
  unusual_earnings:
    "בדוק הצעת רווח חריג באופן עצמאי. אל תשלם או תמסור פרטים כדי לקבל הכנסה מובטחת.",
  gift_offer:
    "בדוק הצעת מתנה או פרס מול הגוף הרשמי באמצעות פרטי קשר שמצאת בעצמך.",
  link:
    "אל תלחץ על קישור בהודעה רק מפני שהדומיין תואם לרשימה. אם צריך, היכנס דרך האפליקציה הרשמית או אתר שהקלדת בעצמך.",
  click_action:
    "אל תלחץ על קישור מתוך הודעה לא צפויה. פתח את האתר הרשמי בעצמך אם צריך לבדוק את הפרטים.",
  shortened_link:
    "הקישור המקוצר מסתיר את יעדו; הבדיקה לא פתחה או עקבה אחריו ולכן לא ניתן להעריך את אתר היעד.",
};

export function isShortenedLinkDomain(domain: string): boolean {
  return shortenedLinkDomains.has(domain.toLowerCase());
}

function getLinkChecks(message: string): LinkCheck[] {
  const checks = new Map<string, LinkCheck>();

  for (const [rawCandidate] of message.matchAll(linkCandidatePattern)) {
    const candidate = rawCandidate.replace(/[.,!?;:)\]}>"'״׳]+$/u, "");
    const urlValue = /^https?:\/\//iu.test(candidate)
      ? candidate
      : `https://${candidate}`;

    try {
      const parsedUrl = new URL(urlValue);
      const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./u, "");
      const url = parsedUrl.href;

      checks.set(url, {
        url,
        domain,
        matchesLocalList: locallyRecognizedDomains.has(domain),
        isWhatsAppChat: domain === "wa.me",
        reputationStatus: "not_checked",
      });
    } catch {
      continue;
    }
  }

  return Array.from(checks.values());
}

export function analyzeMessage(message: string): AnalysisResult {
  const normalizedMessage = message.trim();
  const linkChecks = getLinkChecks(normalizedMessage);
  const meaningfulCharacterCount =
    normalizedMessage.match(/[\p{L}\p{N}]/gu)?.length ?? 0;

  if (meaningfulCharacterCount < 12) {
    return {
      hasEnoughInformation: false,
      riskLevel: null,
      explanation:
        "הטקסט קצר מדי או לא כולל מספיק תוכן שאפשר לבדוק. אפשר להדביק את נוסח ההודעה המלא, בלי להוסיף פרטים אישיים.",
      warningSigns: [],
      nextSteps: [
        "אל תפתח קישורים ואל תמסור פרטים אישיים לפני שבדקת את ההודעה.",
        "אם ההודעה מבקשת פעולה, אמת אותה מול הארגון דרך ערוץ רשמי שמצאת בעצמך.",
      ],
      uncertaintyNotice,
      linkChecks,
    };
  }

  const warningSigns: WarningSign[] = [];

  if (sensitiveRequestPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "sensitive_request",
      title: "בקשה לפרטים רגישים",
      explanation:
        "נראה שההודעה מבקשת סיסמה, קוד אימות או פרטים אישיים/פיננסיים.",
    });
  }

  if (paymentRequestPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "payment_request",
      title: "בקשה להעברת כסף או תשלום",
      explanation: "נראה שההודעה מבקשת לבצע תשלום או העברת כסף.",
    });
  }

  if (jobTaskOfferPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "job_task_offer",
      title: "מוזכרת הצעת עבודה או משימה",
      explanation:
        "ההודעה מציעה עבודה או משימה. עצם ההצעה, בלי הקשר נוסף, אינה מעידה שההודעה חשודה.",
    });
  }

  if (upfrontPaymentPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "upfront_payment",
      title: "מתבקשת עמלה או העברה מראש",
      explanation:
        "בקשה לתשלום מראש עבור עבודה או משימה היא סימן שכדאי לבדוק, אך אינה לבדה הוכחה להונאה.",
    });
  }

  if (urgencyPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "urgency",
      title: "נוצר לחץ לפעול במהירות",
      explanation:
        "ההודעה משתמשת בדחיפות או באיום אפשרי כדי לעודד פעולה מהירה.",
    });
  }

  const hasLink = linkPattern.test(normalizedMessage);
  const hasFinancialLure = financialLurePattern.test(normalizedMessage);
  const hasUnusualEarnings = unusualEarningsPattern.test(normalizedMessage);
  const hasGiftOffer = giftLurePattern.test(normalizedMessage);

  if (hasFinancialLure) {
    warningSigns.push({
      code: "financial_lure",
      title: "מובטחים החזר או כסף שממתין",
      explanation:
        "הודעה על החזר או כסף שממתין היא סימן שכדאי לבדוק, אך אינה לבדה הוכחה להונאה.",
    });
  }

  if (hasUnusualEarnings) {
    warningSigns.push({
      code: "unusual_earnings",
      title: "מובטחים רווחים או הכנסה חריגים",
      explanation:
        "הבטחה להכנסה גבוהה או קלה במיוחד היא סימן שכדאי לאמת, אך אינה לבדה הוכחה להונאה.",
    });
  }

  if (hasGiftOffer) {
    warningSigns.push({
      code: "gift_offer",
      title: "מוצעים מתנה או פרס",
      explanation:
        "הבטחת מתנה או פרס היא סימן שכדאי לבדוק, במיוחד אם מבקשים תשלום או פרטים כדי לקבלם.",
    });
  }

  if (linkChecks.some(({ domain }) => isShortenedLinkDomain(domain))) {
    warningSigns.push({
      code: "shortened_link",
      title: "מופיע קישור מקוצר",
      explanation:
        "הקישור המקוצר מסתיר את יעדו. הבדיקה לא פתחה או עקבה אחריו, ולכן לא ניתן להעריך את אתר היעד.",
    });
  }

  if (hasLink) {
    const hasUnrecognizedDomain = linkChecks.some(
      ({ matchesLocalList }) => !matchesLocalList,
    );
    const linkExplanation =
      linkChecks.length > 0 && !hasUnrecognizedDomain
        ? "הדומיין תואם לרשימה המקומית. הבדיקה לא פתחה את הקישור, והתאמה אינה מוכיחה שההודעה אמיתית או בטוחה."
        : "הדומיין לא נמצא ברשימה המקומית או שלא ניתן לזהותו. זה לא מוכיח שהוא זדוני; הבדיקה לא פתחה את הקישור.";

    warningSigns.push({
      code: "link",
      title: "מופיע קישור בהודעה",
      explanation: linkExplanation,
    });
  }

  if (hasLink && clickActionPattern.test(normalizedMessage)) {
    warningSigns.push({
      code: "click_action",
      title: "מתבקשת לחיצה על קישור",
      explanation:
        "ההודעה משלבת קישור עם הוראה ללחוץ או להיכנס אליו.",
    });
  }

  const hasUrgency = warningSigns.some(({ code }) => code === "urgency");
  const groupedOfferSignals =
    Number(warningSigns.some(({ code }) => code === "job_task_offer")) +
    Number(
      warningSigns.some(({ code }) =>
        ["financial_lure", "unusual_earnings", "gift_offer"].includes(code),
      ),
    ) +
    Number(warningSigns.some(({ code }) => code === "upfront_payment")) +
    Number(hasUrgency);
  const hasHighRiskSign = warningSigns.some(
    ({ code }) => code === "sensitive_request",
  ) ||
    ((hasFinancialLure || hasUrgency) && hasLink) ||
    groupedOfferSignals >= 3 ||
    (warningSigns.some(({ code }) => code === "payment_request") &&
      (hasUrgency || hasFinancialLure || hasUnusualEarnings || hasGiftOffer));
  const hasMediumRiskSign = warningSigns.some(
    ({ code }) =>
      code === "urgency" ||
      code === "financial_lure" ||
      code === "unusual_earnings" ||
      code === "gift_offer" ||
      code === "upfront_payment" ||
      code === "payment_request" ||
      code === "click_action",
  ) || groupedOfferSignals >= 2;
  const riskLevel: RiskLevel = hasHighRiskSign
    ? "high"
    : hasMediumRiskSign
      ? "medium"
      : "low";

  const nextSteps =
    warningSigns.length > 0
      ? Array.from(new Set(warningSigns.map(({ code }) => nextStepBySign[code])))
      : [
          "לא זוהו סימני אזהרה ברורים לפי הכללים המקומיים, אך אין בכך הוכחה שההודעה בטוחה.",
          "אם ההודעה מבקשת פעולה או מעוררת ספק, אמת אותה מול הארגון דרך ערוץ רשמי שמצאת בעצמך.",
        ];
  if (
    linkChecks.length > 0 &&
    !warningSigns.some(({ code }) => code === "shortened_link")
  ) {
    nextSteps.push(
      "אל תפתח קישור חשוד. אם נדרשת פעולה, צור קשר עם הארגון באמצעות פרטי קשר שמצאת בעצמך באתר הרשמי.",
    );
  }

  return {
    hasEnoughInformation: true,
    riskLevel,
    explanation: null,
    warningSigns,
    nextSteps,
    uncertaintyNotice,
    linkChecks,
  };
}
