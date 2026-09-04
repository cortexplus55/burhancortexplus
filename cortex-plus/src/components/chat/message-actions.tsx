"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";

/**
 * Yanıtın altındaki işlemler.
 *
 * Beğen/beğenme düğmeleri bilerek yok: `messages` tablosunda not alanı ve
 * sohbet panelinde mesaj kimliği yok, yani şu an basılsa hiçbir yere
 * yazılmazdı. Hiçbir şey yapmayan düğme, olmayan düğmeden kötüdür.
 *
 * Sesli okuma tarayıcının kendi sesini kullanıyor — ücretsiz katmanda da
 * çalışsın diye. Sunucu sesi Plus'a kapalı ve bir yanıtı dinlemek için kota
 * yakmak gereksiz.
 */
export function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

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

      {copied ? <span className="ap-msg-action-hint">Kopyalandı</span> : null}
    </div>
  );
}
