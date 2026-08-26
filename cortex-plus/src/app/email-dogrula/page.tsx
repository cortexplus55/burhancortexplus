"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MarketingPage } from "@/components/layout/marketing-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
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
