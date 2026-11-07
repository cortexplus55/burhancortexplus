"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { ReadGate, type ReadGateChange } from "@/components/legal/read-gate";
import {
  AgeDeclarationField,
  EMPTY_AGE,
  ageDeclarationOf,
  type AgeValue,
} from "@/components/legal/age-declaration";
import {
  ageProblem,
  type ConsentEvidence,
  type ConsentStatus,
  type MissingConsent,
} from "@/lib/legal/consent-evidence";
import { LEGAL_CHANGE_NOTES, REQUIRED_CONSENT_KEY, type ConsentType } from "@/lib/legal/versions";
import { hasSessionCookie, sessionFingerprint } from "@/lib/consent/session-cookie";
import "@/styles/legal-consent.css";

/*
  Onay kapısı (7 Kasım 2026, uyum paketi). Profesyonel sitelerin yaptığı: metin değişince ya da onay hiç
  kaydedilmemişse girişten sonra bir kez metni gösterip onay istemek; aynı sürümü onaylamış kullanıcıya bir daha
  sormamak. Kapı kapatılamaz (yasal metin onaylanmadan hizmet sürmez) ama öğrenci çıkış yapabilir.

  İstek yalnız oturum çerezi olan tarayıcıda ve oturum başına bir kez atılır; sonuç `sessionStorage`'da 30 dakika
  ve aynı oturum için geçerli. Okunamazsa kapı açılmaz: öğrenci bir sunucu hatası yüzünden kilitlenmez.
*/

const CACHE_KEY = "cp:consent-ok";
const CACHE_MS = 30 * 60_000;

/** Kapının açılmadığı yollar: metnin kendisi, giriş/kayıt akışı, ödeme dönüşü ve test fikstürleri. */
const EXEMPT_PREFIXES = [
  "/kvkk",
  "/kullanim-kosullari",
  "/cerez-politikasi",
  "/gizlilik",
  "/mesafeli-satis",
  "/on-bilgilendirme",
  "/iptal-iade",
  "/teslimat",
  "/iletisim",
  "/kunye",
  "/kayit",
  "/giris",
  "/auth",
  "/sifre-yenile",
  "/sifremi-unuttum",
  "/email-dogrula",
  "/onboarding",
  "/odeme",
  "/e2e",
];

export function consentGateExempt(pathname: string | null): boolean {
  if (!pathname) return true;
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function cachedOk(fingerprint: string): boolean {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw) as { key?: string; fp?: string; at?: number };
    return cached.key === REQUIRED_CONSENT_KEY && cached.fp === fingerprint && Date.now() - (cached.at ?? 0) < CACHE_MS;
  } catch {
    return false;
  }
}

function rememberOk(fingerprint: string) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: REQUIRED_CONSENT_KEY, fp: fingerprint, at: Date.now() }));
  } catch {
    /* depolama kapalıysa bir sonraki sayfada yeniden sorulur; zararı bir istek */
  }
}

type GateState = { missing: MissingConsent[]; ageNeeded: boolean };

