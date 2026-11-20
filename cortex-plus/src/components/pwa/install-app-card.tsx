"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { inAppBrowserApp } from "@/lib/auth/in-app-browser";
import { installPlatform, type InstallPlatform } from "@/lib/pwa/install-platform";
import { isStandaloneDisplay, promptInstall, useInstallPrompt } from "@/lib/pwa/install-prompt";
import {
  INSTALL_CARD_ACTION,
  INSTALL_CARD_ANDROID_NOTE,
  INSTALL_CARD_IOS_STEPS,
  INSTALL_CARD_LATER,
  INSTALL_CARD_TITLE,
  installCardMode,
  readInstallCardMemory,
  writeInstallCardMemory,
  type InstallCardMemory,
  type InstallMilestone,
} from "@/lib/pwa/install-card";
import { MAIN_CONTENT_ID } from "@/lib/ui/main-content";
import { cn } from "@/lib/utils";
import "@/styles/install-app-card.css";

/**
 * "📱 Telefonuna Uygulama Gibi Ekle" (20 Kasım 2026, Faz 8, ürün sahibi). Ne zaman çıkacağı `install-card.ts`'te
 * (`installCardMode`); burada yalnız tarayıcıdan okunanlar ve iki yol:
 * - Android / Chrome: tek dokunuş "Ana Ekrana Ekle" tarayıcının kurulum penceresini açar (olay `install-prompt.ts`'te
 *   saklı; öğrenci kabuğu yakalar). Kurulunca kart bu cihazda bir daha çıkmaz.
 * - iPhone / Safari: olay hiç gelmez; iki adım ("Paylaş" → "Ana Ekrana Ekle"), resim yok, yalnız simge.
 *
 * Yerleşim: `dock` telefonun alt çubuğunun (ve hazırlık sayfasında sabit "Devam et" kartının) üstünde sabit;
 * `inline` sonuç ekranlarında akışın içinde (orada alt çubuk yok). Kapatılınca ("×", "Şimdi değil", Escape) 30 gün
 * çıkmaz; gösterilmesi de 30 günü başlatır. Sunucuda ve hidrasyonda hiçbir şey çizilmez (tarayıcı kimliği yalnız
 * tarayıcıda okunur).
 */

const noopSubscribe = () => () => undefined;

/** Kartın üstünde durması gereken sabit alt parçalar: alt sekme çubuğu, hazırlık sayfasının "Devam et" kartı. */
const DOCK_ABOVE = [".cp-sor-bottomnav", ".cp-prep-layout .cp-path-next"].join(", ");
/** Kartla altındaki parça arası (`--cx-space-8`). */
const DOCK_GAP_PX = 8;

function clientPlatform(): InstallPlatform | null {
  return installPlatform(window.navigator.userAgent);
}

function clientInAppBrowser(): string | null {
  return inAppBrowserApp(window.navigator.userAgent);
}

function coarsePointer(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches === true;
}

function narrowViewport(): boolean {
  return window.matchMedia?.("(max-width: 767px)").matches === true;
}

/** Ekranın altından, kartın üstünde durması gereken sabit parçaların kapladığı yükseklik (px). */
function occupiedBottom(card: HTMLElement): number {
  const viewport = window.innerHeight;
  let occupied = 0;
  for (const element of document.querySelectorAll<HTMLElement>(DOCK_ABOVE)) {
    if (card.contains(element)) continue;
    const style = window.getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0 || rect.top >= viewport || rect.top < viewport * 0.4) continue;
    occupied = Math.max(occupied, viewport - rect.top);
  }
  return Math.ceil(occupied);
}

/** Kapanan kartın içindeki odak kaybolmasın: ana içeriğe geçer (Tab sırasına girmeden). */
function handOffFocus(card: HTMLElement | null) {
  if (!card || !card.contains(document.activeElement)) return;
  const main = document.getElementById(MAIN_CONTENT_ID) ?? document.querySelector("main");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

/** Adımın kalın yazılan kısmı ("Paylaş", "Ana Ekrana Ekle"); metin `INSTALL_CARD_IOS_STEPS` ile aynı kalır. */
function StepText({ text, strong }: { text: string; strong: string }) {
  const at = text.indexOf(strong);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong>{strong}</strong>
      {text.slice(at + strong.length)}
    </>
  );
}

