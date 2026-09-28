"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PremiumAuthShell } from "@/components/layout/premium-auth-shell";
import { createClient } from "@/lib/supabase/client";
import { passwordIssues } from "@/lib/auth/password";
import { authErrorMessage } from "@/lib/auth/messages";

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

    // Sayfa artık /ayarlar'dan da açılıyor; oturumu açık öğrenciye her hatada
    // "bağlantının süresi dolmuş" demek yanlış yönlendiriyordu.
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }

    toast.success("Şifren güncellendi.");
    router.push("/ogretmen");
  }

  return (
    <PremiumAuthShell title="Şifre yenile" subtitle="Yeni şifreni belirle ve hesabına dön.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[var(--cx-muted)]">
            Yeni şifre
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="cortex-premium-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-rules"
          />
          <p id="password-rules" className="text-xs text-[var(--cx-muted)]">
            En az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm" className="text-sm font-medium text-[var(--cx-muted)]">
            Yeni şifre tekrar
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            className="cortex-premium-input"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <button type="submit" disabled={loading} className="cortex-premium-btn-primary">
          {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--cx-muted)]">
        <Link href="/ayarlar" className="text-[var(--cx-gold-hover)] underline">
          Ayarlara dön
        </Link>
      </p>
    </PremiumAuthShell>
  );
}
