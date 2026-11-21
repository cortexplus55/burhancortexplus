"use client";

import type { ReactNode, RefObject } from "react";
import { ArrowUp, Camera, Loader2, Mic, Plus, Square } from "lucide-react";
import { TeacherV3More } from "@/components/chat/teacher-v3/teacher-v3-more";

/** Ses dalgası: "Konuş" düğmesinin yanındaki küçük çizgiler (hareket azaltmada durur). */
function Waves() {
  return (
    <span className="cx-v3-waves" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Öğretmen v3 yazma kapsülü: tek yuvarlak kap. Sol üstte "⋮ Daha fazla", ortada 1–4 satır uzayan yazma alanı, altta
 * solda "+" (dosya) ve kamera, sağda mikrofon (dikte) ve tek eylem düğmesi: yazı boşken "Konuş" (yalnız sesli mod
 * verildiyse), yazınca yuvarlak "Gönder" (ekranın tek marka düğmesi), yanıt akarken "Durdur".
 */
export function TeacherV3Composer({
  textareaRef,
  value,
  onChange,
  onSubmit,
  placeholder,
  loading,
  hasPayload,
  onStop,
  onAttach,
  onCamera,
  mic,
  onLiveTalk,
  onCommand,
  preview,
  quota,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  loading: boolean;
  /** Yazı ya da ek var mı (Gönder açık). */
  hasPayload: boolean;
  onStop: () => void;
  onAttach: () => void;
  onCamera: () => void;
  mic: { listening: boolean; transcribing: boolean; onToggle: () => void };
  /** Canlı sesli mod. Verilmezse "Konuş" hiç çizilmez; yerinde Gönder durur. */
  onLiveTalk?: () => void;
  onCommand: (prompt: string) => void;
  /** Eklenen dosyanın önizlemesi (ve fotoğrafla iki seçim). */
  preview?: ReactNode;
  /** Ücretsiz hesapta "N mesaj kaldı". */
  quota?: ReactNode;
}) {
  const mode: "stop" | "send" | "talk" = loading ? "stop" : hasPayload || !onLiveTalk ? "send" : "talk";
  const micLabel = mic.listening ? "Kaydı bitir" : mic.transcribing ? "Sesin çözümleniyor" : "Mikrofon";
  return (
    <form
      className="cx-v3-capsule"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "send" && hasPayload) onSubmit();
      }}
    >
      <TeacherV3More disabled={loading} onCommand={onCommand} />
      {preview}
      <textarea
        ref={textareaRef}
        className="cx-v3-input"
        value={value}
        rows={1}
        placeholder={placeholder}
        aria-label="Mesajın"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!loading && hasPayload) onSubmit();
          }
        }}
      />
      <div className="cx-v3-row">
        <div className="cx-v3-row-start">
          <button type="button" className="cx-v3-tool-btn" aria-label="Dosya ekle" title="Dosya ya da PDF ekle" disabled={loading} onClick={onAttach}>
            <Plus aria-hidden />
          </button>
          <button type="button" className="cx-v3-tool-btn" aria-label="Fotoğraf çek" title="Fotoğraf çek" disabled={loading} onClick={onCamera}>
            <Camera aria-hidden />
          </button>
          {quota}
        </div>
        <div className="cx-v3-row-end">
          <button
            type="button"
            className="cx-v3-tool-btn"
            data-live={mic.listening || undefined}
            aria-label={micLabel}
            title={micLabel}
            disabled={loading || mic.transcribing}
            onClick={mic.onToggle}
          >
            {mic.transcribing ? <Loader2 className="cx-v3-spin" aria-hidden /> : <Mic aria-hidden />}
          </button>
          <button
            type={mode === "send" ? "submit" : "button"}
            className="cx-v3-action"
            data-mode={mode}
            aria-label={mode === "stop" ? "Yanıtı durdur" : mode === "talk" ? "Konuş" : "Gönder"}
            disabled={mode === "send" && !hasPayload}
            onClick={(event) => {
              if (mode === "stop") {
                event.preventDefault();
                onStop();
              } else if (mode === "talk") {
                event.preventDefault();
                onLiveTalk?.();
              }
            }}
          >
            <span className="cx-v3-action-talk" aria-hidden>
              <Waves />
              <span>Konuş</span>
            </span>
            <span className="cx-v3-action-icon" aria-hidden>
              {mode === "stop" ? <Square /> : <ArrowUp />}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
