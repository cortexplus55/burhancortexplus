"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AudiencePicker } from "@/components/landing/audience-picker";
import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { segmentForTrack, trackForSegment, type GuestTrackId } from "@/lib/marketing/guest-demo-tracks";
import { HERO, HERO_FOOT } from "@/lib/marketing/landing-content";
import { PRODUCT_SUMMARY } from "@/lib/marketing/product-definition";
import {
  audienceSegment,
  DEFAULT_SEGMENT,
  resolveSegmentParam,
  type AudienceSegmentId,
} from "@/lib/marketing/landing-showcase";

/** Profil adreste kalır (`?hedef=`): paylaşılan bağlantı aynı seçimi açar. Gezinme yok. */
function writeSegmentToUrl(id: AudienceSegmentId) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("hedef", id);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* adres güncellenemezse seçim yine değişir */
  }
}

/**
 * Kahraman + tek seçici + 7 adımlı turun birinci adımı TEK EKRANDA. Sayfa önbellekten gelir (5 dk); `?hedef=` ve
 * `utm_*` tarayıcıda okunur, seçim ona göre açılır. Seçim değişince adres de değişir (`replaceState`, gezinme yok).
 *
 * 11 Kasım 2026, kokpit: kahraman ile tur tek ekranda; sağdaki durağan sahne kalktı.
 * Renk mavi değil: zemin sıcak siyah, eylem kâğıt beyazı, vurgu logonun şeridi (aynı gün, ikinci tur).
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi: "sade, ortada, tek seçici"): kahramandaki dört sekme ile turun branş şeridi tek
 * seçicide birleşti (`AudiencePicker`). Seçenek bir branştır; profil (cümle, kayıt bağlantısı) ondan gelir. Eski
 * bağlantılar çalışır: `?hedef=yks-lgs` "Lise & YKS" seçeneğini açar ve kayıt bağlantısında `yks-lgs` kalır. Kahramanın
 * altı tek satır (`HERO_FOOT`). Söz ortada: başlık, cümle, seçici ve kayıt düğmesi; hemen altında turun birinci adımı.
 */
export function AudienceHero() {
  const [segmentId, setSegmentId] = useState<AudienceSegmentId>(DEFAULT_SEGMENT);
  const trackId = trackForSegment(segmentId);

  useEffect(() => {
    const fromUrl = resolveSegmentParam(window.location.search);
    if (fromUrl) setSegmentId(fromUrl);
  }, []);

  const pickTrack = useCallback(
    (track: GuestTrackId) => {
      const next = segmentForTrack(track, segmentId);
      if (next === segmentId) return;
      setSegmentId(next);
      writeSegmentToUrl(next);
    },
    [segmentId],
  );

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
          {/* Seçim değişince cümle yeniden belirir (anahtar animasyonu baştan başlatır). */}
          <p key={segment.id} className="hm-lead" aria-live="polite">
            {segment.lead}
          </p>
        </div>

        {/*
          Ürünün tanımı (27 Kasım 2026, GEO): HTML'de başlığın hemen ardında, sayfanın ilk kelimeleri arasında (yapay zekâ
          aramaları ve ekran okuyucu önce bunu okur); ekranda turun altında durur (`grid-area: define`), ilk ekrandaki
          ölçüler değişmez. Gizli değil, herkes görür.
        */}
        <p className="hm-define" data-product-definition>
          {PRODUCT_SUMMARY}
        </p>

        <div className="hm-hero-pick">
          <AudiencePicker value={trackId} onChange={pickTrack} controls="nasil" />
          <div className="hm-cta-row">
            <Link href={segment.signupHref} className="lp-btn lp-btn--primary hm-cta" data-hero-cta>
              <span key={segment.id} className="hm-cta-label">
                {segment.ctaLabel}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* Turun birinci adımı: profil ve branş buradan iner; tur kayıt bağlantısını, örnek notu ve yedi adımı ona göre kurar. */}
        <div className="hm-hero-cockpit">
          <FuturisticGuidedJourney segmentId={segmentId} trackId={trackId} />
        </div>

        {/* Kahramanın altı tek satır: iki gerçek ve iki bağlantı; ayraçlar ekran okuyucuda okunmaz. */}
        <p className="hm-hero-foot" data-hero-foot>
          {HERO_FOOT.facts.map((fact) => (
            <Fragment key={fact}>
              <span className="hm-foot-fact">{fact}</span>{" "}
              <span className="hm-foot-sep" aria-hidden>
                ·
              </span>{" "}
            </Fragment>
          ))}
          <span className="hm-foot-fact">
            {HERO_FOOT.noNotes.lead}{" "}
            <Link href={HERO_FOOT.noNotes.href} className="hm-foot-link">
              {HERO_FOOT.noNotes.label}
              <span aria-hidden>→</span>
            </Link>
          </span>{" "}
          <span className="hm-foot-sep" aria-hidden>
            ·
          </span>{" "}
          <Link href={HERO_FOOT.sample.href} className="hm-foot-link">
            {HERO_FOOT.sample.label}
          </Link>
        </p>
      </div>
    </section>
  );
}
