"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Square, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";

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
export function MessageActions({
  content,
  messageId,
  rating: initialRating = null,
  onRated,
}: {
  content: string;
  messageId?: string;
  rating?: Rating;
  onRated?: (rating: Rating) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [rating, setRating] = useState<Rating>(initialRating);
  const [askReason, setAskReason] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => () => stopSpeech(), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Kopyalanamadı", {
        description: "Tarayıcı panoya erişime izin vermedi.",
      });
    }
  }

  function toggleSpeech() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    // Markdown işaretleri sesli okunduğunda "yıldız yıldız" diye duyuluyor.
    const plain = content
      .replace(/```[\s\S]*?```/g, " kod bloğu ")
      .replace(/[*_`#>|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return;
    setSpeaking(true);
    speakTurkish(plain, () => setSpeaking(false));
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

  return (
    <div className="ap-msg-actions">
      <button
        type="button"
        className="ap-msg-action"
        onClick={toggleSpeech}
        aria-label={speaking ? "Okumayı durdur" : "Sesli oku"}
        title={speaking ? "Okumayı durdur" : "Sesli oku"}
      >
        {speaking ? (
          <Square className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      <button
        type="button"
        className="ap-msg-action"
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

      {messageId ? (
        <>
          <button
            type="button"
            className={rating === 1 ? "ap-msg-action is-on" : "ap-msg-action"}
            onClick={onThumbUp}
            aria-pressed={rating === 1}
            aria-label={rating === 1 ? "Beğeniyi geri al" : "Bu yanıt işime yaradı"}
            title={rating === 1 ? "Beğeniyi geri al" : "Bu yanıt işime yaradı"}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            className={rating === -1 ? "ap-msg-action is-off" : "ap-msg-action"}
            onClick={onThumbDown}
            aria-pressed={rating === -1}
            aria-label={rating === -1 ? "Oyu geri al" : "Bu yanıt işime yaramadı"}
            title={rating === -1 ? "Oyu geri al" : "Bu yanıt işime yaramadı"}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      ) : null}

      {copied ? <span className="ap-msg-action-hint">Kopyalandı</span> : null}

      {askReason && rating === -1 ? (
        <div className="ap-msg-reasons" role="group" aria-label="Sorun neydi?">
          <span className="ap-msg-action-hint">Sorun neydi?</span>
          {REASONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ap-msg-reason"
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
