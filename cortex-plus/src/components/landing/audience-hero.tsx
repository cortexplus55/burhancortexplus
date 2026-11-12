"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AudienceTabs } from "@/components/landing/audience-tabs";
import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { HERO, HERO_FACTS, HERO_INPUTS } from "@/lib/marketing/landing-content";
import {
  audienceSegment,
  DEFAULT_SEGMENT,
  resolveSegmentParam,
  type AudienceSegmentId,
} from "@/lib/marketing/landing-showcase";

/**
 * Kahraman + hedef kitle sekmeleri + 7 adımlı canlı kokpit tek durumda ve TEK EKRANDA. Sayfa önbellekten gelir
 * (5 dk); `?hedef=` ve `utm_campaign` tarayıcıda okunur, sekme ona göre açılır. Sekme değişince adres de değişir
 * (`replaceState`, gezinme yok): paylaşılan bağlantı aynı sekmeyi açar.
 *
 * 11 Kasım 2026, kokpit (canlı denetim: "ilk ekranda tıklanamayan bir şema var, hemen altında aynı akış tur
 * olarak tekrar ediyor"): sağdaki durağan sahne kalktı. Üstte söz (başlık ve sekmenin cümlesi), altında tek satırda
 * dört sekme ve kayıt düğmesi; hemen altında tur konsolu. Ziyaretçi sayfayı kaydırmadan turun ilk adımını görür ve oynar.
 * Kısa gerçekler ve "notun yok mu" satırı konsolun altında: ilk ekrandaki yeri tura bırakırlar.
 *
 * Renk mavi değil: zemin sıcak siyah, eylem kâğıt beyazı, vurgu logonun şeridi (aynı gün, ikinci tur).
 */
export function AudienceHero() {
  const [segmentId, setSegmentId] = useState<AudienceSegmentId>(DEFAULT_SEGMENT);

  useEffect(() => {
    const fromUrl = resolveSegmentParam(window.location.search);
    if (fromUrl) setSegmentId(fromUrl);
  }, []);

  const pick = useCallback((id: AudienceSegmentId) => {
    setSegmentId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("hedef", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* adres güncellenemezse sekme yine değişir */
    }
  }, []);

  const segment = audienceSegment(segmentId);

  return (
    <section className="hm-hero" aria-labelledby="lp-hero-title">
      <div className="hm-hero-light" aria-hidden />
      <div className="lp-wrap hm-hero-grid">
        <div className="hm-hero-copy">
          <h1 id="lp-hero-title" className="hm-title">
            <span className="hm-title-line">{HERO.titleLead}</span>{" "}
            <span className="hm-title-line">{HERO.titleAccent}</span>
            <svg className="hm-title-under" viewBox="0 0 320 22" preserveAspectRatio="none" aria-hidden focusable="false">
              <defs>
                <linearGradient id="hm-under" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#ffb224" />
                  <stop offset="0.36" stopColor="#ff4d8d" />
                  <stop offset="0.68" stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <path d="M4 14 C60 2 110 20 168 10 S270 4 316 12" pathLength={1} stroke="url(#hm-under)" />
            </svg>
          </h1>
          <p className="hm-lead" aria-live="polite">
            {segment.lead}
          </p>
        </div>

        <div className="hm-hero-pick">
          <AudienceTabs value={segmentId} onChange={pick} controls="nasil" />
          <div className="hm-cta-row">
            <Link href={segment.signupHref} className="lp-btn lp-btn--primary hm-cta">
              {segment.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* Kokpit: turun kendisi. Sekme durumu buradan iner; tur kayıt bağlantısını ve bağlam satırını ona göre kurar. */}
        <div className="hm-hero-cockpit">
          <FuturisticGuidedJourney segmentId={segmentId} />
        </div>

        <div className="hm-hero-foot">
          <ul className="lp-facts hm-facts" aria-label="Kısaca">
            {HERO_FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p className="lp-inputs">{HERO_INPUTS.accepts}</p>
          <p className="hm-foot-links">
            <Link href={HERO_INPUTS.noNotes.href}>{HERO_INPUTS.noNotes.label}</Link>
            <Link href={HERO.secondary.href}>{HERO.secondary.label}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
