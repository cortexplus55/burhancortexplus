"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Play, Sparkles, CheckCircle2, Zap } from "lucide-react";

/**
 * Misafir hero — film jeneriği seviyesinde agresif sahne.
 * Düz webp yok; cam ürün UI + ışık huzmeleri + net sonuç vaadi.
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
    <section className="mk-film-hero relative flex min-h-[min(100dvh,920px)] flex-col justify-center overflow-hidden pb-16 pt-24 md:pb-24 md:pt-28">
      <div className="mk-film-hero-fx" aria-hidden>
        <span className="mk-film-beam mk-film-beam--a" />
        <span className="mk-film-beam mk-film-beam--b" />
        <span className="mk-film-orb mk-film-orb--gold" />
        <span className="mk-film-orb mk-film-orb--violet" />
        <span className="mk-film-orb mk-film-orb--core" />
        <span className="mk-film-vignette" />
        <span className="mk-film-grain" />
        <span className="mk-film-scan" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-4 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
        <div className="text-center lg:text-left">
          <p className="mk-film-kicker mk-section-reveal">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            TYT · AYT · LGS — film gibi çalışan AI öğretmen
          </p>
          <h1 className="mk-film-title mk-section-reveal mk-section-reveal-delay-1 mt-5">
            Zayıf konunu gör.
            <span className="mk-film-title-line">Netini patlat.</span>
          </h1>
          <p className="mk-section-reveal mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--mk-muted)] md:mx-0 md:text-lg">
            Fotoğraftan çözüm, deneme analizi, kişisel plan — dağınık PDF değil;
            sahne sahne yükselten öğretmen.
          </p>

          <form
            onSubmit={onSubmit}
            className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-8 max-w-xl lg:mx-0"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              AI öğretmene sor
            </label>
            <div className="mk-prompt-bar mk-prompt-bar--film">
              <input
                id="hero-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Örn. Trigonometride bu hafta nerede kaybediyorum?"
                autoComplete="off"
              />
              <button type="submit" className="mk-prompt-submit">
                Sahneyi aç
              </button>
            </div>
          </form>

          <ul className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-5 flex max-w-xl flex-col gap-2 text-sm text-[var(--mk-muted)] lg:mx-0">
            {[
              "Kart yok — hemen başla",
              "Soru → analiz → plan tek film",
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
            <Link href="/kayit" className="mk-btn-play mk-btn-play--film">
              <span className="mk-btn-play-icon" aria-hidden>
                <Play className="h-4 w-4 fill-current" />
              </span>
              Ücretsiz dene
            </Link>
            <Link href="/ornek" className="mk-btn-ghost">
              Canlı örneği izle
            </Link>
          </div>
        </div>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mk-film-stage mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <div className="mk-film-stage-glow" aria-hidden />
          <div className="mk-film-ticket" aria-hidden>
            <Sparkles className="h-3.5 w-3.5" />
            <span>Net</span>
            <strong>28 → 42</strong>
          </div>
          <div className="mk-hero-window mk-film-window">
            <div className="mk-hero-window-chrome" aria-hidden>
              <span />
              <span />
              <span />
              <p>Konu analizi · canlı</p>
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
                    AI koç: Bu hafta olasılık + fonksiyon 90 dk — deneme netin
                    +4–6 artabilir.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mk-film-phone" aria-hidden>
            <div className="mk-film-phone-chrome">
              <span />
              <em>Soru çözücü</em>
            </div>
            <p className="mk-film-phone-q">log₂(x) + log₂(x−2) = 3</p>
            <ol>
              <li>Tanım: x &gt; 2</li>
              <li>log₂[x(x−2)] = 3</li>
              <li>x² − 2x − 8 = 0 → x = 4</li>
            </ol>
          </div>
          <p className="mk-hero-stage-caption">Ürün arayüzü önizlemesi</p>
        </div>
      </div>
    </section>
  );
}
