"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MarketingPage,
  OriginButton,
  OriginFormHint,
  OriginInput,
  OriginLabel,
} from "@/components/layout/marketing-page";
import { createClient } from "@/lib/supabase/client";
import { passwordIssues } from "@/lib/auth/password";

export default function SifreYenilePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const issues = passwordIssues(password);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (issues.length) {
      toast.error(issues[0]);
      return;
    }
    if (password !== confirm) {
      toast.error("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error("Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir.");
      return;
    }

    toast.success("Şifren güncellendi.");
    router.push("/dashboard");
  }

  return (
    <MarketingPage
      title="Şifre yenile"
      description="Yeni şifreni belirle ve hesabına dön."
    >
      <form onSubmit={onSubmit} className="max-w-md space-y-4">
        <div className="space-y-2">
          <OriginLabel htmlFor="password">Yeni şifre</OriginLabel>
          <OriginInput
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-rules"
          />
          <OriginFormHint id="password-rules">
            En az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam.
          </OriginFormHint>
        </div>

        <div className="space-y-2">
          <OriginLabel htmlFor="confirm">Yeni şifre tekrar</OriginLabel>
          <OriginInput
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <OriginButton type="submit" disabled={loading}>
          {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
        </OriginButton>
      </form>
    </MarketingPage>
  );
}
