"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarketingPage } from "@/components/layout/marketing-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * E-posta doğrulama (8 Kasım 2026). Kayıt artık doğrulama beklemeden içeri alır (31 Ekim, Paket J1 #1) ve doğrulama
 * bağlantısı Resend üzerinden gider; Supabase'in kendi doğrulama e-postası kalktı. Bu sayfa iki işe yarar:
 * giriş yapmış öğrenci bağlantıyı buradan yeniden ister, girişi olmayan önce giriş yapar.
 */
export default function EmailDogrulaPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(Boolean(data.user)))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const coolSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function resend() {
    if (coolSeconds > 0 || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/eposta-dogrula/gonder", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; verified?: boolean; error?: string };
      if (response.ok && body.verified) {
        toast.success("E-postan zaten doğrulanmış.");
        return;
      }
      if (response.ok) {
        setCooldownUntil(Date.now() + 60_000);
        toast.success("Doğrulama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.");
        return;
      }
      toast.error(
        response.status === 429
          ? "Çok sık istek. Biraz bekleyip yeniden dene."
          : (body.error ?? "Gönderilemedi. Birkaç dakika sonra yeniden dene."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingPage
      variant="auth"
      title="E-posta doğrulama"
      description="Hesabın açık: doğrulama bağlantısı e-postana gelir, çalışmaya hemen başlayabilirsin."
    >
      <div className="mk-card space-y-6 p-6">
        <p className="text-sm text-[var(--mk-muted)]">
          Bağlantı gelmediyse spam / gereksiz klasörünü kontrol et. Gönderen{" "}
          <span className="text-[var(--mk-text)]">cortexplus@cortexplus.app</span>. Hotmail ve Outlook&apos;ta Gelen,
          Gereksiz ve Diğer sekmelerine de bak.
        </p>
        <p className="text-sm text-[var(--mk-muted)]">
          Bağlantı 7 gün geçerli ve başka cihazda açılsa da e-postanı doğrular.
        </p>

        {signedIn === false ? (
          <Link href="/giris?next=/email-dogrula" className={`${buttonVariants()} w-full`}>
            Giriş yap ve bağlantıyı yeniden iste
          </Link>
        ) : (
          <Button type="button" disabled={loading || coolSeconds > 0 || signedIn === null} className="w-full" onClick={() => void resend()}>
            {loading
              ? "Gönderiliyor…"
              : coolSeconds > 0
                ? `Yeniden gönder (${coolSeconds}s)`
                : "Doğrulama bağlantısını yeniden gönder"}
          </Button>
        )}
      </div>
    </MarketingPage>
  );
}
