"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Astra-sakin misafir hero.
 * Tek mesaj + büyük ürün demosu + sessiz demo paneli.
 * Film/ışık şovu yok.
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
    <section className="mk-astra-hero">
      <div className="mk-astra-hero-inner">
        <div className="mk-astra-copy">
          <p className="mk-astra-eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            TYT · AYT · LGS
          </p>
          <h1 className="mk-astra-title">Study smarter.</h1>
          <p className="mk-astra-sub">
            Sınava özel AI öğretmen, tek akışta.
          </p>

          <form onSubmit={onSubmit} className="mk-astra-prompt">
            <label htmlFor="astra-hero-prompt" className="sr-only">
              Ne çalışıyorsun?
            </label>
            <input
              id="astra-hero-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Örn. Trigonometri eksiklerim, bu hafta ne yapayım?"
              autoComplete="off"
            />
            <button type="submit">Başla</button>
          </form>

          <div className="mk-astra-cta-row">
            <Link href="/kayit" className="mk-astra-btn-primary">
              Ücretsiz dene
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#urun-demo" className="mk-astra-btn-secondary">
              Ürünü gör
            </a>
          </div>
          <p className="mk-astra-trust">Kart gerekmez · Dakikalar içinde başla</p>
        </div>

        <div className="mk-astra-stage" id="urun-demo" aria-label="Ürün demosu">
          <div className="mk-astra-demo-window">
            <div className="mk-astra-demo-chrome" aria-hidden>
              <span />
              <span />
              <span />
              <em>Cortex Plus · Konu haritası</em>
            </div>
            <div className="mk-astra-demo-body">
              <aside className="mk-astra-demo-nav" aria-hidden>
                <p>cortex+</p>
                <ul>
                  <li className="is-on">Konular</li>
                  <li>Soru çöz</li>
                  <li>Deneme</li>
                  <li>Plan</li>
                </ul>
              </aside>
              <div className="mk-astra-demo-main">
                <header>
                  <div>
                    <p>Matematik · Bu hafta</p>
                    <h2>Zayıf konuların</h2>
                  </div>
                  <div className="mk-astra-demo-score" aria-hidden>
                    <strong>62%</strong>
                    <span>hazır</span>
                  </div>
                </header>
                <ul className="mk-astra-demo-list">
                  <li>
                    <div>
                      <strong>Olasılık</strong>
                      <span>Öncelik · net %34</span>
                    </div>
                    <em>Çalış</em>
                  </li>
                  <li>
                    <div>
                      <strong>Fonksiyonlar</strong>
                      <span>Tekrar · net %41</span>
                    </div>
                    <em>Çalış</em>
                  </li>
                  <li>
                    <div>
                      <strong>Problemler</strong>
                      <span>Güçlendir · net %48</span>
                    </div>
                    <em>Çalış</em>
                  </li>
                </ul>
                <div className="mk-astra-demo-coach">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <p>
                    Bu hafta olasılık + fonksiyon: 90 dk. Deneme netin +4–6
                    artabilir.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mk-astra-video-card">
            <div className="mk-astra-video-badge">Sessiz demo</div>
            <div className="mk-astra-video-screen" aria-hidden>
              <div className="mk-astra-video-line mk-astra-video-line--a" />
              <div className="mk-astra-video-line mk-astra-video-line--b" />
              <div className="mk-astra-video-line mk-astra-video-line--c" />
              <p>Fotoğraf → adım adım çözüm → plan</p>
            </div>
            <p className="mk-astra-video-caption">
              Ürün akışı önizlemesi · ses kapalı
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
