"use client";

import Link from "next/link";
import "@/styles/topic-gain.css";

export type TopicGain = { label: string; before: number; after: number };

/** Kart yalnız gerçek bir artışta açılır; düşüş ya da aynı kalış kutlanmaz. */
export function topicGainWorthShowing(gain: unknown): gain is TopicGain {
  if (!gain || typeof gain !== "object") return false;
  const row = gain as Record<string, unknown>;
  return (
    typeof row.label === "string" &&
    row.label.trim().length > 0 &&
    typeof row.before === "number" &&
    typeof row.after === "number" &&
    Number.isFinite(row.before) &&
    Number.isFinite(row.after) &&
    row.after > row.before
  );
}

/**
 * Sonuç ekranından sonra "+%X kazandın" (19 Ekim 2026, Astra'da test sonrası "+6% kazandın ·
 * Konu hakimiyeti 18%"). Sayı konu hâkimiyetinin kendisi (`exam_prep_topic_mastery.confidence`):
 * bu etkinliğin cevaplarıyla değişen güven, önce ve sonra.
 */
export function TopicGainCard({ gain, nextHref }: { gain: TopicGain; nextHref: string }) {
  const delta = Math.max(1, Math.round(gain.after - gain.before));
  const after = Math.max(0, Math.min(100, Math.round(gain.after)));
  return (
    <section className="cp-topic-gain" aria-labelledby="cp-topic-gain-title">
      <h1 id="cp-topic-gain-title" className="cp-topic-gain-title">
        <span>+%{delta}</span> kazandın!
      </h1>
      <p className="cp-topic-gain-topic">{gain.label} konusunda</p>
      <div
        className="cp-topic-gain-tile"
        role="img"
        aria-label={`Konu hâkimiyeti yüzde ${after}`}
        style={{ ["--gain" as string]: `${after}` }}
      >
        <p className="cp-topic-gain-kicker">Konu hâkimiyeti</p>
        <p className="cp-topic-gain-ring">
          <strong>%{after}</strong>
        </p>
      </div>
      <p className="cp-topic-gain-note">Her etkinlik seni hedefine biraz daha yaklaştırır.</p>
      <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary cp-topic-gain-continue">
        Devam et
      </Link>
    </section>
  );
}
