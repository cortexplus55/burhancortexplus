"use client";

import { MathText } from "@/components/learning/math-text";
import type { BoardCard } from "@/lib/tutor/realtime/config";
import "@/styles/realtime-voice.css";

/*
  Tahta kartı (21 Kasım 2026): öğretmenin konuşurken yazdığı formül ya da kilit kavram. Sohbetin formül kartı ve kilit
  bilgi diliyle aynı aile: formül indigo çerçeveli kartta KaTeX'le (`MathText`, kendi kaçışıyla), kavram turuncu kilit
  bilgi şeridiyle. Ham HTML basılmaz. Sohbet akışında da (entegrasyon) ses çubuğunun üstünde de bu bileşen çizilir.
*/

export const BOARD_KIND_LABEL: Record<BoardCard["kind"], string> = { formula: "Formül", concept: "Kilit kavram" };

export function RealtimeBoardCard({ card, className }: { card: BoardCard; className?: string }) {
  return (
    <aside className={["cx-rv-card", className].filter(Boolean).join(" ")} data-kind={card.kind} aria-label={`${BOARD_KIND_LABEL[card.kind]}: ${card.title}`}>
      <p className="cx-rv-card-kind">{BOARD_KIND_LABEL[card.kind]}</p>
      <p className="cx-rv-card-title">{card.title}</p>
      {card.kind === "formula" ? (
        <MathText className="cx-rv-card-formula" text={card.body} />
      ) : (
        <p className="cx-rv-card-body">{card.body}</p>
      )}
    </aside>
  );
}
