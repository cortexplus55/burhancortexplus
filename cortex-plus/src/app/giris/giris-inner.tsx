"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import {
  OriginButton,
  OriginButtonOutline,
  OriginFormPanel,
  OriginInput,
  OriginLabel,
  OriginMarketingLink,
} from "@/components/marketing/origin-form";
import "@/styles/origin-marketing.css";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function GirisPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/ogretmen";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Giriş başarısız. Bilgilerinizi kontrol edin.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function google() {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <OriginMarketingPage title="Giriş yap">
      <OriginFormPanel className="mx-auto max-w-md space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <OriginLabel htmlFor="email">E-posta</OriginLabel>
            <OriginInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <OriginLabel htmlFor="password">Şifre</OriginLabel>
            <OriginInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <OriginButton type="submit" disabled={loading}>
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </OriginButton>
          <OriginButtonOutline type="button" onClick={google}>
            Google ile devam et
          </OriginButtonOutline>
          <p className="mk-prose text-center text-sm">
            <OriginMarketingLink href="/sifremi-unuttum">Şifremi unuttum</OriginMarketingLink>
            {" · "}
            <OriginMarketingLink href="/kayit">Kayıt ol</OriginMarketingLink>
          </p>
        </form>
      </OriginFormPanel>
    </OriginMarketingPage>
  );
}
