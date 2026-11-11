"use client";

import { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { HOME_COPY, REEL_FRAMES } from "@/lib/marketing/landing-content";

/**
 * Film şeridi (11 Kasım 2026, ikinci tur): ürünün etkinlikleri yan yana kareler hâlinde, tek satırda. Sayfa uzamaz;
 * şerit yana kayar (dokunma, tekerlek, klavye ya da iki düğme). Kareler bir sıra değil, bir koleksiyon: numara yok.
 * Plus'a özel kareler etiketli; etiketsizler ücretsiz hesapta da açık (`REEL_FRAMES`, bekçi testli).
 */
export function FeatureReel() {
  const strip = useRef<HTMLUListElement>(null);
  const copy = HOME_COPY.reel;

  const slide = useCallback((direction: 1 | -1) => {
    const node = strip.current;
    if (!node) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({ left: direction * Math.max(260, node.clientWidth * 0.8), behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <section className="hm-section hm-reel" aria-labelledby="hm-reel-title">
      <div className="lp-wrap hm-reel-head" data-cinematic-reveal>
        <div>
          <h2 id="hm-reel-title" className="hm-h2 hm-h2--left">
            {copy.title}
          </h2>
          <p className="hm-sub">{copy.lead}</p>
        </div>
        <div className="hm-reel-nav">
          <button type="button" className="hm-reel-btn" aria-label={copy.prev} onClick={() => slide(-1)}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" className="hm-reel-btn" aria-label={copy.next} onClick={() => slide(1)}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="hm-film">
        {/* Şerit klavyeyle de kayar: odaklanınca ok tuşları tarayıcının kendi kaydırmasıdır. */}
        <ul ref={strip} className="hm-film-strip" tabIndex={0} aria-label={copy.title}>
          {REEL_FRAMES.map((frame) => (
            <li key={frame.id} className={frame.plusOnly ? "hm-frame hm-frame--plus" : "hm-frame"}>
              <span className="hm-frame-art" aria-hidden>
                <Icon3D name={frame.icon} size={72} />
              </span>
              <h3 className="hm-frame-title">
                {frame.title}
                {frame.plusOnly ? (
                  <span className="hm-frame-plus">
                    <Sparkles className="h-3 w-3" aria-hidden /> Plus
                  </span>
                ) : null}
              </h3>
              <p className="hm-frame-body">{frame.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
