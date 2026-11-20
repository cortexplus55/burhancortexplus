"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ReadGate, type ReadGateChange } from "@/components/legal/read-gate";
import { PARENT_PAY_COPY, PARENT_PERFORMANCE_CONSENT_TEXT, parentPaidLine } from "@/lib/payments/parent-pay-copy";

const POLL_MS = 3000;

/**
 * Velinin ödeme formu (29 Ekim 2026; Faz 5 §2 ile yeniden tasarlandı, 19 Kasım 2026): makbuz e-postası, Ön Bilgilendirme
 * ve Mesafeli Satış onay kutusu (metin açılıp okunmadan işaretlenmez), hizmetin hemen başlaması kutusu; ardından PayTR
 * iFrame'i aynı sayfada. iFrame açıkken ödeme durumu yoklanır; geri çağrı onaylayınca form onay ekranına döner.
 */
export function ParentPayForm({ token, studentName, planName, priceLabel }: { token: string; studentName: string; planName: string; priceLabel: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  // 7 Kasım 2026: sözleşmeler okunmadan işaretlenmez; hizmetin hemen başlaması ayrı kutu (m.15/1-h).
  const [legalRead, setLegalRead] = useState<ReadGateChange>({ checked: false, evidence: null });
  const accepted = legalRead.checked;
  const [performance, setPerformance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!iframeUrl || paid) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/billing/parent-link/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { paid?: boolean };
        if (!stopped && body.paid) setPaid(true);
      } catch {
        /* sıradaki yoklama dener */
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [iframeUrl, paid, token]);

  async function start() {
    if (!accepted) {
      setError("Önce Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni açıp okumalı ve onaylamalısınız.");
      return;
    }
    if (!performance) {
      setError("Ödemeye geçmek için dijital hizmetin hemen başlamasını ve cayma hakkı olmadığını onaylamanız gerekiyor.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/parent-link/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: email.trim(),
          name: name.trim() || undefined,
          legalAccepted: true,
          performanceConsent: true,
          ...(legalRead.evidence ? { legalEvidence: legalRead.evidence } : {}),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { iframeUrl?: string; error?: string };
      if (!res.ok || !payload.iframeUrl) {
        setError(
          res.status === 410
            ? "Bu ödeme bağlantısının süresi dolmuş, öğrencinizden yeni link isteyebilirsiniz"
            : payload.error === "invalid_input"
              ? "E-posta adresini kontrol edin."
              : payload.error ?? "Ödeme başlatılamadı.",
        );
        return;
      }
      setIframeUrl(payload.iframeUrl);
    } catch {
      setError("Bağlantı hatası. Yeniden deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (paid) {
    return (
      <section className="vo-card vo-notice vo-notice--ok" role="status" data-testid="veli-paid">
        <CheckCircle2 className="vo-confirm-icon" aria-hidden />
        <h2 className="vo-notice-title">{PARENT_PAY_COPY.paidTitle}</h2>
        <p className="vo-notice-body">{parentPaidLine(studentName, planName)}</p>
      </section>
    );
  }

  if (iframeUrl) {
    return (
      <section className="vo-card vo-iframe-card" aria-label="PayTR güvenli ödeme">
        <p className="vo-iframe-note">
          <Lock className="h-4 w-4" aria-hidden /> Güvenli ödeme sayfası PayTR tarafından sunulur; kart bilgileri bize gelmez.
        </p>
        <iframe src={iframeUrl} title="PayTR güvenli ödeme" className="vo-iframe" allow="payment" />
      </section>
    );
  }

  return (
    <form
      className="vo-card vo-form"
      data-testid="veli-form"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <label className="vo-field">
        <span>{PARENT_PAY_COPY.emailLabel}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      </label>
      <label className="vo-field">
        <span>Adınız (isteğe bağlı)</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" />
      </label>
      <div className="vo-consents">
        <ReadGate
          docId="satis_sozlesmeleri"
          linkText="Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi"
          after="'ni okudum, onaylıyorum."
          ariaLabel="Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni okudum, onaylıyorum"
          checked={accepted}
          onChange={setLegalRead}
        />
        <label className="cp-legal-row">
          <Checkbox
            aria-label={PARENT_PERFORMANCE_CONSENT_TEXT}
            className="mt-0.5 size-5 border-[var(--c-text-subtle)]"
            checked={performance}
            onCheckedChange={(value) => setPerformance(value === true)}
          />
          <span className="cp-legal-row-text">{PARENT_PERFORMANCE_CONSENT_TEXT}</span>
        </label>
      </div>
      {error ? (
        <p role="alert" className="vo-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="vo-pay-btn">
        <Lock className="h-4 w-4" aria-hidden />
        {busy ? "Ödeme sayfası açılıyor…" : `${PARENT_PAY_COPY.payCta} · ${priceLabel}`}
      </button>
    </form>
  );
}
