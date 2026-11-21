"use client";

import { useState } from "react";
import { RealtimeBoardCard } from "@/components/chat/realtime/realtime-board-card";
import { RealtimeVoiceBar } from "@/components/chat/realtime/realtime-voice-bar";
import type { BoardCard } from "@/lib/tutor/realtime/config";
import type { TranscriptUpdate } from "@/lib/tutor/realtime/engine";
import type { RealtimeEndResult } from "@/lib/tutor/realtime/use-realtime-tutor";

/*
  Yalnız test fikstürü (E2E_FIXTURE=1): sohbetin içinde canlı sesli ders. Satırlar ve tahta kartları akışa düşer
  (entegrasyonun yapacağı gibi), çubuk yazma alanının yerinde. `endpoint` fikstür ucunu (kimliksiz, kredisiz) gösterir.
*/

type Entry = { kind: "turn"; turn: TranscriptUpdate } | { kind: "card"; card: BoardCard };

export function SesliDersFixture({
  endpoint,
  dock,
  theme,
  autoStart,
}: {
  endpoint: string;
  dock: "inline" | "bottom";
  theme: "dark" | "light";
  autoStart: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ended, setEnded] = useState<RealtimeEndResult | null>(null);

  const onTranscript = (turn: TranscriptUpdate) => {
    setEntries((current) => {
      const index = current.findIndex((entry) => entry.kind === "turn" && entry.turn.id === turn.id);
      if (turn.final && !turn.text.trim()) return index >= 0 ? current.filter((_, i) => i !== index) : current;
      if (index >= 0) {
        const next = current.slice();
        next[index] = { kind: "turn", turn };
        return next;
      }
      return [...current, { kind: "turn", turn }];
    });
  };

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <main
        style={{
          minHeight: "100dvh",
          background: "var(--cx-bg-0)",
          color: "var(--cx-text-primary)",
          padding: "24px 16px 200px",
          fontFamily: "var(--cx-font-sans)",
        }}
      >
        <div style={{ maxWidth: "48rem", margin: "0 auto", display: "grid", gap: 12 }} data-testid="rv-thread">
          {entries.map((entry) =>
            entry.kind === "card" ? (
              <RealtimeBoardCard key={entry.card.id} card={entry.card} />
            ) : (
              <p
                key={entry.turn.id}
                data-role={entry.turn.role}
                data-final={entry.turn.final ? "true" : "false"}
                style={{
                  margin: 0,
                  padding: "10px 14px",
                  borderRadius: 16,
                  background: entry.turn.role === "user" ? "var(--cx-brand-weak)" : "var(--cx-bg-1)",
                  justifySelf: entry.turn.role === "user" ? "end" : "start",
                  maxWidth: "85%",
                  font: "var(--cx-t-body-16)",
                }}
              >
                {entry.turn.text || "…"}
              </p>
            ),
          )}
          {ended ? <pre data-testid="rv-ended">{JSON.stringify(ended)}</pre> : null}
        </div>
        <div style={dock === "inline" ? { maxWidth: "48rem", margin: "24px auto 0" } : undefined}>
          <RealtimeVoiceBar
            endpoint={endpoint}
            dock={dock}
            autoStart={autoStart}
            onTranscript={onTranscript}
            onBoardCard={(card) => setEntries((current) => [...current, { kind: "card", card }])}
            onEnded={(result) => setEnded(result)}
          />
        </div>
      </main>
    </div>
  );
}