export function InstallAppCard({
  milestone,
  placement = "dock",
}: {
  milestone: InstallMilestone | null;
  placement?: "dock" | "inline";
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const { prompt, installed: installedNow } = useInstallPrompt();
  const platform = useSyncExternalStore(noopSubscribe, clientPlatform, () => null);
  const inAppBrowser = useSyncExternalStore(noopSubscribe, clientInAppBrowser, () => null);
  const standalone = useSyncExternalStore(noopSubscribe, isStandaloneDisplay, () => false);
  const coarse = useSyncExternalStore(noopSubscribe, coarsePointer, () => false);
  const narrow = useSyncExternalStore(noopSubscribe, narrowViewport, () => false);
  // Açılıştaki hafıza ve saat: kart gösterilince yazılan "son gösterim" bu ziyarette kartı gizlemesin.
  const [memory] = useState<InstallCardMemory | null>(() => (typeof window === "undefined" ? null : readInstallCardMemory()));
  const [openedAt] = useState(() => Date.now());
  const [closed, setClosed] = useState(false);

  const mode =
    memory && !closed
      ? installCardMode({
          platform,
          inAppBrowser,
          standalone,
          coarsePointer: coarse,
          narrowViewport: narrow,
          milestone,
          promptAvailable: Boolean(prompt),
          installedNow,
          memory,
          now: openedAt,
        })
      : null;

  // Gösterim 30 günü başlatır; akış içindeki kart ancak ekrana girince "gösterildi" sayılır.
  useEffect(() => {
    if (!mode) return;
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      writeInstallCardMemory({ lastAt: Date.now() });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        writeInstallCardMemory({ lastAt: Date.now() });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [mode]);

  // Sabit kart: alt çubuğun ve "Devam et" kartının üstüne oturur; sayfanın sonu kartın arkasında kalmasın diye
  // akışta aynı yükseklikte boşluk bırakır.
  useEffect(() => {
    if (!mode || placement !== "dock") return;
    const card = cardRef.current;
    if (!card) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = occupiedBottom(card);
      if (offset > 0) card.style.setProperty("--cx-install-dock", `calc(${offset}px + var(--cx-space-8))`);
      else card.style.removeProperty("--cx-install-dock");
      // Alt çubuğun ve "Devam et" kartının payı sayfada zaten var; boşluk yalnız kartın kendisi kadar.
      if (spacerRef.current) spacerRef.current.style.height = `${Math.ceil(card.getBoundingClientRect().height) + DOCK_GAP_PX}px`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (resize) {
      resize.observe(card);
      for (const element of document.querySelectorAll<HTMLElement>(DOCK_ABOVE)) resize.observe(element);
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [mode, placement]);

  if (!mode) return null;

  function dismiss() {
    writeInstallCardMemory({ lastAt: Date.now() });
    handOffFocus(cardRef.current);
    setClosed(true);
  }

  async function install() {
    handOffFocus(cardRef.current);
    setClosed(true);
    const outcome = await promptInstall();
    writeInstallCardMemory(outcome === "accepted" ? { installed: true, lastAt: Date.now() } : { lastAt: Date.now() });
  }

  return (
    <>
      <section
        ref={cardRef}
        className={cn("cx-install-card", placement === "dock" ? "cx-surface-1" : "cx-surface-2", `cx-install-card--${placement}`)}
        aria-labelledby={titleId}
        data-install-card={mode}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          dismiss();
        }}
      >
        <div className="cx-install-card__head">
          <div className="cx-install-card__text">
            <h2 id={titleId} className="cx-install-card__title">
              <span aria-hidden="true">📱 </span>
              {INSTALL_CARD_TITLE}
            </h2>
            {mode === "android" ? <p className="cx-install-card__note">{INSTALL_CARD_ANDROID_NOTE}</p> : null}
          </div>
          <button type="button" className="cx-install-card__close" aria-label="Kartı kapat" onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
        {mode === "ios" ? (
          <ol className="cx-install-card__steps">
            {INSTALL_CARD_IOS_STEPS.map((step, index) => {
              const Icon = index === 0 ? Share : SquarePlus;
              return (
                <li key={step} className="cx-install-card__step">
                  <span className="cx-install-card__step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="cx-install-card__step-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="cx-install-card__step-text">
                    <StepText text={step} strong={index === 0 ? "Paylaş" : "Ana Ekrana Ekle"} />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="cx-install-card__actions">
          {mode === "android" ? (
            <button type="button" className="cx-install-card__btn cx-glass" onClick={() => void install()}>
              <Download aria-hidden="true" />
              {INSTALL_CARD_ACTION}
            </button>
          ) : null}
          <button type="button" className="cx-install-card__btn cx-install-card__btn--later cx-weak" onClick={dismiss}>
            {INSTALL_CARD_LATER}
          </button>
        </div>
      </section>
      {placement === "dock" ? <div ref={spacerRef} className="cx-install-card-spacer" aria-hidden="true" /> : null}
    </>
  );
}
