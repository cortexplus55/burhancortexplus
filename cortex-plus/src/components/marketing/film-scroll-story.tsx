"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { Camera, Brain, Rocket, ArrowRight } from "lucide-react";

const ACTS = [
  {
    id: "cek",
    n: "01",
    title: "Çek",
    line: "Soruyu sahneye al.",
    body: "Fotoğraf veya metin — AI anında tanır, çözüme hazırlar.",
    icon: Camera,
    stat: { label: "Güven", value: "%97" },
    lines: ["Soru yakalandı", "Konu eşleşti", "Adımlar hazır"],
  },
  {
    id: "anla",
    n: "02",
    title: "Anla",
    line: "Ezber değil, mantık.",
    body: "Çeldirici, neden yanlış, neden doğru — kalıcı anlayış.",
    icon: Brain,
    stat: { label: "Anlama", value: "%94" },
    lines: ["Adım adım çözüm", "Çeldirici analizi", "Pekiştirme"],
  },
  {
    id: "yuksel",
    n: "03",
    title: "Yüksel",
    line: "Netin görünür olsun.",
    body: "Eksik kapanır, plan güncellenir, ilerleme ölçülür.",
    icon: Rocket,
    stat: { label: "Net", value: "+14" },
    lines: ["28 → 42 net", "Öncelik listesi", "Haftalık plan"],
  },
] as const;

/** Framer Motion scroll hikâyesi — sticky pin + scrub. */
export function FilmScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} className="mk-lux-story" aria-labelledby="lux-story-h">
      <div className="mk-lux-story-sticky">
        <div className="mk-lux-story-head">
          <p className="mk-lux-eyebrow">Ürün filmi</p>
          <h2 id="lux-story-h">Üç hareket. Bir öğretmen.</h2>
          <div className="mk-lux-progress" aria-hidden>
            <motion.span style={{ width: reduce ? "100%" : progress }} />
          </div>
        </div>

        <div className="mk-lux-story-acts">
          {ACTS.map((act, i) => {
            const Icon = act.icon;
            const start = i / ACTS.length;
            const end = (i + 1) / ACTS.length;
            return (
              <ActCard
                key={act.id}
                act={act}
                Icon={Icon}
                start={start}
                end={end}
                progress={scrollYProgress}
                reduce={!!reduce}
              />
            );
          })}
        </div>

        <div className="mk-lux-cta-row mk-lux-cta-row--center">
          <Link href="/kayit" className="mk-lux-btn-primary">
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/ornek" className="mk-lux-btn-ghost">
            Canlı örneği aç
          </Link>
        </div>
      </div>
    </section>
  );
}

function ActCard({
  act,
  Icon,
  start,
  end,
  progress,
  reduce,
}: {
  act: (typeof ACTS)[number];
  Icon: typeof Camera;
  start: number;
  end: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduce: boolean;
}) {
  const opacity = useTransform(
    progress,
    [start, start + 0.08, end - 0.08, end],
    reduce ? [1, 1, 1, 1] : [0, 1, 1, 0],
  );
  const y = useTransform(
    progress,
    [start, start + 0.08, end - 0.08, end],
    reduce ? [0, 0, 0, 0] : [36, 0, 0, -28],
  );
  const scale = useTransform(
    progress,
    [start, start + 0.08, end - 0.08, end],
    reduce ? [1, 1, 1, 1] : [0.97, 1, 1, 0.98],
  );

  return (
    <motion.article className="mk-lux-act" style={{ opacity, y, scale }}>
      <div className="mk-lux-act-copy">
        <p className="mk-lux-act-n">
          <Icon className="h-4 w-4" aria-hidden />
          {act.n} · {act.title}
        </p>
        <h3>{act.line}</h3>
        <p>{act.body}</p>
      </div>
      <div className="mk-lux-act-panel">
        <div className="mk-lux-act-stat">
          <span>{act.stat.label}</span>
          <strong>{act.stat.value}</strong>
        </div>
        <ol>
          {act.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </div>
    </motion.article>
  );
}
