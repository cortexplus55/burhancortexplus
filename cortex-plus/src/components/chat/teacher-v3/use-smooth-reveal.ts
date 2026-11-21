"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { REVEAL_BASE_CPS, REVEAL_FADE_MS, revealStep } from "@/lib/teacher/smooth-reveal";

/** Kullanıcı hareket azaltmayı istiyor mu (tarayıcı sormayı bilmiyorsa hayır). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches === true
      : false;
  } catch {
    return false;
  }
}

/**
 * Yumuşak kelime akışı (öğretmen v3). `animate` kapalıysa (eski mesaj) metin geldiği gibi görünür. Açıkken görünen
 * uzunluk her karede `revealStep` ile kelime sınırına kadar ilerler; akış bittiğinde kalan kısım kısa sürede tamamlanır.
 * Hareket azaltmada ya da kare çizimi olmayan ortamda ilk çizimden sonra metin tamamen görünür. Sunucuda ve ilk istemci
 * çiziminde aynı (boş) başlar: hidrasyon uyuşmazlığı olmaz. Sunucunun kesin metni taslaktan farklıysa görünen uzunluk
 * geri çekilmez; değişen harfler yerinde değişir.
 */
export function useSmoothReveal(
  target: string,
  { animate, streaming, baseCps = REVEAL_BASE_CPS }: { animate: boolean; streaming: boolean; baseCps?: number },
): { text: string; done: boolean } {
  const [shown, setShown] = useState(() => (animate ? 0 : target.length));
  const stateRef = useRef({ shown: animate ? 0 : target.length, carry: 0 });
  const targetRef = useRef(target);
  const streamingRef = useRef(streaming);
  targetRef.current = target;
  streamingRef.current = streaming;

  useEffect(() => {
    if (!animate) return;
    const live = !prefersReducedMotion() && typeof requestAnimationFrame === "function";
    if (!live) {
      stateRef.current = { shown: target.length, carry: 0 };
      setShown(target.length);
      return;
    }
    let frame = 0;
    let last = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tick = (now: number) => {
      const dt = Math.min(64, Math.max(0, now - last));
      last = now;
      const goal = targetRef.current;
      const current = { shown: Math.min(stateRef.current.shown, goal.length), carry: stateRef.current.carry };
      const next = revealStep(current, goal, dt, streamingRef.current, baseCps);
      if (next.shown !== stateRef.current.shown) setShown(next.shown);
      stateRef.current = next;
      if (next.shown < goal.length || streamingRef.current) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, target, streaming, baseCps]);

  const visible = animate ? target.slice(0, Math.min(shown, target.length)) : target;
  return { text: visible, done: !streaming && visible.length >= target.length };
}

/** Sayılan metin düğümleri: formül (KaTeX) ve kod içi sayılmaz, sarılmaz. */
function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent || parent.closest(".katex, pre, code, [data-v3-static]")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text);
  return out;
}

/**
 * Yeni kelimeler ~120 ms'de opaklıkla belirir. Metin her karede yeniden çizildiği için (Markdown HTML'i) son 120 ms'de
 * eklenen kısım sarılır; sarma süresi geçen zamana göre negatif gecikmeyle sürer (her çizimde baştan başlamaz). Yalnız
 * opaklık değişir: düzen sıçramaz. Hareket azaltmada ya da `enabled` kapalıyken hiçbir şey yapılmaz.
 */
export function useFreshFade(rootRef: RefObject<HTMLElement | null>, signal: string, enabled: boolean): void {
  const log = useRef<{ len: number; t: number }[]>([]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) {
      log.current = [];
      return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nodes = textNodes(root);
    const total = nodes.reduce((sum, node) => sum + (node.nodeValue?.length ?? 0), 0);
    const entries = log.current;
    const lastLen = entries.length ? entries[entries.length - 1]!.len : 0;
    if (total < lastLen) {
      log.current = [{ len: total, t: now - REVEAL_FADE_MS }];
      return;
    }
    if (total > lastLen) entries.push({ len: total, t: now });
    // Pencere dışı kayıtlar: yalnız en yenisi taban olarak kalır.
    while (entries.length > 1 && now - entries[1]!.t >= REVEAL_FADE_MS) entries.shift();
    const base = entries.length && now - entries[0]!.t >= REVEAL_FADE_MS ? entries[0]!.len : 0;
    const ranges: { from: number; to: number; age: number }[] = [];
    let from = base;
    for (const entry of entries) {
      if (entry.len > from && now - entry.t < REVEAL_FADE_MS) ranges.push({ from, to: entry.len, age: now - entry.t });
      from = Math.max(from, entry.len);
    }
    if (!ranges.length) return;
    let offset = 0;
    for (const node of nodes) {
      const text = node.nodeValue ?? "";
      const start = offset;
      const end = offset + text.length;
      offset = end;
      if (node.parentElement?.classList.contains("cx-v3-fresh")) continue;
      // Bu düğümün sonundan başına doğru sar (bölme sonraki dilimlerin yerini kaydırmasın).
      for (let index = ranges.length - 1; index >= 0; index -= 1) {
        const range = ranges[index]!;
        const a = Math.max(start, range.from);
        const b = Math.min(end, range.to);
        if (a >= b) continue;
        let target: Text = node;
        if (b - start < (target.nodeValue?.length ?? 0)) target.splitText(b - start);
        if (a - start > 0) target = target.splitText(a - start);
        const span = document.createElement("span");
        span.className = "cx-v3-fresh";
        span.style.animationDelay = `-${Math.round(range.age)}ms`;
        target.parentNode?.insertBefore(span, target);
        span.appendChild(target);
      }
    }
  }, [rootRef, signal, enabled]);
}
