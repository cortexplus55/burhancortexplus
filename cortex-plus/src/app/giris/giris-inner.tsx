"use client";

import Link from "next/link";
import { PremiumAuthShell } from "@/components/layout/premium-auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { GoogleBlockedNote } from "@/components/auth/google-blocked-note";
import { useGoogleBlockedWebViewApp } from "@/lib/auth/in-app-browser";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
import { authErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function GirisPage() {
  const router = useRouter();
  const params = useSearchParams();
  // Giriş sonrası varsayılan ana sayfa öğrenme döngüsü (dashboard); AI sohbet
  // yalnızca açıkça `next=/ogretmen` istenirse.
  //
  // `next` doğrudan router.push'a gidiyordu: /giris?next=https://… girişten
  // sonra öğrenciyi başka bir siteye götürüyordu (açık yönlendirme). Google
  // yolu sunucuda (auth/callback) temizleniyordu, şifreli giriş yolu değil.
  const next = safeNextPath(params.get("next"));
  // Askıya alınan hesap ara katmandan buraya düşer (plan 4.1): neden yazmazsak
  // öğrenci şifresini yanlış sanır ve destek yerine sıfırlama döngüsüne girer.
  const suspended = params.get("durum") === "askida";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Instagram / Facebook / TikTok tarayıcısında Google girişi reddediliyor (beta duyurusu, 20 Ekim 2026).
  const blockedApp = useGoogleBlockedWebViewApp();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      // "Giriş başarısız" her hatada aynıydı; e-postasını doğrulamamış
      // öğrenci şifresini yanlış sanıyordu.
      const needsConfirm = error.message.toLowerCase().includes("email not confirmed");
      setUnconfirmed(needsConfirm);
      if (needsConfirm) {
        try {
          sessionStorage.setItem("cortex-signup-email", email);
        } catch {
          /* ignore */
        }
      }
      toast.error(authErrorMessage(error));
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
        {suspended ? (
          <p
            role="status"
            className="rounded-xl border border-[var(--cx-border)] px-4 py-3 text-sm text-[var(--cx-muted)]"
          >
            Hesabın askıya alındı; şu an giriş yapılamıyor. Bilgi ve itiraz için{" "}
            <a href="mailto:cortexplus@cortexplus.app" className="underline">
              cortexplus@cortexplus.app
            </a>
            {" "}adresine yaz.
          </p>
        ) : null}
        {blockedApp ? (
          <GoogleBlockedNote
            app={blockedApp}
            className="border-[var(--cx-border)] text-[var(--cx-muted)]"
          />
        ) : (
          <>
            <GoogleSignInButton onClick={google} disabled={loading} />
            {/* Google ile ilk girişte hesap burada da açılabiliyor; kayıt
                sihirbazındaki onay kutusu bu yolda hiç görünmüyordu. */}
            <p className="text-center text-xs text-[var(--cx-muted)]">
              Google ile devam ederek{" "}
              <Link href="/kullanim-kosullari" className="underline">
                Kullanım Koşulları
              </Link>
              {" ve "}
              <Link href="/kvkk" className="underline">
                KVKK Aydınlatma Metni
              </Link>
              &apos;ni kabul etmiş olursun.
            </p>

            <div className="flex items-center gap-3 text-xs text-[var(--cx-muted)]">
              <span className="h-px flex-1 bg-[var(--cx-border)]" aria-hidden />
              veya e-posta ile
              <span className="h-px flex-1 bg-[var(--cx-border)]" aria-hidden />
            </div>
          </>
        )}

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
        {unconfirmed ? (
          <p className="text-center text-sm text-[var(--cx-muted)]" role="status">
            Doğrulama e-postası gelmediyse{" "}
            <Link href="/email-dogrula" className="text-[var(--cx-gold-hover)] underline">
              yenisini gönder
            </Link>
            .
          </p>
        ) : null}
        <p className="text-center text-sm text-[var(--cx-muted)]">
          <Link href="/sifremi-unuttum" className="text-[var(--cx-gold-hover)] underline">
            Şifreni mi unuttun?
          </Link>
          {" · "}
          {/* Beta kodu bağlantısıyla gelen yeni öğrenci (/pay?kod=…) kayıttan sonra koda dönsün. */}
          <Link
            href={params.get("next") ? `/kayit?next=${encodeURIComponent(next)}` : "/kayit"}
            className="text-[var(--cx-gold-hover)] underline"
          >
            Kayıt ol
          </Link>
        </p>
      </div>
    </PremiumAuthShell>
  );
}
