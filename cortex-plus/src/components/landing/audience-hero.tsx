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
 * Kahraman + hedef kitle sekmeleri + 7 adımlı tanıtım turu tek durumda. Sayfa önbellekten gelir (5 dk);
 * `?hedef=` ve `utm_campaign` tarayıcıda okunur, sekme ona göre açılır. Sekme değişince adres de değişir
 * (`replaceState`, gezinme yok) — paylaşılan bağlantı aynı sekmeyi açar.
 *
 * 11 Kasım 2026 (ürün sahibi: "kısa ve net"): kahraman tek cümleye indi; altında üç gerçek (kart yok, ilk ders
 * süresiz ücretsiz, otomatik yenileme yok) ve kabul edilen dosya türleri. Eski maket (not → telefon → yol) ve
 * ayrı vitrin kalktı: aynı hikâyeyi artık ziyaretçi turda kendi tıklamasıyla yaşıyor.
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
      <section className="lp-hero lp-hero--lean" aria-labelledby="lp-hero-title">
        <div className="lp-hero-bg" aria-hidden>
          <div className="lp-aurora" />
          <div className="lp-floor" />
        </div>
        <div className="lp-wrap lp-hero-inner">
          <h1 id="lp-hero-title" className="lp-hero-title">
            {HERO.titleLead} <span className="lp-glow-text">{HERO.titleAccent}</span>
          </h1>
          <p className="lp-hero-lead" aria-live="polite">
            {segment.lead}
          </p>
          <AudienceTabs value={segmentId} onChange={pick} controls="nasil" />
          <div className="lp-cta-row">
            <Link href={segment.signupHref} className="lp-btn lp-btn--primary">
              {segment.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href={HERO.secondary.href} className="lp-btn lp-btn--ghost">
              {HERO.secondary.label}
            </Link>
          </div>
          <ul className="lp-facts" aria-label="Kısaca">
            {HERO_FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p className="lp-inputs">
            {HERO_INPUTS.accepts}{" "}
            <Link href={HERO_INPUTS.noNotes.href}>{HERO_INPUTS.noNotes.label}</Link>
          </p>
        </div>
      </section>

      <FuturisticGuidedJourney segmentId={segmentId} />
    </>
  );
}
