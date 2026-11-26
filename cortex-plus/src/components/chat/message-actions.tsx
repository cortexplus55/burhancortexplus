"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Flag, RefreshCw, Square, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import { plainTutorText } from "@/lib/learning/tutor-reply";
import {
  REPLY_REPORT_EXCERPT_MAX,
  REPLY_REPORT_REASONS,
  REPLY_REPORT_THANKS,
  type ReplyReportReason,
} from "@/lib/learning/reply-report";

export type Rating = 1 | -1 | null;
export type RatingReason = "yanlis" | "anlasilmadi" | "eksik";

/**
 * Olumsuz oyda sorulan tek soru.
 *
 * "Neden beğenmedin?" diye boş bir kutu açmak yerine üç seçenek: yazmak zaman
 * alıyor ve kimse yazmıyor, seçenek ise tek dokunuş. Üçü de AI talimatlarında
 * farklı bir düzeltmeye karşılık geliyor, yani gelen veri gerçekten işe yarıyor.
 */
const REASONS: { id: RatingReason; label: string }[] = [
  { id: "yanlis", label: "Yanlış" },
  { id: "anlasilmadi", label: "Anlamadım" },
  { id: "eksik", label: "Eksik kaldı" },
];

/**
 * Yanıtın altındaki işlemler.
 *
 * Sesli okuma tarayıcının kendi sesini kullanıyor — ücretsiz katmanda da
 * çalışsın diye. Sunucu sesi Plus'a kapalı ve bir yanıtı dinlemek için kota
 * yakmak gereksiz.
 *
 * Başparmaklar yalnızca kaydedilmiş yanıtlarda çıkıyor: `messageId` yoksa
 * (sohbet kaydedilmemişse) oy verilecek satır da yok, o yüzden düğmeyi hiç
 * göstermiyoruz. Hiçbir şey yapmayan düğme, olmayan düğmeden kötüdür.
 */
