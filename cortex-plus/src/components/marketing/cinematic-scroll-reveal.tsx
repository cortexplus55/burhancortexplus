"use client";

import { useEffect } from "react";

export function CinematicScrollReveal({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let killed = false;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (killed) return;
      gsap.registerPlugin(ScrollTrigger);

      const nodes = gsap.utils.toArray<HTMLElement>("[data-cinematic-reveal]");
      nodes.forEach((el) => {
        /**
         * EKRANDA OLANA DOKUNMA.
         *
         * `gsap.from(..., opacity: 0)` elemanı ANINDA görünmez yapıyor ve
         * geri getirmeyi kaydırma tetikleyicisine bırakıyor. Açılışta zaten
         * ekranda duran bir blok için o tetikleyici güvenilir değil: gsap
         * sonradan yükleniyor, tetikleyicinin başlangıç noktası çoktan
         * geçilmiş oluyor ve blok yarı saydam takılı kalıyor.
         *
         * Canlıda fiyatlandırma sayfasının kendi başlığı — insanların ödeme
         * kararı verdiği sayfa — hem masaüstünde hem telefonda %29 opaklıkta
         * açılıyordu. Kaydırınca düzeliyordu; kaydırmayan görmüyordu.
         *
         * İlk kare her zaman okunur olmalı. Efekt, açılışta katlanın altında
         * kalan bloklara ait; görünür olan olduğu gibi durur.
         */
        // Görünür alanı ölçemiyorsak hiç animasyon yok: okunur bir sayfa,
        // efektli bir sayfadan önce gelir. (Gömülü tarayıcılarda
        // innerHeight 0 dönebiliyor; ilk hâlinde koruma buna takıldı ve
        // her bloğu "katlanın altında" sayıp gizledi.)
        const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewport) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < viewport) return;

        gsap.from(el, {
          y: 36,
          opacity: 0,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
        });
      });
    })();

    return () => {
      killed = true;
      void import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
        ScrollTrigger.getAll().forEach((t) => t.kill());
      });
    };
  }, []);

  return children;
}
