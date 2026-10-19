"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOST_USED_OPTIONS, SURVEY_COPY, SURVEY_IMPROVE_MAX, type MostUsed } from "@/lib/feedback/weekly-survey";
import "@/styles/weekly-survey.css";

type Phase = "hidden" | "open" | "sending" | "thanks";

/**
 * Haftalık kısa anket kartı (19 Ekim 2026, kapalı beta). Sınavlar sayfasında, o hafta çalışmış
 * öğrenciye haftada en çok bir kez görünür; kararı sunucu verir (`/api/feedback/weekly`). Okuma
 * düşerse kart hiç görünmez. "Şimdi değil" de haftanın satırını yazar.
 */
export function WeeklySurveyCard() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [mostUsed, setMostUsed] = useState<MostUsed | null>(null);
  const [improve, setImprove] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/feedback/weekly", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { show?: boolean } | null) => {
        if (alive && payload?.show) setPhase("open");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function send(body: Record<string, unknown>, after: Phase) {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Cevap kaydedilemedi.");
        setPhase("open");
        return;
      }
      setPhase(after);
    } catch {
      setError("Bağlantı hatası. Yeniden dene.");
      setPhase("open");
    }
  }

  if (phase === "hidden") return null;

  if (phase === "thanks") {
    return (
      <section className="cp-survey cp-survey--thanks" role="status">
        <p>{SURVEY_COPY.thanks}</p>
      </section>
    );
  }

  const ready = helpfulness !== null && recommend !== null;
  const busy = phase === "sending";

  return (
    <section className="cp-survey" aria-labelledby="cp-survey-title">
      <header className="cp-survey-head">
        <div>
          <h2 id="cp-survey-title" className="cp-survey-title">
            {SURVEY_COPY.title}
          </h2>
          <p className="cp-survey-intro">{SURVEY_COPY.intro}</p>
        </div>
        <button
          type="button"
          className="cp-survey-close"
          aria-label={SURVEY_COPY.dismiss}
          disabled={busy}
          onClick={() => send({ action: "dismiss" }, "hidden")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <fieldset className="cp-survey-q">
        <legend>{SURVEY_COPY.helpfulness}</legend>
        <div className="cp-survey-scale" role="radiogroup">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={helpfulness === value}
              className={cn(helpfulness === value && "is-on")}
              onClick={() => setHelpfulness(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="cp-survey-ends">
          <span>{SURVEY_COPY.helpfulnessEnds[0]}</span>
          <span>{SURVEY_COPY.helpfulnessEnds[1]}</span>
        </p>
      </fieldset>

      <fieldset className="cp-survey-q">
        <legend>{SURVEY_COPY.recommend}</legend>
        <div className="cp-survey-scale cp-survey-scale--11" role="radiogroup">
          {Array.from({ length: 11 }, (_, value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={recommend === value}
              className={cn(recommend === value && "is-on")}
              onClick={() => setRecommend(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="cp-survey-ends">
          <span>{SURVEY_COPY.recommendEnds[0]}</span>
          <span>{SURVEY_COPY.recommendEnds[1]}</span>
        </p>
      </fieldset>

      <fieldset className="cp-survey-q">
        <legend>{SURVEY_COPY.mostUsed}</legend>
        <div className="cp-survey-chips" role="radiogroup">
          {MOST_USED_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={mostUsed === option.id}
              className={cn(mostUsed === option.id && "is-on")}
              onClick={() => setMostUsed(mostUsed === option.id ? null : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="cp-survey-q cp-survey-text">
        <span>{SURVEY_COPY.improve}</span>
        <textarea
          value={improve}
          maxLength={SURVEY_IMPROVE_MAX}
          rows={2}
          onChange={(event) => setImprove(event.target.value)}
        />
      </label>

      {error ? (
        <p className="cp-survey-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cp-survey-actions">
        <button
          type="button"
          className="cp-survey-later"
          disabled={busy}
          onClick={() => send({ action: "dismiss" }, "hidden")}
        >
          {SURVEY_COPY.dismiss}
        </button>
        <button
          type="button"
          className="cp-survey-send"
          disabled={!ready || busy}
          onClick={() =>
            send({ action: "answer", helpfulness, recommend, mostUsed, improve: improve.trim() || null }, "thanks")
          }
        >
          {busy ? "…" : SURVEY_COPY.submit}
        </button>
      </div>
    </section>
  );
}
