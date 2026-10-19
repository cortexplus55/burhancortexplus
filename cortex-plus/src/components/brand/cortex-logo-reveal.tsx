"use client";

import { useEffect, useRef, useState } from "react";
import { CortexLogoMotion } from "@/components/brand/cortex-logo-motion";

/**
 * Sayfanın aşağısındaki hareketli logo açılışı kaçırmasın: ekrana ilk girdiğinde işaret yeniden
 * kurulur ve açılış baştan oynar. Sayfa açılırken zaten görünüyorsa dokunulmaz. İşaret hiçbir an
 * gizli beklemez; gözlemci çalışmasa da son hali görünür.
 */
export function CortexLogoReveal({ size = 72, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRun((value) => value + 1);
        observer.disconnect();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className={className}>
      <CortexLogoMotion key={run} size={size} />
    </span>
  );
}
