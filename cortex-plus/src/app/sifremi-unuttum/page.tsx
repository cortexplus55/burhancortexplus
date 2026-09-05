"use client";

import Link from "next/link";
import { useState } from "react";
import { PremiumAuthShell } from "@/components/layout/premium-auth-shell";
import { createClient } from "@/lib/supabase/client";

export default function SifremiUnuttumPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/sifre-yenile`,
      });
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <PremiumAuthShell
      title="Şifremi unuttum"
      subtitle="E-posta adresini gir; hesabın varsa sıfırlama bağlantısı gönderilir."
    >
      {sent ? (
        <p className="text-sm leading-relaxed text-[var(--cx-muted)]">
          Girdiğin adrese ait bir hesap varsa şifre sıfırlama bağlantısını
          gönderdik. Gelen kutunu ve spam klasörünü kontrol et.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-[var(--cx-muted)]">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="cortex-premium-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="cortex-premium-btn-primary">
            {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-[var(--cx-muted)]">
        <Link href="/giris" className="text-[var(--cx-gold-hover)] underline">
          Girişe dön
        </Link>
      </p>
    </PremiumAuthShell>
  );
}