/** Sesli dinlemenin okuduğu metin: Markdown işaretleri "yıldız yıldız" diye duyulmasın. */
export function speechTextFor(content: string): string {
  return plainTutorText(content)
    .replace(/```[\s\S]*?```/g, " kod bloğu ")
    .replace(/[*_`#>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function MessageActions({
  content,
  messageId,
  rating: initialRating = null,
  onRated,
  onRegenerate,
  layout = "default",
  speech,
}: {
  content: string;
  messageId?: string;
  rating?: Rating;
  onRated?: (rating: Rating) => void;
  onRegenerate?: () => void;
  /**
   * Öğretmen v3 (teacher.v2 ana sohbeti): dört soluk simge, sırası beğen, beğenme, sesli dinle, kopyala; yeniden üret
   * yok. Verilmezse bugünkü düzen birebir.
   */
  layout?: "default" | "v3";
  /** Sesli dinleme dışarıdan yönetilir (öğretmen v3: kendiliğinden okuma ile aynı ses tek yerde). */
  speech?: { speaking: boolean; onToggle: () => void };
}) {
  const [copied, setCopied] = useState(false);
  const [ownSpeaking, setSpeaking] = useState(false);
  const [rating, setRating] = useState<Rating>(initialRating);
  const [askReason, setAskReason] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const speaking = speech ? speech.speaking : ownSpeaking;

  useEffect(() => () => {
    if (!speech) stopSpeech();
    // Yalnız kendi okumasını durdurur; dışarıdan yönetilen ses paneldedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainTutorText(content));
      setCopied(true);
      toast.success("Kopyalandı");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Kopyalanamadı", {
        description: "Tarayıcı panoya erişime izin vermedi.",
      });
    }
  }

  function toggleSpeech() {
    if (speech) {
      speech.onToggle();
      return;
    }
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    // Markdown işaretleri sesli okunduğunda "yıldız yıldız" diye duyuluyor.
    const plain = plainTutorText(content)
      .replace(/```[\s\S]*?```/g, " kod bloğu ")
      .replace(/[*_`#>|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return;
    setSpeaking(true);
    speakTurkish(plain, {
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        toast.error("Sesli okuma çalışmadı", {
          description: "Tarayıcında Türkçe ses yüklü olmayabilir.",
        });
      },
    });
  }

  async function rate(next: Rating, reason?: RatingReason) {
    if (!messageId || sending) return;
    // Ekranı hemen güncelliyoruz; ağ beklemek bir başparmak için fazla.
    const previous = rating;
    setRating(next);
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, rating: next, reason: reason ?? null }),
      });
      if (!res.ok) throw new Error("kaydedilemedi");
      onRated?.(next);
      if (next === -1 && reason) {
        toast.success("Teşekkürler, not aldık.");
      }
    } catch {
      setRating(previous);
      toast.error("Oyun kaydedilemedi", {
        description: "Bağlantını kontrol edip tekrar dene.",
      });
    } finally {
      setSending(false);
    }
  }

  /**
   * "Bildir" (26 Kasım 2026, Google Play yapay zekâ içerik politikası): hatalı ya da uygunsuz yanıt uygulamadan
   * çıkmadan bildirilir. Kaydedilmemiş yanıtta da çalışır (ekrandaki metin gider); kayıtlıysa metin sunucudan okunur.
   */
  async function report(reason: ReplyReportReason) {
    if (reporting || reported) return;
    setReporting(true);
    try {
      const res = await fetch("/api/ai/chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: messageId ?? null,
          reason,
          // Metin her zaman gider: kayıtlı yanıtta sunucu kendi kaydını okur, geçici kimlikli yanıtta bu metni kullanır.
          excerpt: plainTutorText(content).slice(0, REPLY_REPORT_EXCERPT_MAX),
        }),
      });
      if (!res.ok) throw new Error("bildirilemedi");
      setReported(true);
      setReportOpen(false);
      if (messageId) {
        setRating(-1);
        onRated?.(-1);
      }
      toast.success(REPLY_REPORT_THANKS);
    } catch {
      toast.error("Bildirim gönderilemedi", { description: "Bağlantını kontrol edip tekrar dene." });
    } finally {
      setReporting(false);
    }
  }

  const reportButton = (className: string, iconClass?: string) => (
    <button
      type="button"
      className={className}
      data-on={reported || undefined}
      onClick={() => {
        if (reported) return;
        setAskReason(false);
        setReportOpen((open) => !open);
      }}
      aria-expanded={reportOpen}
      aria-label={reported ? "Bildirildi" : "Bildir"}
      title={reported ? "Bildirildi" : "Yanlış ya da uygunsuz yanıtı bildir"}
      disabled={reporting}
    >
      <Flag className={iconClass} aria-hidden />
    </button>
  );

  const reportReasons = (groupClass: string, hintClass: string, buttonClass: string) =>
    reportOpen && !reported ? (
      <div className={groupClass} role="group" aria-label="Yanıtı neden bildiriyorsun?">
        <span className={hintClass}>Neden bildiriyorsun?</span>
        {REPLY_REPORT_REASONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={buttonClass}
            disabled={reporting}
            onClick={() => void report(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null;

  function onThumbUp() {
    setAskReason(false);
    void rate(rating === 1 ? null : 1);
  }

  function onThumbDown() {
    if (rating === -1) {
      setAskReason(false);
      void rate(null);
      return;
    }
    // Önce oyu kaydediyoruz, sebep isteğe bağlı kalıyor: sebep sormadan
    // kaydetmezsek, seçenekleri geçen öğrencinin oyu kaybolurdu.
    void rate(-1);
    setAskReason(true);
  }

  if (layout === "v3") {
    return (
      <div className="cx-v3-acts" role="group" aria-label="Yanıt işlemleri">
        {messageId ? (
          <>
            <button
              type="button"
              className="cx-v3-act"
              data-on={rating === 1 || undefined}
              onClick={onThumbUp}
              aria-pressed={rating === 1}
              aria-label={rating === 1 ? "Beğeniyi geri al" : "Faydalı"}
              title={rating === 1 ? "Beğeniyi geri al" : "Faydalı"}
            >
              <ThumbsUp aria-hidden />
            </button>
            <button
              type="button"
              className="cx-v3-act"
              data-off={rating === -1 || undefined}
              onClick={onThumbDown}
              aria-pressed={rating === -1}
              aria-label={rating === -1 ? "Oyu geri al" : "Faydalı değil"}
              title={rating === -1 ? "Oyu geri al" : "Faydalı değil"}
            >
              <ThumbsDown aria-hidden />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="cx-v3-act"
          data-on={speaking || undefined}
          onClick={toggleSpeech}
          aria-label={speaking ? "Okumayı durdur" : "Sesli dinle"}
          title={speaking ? "Okumayı durdur" : "Sesli dinle"}
        >
          {speaking ? <Square aria-hidden /> : <Volume2 aria-hidden />}
        </button>
        <button type="button" className="cx-v3-act" onClick={copy} aria-label="Kopyala" title="Kopyala">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
        {reportButton("cx-v3-act")}
        {reportReasons("cx-v3-reasons", "cx-v3-reasons-hint", "cx-v3-reason")}
        {askReason && rating === -1 ? (
          <div className="cx-v3-reasons" role="group" aria-label="Sorun neydi?">
            <span className="cx-v3-reasons-hint">Sorun neydi?</span>
            {REASONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cx-v3-reason"
                onClick={() => {
                  setAskReason(false);
                  void rate(-1, item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="cp-msg-actions">
      <button
        type="button"
        className="cp-msg-action"
        onClick={toggleSpeech}
        aria-label={speaking ? "Okumayı durdur" : "Sesli dinle"}
        title={speaking ? "Okumayı durdur" : "Sesli dinle"}
      >
        {speaking ? (
          <Square className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      <button
        type="button"
        className="cp-msg-action"
        onClick={copy}
        aria-label="Kopyala"
        title="Kopyala"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      {onRegenerate ? (
        <button
          type="button"
          className="cp-msg-action"
          onClick={onRegenerate}
          aria-label="Yeniden üret"
          title="Yeniden üret"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}

      {messageId ? (
        <>
          <button
            type="button"
            className={rating === 1 ? "cp-msg-action is-on" : "cp-msg-action"}
            onClick={onThumbUp}
            aria-pressed={rating === 1}
            aria-label={rating === 1 ? "Beğeniyi geri al" : "Faydalı"}
            title={rating === 1 ? "Beğeniyi geri al" : "Faydalı"}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            className={rating === -1 ? "cp-msg-action is-off" : "cp-msg-action"}
            onClick={onThumbDown}
            aria-pressed={rating === -1}
            aria-label={rating === -1 ? "Oyu geri al" : "Faydalı değil"}
            title={rating === -1 ? "Oyu geri al" : "Faydalı değil"}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      ) : null}

      {reportButton("cp-msg-action", "h-3.5 w-3.5")}

      {copied ? <span className="cp-msg-action-hint">Kopyalandı</span> : null}

      {reportReasons("cp-msg-reasons", "cp-msg-action-hint", "cp-msg-reason")}

      {askReason && rating === -1 ? (
        <div className="cp-msg-reasons" role="group" aria-label="Sorun neydi?">
          <span className="cp-msg-action-hint">Sorun neydi?</span>
          {REASONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cp-msg-reason"
              onClick={() => {
                setAskReason(false);
                void rate(-1, item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
