"use client";

import { useRef, useState } from "react";
import {
  analyzeMessage,
  type AnalysisResult,
  type LinkCheck,
  type ReputationStatus,
  type RiskLevel,
} from "@/lib/analyzeMessage";
import {
  getLinkSafetyNotes,
  getOverallReputationStatus,
  getOverallVerdict,
} from "@/lib/assessmentSummary";
import { requestUrlCheck } from "@/lib/requestUrlCheck";

const riskLabels: Record<RiskLevel, string> = {
  low: "נמוך",
  medium: "בינוני",
  high: "גבוה",
};

const reputationLabels: Record<ReputationStatus, string> = {
  not_checked: "לא נבדק",
  checking: "נבדק מול המאגר...",
  listed: "נמצא איום",
  no_match: "לא נמצא איום ידוע — אין בכך הוכחה שהקישור בטוח",
  unavailable: "בדיקת הכתובת לא זמינה",
};

export default function Home() {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const lookupRequestId = useRef(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [allowExternalLookup, setAllowExternalLookup] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  async function handleAnalyze() {
    const requestId = ++lookupRequestId.current;
    const submittedMessage = messageRef.current?.value ?? message;
    setMessage(submittedMessage);
    setLookupMessage(null);

    const analysis = analyzeMessage(submittedMessage);
    setResult(analysis);

    if (
      !allowExternalLookup ||
      analysis.linkChecks.length === 0
    ) {
      return;
    }

    setResult({
      ...analysis,
      linkChecks: analysis.linkChecks.map((check) => ({
        ...check,
        reputationStatus: "checking",
      })),
    });

    const urlCheck = await requestUrlCheck(
      analysis.linkChecks.map(({ url }) => url),
      allowExternalLookup,
    );
    if (requestId !== lookupRequestId.current) {
      return;
    }

    if (!urlCheck) {
      return;
    }

    if (urlCheck.kind === "unavailable") {
      setResult({
        ...analysis,
        linkChecks: analysis.linkChecks.map((check) => ({
          ...check,
          reputationStatus: "unavailable",
        })),
      });
      setLookupMessage(urlCheck.message);
      return;
    }

    const linkChecks: LinkCheck[] = analysis.linkChecks.map((check) => ({
      ...check,
      reputationStatus: urlCheck.results.get(check.url) ?? "unavailable",
    }));
    setResult({
      ...analysis,
      linkChecks,
    });
  }

  function handleClear() {
    lookupRequestId.current += 1;
    setMessage("");
    setResult(null);
    setLookupMessage(null);
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            !
          </span>
          <span>בודק הודעות</span>
        </div>
        <span className="local-badge">
          <span aria-hidden="true" />
          בדיקת קישור לפי בחירה
        </span>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">עוצרים. בודקים. מחליטים.</p>
        <h1 id="page-title">קיבלת הודעה חשודה?</h1>
        <p className="hero-copy">
          כללי האזהרה פועלים במכשירך. אם תבחר בבדיקה חיצונית, יישלח ל-Google
          Safe Browsing הקישור המלא, כולל הנתיב והפרמטרים — לא ההודעה שסביבו.
        </p>
      </section>

      <section className="checker-card" aria-label="בדיקת הודעה">
        <label className="field-label" htmlFor="message">
          תוכן ההודעה
        </label>
        <textarea
          id="message"
          ref={messageRef}
          dir="auto"
          maxLength={5000}
          placeholder="הדבק כאן את ההודעה שקיבלת..."
          value={message}
          onChange={(event) => {
            lookupRequestId.current += 1;
            setMessage(event.target.value);
            setResult(null);
            setLookupMessage(null);
          }}
          rows={7}
        />
        <div className="input-footer">
          <span className="privacy-hint">
            אין צורך להוסיף פרטים אישיים שאינם מופיעים בהודעה.
          </span>
          <span className="character-count" aria-live="polite">
            {message.length}/5000
          </span>
        </div>
        <label className="lookup-consent">
          <input
            type="checkbox"
            checked={allowExternalLookup}
            onChange={(event) =>
              setAllowExternalLookup(event.target.checked)
            }
          />
          <span>
            אפשר לבדוק את הקישור המלא מול Google Safe Browsing. הקישור, כולל
            הנתיב והפרמטרים שבו (שעשויים לכלול מספר טלפון), יישלח לספק;
            ההודעה עצמה לא תישלח.
          </span>
        </label>
        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleAnalyze}
          >
            בדיקת ההודעה
            <span aria-hidden="true">←</span>
          </button>
          {message && (
            <button
              className="text-button"
              type="button"
              onClick={handleClear}
            >
              ניקוי
            </button>
          )}
        </div>
      </section>

      {result && (
        <AnalysisPanel result={result} lookupMessage={lookupMessage} />
      )}

      <aside className="safety-note" aria-label="הבהרת בטיחות">
        <span className="note-icon" aria-hidden="true">
          i
        </span>
        <p>
          בדיקה מקומית או היעדר התאמה במאגר איומים אינם הוכחה שהודעה בטוחה.
          גם Google Safe Browsing עלול שלא לזהות איומים מסוימים. במקרה של ספק,
          אמת את הפרטים מול הארגון בערוץ רשמי שמצאת בעצמך.
        </p>
      </aside>

      <footer className="site-footer">
        <span>
          ההודעה עצמה לא נשלחת או נשמרת. בדיקה חיצונית שולחת את הקישור המלא
          לספק רק לאחר הסכמה.
        </span>
      </footer>
    </main>
  );
}

