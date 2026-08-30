"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Heart, Pause, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ReviewTools({
  text,
  initialLiked,
  likeHref,
  likeBody,
  copyLabel = "Kopyalandı.",
  ariaLabel = "İçerik araçları",
}: {
  text: string;
  initialLiked: boolean;
  likeHref: string;
  likeBody: Record<string, unknown>;
  copyLabel?: string;
  ariaLabel?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [liked, setLiked] = useState(initialLiked);
  const [savingLike, setSavingLike] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
    };
  }, []);

  function pickTurkishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith("tr")) ??
      voices.find((v) => v.lang.toLowerCase().includes("tr")) ??
      null
    );
  }

  function toggleSpeak() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast.error("Bu tarayıcıda sesli okuma yok.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const clean = text.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
    if (!clean) {
      toast.error("Okunacak metin yok.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 4000));
    utterance.lang = "tr-TR";
    const voice = pickTurkishVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copyLabel);
    } catch {
      toast.error("Kopyalanamadı.");
    }
  }

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setSavingLike(true);
    try {
      const res = await fetch(likeHref, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...likeBody, liked: next }),
      });
      if (!res.ok) {
        setLiked(!next);
        toast.error("Beğeni kaydedilemedi.");
      }
    } catch {
      setLiked(!next);
      toast.error("Beğeni kaydedilemedi.");
    } finally {
      setSavingLike(false);
    }
  }

  return (
    <div className="ap-lesson-toolbar" role="toolbar" aria-label={ariaLabel}>
      <button
        type="button"
        className={cn("ap-lesson-tool", speaking && "ap-lesson-tool--active")}
        onClick={toggleSpeak}
        aria-pressed={speaking}
      >
        {speaking ? (
          <Pause className="h-4 w-4" aria-hidden />
        ) : (
          <Volume2 className="h-4 w-4" aria-hidden />
        )}
        {speaking ? "Durdur" : "Sesli oku"}
      </button>
      <button type="button" className="ap-lesson-tool" onClick={() => void copyText()}>
        <Copy className="h-4 w-4" aria-hidden />
        Kopyala
      </button>
      <button
        type="button"
        className={cn("ap-lesson-tool", liked && "ap-lesson-tool--liked")}
        onClick={() => void toggleLike()}
        disabled={savingLike}
        aria-pressed={liked}
      >
        <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden />
        {liked ? "Beğenildi" : "Beğen"}
      </button>
    </div>
  );
}
