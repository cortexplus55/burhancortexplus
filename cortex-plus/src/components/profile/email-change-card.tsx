"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/messages";

/**
 * E-posta adresi ve değiştirme.
 *
 * Değişiklik Supabase'in güvenli akışıyla: panelde "Secure email change"
 * açık (29 Eylül 2026'da bakıldı), yani hem eski hem yeni adrese onay
 * bağlantısı gidiyor ve ikisi de açılmadan adres değişmiyor. Metin bunu
 * söylüyor; tek bağlantı yeter demek öğrenciyi yarım bir değişiklikle
 * bırakırdı.
 *
 * Google ile açılmış hesapta form yok: giriş adresi Google hesabından
 * geliyor, burada değiştirmek iki farklı adresli bir hesap bırakırdı.
 */
export function EmailChangeCard({
  email,
  pendingEmail,
  hasPasswordLogin,
}: {
  email: string | null;
  pendingEmail: string | null;
  hasPasswordLogin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(pendingEmail);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = value.trim().toLowerCase();
    if (!next || next === email?.toLowerCase()) {
      toast.error("Şu anki adresinden farklı bir e-posta yaz.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/ayarlar` },
    );
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    setSentTo(next);
    setEditing(false);
    setValue("");
    toast.success("Onay bağlantıları gönderildi.");
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        E-posta: <strong>{email ?? "—"}</strong>
      </p>

      {sentTo ? (
        <p className="rounded-lg border border-[var(--cp-border)] p-3 text-[var(--cp-muted)]" role="status">
          <strong className="text-[var(--cp-text)]">{sentTo}</strong> adresine geçiş bekliyor. İki onay bağlantısı
          gönderdik: biri şu anki adresine, biri yeni adresine. İkisini de açınca değişiklik tamamlanır; o zamana
          kadar girişin şu anki adresinle devam eder.
        </p>
      ) : null}

      {!hasPasswordLogin ? (
        <p className="text-[var(--cp-muted)]">
          Google ile giriş yapıyorsun; adresin Google hesabından geliyor. Adresi Google hesabında değiştirebilirsin.
        </p>
      ) : editing ? (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <label htmlFor="new-email" className="sr-only">
            Yeni e-posta
          </label>
          <input
            id="new-email"
            type="email"
            required
            autoComplete="email"
            placeholder="yeni@adres.com"
            className="min-w-0 flex-1 rounded-lg border border-[var(--cp-border)] bg-transparent px-3 py-2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" disabled={busy} className="rounded-full border border-[var(--cp-border)] px-4 py-2 font-medium">
            {busy ? "Gönderiliyor…" : "Onay bağlantısı gönder"}
          </button>
          <button type="button" className="px-2 py-2 text-[var(--cp-muted)]" onClick={() => setEditing(false)}>
            Vazgeç
          </button>
        </form>
      ) : (
        <button type="button" className="font-medium underline" onClick={() => setEditing(true)}>
          E-posta adresini değiştir
        </button>
      )}

      <p>
        <Link href="/sifre-yenile" className="font-medium underline">
          {hasPasswordLogin ? "Şifreni değiştir" : "Şifre belirle"}
        </Link>
      </p>
    </div>
  );
}
