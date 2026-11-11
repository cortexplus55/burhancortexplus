"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, PlayCircle } from "lucide-react";
import { AudienceTabs } from "@/components/landing/audience-tabs";
import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { HeroScene } from "@/components/landing/hero-scene";
import { HERO, HERO_FACTS, HERO_INPUTS } from "@/lib/marketing/landing-content";
import {
  audienceSegment,
  DEFAULT_SEGMENT,
  resolveSegmentParam,
  type AudienceSegmentId,
} from "@/lib/marketing/landing-showcase";

/**
 * Kahraman + hedef kitle sekmeleri + 7 adımlı tanıtım turu tek durumda. Sayfa önbellekten gelir (5 dk);
 * `?hedef=` ve `utm_campaign` tarayıcıda okunur, sekme ona göre açılır. Sekme değişince adres de değişir
 * (`replaceState`, gezinme yok) — paylaşılan bağlantı aynı sekmeyi açar.
 *
 * 11 Kasım 2026, ikinci tur (ürün sahibi: "mavi zemin, mavi düğme klasik yapay zekâ sitesi gibi; yenilikçi,
 * sinematik, fütüristik olsun; ana ekran boş kalmış"): kahraman iki sütun. Solda söz (başlık, sekmenin tek
 * cümlesi, kayıt), sağda sahne: ders notu ve ondan çıkan ışık şeridi (`HeroScene`). Başlığın altındaki çizgi de
 * aynı şerittir. Renk mavi değil: zemin sıcak siyah, eylem kâğıt beyazı, vurgu logonun şeridi.
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
    <>
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
            <AudienceTabs value={segmentId} onChange={pick} controls="nasil" />
            <div className="hm-cta-row">
              <Link href={segment.signupHref} className="lp-btn lp-btn--primary hm-cta">
                {segment.ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href={HERO.secondary.href} className="lp-btn lp-btn--ghost hm-cta-ghost">
                <PlayCircle className="h-4 w-4" aria-hidden />
                {HERO.secondary.label}
              </Link>
            </div>
            <ul className="lp-facts hm-facts" aria-label="Kısaca">
              {HERO_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
            <p className="lp-inputs">
              {HERO_INPUTS.accepts}{" "}
              <Link href={HERO_INPUTS.noNotes.href}>{HERO_INPUTS.noNotes.label}</Link>
            </p>
          </div>
          <HeroScene />
        </div>
      </section>

      <FuturisticGuidedJourney segmentId={segmentId} />
    </>
  );
}
