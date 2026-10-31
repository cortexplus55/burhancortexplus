"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TWIN_BUTTON, TWIN_UNAVAILABLE } from "@/lib/learning/twin-question-copy";
import "@/styles/twin-question.css";

type TwinQuestion = { text: string; options: string[]; multi: boolean };
type TwinResult = { correct: boolean; correctOptions: string[]; explanation: string | null; message: string };

/**
 * "🔥 Anladığını Kanıtla: Şimdi İkiz Soruyu Çöz (+5 ⭐)" (31 Ekim 2026, Paket J3 #12). Yanlış yapılan sorunun
 * açıklamasının altında; dokununca aynı kavramın sayıları/öncülleri değişmiş tek kardeş sorusu açılır. Cevap sunucuda
 * notlanır (anahtar tarayıcıda yok), doğruysa +5 yıldız.
 */
export function TwinQuestionCard({ attemptId, index }: { attemptId: string; index: number }) {
  const [state, setState] = useState<"idle" | "loading" | "play" | "checking" | "done">("idle");
  const [question, setQuestion] = useState<TwinQuestion | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<TwinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/learning/twin-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", attemptId, index }),
      });
      const data = (await response.json().catch(() => ({}))) as { question?: TwinQuestion; token?: string; error?: string };
      if (!response.ok || !data.question || !data.token) {
        setError(data.error || TWIN_UNAVAILABLE);
        setState("idle");
        return;
      }
      setQuestion(data.question);
      setToken(data.token);
      setState("play");
    } catch {
      setError(TWIN_UNAVAILABLE);
      setState("idle");
    }
  }

  async function check() {
    if (!question || !token || !picked.length) return;
    setState("checking");
    try {
      const response = await fetch("/api/learning/twin-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", token, answer: question.multi ? picked : picked[0] }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<TwinResult> & { error?: string };
      if (!response.ok || typeof data.correct !== "boolean") {
        setError(data.error || TWIN_UNAVAILABLE);
        setState("play");
        return;
      }
      setResult(data as TwinResult);
      setState("done");
    } catch {
      setError(TWIN_UNAVAILABLE);
      setState("play");
    }
  }

  if (state === "idle" || state === "loading") {
    return (
      <div className="cp-twin-entry">
        <button type="button" className="cp-twin-button" onClick={open} disabled={state === "loading"} aria-busy={state === "loading" || undefined}>
          {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          <span>{state === "loading" ? "İkiz soru hazırlanıyor…" : TWIN_BUTTON}</span>
        </button>
        {error ? (
          <p className="cp-twin-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!question) return null;
  const done = state === "done" && result;
  return (
    <div className="cp-twin" role="group" aria-label="İkiz soru">
      <p className="cp-twin-label">🔥 İkiz soru</p>
      <p className="cp-twin-text">
        <RichBody text={question.text} />
      </p>
      <div className="cp-twin-options" role={question.multi ? "group" : "radiogroup"}>
        {question.options.map((option, optionIndex) => {
          const on = picked.includes(option);
          const right = done && result.correctOptions.includes(option);
          const wrongPick = done && on && !right;
          return (
            <button
              key={option}
              type="button"
              role={question.multi ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={state !== "play"}
              className={`cp-twin-option ${on ? "is-on" : ""} ${right ? "is-right" : ""} ${wrongPick ? "is-wrong" : ""}`}
              onClick={() =>
                setPicked((current) =>
                  question.multi ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : [option],
                )
              }
            >
              <span className="cp-twin-letter">{String.fromCharCode(65 + optionIndex)}</span>
              <span className="min-w-0 flex-1">
                <RichBody text={option} />
              </span>
              {right ? <Check className="h-4 w-4" aria-hidden /> : wrongPick ? <X className="h-4 w-4" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      {done ? (
        <div className="cp-twin-result" role="status" aria-live="polite">
          <p className={result.correct ? "cp-twin-ok" : "cp-twin-miss"}>{result.message}</p>
          {result.explanation ? (
            <p className="cp-twin-why">
              <RichBody text={result.explanation} />
            </p>
          ) : null}
        </div>
      ) : (
        <button type="button" className="cp-twin-check" onClick={check} disabled={!picked.length || state === "checking"}>
          {state === "checking" ? "Kontrol ediliyor…" : "Kontrol et"}
        </button>
      )}
      {error && !done ? (
        <p className="cp-twin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
