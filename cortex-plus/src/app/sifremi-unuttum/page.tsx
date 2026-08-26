"use client";

import { useState } from "react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      // Account existence is never revealed, regardless of the result.
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
        <p className="max-w-md rounded-lg border p-4 text-sm">
          Girdiğin adrese ait bir hesap varsa şifre sıfırlama bağlantısını
          gönderdik. Gelen kutunu ve spam klasörünü kontrol et.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
          </Button>
        </form>
      )}
    </MarketingPage>
  );
}
