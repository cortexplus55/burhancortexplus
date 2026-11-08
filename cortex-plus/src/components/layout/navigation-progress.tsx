"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Sayfa geçiş çizgisi (8 Kasım 2026, ürün sahibi: "bastım mı?" anı). Bu projede sayfalara Suspense sınırı / loading.tsx
 * konmuyor (AGENTS.md), bu yüzden bir bağlantıya basınca sunucu sayfayı hazırlayana kadar ekranda hiçbir şey olmuyordu.
 * Çizgi sayfanın içeriğine dokunmaz: yalnız üstte ince bir şerit. Uygulama içi bağlantıya basınca 120 ms sonra belirir
 * (anında açılan sayfada yanıp sönmesin), yeni adres yerleşince tamamlanıp kaybolur; 15 sn'de kendiliğinden kapanır.
 */

const SHOW_DELAY_MS = 120;
const GIVE_UP_MS = 15_000;

/** Tıklanan bağlantı bu sekmede, başka bir uygulama içi sayfaya mı gidiyor? */
export function isInternalNavigation(anchor: HTMLAnchorElement, event: MouseEvent, current: Location): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#") || /^(mailto|tel|sms|javascript):/i.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(anchor.href, current.href);
  } catch {
    return false;
  }
  if (url.origin !== current.origin) return false;
  // Yalnız çapası değişen adres sayfa yüklemez.
  return url.pathname !== current.pathname || url.search !== current.search;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<{ show?: number; giveUp?: number; hide?: number; watch?: number }>({});
  const startHref = useRef<string | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const clear = () => {
      window.clearTimeout(timers.current.show);
      window.clearTimeout(timers.current.giveUp);
      window.clearTimeout(timers.current.hide);
      window.clearInterval(timers.current.watch);
    };
    const finish = () => {
      if (startHref.current === null) return;
      startHref.current = null;
      clear();
      if (bar.dataset.state !== "loading") {
        bar.dataset.state = "idle";
        return;
      }
      bar.dataset.state = "done";
      timers.current.hide = window.setTimeout(() => {
        bar.dataset.state = "idle";
      }, 320);
    };
    const start = () => {
      clear();
      startHref.current = window.location.href;
      bar.dataset.state = "idle";
      timers.current.show = window.setTimeout(() => {
        bar.dataset.state = "loading";
      }, SHOW_DELAY_MS);
      timers.current.giveUp = window.setTimeout(finish, GIVE_UP_MS);
      // Yalnız sorgusu değişen geçişte yol aynı kalır: adresin kendisi izlenir.
      timers.current.watch = window.setInterval(() => {
        if (window.location.href !== startHref.current) finish();
      }, 40);
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (isInternalNavigation(anchor, event, window.location)) start();
    };
    // Yakalama aşamasında: Next'in <Link>'i tıklamayı kendi işleyicisinde iptal edip istemci tarafında gider; bubble
    // aşamasında bakınca her bağlantı "iptal edilmiş" görünüyor ve çizgi hiç başlamıyordu. Adresi anında değişen
    // geçişler (pencere bağlantıları) 120 ms dolmadan biter, çizgi görünmez.
    document.addEventListener("click", onClick, true);
    const onFinishSignal = () => finish();
    window.addEventListener("cp:navigation-done", onFinishSignal);
    window.addEventListener("popstate", onFinishSignal);
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("cp:navigation-done", onFinishSignal);
      window.removeEventListener("popstate", onFinishSignal);
    };
  }, []);

  // Yol değişti: yeni sayfa yerleşti.
  useEffect(() => {
    if (startHref.current !== null) window.dispatchEvent(new Event("cp:navigation-done"));
  }, [pathname]);

  return <div ref={barRef} className="cp-nav-progress" data-state="idle" aria-hidden />;
}
