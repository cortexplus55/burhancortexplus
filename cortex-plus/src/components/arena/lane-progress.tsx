import type { CSSProperties } from "react";
import "@/styles/arena.css";

/*
  Şeritli ilerleme (Faz 4A, ANA-PROMPT 4A). Sen camgöbeği, bot pembe-mor, arkadaş mor (--cx-lane-*); hedef nötr.
  Bot şeridinde "BOT" rozeti tip düzeyinde zorunludur: rozetsiz bot şeridi derlenmez (bot gerçek bir kişi sanılmasın).
  Ekran okuyucu tek özet okur ("Sen 6, Atlas 5"); şeritlerin kendisi süs.
*/

type LaneBase = { id: string; label: string; value: number; max: number };
export type Lane =
  | (LaneBase & { tone: "you" | "friend" | "target"; badge?: string })
  | (LaneBase & { tone: "bot"; badge: "BOT" });

export function laneSummary(lanes: readonly Lane[]): string {
  return lanes.map((lane) => `${lane.label} ${lane.value}`).join(", ");
}

const pct = (lane: Lane) => (lane.max > 0 ? Math.max(0, Math.min(100, (lane.value / lane.max) * 100)) : 0);

export function LaneProgress({ lanes, single = false }: { lanes: readonly Lane[]; single?: boolean }) {
  const shown = single ? lanes.slice(0, 1) : lanes;
  return (
    <div className="cx-lanes" data-single={single ? "" : undefined} role="img" aria-label={laneSummary(shown)}>
      {shown.map((lane) => (
        <div key={lane.id} className="cx-lane" data-tone={lane.tone} aria-hidden>
          <span className="cx-lane-head">
            <span className="cx-t-label-13 cx-lane-label">{lane.label}</span>
            {lane.badge ? <span className="cx-t-meta-xs cx-lane-badge">{lane.badge}</span> : null}
            <span className="cx-t-meta-s cx-lane-value">{lane.value}</span>
          </span>
          <span className="cx-lane-track">
            <span className="cx-lane-fill" style={{ "--cx-lane-pct": `${pct(lane)}%` } as CSSProperties} />
          </span>
        </div>
      ))}
    </div>
  );
}
