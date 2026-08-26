"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  MarketingPage,
  OriginButton,
  OriginInput,
  OriginLabel,
} from "@/components/layout/marketing-page";
import { createClient } from "@/lib/supabase/client";

export default function EmailDogrulaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/kayit/tamamla`,
        },
      });
    } finally {
      setLoading(false);
      toast.success("Hesabın doğrulanmamışsa yeni bir bağlantı gönderdik.");
    }
  }

  return (
    <MarketingPage
      title="E-posta doğrulama"
      description="Kayıt sırasında gönderdiğimiz bağlantıya tıklayarak hesabını etkinleştir."
    >
      <div className="max-w-md space-y-6">
        <div className="mk-notice">
          Bağlantı e-postan gelmediyse spam klasörünü kontrol et veya aşağıdan
          yeniden gönder.
        </div>

        <form onSubmit={resend} className="space-y-4">
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
            {loading ? "Gönderiliyor…" : "Doğrulama e-postasını yeniden gönder"}
          </OriginButton>
        </form>
      </div>
    </MarketingPage>
  );
}
