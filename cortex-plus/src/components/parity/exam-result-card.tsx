"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  EXAM_FEEDBACK_LIMITS,
  EXAM_FEEDBACK_SAVE,
  EXAM_FEEDBACK_SHOWCASE_CONSENT,
  EXAM_FEEDBACK_THANKS,
  EXAM_FEEDBACK_TITLE,
  EXAM_RESULT_LATER,
  examFeedbackLead,
  examResultCardText,
  examResultShareText,
  examResultShareable,
  examResultSubline,
  examResultTrend,
  examResultWhatsappHref,
  type ExamBaselineSource,
} from "@/lib/learning/exam-result";
import { cn } from "@/lib/utils";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import "@/styles/cram-sheet.css";
import "@/styles/exam-feedback.css";

export const EXAM_RESULT_URL = "/api/learning/exam-prep/exam-result";
export const EXAM_FEEDBACK_URL = "/api/learning/exam-prep/exam-feedback";

type StoredResult = { score: number; baselinePct: number | null; baselineSource?: ExamBaselineSource | null };

export type ExamResultCardProps = {
  prepId: string;
  /** Sınav günü geçti (sınav gününün başından 24 saat) ve not / yorum yok: soru gösterilir. */
  due: boolean;
  stored: StoredResult | null;
  /** Paylaşımın mutlak tanıtım sayfası adresi (sunucuda `appOrigin()`). */
  landingUrl: string;
  /** Hazırlık sayfasının "Hazırlık" puanı (Faz 7): soru cümlesinde; ölçülmediyse yazılmaz. */
  readinessPct?: number | null;
  /** Aynı puanın sunucuda imzalı anlık görüntüsü; kayıtta tarayıcının yazdığı puan değil bu okunur. */
  readinessToken?: string | null;
};

/**
 * Sınav sonrası kartı (31 Ekim 2026, Paket J3 #14; Faz 7, 20 Kasım 2026 başarı toplayıcı): sınav günü geçince
 * "🎓 Sınavın Nasıl Geçti?" — gerçek not (serbest: "85", "AA"), kısa yorum, isteğe bağlı görünen ad ve açık izin
 * kutusu (varsayılan işaretsiz). Not 0-100 arası sayıysa başlangıçla karşılaştıran paylaşılabilir kart çıkar
 * (düşüşte nazik, paylaşım önerilmez). Kart × ile bu ziyaret için kapanır; "Notum henüz açıklanmadı" 3 gün erteler.
 */
export function ExamResultCard({ prepId, due, stored, landingUrl, readinessPct = null, readinessToken = null }: ExamResultCardProps) {
  const [result, setResult] = useState(stored);
  const [thanks, setThanks] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [showcase, setShowcase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const ids = useId();

  if (hidden || (!result && !thanks && !due)) return null;

  async function post(url: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: StoredResult | null;
        snoozed?: boolean;
        testimonialSaved?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi. Yeniden dene.");
        return;
      }
      if (data.snoozed) {
        setHidden(true);
        return;
      }
      if (data.result) {
        setResult({ score: data.result.score, baselinePct: data.result.baselinePct ?? null, baselineSource: data.result.baselineSource ?? null });
        if (data.testimonialSaved === false && data.message) toast.message(data.message);
        else if (data.testimonialSaved) toast.success(EXAM_FEEDBACK_THANKS);
      } else if (data.testimonialSaved) {
        setThanks(data.message ?? EXAM_FEEDBACK_THANKS);
      }
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
        <p className="cp-exam-result-note">{examResultSubline(trend, result.baselineSource)}</p>
        {examResultShareable(trend) ? (
          <div className="cp-exam-result-actions">
            <ExternalAnchor
              href={examResultWhatsappHref(text, landingUrl)}
              className="cp-prep-share-go"
            >
              WhatsApp&apos;ta paylaş
            </ExternalAnchor>
            <button type="button" className="cp-prep-share-copy" onClick={() => void copy()}>
              Kopyala
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (thanks) {
    return (
      <section className="cp-exam-result" aria-label="Sınav sonucu">
        <p className="cp-exam-result-card is-up" role="status">
          🎓 {thanks}
        </p>
      </section>
    );
  }

  const ready = score.trim().length > 0 && comment.trim().length > 0;
  return (
    <section className="cp-exam-result cp-exam-feedback" aria-labelledby={`${ids}-title`}>
      <button
        type="button"
        className="cp-exam-feedback-close"
        aria-label="Kartı kapat"
        title="Kartı kapat"
        onClick={() => setHidden(true)}
      >
        <X aria-hidden />
      </button>
      <h2 className="cp-exam-result-title" id={`${ids}-title`}>
        {EXAM_FEEDBACK_TITLE}
      </h2>
      <p className="cp-exam-result-note">{examFeedbackLead(readinessPct)}</p>
      <form
        className="cp-exam-feedback-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || busy) return;
          void post(EXAM_FEEDBACK_URL, {
            actualScore: score,
            comment,
            displayName: name.trim() || null,
            allowPublicShowcase: showcase,
            readinessToken,
          });
        }}
      >
        <label className="cp-exam-feedback-field" htmlFor={`${ids}-score`}>
          <span>Sınav notun</span>
          <input
            id={`${ids}-score`}
            className="cp-exam-result-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={EXAM_FEEDBACK_LIMITS.score}
            placeholder="Örn. 85 ya da AA"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            required
          />
        </label>
        <label className="cp-exam-feedback-field" htmlFor={`${ids}-comment`}>
          <span>Kısa yorumun</span>
          <textarea
            id={`${ids}-comment`}
            className="cp-exam-result-input cp-exam-feedback-comment"
            rows={3}
            maxLength={EXAM_FEEDBACK_LIMITS.comment}
            placeholder="Hazırlığın sınavda sana nasıl yardım etti?"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            required
          />
        </label>
        <label className="cp-exam-feedback-field" htmlFor={`${ids}-name`}>
          <span>Görünen adın (isteğe bağlı)</span>
          <input
            id={`${ids}-name`}
            className="cp-exam-result-input"
            type="text"
            autoComplete="off"
            maxLength={EXAM_FEEDBACK_LIMITS.name}
            placeholder="Örn. Elif K."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="cp-exam-feedback-consent" htmlFor={`${ids}-consent`}>
          <input
            id={`${ids}-consent`}
            type="checkbox"
            checked={showcase}
            onChange={(event) => setShowcase(event.target.checked)}
          />
          <span>{EXAM_FEEDBACK_SHOWCASE_CONSENT}</span>
        </label>
        <button type="submit" className="cp-exam-feedback-send cx-glass" disabled={busy || !ready}>
          {EXAM_FEEDBACK_SAVE}
        </button>
      </form>
      <button
        type="button"
        className="cp-exam-result-later"
        disabled={busy}
        onClick={() => void post(EXAM_RESULT_URL, { later: true })}
      >
        {EXAM_RESULT_LATER}
      </button>
    </section>
  );
}
