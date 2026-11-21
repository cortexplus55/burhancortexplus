"use client";

import type { RefObject } from "react";
import { ArrowLeft, History, SquarePen, Volume2, VolumeX } from "lucide-react";
import { AUTO_SPEAK_LABEL } from "@/lib/teacher/auto-speak";

/**
 * Öğretmen v3 sohbet çerçevesinin tek üst şeridi (48 px): solda geri (ana ekrana döner), sağda "Sesli yanıt" anahtarı,
 * sohbet geçmişi ve "Yeni sohbet". Uygulamanın üst menüsü ve telefondaki alt sekme çubuğu sohbet açıkken gizlidir
 * (teacher-v3.css).
 *
 * "Sesli yanıt" (21 Kasım 2026, ürün sahibinin istemi): açıkken her yeni öğretmen yanıtı, öğrenci hiçbir yere basmadan
 * öğretmenin doğal sesiyle okunur; tek dokunuşla susar. Tercih tarayıcıda saklanır. Ücretsiz hesapta ses Plus'ta:
 * düğme küçük altın noktayla durur, dokununca yükseltme penceresi açılır.
 */
export function TeacherV3Bar({
  onBack,
  onHistory,
  onNewChat,
  historyRef,
  voice,
}: {
  onBack: () => void;
  onHistory: () => void;
  onNewChat: () => void;
  historyRef?: RefObject<HTMLButtonElement | null>;
  voice?: { on: boolean; locked: boolean; onToggle: () => void };
}) {
  return (
    <header className="cx-v3-bar">
      <button type="button" className="cx-v3-round" aria-label="Geri" title="Ana ekrana dön" onClick={onBack}>
        <ArrowLeft aria-hidden />
      </button>
      <div className="cx-v3-bar-end">
        {voice ? (
          <button
            type="button"
            className="cx-v3-round cx-v3-voice-toggle"
            aria-pressed={voice.on}
            aria-label={voice.locked ? `${AUTO_SPEAK_LABEL} (Plus)` : AUTO_SPEAK_LABEL}
            title={voice.locked ? `${AUTO_SPEAK_LABEL} · Plus` : voice.on ? "Sesli yanıt açık" : "Sesli yanıt kapalı"}
            data-on={voice.on || undefined}
            data-locked={voice.locked || undefined}
            onClick={voice.onToggle}
          >
            {voice.on ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            {voice.locked ? <span className="cx-v3-plus-dot" aria-hidden /> : null}
          </button>
        ) : null}
        <button
          ref={historyRef}
          type="button"
          className="cx-v3-round"
          aria-label="Sohbet geçmişi"
          aria-haspopup="dialog"
          title="Sohbet geçmişi"
          data-tutor-history-opener=""
          onClick={onHistory}
        >
          <History aria-hidden />
        </button>
        <button type="button" className="cx-v3-new" onClick={onNewChat}>
          <SquarePen aria-hidden />
          <span>Yeni sohbet</span>
        </button>
      </div>
    </header>
  );
}
