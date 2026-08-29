"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Play } from "lucide-react";

/** Pexels — gece çalışma / sınav hazırlığı (ücretsiz stock, değiştirilebilir) */
const HERO_VIDEO_SRC =
  "https://videos.pexels.com/video-files/6774633/6774633-hd_1280_720_30fps.mp4";

export function CinematicHero() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    if (!q) {
      router.push("/kayit");
      return;
    }
    router.push(`/kayit?prompt=${encodeURIComponent(q)}`);
  }

  return (
    <section className="relative flex min-h-[min(100dvh,920px)] flex-col justify-end overflow-hidden pb-16 pt-28 md:pb-24 md:pt-32">
      <div className="mk-hero-video-wrap" aria-hidden>
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Crect fill='%230a0a0a' width='100%25' height='100%25'/%3E%3C/svg%3E"
        >
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="mk-hero-scrim" />
        <div className="mk-hero-grain" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 text-center">
        <p className="mk-section-reveal text-sm font-medium text-[var(--mk-primary)]">
          Tüm dersler için AI öğretmen
        </p>
        <h1 className="mk-display mk-section-reveal mk-section-reveal-delay-1 mt-4 text-4xl leading-[1.08] md:text-6xl lg:text-7xl">
          Çalışma ve sınav hazırlığında 2 kat hızlı öğren
        </h1>
        <p className="mk-section-reveal mx-auto mt-6 max-w-2xl text-base text-[var(--mk-muted)] md:text-lg">
          Fotoğraftan soru çözümü, deneme sınavları, sözlü pratik ve onlarca
          interaktif uygulama — hepsi Cortex Plus&apos;ta, senin ritminde.
        </p>

        <form
          onSubmit={onSubmit}
          className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-10 max-w-xl"
        >
          <label htmlFor="hero-prompt" className="sr-only">
            AI öğretmene sor
          </label>
          <div className="mk-prompt-bar">
            <input
              id="hero-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Bu hafta hangi konuda zayıfım?"
              autoComplete="off"
            />
            <button type="submit" className="mk-prompt-submit">
              Gönder
            </button>
          </div>
        </form>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-[var(--mk-muted)]">
          <span className="rounded-full border border-white/10 px-3 py-1">
            Ücretsiz başlangıç kredisi
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            Tüm dersler · TR
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            Veli & öğretmen desteği
          </span>
        </div>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mt-8 flex flex-col items-center gap-3">
          <Link href="/kayit" className="mk-btn-play">
            <span className="mk-btn-play-icon" aria-hidden>
              <Play className="h-4 w-4 fill-current" />
            </span>
            Ücretsiz dene
          </Link>
          <Link
            href="/fiyatlandirma"
            className="text-sm text-[var(--mk-muted)] underline-offset-2 hover:text-[var(--mk-text)] hover:underline"
          >
            Plus planlarını incele
          </Link>
        </div>
      </div>
    </section>
  );
}
