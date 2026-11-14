"use client";

import { useCallback, useState } from "react";
import { ComboChip } from "@/components/arena/combo-chip";
import { LaneProgress } from "@/components/arena/lane-progress";
import { LaunchSequence, type LaunchPhase } from "@/components/arena/launch-sequence";
import { ResultReveal } from "@/components/arena/result-reveal";
import { ShareSheet } from "@/components/arena/share-sheet";
import { SquareStrip } from "@/components/arena/square-strip";
import { TimerRing } from "@/components/arena/timer-ring";

/** Yalnız galeri (Faz 4A): her bileşen bir örnekle; sayılar örnektir. */
export function ArenaGallery() {
  const [phase, setPhase] = useState<LaunchPhase>("preparing");
  const [done, setDone] = useState(false);
  const onDone = useCallback(() => setDone(true), []);
  return (
    <main className="dark cx-arena-gallery" lang="tr">
      <h1 className="cx-t-heading-s">Heyecan kiti</h1>
      <section aria-label="Şeritler">
        <LaneProgress
          lanes={[
            { id: "sen", label: "Sen", value: 6, max: 10, tone: "you" },
            { id: "atlas", label: "Atlas", value: 5, max: 10, tone: "bot", badge: "BOT" },
            { id: "arkadas", label: "Arkadaşın", value: 4, max: 10, tone: "friend" },
          ]}
        />
        <LaneProgress single lanes={[{ id: "hedef", label: "Hedef", value: 3, max: 7, tone: "target" }]} />
      </section>
      <section aria-label="Süre">
        <TimerRing total={20} remaining={12} />
        <TimerRing total={20} remaining={4} />
      </section>
      <section aria-label="Seri">
        <ComboChip combo={3} />
      </section>
      <section aria-label="Açılış">
        <LaunchSequence phase={phase} slots={["Sorular", "Rakip", "Süre"]} progress={phase === "preparing" ? 0.34 : 1} onDone={onDone} onSkip={onDone} />
        <div className="cx-arena-row">
          <button type="button" className="cx-weak cx-t-button-s cx-arena-btn" onClick={() => setPhase("ready")}>
            Hazır
          </button>
          <button type="button" className="cx-weak cx-t-button-s cx-arena-btn" onClick={() => setPhase("countdown")}>
            Geri sayım
          </button>
        </div>
        <p className="cx-t-meta-s" data-testid="launch-done">{done ? "bitti" : "bekliyor"}</p>
      </section>
      <section aria-label="Sonuç">
        <ResultReveal from={0} value={7} />
      </section>
      <section aria-label="Kareler">
        <SquareStrip items={[{ state: "correct" }, { state: "correct" }, { state: "wrong" }, { state: "double" }, { state: "skipped" }, { state: "pending" }]} />
      </section>
      <section aria-label="Paylaş">
        <ShareSheet formats={["story", "square", "link"]} url="https://cortexplus.app" getFiles={async () => []} />
      </section>
    </main>
  );
}
