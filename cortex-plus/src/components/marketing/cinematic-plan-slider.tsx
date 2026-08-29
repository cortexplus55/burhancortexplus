"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "free",
    name: "Ücretsiz",
    price: "0 ₺",
    period: "başlangıç",
    highlight: false,
    bullets: [
      "Günlük ücretsiz AI hakları",
      "Temel soru çözümü ve sohbet",
      "Deneme sınavı (kredi ile)",
    ],
    cta: { href: "/kayit", label: "Ücretsiz başla" },
  },
  {
    id: "plus",
    name: "Plus",
    price: "Aylık",
    period: "esnek paketler",
    highlight: true,
    bullets: [
      "Gelişmiş AI modeli",
      "Daha yüksek günlük limit",
      "İlerleme özeti ve öncelikli destek",
    ],
    cta: { href: "/fiyatlandirma", label: "Plus satın al" },
  },
] as const;

export function CinematicPlanSlider() {
  const [active, setActive] = useState<(typeof PLANS)[number]["id"]>("plus");
  const plan = PLANS.find((p) => p.id === active) ?? PLANS[1];

  return (
    <section className="border-t border-[var(--mk-border)] py-20 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
          Planlar
        </p>
        <h2 className="mk-display mt-3 text-3xl md:text-4xl">
          İhtiyacına göre büyü
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-[var(--mk-muted)] md:text-base">
          Önce ücretsiz dene; sınav döneminde Plus ile limit ve model kalitesini
          artır.
        </p>

        <div
          className="mx-auto mt-10 inline-flex w-full max-w-sm rounded-full border border-[var(--mk-border)] bg-[var(--mk-surface)] p-1 sm:max-w-none sm:w-auto"
          role="tablist"
          aria-label="Plan seçimi"
        >
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active === p.id}
              onClick={() => setActive(p.id)}
              className={cn(
                "flex-1 rounded-full px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-8",
                active === p.id
                  ? "bg-amber-500/20 text-amber-200"
                  : "text-[var(--mk-muted)] hover:text-[var(--mk-text)]",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        <article
          className={cn(
            "mk-card mk-card-cinematic mx-auto mt-10 min-h-[320px] max-w-md rounded-3xl p-8 text-left md:mt-12 md:max-w-lg md:p-10",
            plan.highlight && "ring-1 ring-amber-500/30",
          )}
        >
          <p className="text-sm text-[var(--mk-muted)]">{plan.period}</p>
          <p className="mt-1 text-3xl font-bold text-amber-200">{plan.price}</p>
          <ul className="mt-6 space-y-3 text-sm text-[var(--mk-muted)]">
            {plan.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-amber-400" aria-hidden>
                  ✦
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Link
            href={plan.cta.href}
            className={cn(
              "mt-8 inline-flex w-full items-center justify-center rounded-full py-3.5 text-sm font-semibold transition-colors",
              plan.highlight
                ? "bg-[var(--mk-primary)] text-black hover:brightness-110"
                : "border border-[var(--mk-border)] hover:border-amber-500/40",
            )}
          >
            {plan.cta.label}
          </Link>
        </article>
      </div>
    </section>
  );
}
