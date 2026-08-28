"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PremiumAuthShell } from "@/components/layout/premium-auth-shell";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
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
    const { error } = await signInWithGoogle(
      supabase,
      `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    );
    if (error) toast.error("Google ile giriş başlatılamadı.");
  }

  return (
    <PremiumAuthShell
      title="Giriş yap"
      subtitle="Hesabınla devam et veya Google kullan."
    >
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
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[var(--cx-muted)]">
            Şifre
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="cortex-premium-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading} className="cortex-premium-btn-primary">
          Giriş yap
        </button>
        <button type="button" className="cortex-premium-btn-ghost" onClick={google}>
          Google ile devam et
        </button>
        <p className="text-center text-sm text-[var(--cx-muted)]">
          <Link href="/sifremi-unuttum" className="text-[var(--cx-gold-hover)] underline">
            Şifremi unuttum
          </Link>
          {" · "}
          <Link href="/kayit" className="text-[var(--cx-gold-hover)] underline">
            Kayıt ol
          </Link>
        </p>
      </form>
    </PremiumAuthShell>
  );
}