export function ConsentGate() {
  const pathname = usePathname();
  const [state, setState] = useState<GateState | null>(null);

  useEffect(() => {
    if (consentGateExempt(pathname) || !hasSessionCookie()) return;
    const fingerprint = sessionFingerprint();
    if (cachedOk(fingerprint)) return;
    let cancelled = false;
    fetch("/api/consent/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ({ ok?: boolean } & Partial<ConsentStatus>) | null) => {
        if (cancelled || !body?.ok) return;
        const missing = body.missing ?? [];
        const ageNeeded = Boolean(body.ageNeeded);
        if (!missing.length && !ageNeeded) {
          rememberOk(fingerprint);
          setState(null);
          return;
        }
        setState({ missing, ageNeeded });
      })
      .catch(() => {
        /* ağ yoksa kapı açılmaz; bir sonraki sayfada yeniden sorulur */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!state || consentGateExempt(pathname)) return null;
  return (
    <ConsentGateDialog
      state={state}
      onDone={() => {
        rememberOk(sessionFingerprint());
        setState(null);
      }}
    />
  );
}

const DOC_COPY: Record<ConsentType, { linkText: string; after: string; ariaLabel: string }> = {
  kvkk_aydinlatma: {
    linkText: "KVKK Aydınlatma Metni",
    after: "'ni okudum ve anladım.",
    ariaLabel: "KVKK Aydınlatma Metni'ni okudum ve anladım",
  },
  kullanim_kosullari: {
    linkText: "Kullanım Koşulları",
    after: "'nı okudum ve kabul ediyorum.",
    ariaLabel: "Kullanım Koşulları'nı okudum ve kabul ediyorum",
  },
};

export function ConsentGateDialog({ state, onDone }: { state: GateState; onDone: () => void }) {
  const [reads, setReads] = useState<Partial<Record<ConsentType, ReadGateChange>>>({});
  const [age, setAge] = useState<AgeValue>(EMPTY_AGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updated = state.missing.length > 0 && state.missing.every((item) => item.previous);
  const changes = state.missing.filter((item) => item.previous).map((item) => LEGAL_CHANGE_NOTES[item.type]);
  const docsReady = state.missing.every((item) => reads[item.type]?.checked && reads[item.type]?.evidence);
  const ageIssue = state.ageNeeded ? ageProblem(ageDeclarationOf(age)) : null;
  const ready = docsReady && !ageIssue;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const documents: ConsentEvidence = {};
    for (const item of state.missing) {
      const evidence = reads[item.type]?.evidence;
      if (evidence) documents[item.type] = evidence;
    }
    try {
      const response = await fetch("/api/consent/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents,
          ...(state.ageNeeded ? { age: ageDeclarationOf(age) } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; missing?: unknown[]; ageNeeded?: boolean };
      if (!response.ok) {
        setError(body.error ?? "Onayın kaydedilemedi. Birkaç saniye sonra yeniden dene.");
        return;
      }
      onDone();
    } catch {
      setError("Onayın şu an gönderilemedi. İnternetini kontrol edip yeniden dene.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open disablePointerDismissal onOpenChange={() => undefined}>
      <Dialog.Portal>
        <Dialog.Backdrop className="cp-legal-backdrop" />
        <Dialog.Popup className="cp-legal-dialog" data-consent-gate>
          <div className="cp-legal-dialog-head">
            <div className="min-w-0">
              <Dialog.Title className="cp-legal-dialog-title">
                {updated ? "Metinlerimizi güncelledik" : "Devam etmeden önce"}
              </Dialog.Title>
              <Dialog.Description className="cp-legal-dialog-meta">
                Aynı sürümü bir kez onayladığında bir daha sormayız.
              </Dialog.Description>
            </div>
          </div>
          <div className="cp-legal-dialog-body">
            <p className="cp-consent-gate-intro">
              Cortex Plus&apos;ı kullanmaya devam etmek için aşağıdaki metinleri açıp sonuna kadar okuman ve onaylaman
              gerekiyor.
            </p>
            {changes.length ? (
              <ul className="cp-consent-gate-changes">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <div className="cp-consent-gate-list">
              {state.ageNeeded ? <AgeDeclarationField value={age} onChange={setAge} /> : null}
              {state.missing.map((item) => (
                <ReadGate
                  key={item.type}
                  docId={item.type}
                  linkText={DOC_COPY[item.type].linkText}
                  after={DOC_COPY[item.type].after}
                  ariaLabel={DOC_COPY[item.type].ariaLabel}
                  checked={Boolean(reads[item.type]?.checked)}
                  onChange={(change) => setReads((previous) => ({ ...previous, [item.type]: change }))}
                />
              ))}
            </div>
          </div>
          <div className="cp-legal-dialog-foot">
            {error ? (
              <p className="cp-consent-gate-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="cp-legal-actions">
              <button
                type="button"
                className="cp-legal-btn"
                data-primary="true"
                disabled={!ready || busy}
                onClick={() => void submit()}
              >
                {busy ? "Kaydediliyor…" : "Onayla ve devam et"}
              </button>
            </div>
            <form action="/api/auth/signout" method="post" className="flex justify-center">
              <button type="submit" className="cp-consent-gate-signout">
                Şimdi değil, çıkış yap
              </button>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
