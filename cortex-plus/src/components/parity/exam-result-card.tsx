"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  EXAM_RESULT_ASK,
  EXAM_RESULT_LATER,
  EXAM_RESULT_SAVE,
  examResultCardText,
  examResultShareText,
  examResultShareable,
  examResultSubline,
  examResultTrend,
  examResultWhatsappHref,
  parseExamScore,
} from "@/lib/learning/exam-result";
import { cn } from "@/lib/utils";
import "@/styles/cram-sheet.css";

export const EXAM_RESULT_URL = "/api/learning/exam-prep/exam-result";

export type ExamResultCardProps = {
  prepId: string;
  /** Sınav günü geçti ve not yok: soru gösterilir. */
  due: boolean;
  stored: { score: number; baselinePct: number | null } | null;
  /** Paylaşımın mutlak tanıtım sayfası adresi (sunucuda `appOrigin()`). */
  landingUrl: string;
};

/**
 * Sınav sonrası başarı kartı (31 Ekim 2026, Paket J3 #14): "Sınavın nasıl geçti? Notunu yaz" → başlangıçla
 * karşılaştıran kart; WhatsApp'ta paylaş ve kopyala. Düşüşte kart nazik kalır ve paylaşım önerilmez.
 */
export function ExamResultCard({ prepId, due, stored, landingUrl }: ExamResultCardProps) {
  const [result, setResult] = useState(stored);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden || (!result && !due)) return null;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(EXAM_RESULT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: { score: number; baselinePct: number | null };
        snoozed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi. Yeniden dene.");
        return;
      }
      if (data.snoozed) setHidden(true);
      else if (data.result) setResult({ score: data.result.score, baselinePct: data.result.baselinePct ?? null });
    } catch {
      toast.error("İnternet bağlantını kontrol edip yeniden dene.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const trend = examResultTrend(result.baselinePct, result.score);
    const text = examResultCardText(result);
    const shareText = examResultShareText(text);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(`${shareText} ${landingUrl}`);
        toast.success("Kart metni kopyalandı.");
      } catch {
        toast.error("Kopyalanamadı.");
      }
    };
    return (
      <section className="cp-exam-result" aria-label="Sınav sonucu">
        <p className={cn("cp-exam-result-card", trend === "up" && "is-up")}>{text}</p>
        <p className="cp-exam-result-note">{examResultSubline(trend)}</p>
        {examResultShareable(trend) ? (
          <div className="cp-exam-result-actions">
            <a
              href={examResultWhatsappHref(text, landingUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="cp-prep-share-go"
            >
              WhatsApp&apos;ta paylaş
            </a>
            <button type="button" className="cp-prep-share-copy" onClick={() => void copy()}>
              Kopyala
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const score = parseExamScore(value);
  return (
    <section className="cp-exam-result" aria-label="Sınav sonucu">
      <h2 className="cp-exam-result-title">🎓 {EXAM_RESULT_ASK}</h2>
      <p className="cp-exam-result-note">Notunu 0 ile 100 arasında yaz; başlangıç seviyenle karşılaştıralım.</p>
      <form
        className="cp-exam-result-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (score != null) void send({ score });
        }}
      >
        <input
          className="cp-exam-result-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          placeholder="Örn. 85"
          aria-label="Sınav notu (0-100)"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="cp-exam-result-save" disabled={busy || score == null}>
          {EXAM_RESULT_SAVE}
        </button>
      </form>
      <button type="button" className="cp-exam-result-later" disabled={busy} onClick={() => void send({ later: true })}>
        {EXAM_RESULT_LATER}
      </button>
    </section>
  );
}
