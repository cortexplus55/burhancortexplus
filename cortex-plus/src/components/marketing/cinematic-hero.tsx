"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Play, Sparkles, CheckCircle2 } from "lucide-react";

/**
 * Misafir hero — Astra seviyesinde sinematik ürün sahnesi.
 * Stok video / okunaksız webp yok: solda net vaat, sağda cam UI sahnesi.
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
    <section className="mk-hero-premium relative flex min-h-[min(100dvh,880px)] flex-col justify-center overflow-hidden pb-14 pt-24 md:pb-20 md:pt-28">
      <div className="mk-hero-ambient" aria-hidden>
        <span className="mk-hero-orb mk-hero-orb--gold" />
        <span className="mk-hero-orb mk-hero-orb--violet" />
        <span className="mk-hero-vignette" />
        <span className="mk-hero-grain" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="text-center lg:text-left">
          <p className="mk-hero-kicker mk-section-reveal">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Sınav AI öğretmeni · TYT · AYT · LGS
          </p>
          <h1 className="mk-hero-title mk-section-reveal mk-section-reveal-delay-1 mt-4">
            Zayıf konunu gör.
            <span className="mk-hero-title-accent"> Bir sonraki adımı bil.</span>
          </h1>
          <p className="mk-section-reveal mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--mk-muted)] md:mx-0 md:text-lg">
            Fotoğraftan çözüm, deneme analizi ve kişisel plan — dağınık kaynak
            değil, tek akışta çalışan öğretmen.
          </p>

          <form
            onSubmit={onSubmit}
            className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-8 max-w-xl lg:mx-0"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              AI öğretmene sor
            </label>
            <div className="mk-prompt-bar mk-prompt-bar--premium">
              <input
                id="hero-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Örn. Trigonometride bu hafta nerede kaybediyorum?"
                autoComplete="off"
              />
              <button type="submit" className="mk-prompt-submit">
                Dene
              </button>
            </div>
          </form>

          <ul className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-5 flex max-w-xl flex-col gap-2 text-sm text-[var(--mk-muted)] lg:mx-0">
            {[
              "Ücretsiz başlangıç — kart gerekmez",
              "Not, deneme ve plan tek yerde",
              "Plus ile daha derin model",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center justify-center gap-2 lg:justify-start"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-[var(--mk-primary)]"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="mk-section-reveal mk-section-reveal-delay-2 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/kayit" className="mk-btn-play">
              <span className="mk-btn-play-icon" aria-hidden>
                <Play className="h-4 w-4 fill-current" />
              </span>
              Ücretsiz dene
            </Link>
            <Link href="/ornek" className="mk-btn-ghost">
              Canlı örneği aç
            </Link>
          </div>
        </div>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mk-hero-stage mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <div className="mk-hero-stage-glow" aria-hidden />
          <div className="mk-hero-window">
            <div className="mk-hero-window-chrome" aria-hidden>
              <span />
              <span />
              <span />
              <p>Konu analizi</p>
            </div>
            <div className="mk-hero-ui">
              <aside className="mk-hero-ui-nav" aria-hidden>
                <p className="mk-hero-ui-brand">cortex+</p>
                <ul>
                  <li className="is-active">Konu analizi</li>
                  <li>Soru çöz</li>
                  <li>Deneme</li>
                  <li>Plan</li>
                </ul>
              </aside>
              <div className="mk-hero-ui-main">
                <div className="mk-hero-ui-head">
                  <div>
                    <p className="mk-hero-ui-label">Matematik · Bu hafta</p>
                    <h2>Zayıf konuların</h2>
                  </div>
                  <div className="mk-hero-ui-ring" aria-hidden>
                    <strong>%62</strong>
                    <span>hazır</span>
                  </div>
                </div>
                <ul className="mk-hero-ui-list">
                  {[
                    { t: "İstatistik & olasılık", m: "Net %34 · öncelik" },
                    { t: "Fonksiyonlar", m: "Net %41 · tekrar" },
                    { t: "Problemler", m: "Net %48 · güçlendir" },
                  ].map((row) => (
                    <li key={row.t}>
                      <div>
                        <strong>{row.t}</strong>
                        <span>{row.m}</span>
                      </div>
                      <em>Çalış</em>
                    </li>
                  ))}
                </ul>
                <div className="mk-hero-ui-note">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <p>
                    AI koç: Bu hafta olasılık ve fonksiyona 90 dk ayır; deneme
                    netin +4–6 artabilir.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mk-hero-stage-caption">Ürün arayüzü önizlemesi</p>
        </div>
      </div>
    </section>
  );
}
