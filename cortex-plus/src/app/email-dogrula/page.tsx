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

export default function EmailDogrulaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SIGNUP_EMAIL_KEY);
      if (stored) setEmail(stored);
    } catch {
      /* ignore */
    }
  }, []);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: authCallbackUrl("/kayit/tamamla"),
        },
      });
    } finally {
      setLoading(false);
      toast.success("Hesabın doğrulanmamışsa yeni bir bağlantı gönderdik.");
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
          Bağlantı e-postan gelmediyse spam klasörünü kontrol et veya aşağıdan
          yeniden gönder.
        </p>

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
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Gönderiliyor…" : "Doğrulama e-postasını yeniden gönder"}
          </Button>
        </form>
      </div>
    </MarketingPage>
  );
}
