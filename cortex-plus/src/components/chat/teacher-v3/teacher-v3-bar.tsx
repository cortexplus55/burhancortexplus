"use client";

import type { RefObject } from "react";
import { ArrowLeft, History, SquarePen } from "lucide-react";

/**
 * Öğretmen v3 sohbet çerçevesinin tek üst şeridi (48 px): solda geri (ana ekrana döner), sağda sohbet geçmişi ve
 * "Yeni sohbet". Uygulamanın üst menüsü ve telefondaki alt sekme çubuğu sohbet açıkken gizlidir (teacher-v3.css).
 */
export function TeacherV3Bar({
  onBack,
  onHistory,
  onNewChat,
  historyRef,
}: {
  onBack: () => void;
  onHistory: () => void;
  onNewChat: () => void;
  historyRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="cx-v3-bar">
      <button type="button" className="cx-v3-round" aria-label="Geri" title="Ana ekrana dön" onClick={onBack}>
        <ArrowLeft aria-hidden />
      </button>
      <div className="cx-v3-bar-end">
        <button
          ref={historyRef}
          type="button"
          className="cx-v3-round"
          aria-label="Sohbet geçmişi"
          aria-haspopup="dialog"
          title="Sohbet geçmişi"
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
