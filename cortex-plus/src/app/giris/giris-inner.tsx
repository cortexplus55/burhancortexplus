"use client";

import Link from "next/link";
import { PremiumAuthShell } from "@/components/layout/premium-auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
      toast.error("Giriş başarısız. Bilgilerini kontrol et.");
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
      title="Tekrar hoş geldin"
      subtitle="Google ile saniyeler içinde devam et veya e-postanla giriş yap."
    >
      <div className="space-y-4">
        <GoogleSignInButton onClick={google} disabled={loading} />

        <div className="flex items-center gap-3 text-xs text-[var(--cx-muted)]">
          <span className="h-px flex-1 bg-[var(--cx-border)]" aria-hidden />
          veya e-posta ile
          <span className="h-px flex-1 bg-[var(--cx-border)]" aria-hidden />
        </div>

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
          <button type="submit" disabled={loading} className="cortex-premium-btn-primary w-full">
            Giriş yap
          </button>
        </form>
        <p className="text-center text-sm text-[var(--cx-muted)]">
          <Link href="/sifremi-unuttum" className="text-[var(--cx-gold-hover)] underline">
            Şifreni mi unuttun?
          </Link>
          {" · "}
          <Link href="/kayit" className="text-[var(--cx-gold-hover)] underline">
            Kayıt ol
          </Link>
        </p>
      </div>
    </PremiumAuthShell>
  );
}
