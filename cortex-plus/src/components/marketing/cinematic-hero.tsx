"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 * i,
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

/**
 * Premium misafir hero — Framer Motion.
 * Tek mesaj + derinlikli ürün sahnesi (önceki kopya değil, üst katman).
 */
export function CinematicHero() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 18 });
  const sy = useSpring(my, { stiffness: 120, damping: 18 });
  const transform = useMotionTemplate`perspective(1200px) rotateX(${sy}deg) rotateY(${sx}deg)`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    mx.set(px * 8);
    my.set(py * -6);
  }

  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    router.push(q ? `/kayit?prompt=${encodeURIComponent(q)}` : "/kayit");
  }

  return (
    <section className="mk-lux-hero">
      <div className="mk-lux-hero-ambient" aria-hidden>
        <span className="mk-lux-glow mk-lux-glow--gold" />
        <span className="mk-lux-glow mk-lux-glow--violet" />
        <span className="mk-lux-grid" />
      </div>

      <div className="mk-lux-hero-grid">
        <div className="mk-lux-copy">
          <motion.p
            className="mk-lux-eyebrow"
            custom={0}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            TYT · AYT · LGS
          </motion.p>

          <motion.h1
            className="mk-lux-title"
            custom={1}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            Study smarter.
          </motion.h1>

          <motion.p
            className="mk-lux-sub"
            custom={2}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            Sınava özel AI öğretmen, tek akışta.
          </motion.p>

          <motion.form
            onSubmit={onSubmit}
            className="mk-lux-prompt"
            custom={3}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            <label htmlFor="lux-prompt" className="sr-only">
              Ne çalışıyorsun?
            </label>
            <input
              id="lux-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Örn. Olasılıkta netim düşük — bu hafta ne yapayım?"
              autoComplete="off"
            />
            <button type="submit">Başla</button>
          </motion.form>

          <motion.div
            className="mk-lux-cta-row"
            custom={4}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            <Link href="/kayit" className="mk-lux-btn-primary">
              Ücretsiz dene
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#urun-sahne" className="mk-lux-btn-ghost">
              Ürünü gör
            </a>
          </motion.div>
          <motion.p
            className="mk-lux-trust"
            custom={5}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate="show"
          >
            Kart gerekmez · Dakikalar içinde başla
          </motion.p>
        </div>

        <motion.div
          ref={stageRef}
          id="urun-sahne"
          className="mk-lux-stage"
          style={reduce ? undefined : { transform }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay: 0.15 }}
        >
          <div className="mk-lux-stage-glow" aria-hidden />
          <div className="mk-lux-window">
            <div className="mk-lux-chrome" aria-hidden>
              <span />
              <span />
              <span />
              <em>Cortex Plus · Canlı önizleme</em>
            </div>
            <div className="mk-lux-ui">
              <aside aria-hidden>
                <p>cortex+</p>
                <ul>
                  <li className="on">Konular</li>
                  <li>Soru çöz</li>
                  <li>Deneme</li>
                  <li>Plan</li>
                </ul>
              </aside>
              <div className="mk-lux-main">
                <header>
                  <div>
                    <p>Matematik · Bu hafta</p>
                    <h2>Zayıf haritan</h2>
                  </div>
                  <motion.div
                    className="mk-lux-ring"
                    initial={reduce ? false : { scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.55, type: "spring", stiffness: 160 }}
                    aria-hidden
                  >
                    <strong>62%</strong>
                    <span>hazır</span>
                  </motion.div>
                </header>
                <ul>
                  {[
                    ["Olasılık", "Öncelik · %34"],
                    ["Fonksiyonlar", "Tekrar · %41"],
                    ["Problemler", "Güçlendir · %48"],
                  ].map(([t, m], i) => (
                    <motion.li
                      key={t}
                      initial={reduce ? false : { opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45 + i * 0.1, duration: 0.45 }}
                    >
                      <div>
                        <strong>{t}</strong>
                        <span>{m}</span>
                      </div>
                      <em>Çalış</em>
                    </motion.li>
                  ))}
                </ul>
                <div className="mk-lux-coach">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <p>
                    Koç: Bu hafta olasılık + fonksiyon 90 dk — deneme netin
                    +4–6 artabilir.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <motion.div
            className="mk-lux-float-card"
            aria-hidden
            animate={
              reduce
                ? undefined
                : { y: [0, -10, 0], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" } }
            }
          >
            <span>Sessiz demo</span>
            <strong>Foto → çözüm → plan</strong>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
