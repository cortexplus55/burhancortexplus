"use client";

import "@/styles/teacher-v2-sohbet.css";

/**
 * Faz 11 (teacher.v2): öğretmen ilk parçayı yazana kadar tek satır durum (`thinkingStatus`). Üç nokta hareket
 * azaltmada durur; cümle tek satırda kalır (sığmazsa üç noktayla kısalır), sohbet sütunu sıçramaz.
 */
export function TeacherThinking({ text }: { text: string }) {
  return (
    <div className="cx-v2-thinking" role="status" aria-label={text}>
      <span className="cx-v2-thinking-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="cx-v2-thinking-text" aria-hidden>
        {text}
      </span>
    </div>
  );
}
