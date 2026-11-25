import type {
  AnalysisResult,
  LinkCheck,
  ReputationStatus,
} from "./analyzeMessage.ts";
import { isShortenedLinkDomain } from "./analyzeMessage.ts";

export function getOverallReputationStatus(
  linkChecks: LinkCheck[],
): ReputationStatus {
  if (linkChecks.some(({ reputationStatus }) => reputationStatus === "listed")) {
    return "listed";
  }
  if (
    linkChecks.some(({ reputationStatus }) => reputationStatus === "checking")
  ) {
    return "checking";
  }
  if (
    linkChecks.some(
      ({ reputationStatus }) => reputationStatus === "unavailable",
    )
  ) {
    return "unavailable";
  }
  if (
    linkChecks.length > 0 &&
    linkChecks.every(({ reputationStatus }) => reputationStatus === "no_match")
  ) {
    return "no_match";
  }
  return "not_checked";
}

export function getOverallVerdict(
  result: AnalysisResult,
  reputationStatus: ReputationStatus,
): { tone: "high" | "caution" | "uncertain"; title: string; detail: string } {
  if (reputationStatus === "listed") {
    return {
      tone: "high",
      title: "HIGH RISK — אל תפתח את הקישור",
      detail:
        "Google Safe Browsing דיווח על איום מוכר בכתובת. אל תפתח אותה. תוצאת הקישור וניתוח תוכן ההודעה מוצגים בנפרד.",
    };
  }

  if (result.hasEnoughInformation && result.riskLevel === "high") {
    return {
      tone: "high",
      title: "סיכון גבוה — נמצאו סימני אזהרה משמעותיים",
      detail:
        `הדירוג מבוסס על תוכן ההודעה בלבד. אמת את הבקשה בערוץ רשמי ואל תפעל לפיה לפני כן.${getLookupContext(reputationStatus)}`,
    };
  }

  if (
    result.hasEnoughInformation &&
    (result.riskLevel === "medium" || result.warningSigns.length > 0)
  ) {
    return {
      tone: "caution",
      title: "נמצאו סימני אזהרה — יש לנקוט זהירות",
      detail:
        `הדירוג מבוסס על תוכן ההודעה בלבד; הוא אינו קביעה שההודעה הונאה.${getLookupContext(reputationStatus)}`,
    };
  }

  if (!result.hasEnoughInformation) {
    return {
      tone: "uncertain",
      title: "אין מספיק מידע להערכת תוכן ההודעה",
      detail: `היעדר סימנים לא ניתן לקביעה. ${getLookupContext(reputationStatus)}`,
    };
  }

  if (reputationStatus === "checking") {
    return {
      tone: "uncertain",
      title: "לא זוהו סימני אזהרה ברורים",
      detail:
        "בדיקת הקישור מול Google Safe Browsing עדיין מתבצעת; היעדר סימנים בטקסט אינו הוכחה שההודעה בטוחה.",
    };
  }

  return {
    tone: "uncertain",
    title: "לא זוהו סימני אזהרה ברורים",
    detail:
      `הניתוח המקומי אינו מוכיח שההודעה בטוחה. ${getLookupContext(reputationStatus)}`,
  };
}

export function getLinkSafetyNotes(linkCheck: LinkCheck): string[] {
  const notes: string[] = [];

  if (linkCheck.isWhatsAppChat) {
    notes.push(
      "קישור wa.me פותח צ'אט WhatsApp עם מספר טלפון. בדיקת הכתובת אינה מאמתת אם האדם שאליו היא מובילה אמין.",
    );
  }

  if (isShortenedLinkDomain(linkCheck.domain)) {
    notes.push(
      "זהו קישור מקוצר. הבדיקה לא פתחה אותו או עקבה אחר הפניה, ולכן יעדו הסופי לא הוערך.",
    );
  }

  return notes;
}

function getLookupContext(status: ReputationStatus): string {
  switch (status) {
    case "listed":
      return " Google Safe Browsing מצא איום מוכר בכתובת.";
    case "no_match":
      return " Google Safe Browsing לא מצא איום מוכר; זו אינה הוכחה שהקישור בטוח.";
    case "unavailable":
      return " בדיקת הקישור לא זמינה, ולכן לא התקבלה תוצאה מ-Google Safe Browsing.";
    case "checking":
      return " בדיקת הקישור מול Google Safe Browsing עדיין מתבצעת.";
    case "not_checked":
      return " הקישור לא נבדק מול Google Safe Browsing.";
  }
}
