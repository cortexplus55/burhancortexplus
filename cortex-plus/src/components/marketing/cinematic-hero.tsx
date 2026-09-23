"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Misafir hero — Astra iskeleti: trust → headline → alt → 2 CTA → laptop + telefon.
 * Kilit metin: Bilgiye hükmet. / Ücretsiz dene / Cortex Plus al
 */
export function CinematicHero() {
  return (
    <section className="mk-hero-premium mk-hero-astra relative flex min-h-[min(100dvh,960px)] flex-col justify-center overflow-hidden pb-20 pt-24 md:pb-28 md:pt-28">
      <div className="mk-hero-ambient" aria-hidden>
        <span className="mk-hero-orb mk-hero-orb--gold" />
        <span className="mk-hero-orb mk-hero-orb--violet" />
        <span className="mk-hero-vignette" />
        <span className="mk-hero-grain" />
        <span className="mk-hero-stars" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 text-center">
        <p className="mk-hero-kicker mk-section-reveal">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          YKS · KPSS · ALES
        </p>

        <h1 className="mk-hero-title mk-hero-title--astra mk-section-reveal mk-section-reveal-delay-1 mt-5">
          Bilgiye hükmet.
        </h1>

        <p className="mk-section-reveal mx-auto mt-4 max-w-xl text-base leading-relaxed text-[color:var(--mk-muted,#a1a1aa)] md:text-lg">
          Sınava özel AI öğretmen, tek akışta.
        </p>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/kayit" className="mk-btn-primary-glow">
            Ücretsiz dene
          </Link>
          <Link href="/paketler" className="mk-btn-secondary-spark">
            <span aria-hidden>✦</span>
            Cortex Plus al
          </Link>
        </div>

        <div className="mk-device-stage mt-16 w-full max-w-[720px]">
          <div className="mk-device-stage-glow" aria-hidden />
          <div className="mk-device-stage-floor" aria-hidden />

          <div className="mk-mbp" aria-label="Cortex Plus masaüstü önizleme">
            <div className="mk-mbp-lid">
              <div className="mk-mbp-bezel">
                <span className="mk-mbp-camera" aria-hidden />
                <div className="mk-mbp-glass">
                  <div className="mk-mbp-shine" aria-hidden />
                  <div className="mk-dash">
                    <aside className="mk-dash-nav">
                      <p className="mk-dash-brand">cortex+</p>
                      <ul>
                        <li className="is-active">Genel bakış</li>
                        <li>Zayıf konular</li>
                        <li>Plan</li>
                        <li>AI öğretmen</li>
                      </ul>
                    </aside>
                    <div className="mk-dash-main">
                      <div className="mk-dash-head">
                        <div>
                          <p className="mk-dash-label">Bu hafta</p>
                          <h2>Zayıf noktaların</h2>
                        </div>
                        <div className="mk-dash-ring">
                          <strong>%62</strong>
                          <span>hazır</span>
                        </div>
                      </div>
                      <div className="mk-dash-chart" aria-hidden>
                        <span style={{ height: "38%" }} />
                        <span style={{ height: "52%" }} />
                        <span style={{ height: "44%" }} />
                        <span style={{ height: "68%" }} />
                        <span style={{ height: "81%" }} />
                        <span className="is-gold" style={{ height: "94%" }} />
                      </div>
                      <ul className="mk-dash-list">
                        <li>
                          <div>
                            <strong>İstatistik</strong>
                            <span>Net %34 · öncelik</span>
                          </div>
                          <em>Çalış</em>
                        </li>
                        <li>
                          <div>
                            <strong>Fonksiyonlar</strong>
                            <span>Net %41 · tekrar</span>
                          </div>
                          <em>Çalış</em>
                        </li>
                        <li>
                          <div>
                            <strong>Problemler</strong>
                            <span>Net %48 · güçlendir</span>
                          </div>
                          <em>Çalış</em>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mk-mbp-chin" aria-hidden>
              <span className="mk-mbp-logo" />
            </div>
            <div className="mk-mbp-base" aria-hidden>
              <span className="mk-mbp-indent" />
            </div>
            <div className="mk-mbp-shadow" aria-hidden />
          </div>

          <div className="mk-iphone" aria-label="Cortex Plus mobil AI öğretmen">
            <span className="mk-iphone-btn mk-iphone-btn--silent" aria-hidden />
            <span className="mk-iphone-btn mk-iphone-btn--volup" aria-hidden />
            <span className="mk-iphone-btn mk-iphone-btn--voldown" aria-hidden />
            <span className="mk-iphone-btn mk-iphone-btn--power" aria-hidden />
            <div className="mk-iphone-frame">
              <div className="mk-iphone-screen">
                <span className="mk-iphone-island" aria-hidden />
                <div className="mk-iphone-shine" aria-hidden />
                <div className="mk-iphone-ui">
                  <p className="mk-phone-hi">Merhaba</p>
                  <div className="mk-phone-orb" aria-hidden />
                  <p className="mk-phone-title">AI öğretmen hazır</p>
                  <p className="mk-phone-sub">Materyalini ver — planı çıkaralım.</p>
                  <div className="mk-phone-chips">
                    <span>TYT</span>
                    <span>AYT</span>
                    <span>KPSS</span>
                  </div>
                  <div className="mk-phone-cta">Sohbete başla ✦</div>
                </div>
              </div>
            </div>
            <div className="mk-iphone-shadow" aria-hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
