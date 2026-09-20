"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Timer } from "lucide-react";

export function FilmClimaxCta() {
  const reduce = useReducedMotion();
  return (
    <section className="mk-lux-climax" aria-labelledby="lux-climax-h">
      <motion.div
        className="mk-lux-climax-inner"
        initial={reduce ? false : { opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <p className="mk-lux-eyebrow">Final</p>
        <h2 id="lux-climax-h">Study smarter.</h2>
        <p>Sınava özel AI öğretmen, tek akışta. Kart gerekmez.</p>
        <div className="mk-lux-cta-row mk-lux-cta-row--center">
          <Link href="/kayit" className="mk-lux-btn-primary">
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/ornek" className="mk-lux-btn-ghost">
            Ürünü gör
          </Link>
        </div>
        <ul className="mk-lux-trust-row">
          <li>
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Kart gerekmez
          </li>
          <li>
            <Timer className="h-4 w-4" aria-hidden />
            Dakikalar içinde
          </li>
          <li>
            <Sparkles className="h-4 w-4" aria-hidden />
            TYT · AYT · LGS
          </li>
        </ul>
      </motion.div>
    </section>
  );
}
