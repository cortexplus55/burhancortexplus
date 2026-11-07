"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import {
  OPEN_COOKIE_PREFERENCES_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentAction,
} from "@/lib/consent/cookie-consent";
import { hasSessionCookie } from "@/lib/consent/session-cookie";
import { COOKIE_CATEGORY_LABELS } from "@/lib/legal/cookie-text";
import "@/styles/legal-consent.css";

/*
  Çerez bandı (7 Kasım 2026, uyum paketi). Kurul'un çerez rehberine göre:
  - Sayfayı kilitlemez (çerez duvarı yok): site bant açıkken de kullanılır, zorunlu olmayan hiçbir çerez yüklenmez.
  - "Reddet", "Tercihler" ve "Kabul et" aynı boyutta ve aynı ağırlıkta; ret, kabul kadar kolay.
  - Analitik kutusu varsayılan kapalı. Tercih istendiği an "Çerez tercihleri"nden değişir.
  - Giriş yapmış öğrencinin bu sürümdeki tercihi hesaptan geri yüklenir; başka cihazda yeniden sorulmaz.
*/

/** Bandın görünmediği yollar: test fikstürleri (e2e tercih çerezini kendisi koyar). */
function bannerHidden(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith("/e2e"));
}

export function CookieBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const existing = readCookieConsent();
    if (existing) {
      setAnalytics(existing.a);
      return;
    }
    if (!hasSessionCookie()) {
      setVisible(true);
      return;
    }
    // Giriş yapmış öğrenci: hesaptaki tercih bu sürüm için varsa yeniden sorma.
    let cancelled = false;
    fetch("/api/consent/cookies", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { choice?: { consentId: string; analytics: boolean; at: number } | null } | null) => {
        if (cancelled) return;
        const choice = body?.choice;
        if (choice) {
          writeCookieConsent(choice.analytics, "custom", { log: false, id: choice.consentId, at: choice.at });
          setAnalytics(choice.analytics);
          return;
        }
        setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const open = () => {
      setAnalytics(readCookieConsent()?.a ?? false);
      setPrefsOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
  }, []);

  function choose(nextAnalytics: boolean, action: CookieConsentAction) {
    writeCookieConsent(nextAnalytics, action);
    setAnalytics(nextAnalytics);
    setVisible(false);
    setPrefsOpen(false);
  }

  return (
    <>
      {visible && !prefsOpen && !bannerHidden(pathname) ? (
        <section className="cp-cookie-bar" role="region" aria-label="Çerez tercihi" data-cookie-banner>
          <p className="cp-cookie-title">Çerez tercihin</p>
          <p className="cp-cookie-text">
            Siteyi çalıştırmak için zorunlu çerezler kullanıyoruz. İzin verirsen, siteyi geliştirmek için hangi
            sayfaların açıldığını ölçen analitik çerezler de çalışır. Ayrıntı:{" "}
            <Link href="/cerez-politikasi">Çerez Politikası</Link>.
          </p>
          <div className="cp-cookie-actions">
            <button type="button" className="cp-cookie-btn" onClick={() => choose(false, "reject_all")}>
              Reddet
            </button>
            <button
              type="button"
              className="cp-cookie-btn"
              onClick={() => {
                setAnalytics(false);
                setPrefsOpen(true);
              }}
            >
              Tercihler
            </button>
            <button type="button" className="cp-cookie-btn" onClick={() => choose(true, "accept_all")}>
              Kabul et
            </button>
          </div>
        </section>
      ) : null}
      <CookiePreferencesDialog
        open={prefsOpen}
        analytics={analytics}
        onAnalyticsChange={setAnalytics}
        onClose={() => setPrefsOpen(false)}
        onSave={() => choose(analytics, "custom")}
        onRejectAll={() => choose(false, "reject_all")}
        onAcceptAll={() => choose(true, "accept_all")}
      />
    </>
  );
}

export function CookiePreferencesDialog({
  open,
  analytics,
  onAnalyticsChange,
  onClose,
  onSave,
  onRejectAll,
  onAcceptAll,
}: {
  open: boolean;
  analytics: boolean;
  onAnalyticsChange: (next: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onRejectAll: () => void;
  onAcceptAll: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="cp-legal-backdrop" />
        <Dialog.Popup className="cp-legal-dialog" data-cookie-preferences>
          <div className="cp-legal-dialog-head">
            <div className="min-w-0">
              <Dialog.Title className="cp-legal-dialog-title">Çerez tercihleri</Dialog.Title>
              <Dialog.Description className="cp-legal-dialog-meta">
                Seçimini istediğin zaman sayfanın altındaki &quot;Çerez tercihleri&quot;nden değiştirebilirsin.
              </Dialog.Description>
            </div>
            <Dialog.Close className="cp-legal-close" aria-label="Kapat">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="cp-legal-dialog-body">
            <div className="cp-cookie-pref">
              <div className="cp-cookie-pref-text">
                <p className="cp-cookie-pref-title">{COOKIE_CATEGORY_LABELS.zorunlu.title}</p>
                <p className="cp-cookie-pref-body">{COOKIE_CATEGORY_LABELS.zorunlu.body}</p>
              </div>
              <span className="cp-cookie-locked">Her zaman açık</span>
            </div>
            <div className="cp-cookie-pref">
              <div className="cp-cookie-pref-text">
                <p className="cp-cookie-pref-title" id="cp-cookie-analytics-title">
                  {COOKIE_CATEGORY_LABELS.analitik.title}
                </p>
                <p className="cp-cookie-pref-body">{COOKIE_CATEGORY_LABELS.analitik.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analytics}
                aria-labelledby="cp-cookie-analytics-title"
                className="cp-cookie-toggle"
                onClick={() => onAnalyticsChange(!analytics)}
              />
            </div>
            <p className="cp-cookie-text mt-3">
              Hangi çerezin ne işe yaradığı ve ne kadar kaldığı:{" "}
              <Link href="/cerez-politikasi" onClick={onClose}>
                Çerez Politikası
              </Link>
              .
            </p>
          </div>
          <div className="cp-legal-dialog-foot">
            <div className="cp-cookie-actions mt-0">
              <button type="button" className="cp-cookie-btn" onClick={onRejectAll}>
                Tümünü reddet
              </button>
              <button type="button" className="cp-cookie-btn" onClick={onSave}>
                Seçimi kaydet
              </button>
              <button type="button" className="cp-cookie-btn" onClick={onAcceptAll}>
                Tümünü kabul et
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Altbilgi ve Ayarlar'daki "Çerez tercihleri" düğmesi: pencereyi açar. */
export function CookiePreferencesButton({ className, label = "Çerez tercihleri" }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={className ?? "cp-cookie-pref-link"}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT))}
    >
      {label}
    </button>
  );
}
