"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ReadGate, type ReadGateChange } from "@/components/legal/read-gate";
import { PERFORMANCE_CONSENT_TEXT } from "@/lib/legal/texts";

/**
 * Velinin ödeme formu (29 Ekim 2026): e-posta (PayTR makbuzu), ad (isteğe bağlı), sözleşme onayı;
 * ardından PayTR iFrame'i aynı sayfada. Veli hesap açmaz; hak öğrencinin hesabına tanımlanır.
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

  async function start() {
    if (!accepted) {
      setError("Önce Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni açıp okumalı ve onaylamalısınız.");
      return;
    }
    if (!performance) {
      setError("Ödemeye geçmek için hizmetin hemen başlamasını istediğinizi onaylamanız gerekiyor.");
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
            ? "Bu bağlantının süresi dolmuş. Öğrenciden yeni bağlantı isteyin."
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

  if (iframeUrl) {
    return (
      <div className="mk-card overflow-hidden">
        <p className="px-5 pt-4 text-sm text-[var(--mk-muted)]">
          Güvenli ödeme sayfası PayTR tarafından sunulur; kart bilgileri bize gelmez.
        </p>
        <iframe src={iframeUrl} title="Güvenli ödeme" className="h-[640px] w-full border-0" allow="payment" />
      </div>
    );
  }

  return (
    <form
      className="mk-card flex flex-col gap-4 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <div>
        <p className="text-sm text-[var(--mk-muted)]">Ödeme</p>
        <p className="text-lg font-semibold text-[var(--mk-text)]">
          {studentName} için {planName} · {priceLabel}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
          Paket {studentName} adlı öğrencinin hesabına tanımlanır. Siz hesap açmazsınız; makbuz ve sözleşme örneği e-postanıza gelir. Otomatik yenileme yoktur.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span>E-posta (makbuz için)</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-xl border border-[var(--mk-border)] bg-transparent px-3 py-2.5 text-[var(--mk-text)]"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Adınız (isteğe bağlı)</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          className="rounded-xl border border-[var(--mk-border)] bg-transparent px-3 py-2.5 text-[var(--mk-text)]"
          autoComplete="name"
        />
      </label>
      <ReadGate
        docId="satis_sozlesmeleri"
        linkText="Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi"
        after="'ni okudum, kabul ediyorum."
        ariaLabel="Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni okudum, kabul ediyorum"
        checked={accepted}
        onChange={setLegalRead}
      />
      <label className="cp-legal-row">
        <Checkbox
          aria-label={PERFORMANCE_CONSENT_TEXT}
          className="mt-0.5 size-5 border-[var(--c-text-subtle)]"
          checked={performance}
          onCheckedChange={(value) => setPerformance(value === true)}
        />
        <span className="cp-legal-row-text">{PERFORMANCE_CONSENT_TEXT}</span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[#f87171]">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="mk-btn-primary inline-flex items-center justify-center px-8 py-3 text-sm disabled:opacity-60">
        {busy ? "Ödeme sayfası açılıyor…" : "Güvenli ödemeye geç"}
      </button>
    </form>
  );
}
