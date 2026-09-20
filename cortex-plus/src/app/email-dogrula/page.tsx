"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarketingPage } from "@/components/layout/marketing-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "@/lib/auth/messages";

const SIGNUP_EMAIL_KEY = "cortex-signup-email";

function isHotmailLike(value: string) {
  const domain = value.split("@")[1]?.toLowerCase() ?? "";
  return ["hotmail.com", "outlook.com", "live.com", "msn.com"].some((d) =>
    domain === d || domain.endsWith(`.${d}`),
  );
}

export default function EmailDogrulaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SIGNUP_EMAIL_KEY);
      if (stored) setEmail(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const coolSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    if (coolSeconds > 0) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: authCallbackUrl("/kayit/tamamla"),
        },
      });
      if (error) {
        toast.error(
          error.message.includes("rate") || error.status === 429
            ? "Çok sık istek. Bir dakika sonra tekrar dene."
            : "Gönderilemedi. E-posta adresini kontrol edip tekrar dene.",
        );
        return;
      }
      setCooldownUntil(Date.now() + 60_000);
      toast.success(
        isHotmailLike(email)
          ? "Bağlantı gönderildi. Hotmail/Outlook’ta Gelen, Gereksiz ve Diğer sekmelerini kontrol et."
          : "Hesabın doğrulanmamışsa yeni bir bağlantı gönderdik.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingPage
      variant="auth"
      title="E-posta doğrulama"
      description="Kayıt sırasında gönderdiğimiz bağlantıya tıklayarak hesabını etkinleştir."
    >
      <div className="mk-card space-y-6 p-6">
        <p className="text-sm text-[var(--mk-muted)]">
          Bağlantı gelmediyse spam / gereksiz klasörünü kontrol et veya aşağıdan
          yeniden gönder. Gönderen genelde{" "}
          <span className="text-[var(--mk-text)]">cortexplus@cortexplus.app</span>.
        </p>

        {isHotmailLike(email) ? (
          <div
            role="note"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100"
          >
            <p className="font-medium text-amber-50">Hotmail / Outlook ipucu</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90">
              <li>Gelen, Gereksiz ve Diğer sekmelerini kontrol et.</li>
              <li>
                cortexplus@cortexplus.app adresini güvenilir gönderenlere ekle,
                sonra yeniden gönder.
              </li>
              <li>Linkler kısa süreli; eski maildeki linki kullanma.</li>
            </ul>
          </div>
        ) : null}

        <form onSubmit={resend} className="space-y-4">
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
          <Button
            type="submit"
            disabled={loading || coolSeconds > 0}
            className="w-full"
          >
            {loading
              ? "Gönderiliyor…"
              : coolSeconds > 0
                ? `Yeniden gönder (${coolSeconds}s)`
                : "Doğrulama e-postasını yeniden gönder"}
          </Button>
        </form>
      </div>
    </MarketingPage>
  );
}