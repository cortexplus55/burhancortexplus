"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Play } from "lucide-react";

/**
 * Ana sayfa hero — stok video yerine ürün UI’si.
 * Prompt çubuğu kayıt akışına taşır; görsel gerçek /urun ekranı.
 */
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
    <section className="relative flex min-h-[min(100dvh,820px)] flex-col justify-center overflow-hidden pb-12 pt-24 md:pb-16 md:pt-28">
      {/* Ambient product backdrop — stok video yok */}
      <div className="mk-hero-video-wrap mk-hero-product-bg" aria-hidden>
        <div className="mk-hero-scrim" />
        <div className="mk-hero-grain" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:text-left">
        <div className="text-center lg:text-left">
          <p className="mk-section-reveal text-sm font-medium text-[var(--mk-primary)]">
            Sınav AI öğretmeni · TYT · AYT · LGS
          </p>
          <h1 className="mk-display mk-section-reveal mk-section-reveal-delay-1 mt-4 text-4xl leading-[1.08] md:text-5xl lg:text-6xl">
            Zayıf konunu gör, bir sonraki adımı bil
          </h1>
          <p className="mk-section-reveal mx-auto mt-5 max-w-xl text-base text-[var(--mk-muted)] md:mx-0 md:text-lg">
            Fotoğraftan soru çözümü, deneme analizi ve kişisel plan — ezber
            listesi değil, senin ritminde çalışan bir öğretmen.
          </p>

          <form
            onSubmit={onSubmit}
            className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-8 max-w-xl lg:mx-0"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              AI öğretmene sor
            </label>
            <div className="mk-prompt-bar">
              <input
                id="hero-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Örn. Bu hafta trigonometride nerede takılıyorum?"
                autoComplete="off"
              />
              <button type="submit" className="mk-prompt-submit">
                Gönder
              </button>
            </div>
          </form>

          <div className="mk-section-reveal mk-section-reveal-delay-2 mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--mk-muted)] lg:justify-start">
            <span className="rounded-full border border-white/15 px-3 py-1">
              Ücretsiz başlangıç kredisi
            </span>
            <span className="rounded-full border border-white/15 px-3 py-1">
              Tüm dersler · TR
            </span>
            <span className="rounded-full border border-white/15 px-3 py-1">
              Plus ile gelişmiş model
            </span>
          </div>

          <div className="mk-section-reveal mk-section-reveal-delay-2 mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/kayit" className="mk-btn-play">
              <span className="mk-btn-play-icon" aria-hidden>
                <Play className="h-4 w-4 fill-current" />
              </span>
              Ücretsiz dene
            </Link>
            <Link href="/ornek" className="mk-btn-ghost">
              Nasıl çalıştığını gör
            </Link>
            <Link
              href="/fiyatlandirma"
              className="text-sm text-[var(--mk-muted)] underline-offset-2 hover:text-[var(--mk-text)] hover:underline"
            >
              Plus planlarını incele
            </Link>
          </div>
        </div>

        {/* Gerçek ürün ekranı — stok ofis görseli yerine */}
        <div className="mk-section-reveal mk-section-reveal-delay-2 mk-hero-product-frame mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <div className="mk-hero-product-chrome" aria-hidden>
            <span />
            <span />
            <span />
            <p>Soru çözümü</p>
          </div>
          <Image
            src="/urun/quiz.webp"
            alt="Cortex Plus soru çözümü ekranı — şıklar, açıklama ve konu takibi"
            width={1904}
            height={642}
            priority
            sizes="(max-width: 1024px) 90vw, 520px"
            className="mk-hero-product-img"
          />
        </div>
      </div>
    </section>
  );
}