function AnalysisPanel({
  result,
  lookupMessage,
}: {
  result: AnalysisResult;
  lookupMessage: string | null;
}) {
  const reputationStatus = getOverallReputationStatus(result.linkChecks);
  const verdict = getOverallVerdict(result, reputationStatus);

  if (!result.hasEnoughInformation) {
    return (
      <div className="analysis-results" aria-live="polite">
        <OverallVerdict verdict={verdict} />
        <section className="result-card message-analysis insufficient">
          <div className="result-heading">
            <span className="result-icon" aria-hidden="true">
              ?
            </span>
            <div>
              <p className="result-kicker" dir="ltr">
                Message text analysis only.
              </p>
              <h2>אין מספיק מידע לבדיקה</h2>
            </div>
          </div>
          <p className="result-description">{result.explanation}</p>
          <NextSteps steps={result.nextSteps} />
        </section>
        <GoogleLookupPanel
          linkChecks={result.linkChecks}
          lookupMessage={lookupMessage}
        />
      </div>
    );
  }

  return (
    <div className="analysis-results" aria-live="polite">
      <OverallVerdict verdict={verdict} />
      <section className={`result-card message-analysis risk-${result.riskLevel}`}>
        <div className="result-heading">
          <span className="result-icon" aria-hidden="true">
            {result.riskLevel === "low" ? "i" : "!"}
          </span>
          <div>
            <p className="result-kicker" dir="ltr">
              Message text analysis only.
            </p>
            <h2>
              {result.riskLevel === "low"
                ? result.warningSigns.length === 0
                  ? "לא זוהו סימני אזהרה ברורים"
                  : "זוהו סימנים שכדאי לבדוק"
                : `רמת הסיכון לפי הטקסט: ${riskLabels[result.riskLevel]}`}
            </h2>
          </div>
        </div>

        {result.warningSigns.length > 0 && (
          <div className="signs-section">
            <h3>מה כדאי לשים לב אליו</h3>
            <ul className="sign-list">
              {result.warningSigns.map((sign) => (
                <li key={sign.code}>
                  <span className="sign-bullet" aria-hidden="true" />
                  <div>
                    <strong>{sign.title}</strong>
                    <p>{sign.explanation}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="result-description">
          אלה סימני אזהרה בלבד; שום סימן יחיד אינו מוכיח הונאה. גם היעדר סימנים
          אינו הוכחה שההודעה בטוחה.
        </p>
        <NextSteps steps={result.nextSteps} />
      </section>
      <GoogleLookupPanel
        linkChecks={result.linkChecks}
        lookupMessage={lookupMessage}
      />
    </div>
  );
}

function OverallVerdict({
  verdict,
}: {
  verdict: ReturnType<typeof getOverallVerdict>;
}) {
  return (
    <section className={`overall-verdict verdict-${verdict.tone}`} role="status">
      <p className="overall-verdict-label">הערכת סיכון כוללת</p>
      <h2>{verdict.title}</h2>
      <p>{verdict.detail}</p>
    </section>
  );
}

function GoogleLookupPanel({
  linkChecks,
  lookupMessage,
}: {
  linkChecks: LinkCheck[];
  lookupMessage: string | null;
}) {
  const status = getOverallReputationStatus(linkChecks);

  return (
    <div className="domain-checks">
      <h3>תוצאת Google Safe Browsing</h3>
      <p className={`reputation-status reputation-${status}`} role="status">
        {reputationLabels[status]}
      </p>
      {linkChecks.length === 0 ? (
        <p>לא זוהה קישור לבדיקה.</p>
      ) : (
        <ul>
          {linkChecks.map((linkCheck) => (
            <li key={linkCheck.url}>
              <bdi dir="ltr">{linkCheck.domain}</bdi>
              <span
                className={`reputation-status reputation-${linkCheck.reputationStatus}`}
              >
                {reputationLabels[linkCheck.reputationStatus]}
              </span>
              {getLinkSafetyNotes(linkCheck).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {status === "not_checked" && linkChecks.length > 0 && (
        <p>
          לא נבדק — המשתמש לא בחר באפשרות הבדיקה; הכתובות לא נשלחו ל-Google Safe
          Browsing.
        </p>
      )}
      {status === "not_checked" && linkChecks.length === 0 && (
        <p>לא נבדק — לא זוהה קישור בהודעה.</p>
      )}
      {status === "no_match" && (
        <p>
          Google Safe Browsing לא זיהה איום מוכר בכתובת שנבדקה. הבדיקה עלולה
          להחמיץ איומים, ואין בכך הוכחה שהקישור בטוח.
        </p>
      )}
      {status === "listed" && (
        <p className="lookup-error">
          Google Safe Browsing דיווח על איום מוכר. אל תפתח את הקישור.
        </p>
      )}
      {lookupMessage && (
        <p className="lookup-error" role="status">
          {lookupMessage}
        </p>
      )}
    </div>
  );
}

function NextSteps({ steps }: { steps: string[] }) {
  return (
    <div className="next-steps">
      <h3>מה אפשר לעשות עכשיו?</h3>
      <ul>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </div>
  );
}
