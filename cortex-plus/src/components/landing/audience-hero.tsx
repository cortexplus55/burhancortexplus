"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AudienceTabs } from "@/components/landing/audience-tabs";
import { HeroStage } from "@/components/landing/hero-stage";
import { InteractiveShowcase } from "@/components/landing/interactive-showcase";
import { HERO } from "@/lib/marketing/landing-content";
import {
  audienceSegment,
  DEFAULT_SEGMENT,
  resolveSegmentParam,
  type AudienceSegmentId,
} from "@/lib/marketing/landing-showcase";

/**
 * Kahraman + hedef kitle sekmeleri + canlı vitrin tek durumda (7 Kasım 2026). Sayfa önbellekten gelir (5 dk);
 * `?hedef=` ve `utm_campaign` tarayıcıda okunur, sekme ona göre açılır. Sekme değişince adres de değişir
 * (`replaceState`, gezinme yok) — paylaşılan bağlantı aynı sekmeyi açar. Sahne (`HeroStage`) seçili sekmenin notunu,
 * ders ekranını ve yolunu çizer (10 Kasım 2026); ilk çizim varsayılan sekmeyle sunucudan gelir.
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
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-hero-bg" aria-hidden>
          <div className="lp-aurora" />
          <div className="lp-floor" />
        </div>
        <div className="lp-wrap lp-hero-inner">
          <p className="lp-eyebrow" aria-live="polite">
            <span className="lp-live" aria-hidden />
            {segment.badge}
          </p>
          <h1 id="lp-hero-title" className="lp-hero-title">
            {HERO.titleLead} <span className="lp-glow-text">{HERO.titleAccent}</span>
          </h1>
          <p className="lp-hero-lead">{segment.lead}</p>
          <AudienceTabs value={segmentId} onChange={pick} controls="lp-showcase" />
          <div className="lp-cta-row">
            <Link href={segment.signupHref} className="lp-btn lp-btn--primary">
              {segment.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href={HERO.secondary.href} className="lp-btn lp-btn--ghost">
              {HERO.secondary.label}
            </Link>
          </div>
          <p className="lp-fineprint">{HERO.fineprint}</p>
        </div>
        <HeroStage segmentId={segmentId} />
      </section>

      <InteractiveShowcase segmentId={segmentId} onPickSegment={pick} />
    </>
  );
}
