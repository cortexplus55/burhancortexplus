"use client";

import { useEffect, useRef } from "react";
import { Camera, Brain, Rocket } from "lucide-react";

/**
 * Film scroll hikâyesi — sticky pin + scrub.
 * Üç perde: Çek → Anla → Yüksel.
 */
const ACTS = [
  {
    id: "cek",
    n: "01",
    title: "Çek",
    line: "Soruyu fotoğrafla. Sahne başlar.",
    body: "Kitaptan veya ekrandan — AI anında tanır, çözüme hazırlar.",
    icon: Camera,
    panelTitle: "Soru yakalandı",
    lines: [
      "2x² − 5x + 3 = 0",
      "Görüntü net · güven %97",
      "Konu: ikinci dereceden denklem",
    ],
  },
  {
    id: "anla",
    n: "02",
    title: "Anla",
    line: "Adım adım mantık. Ezber değil.",
    body: "Çeldiriciler, neden yanlış, neden doğru — kalıcı anlayış.",
    icon: Brain,
    panelTitle: "Cortex AI akıl devrede",
    lines: [
      "Δ = b² − 4ac = 1",
      "x = (5±1)/4 → 1.5 ve 1",
      "Anlama skoru %94",
    ],
  },
  {
    id: "yuksel",
    n: "03",
    title: "Yüksel",
    line: "Netin sahneyi değiştirir.",
    body: "Zayıf konu kapanır, plan güncellenir, motivasyon ölçülür.",
    icon: Rocket,
    panelTitle: "Dönüşüm",
    lines: ["Önce: 28 net", "Sonra: 42 net", "Öncelik konuları kapandı"],
  },
] as const;

export function FilmScrollStory() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;

    let killed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (killed) return;
      gsap.registerPlugin(ScrollTrigger);

      const pin = root.querySelector<HTMLElement>("[data-film-pin]");
      const acts = gsap.utils.toArray<HTMLElement>("[data-film-act]");
      const progress = root.querySelector<HTMLElement>("[data-film-progress]");
      if (!pin || acts.length < 2) return;

      acts.forEach((el, i) => {
        gsap.set(el, {
          autoAlpha: i === 0 ? 1 : 0,
          y: i === 0 ? 0 : 36,
          scale: i === 0 ? 1 : 0.97,
        });
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 2.4)}`,
          pin: pin,
          scrub: 0.65,
          anticipatePin: 1,
        },
      });

      acts.forEach((el, i) => {
        if (i === 0) return;
        const prev = acts[i - 1];
        tl.to(
          prev,
          { autoAlpha: 0, y: -28, scale: 0.96, duration: 0.45, ease: "power2.inOut" },
          i - 0.55,
        );
        tl.to(
          el,
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: "power2.out" },
          i - 0.35,
        );
      });

      if (progress) {
        tl.to(
          progress,
          { scaleX: 1, ease: "none", duration: acts.length - 1 },
          0,
        );
      }

      cleanups.push(() => {
        tl.scrollTrigger?.kill();
        tl.kill();
      });
    })();

    return () => {
      killed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className="mk-film-story"
      aria-labelledby="film-story-heading"
    >
      <div className="mk-film-story-pin" data-film-pin>
        <div className="mk-film-story-head">
          <p className="mk-eyebrow">Görsel şölen</p>
          <h2 id="film-story-heading" className="mk-film-story-title">
            Üç hareket. Büyük dönüşüm.
          </h2>
          <div className="mk-film-progress" aria-hidden>
            <span data-film-progress />
          </div>
        </div>

        <div className="mk-film-story-stage">
          {ACTS.map((act) => {
            const Icon = act.icon;
            return (
              <article
                key={act.id}
                className="mk-film-act"
                data-film-act
                data-act={act.id}
              >
                <div className="mk-film-act-copy">
                  <p className="mk-film-act-n">
                    <Icon className="h-4 w-4" aria-hidden />
                    {act.n} · {act.title}
                  </p>
                  <h3>{act.line}</h3>
                  <p>{act.body}</p>
                </div>
                <div className="mk-film-act-panel" aria-hidden>
                  <div className="mk-film-act-chrome">
                    <span />
                    <span />
                    <span />
                    <em>{act.panelTitle}</em>
                  </div>
                  <ol>
                    {act.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  {act.id === "yuksel" ? (
                    <div className="mk-film-net-burst">
                      <span>28</span>
                      <i>→</i>
                      <strong>42 NET</strong>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
