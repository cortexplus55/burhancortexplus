"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Velinin ödeme formu (29 Ekim 2026): e-posta (PayTR makbuzu), ad (isteğe bağlı), sözleşme onayı;
 * ardından PayTR iFrame'i aynı sayfada. Veli hesap açmaz; hak öğrencinin hesabına tanımlanır.
 */
export function ParentPayForm({ token, studentName, planName, priceLabel }: { token: string; studentName: string; planName: string; priceLabel: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  async function start() {
    if (!accepted) {
      setError("Devam etmek için sözleşmeleri onaylamanız gerekiyor.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/parent-link/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), name: name.trim() || undefined, legalAccepted: true }),
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
          Paket {studentName} adlı öğrencinin hesabına tanımlanır. Siz hesap açmazsınız; makbuz e-postanıza gelir. Otomatik yenileme yoktur.
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
      <label className="flex items-start gap-2 text-sm leading-relaxed">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1" />
        <span>
          <Link href="/on-bilgilendirme" className="underline" target="_blank" rel="noreferrer">
            Ön Bilgilendirme Formu
          </Link>
          &apos;nu ve{" "}
          <Link href="/mesafeli-satis" className="underline" target="_blank" rel="noreferrer">
            Mesafeli Satış Sözleşmesi
          </Link>
          &apos;ni okudum, kabul ediyorum. Dijital hizmet anında açıldığı için cayma hakkı bulunmadığını biliyorum.
        </span>
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
