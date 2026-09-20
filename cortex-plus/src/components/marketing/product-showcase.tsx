"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Camera, LineChart, CalendarRange, ArrowRight } from "lucide-react";

const SCENES = [
  {
    icon: Camera,
    eyebrow: "Soru",
    title: "Fotoğraftan net çözüm",
    body: "Çeldiricilerle gerçek sınav mantığı — yanlışta neden, doğruda pekiştirme.",
    points: ["Anında tanıma", "Adım adım anlatım", "Anlama skoru"],
  },
  {
    icon: LineChart,
    eyebrow: "Analiz",
    title: "Zayıf konu haritası",
    body: "Deneme sonrası kayıplar sıralanır; sıradaki çalışma buna göre kurulur.",
    points: ["Konu bazlı net", "Öncelik listesi", "Koç notu"],
  },
  {
    icon: CalendarRange,
    eyebrow: "Plan",
    title: "Tek akışta öğretmen",
    body: "Sınav tarihine göre günlük bloklar — ne çalışacağını bilerek başla.",
    points: ["Günlük yol", "Süre önerisi", "Takip"],
  },
] as const;

export function ProductShowcase() {
  const reduce = useReducedMotion();
  return (
    <section className="mk-lux-showcase" aria-labelledby="lux-show-h">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <p className="mk-lux-eyebrow">Yakın plan</p>
        <h2 id="lux-show-h">Ürünü yakından oku</h2>
        <p className="mk-lux-showcase-lead">
          Üç sahne. Tek vaat: sınava özel AI öğretmen.
        </p>
      </motion.div>

      <div className="mk-lux-showcase-grid">
        {SCENES.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.article
              key={s.title}
              className="mk-lux-showcase-card"
              initial={reduce ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
              whileHover={reduce ? undefined : { y: -6, transition: { duration: 0.25 } }}
            >
              <p className="mk-lux-eyebrow">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {s.eyebrow}
              </p>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </motion.article>
          );
        })}
      </div>

      <div className="mk-lux-cta-row mk-lux-cta-row--center">
        <Link href="/kayit" className="mk-lux-btn-primary">
          Ücretsiz dene
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/ornek" className="mk-lux-btn-ghost">
          Ürünü gör
        </Link>
      </div>
    </section>
  );
}
