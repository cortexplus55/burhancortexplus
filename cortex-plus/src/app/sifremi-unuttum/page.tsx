"use client";

import { useState } from "react";
import {
  MarketingPage,
  OriginButton,
  OriginFormHint,
  OriginInput,
  OriginLabel,
} from "@/components/layout/marketing-page";
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
    <MarketingPage
      title="Şifremi unuttum"
      description="E-posta adresini gir; hesabın varsa sıfırlama bağlantısı gönderilir."
    >
      {sent ? (
        <div className="mk-notice max-w-md">
          Girdiğin adrese ait bir hesap varsa şifre sıfırlama bağlantısını
          gönderdik. Gelen kutunu ve spam klasörünü kontrol et.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <OriginLabel htmlFor="email">E-posta</OriginLabel>
            <OriginInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <OriginButton type="submit" disabled={loading}>
            {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
          </OriginButton>
          <OriginFormHint>
            Güvenlik nedeniyle hesap olup olmadığına dair bilgi verilmez.
          </OriginFormHint>
        </form>
      )}
    </MarketingPage>
  );
}
