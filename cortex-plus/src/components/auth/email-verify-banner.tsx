"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/**
 * "📩 Hesabını güvenceye almak için e-postanı doğrula" şeridi (31 Ekim 2026, Paket J1 #1).
 *
 * Kayıt artık doğrulama ekranında beklemiyor; doğrulanmamış hesap (`app_metadata.email_unverified`) içeride bu
 * şeridi görür. Bayrak oturum belirtecinde de durur: belirteç bayrak taşımıyorsa ağ isteği yok (öğrencilerin
 * çoğu). Taşıyorsa doğrulama sonrası bayat kalmış olabilir: bir kez taze kullanıcıya bakılır.
 * Doğrulama bağlantısından dönüşte (`?eposta=dogrulandi`) oturum tazelenir ve şerit kalkar. Adres `window`dan okunur:
 * `useSearchParams` kabukta Suspense sınırı isterdi (AGENTS.md: bu projede sayfayı boşaltıyor).
 */
export function EmailVerifyBanner() {
  const [unverified, setUnverified] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const result = new URLSearchParams(window.location.search).get("eposta");
    (async () => {
      if (result === "dogrulandi") {
        await supabase.auth.refreshSession().catch(() => null);
        toast.success("E-postan doğrulandı. Teşekkürler!");
      } else if (result === "gecersiz") {
        toast.error("Doğrulama bağlantısının süresi geçmiş ya da bozuk. Şeritten yenisini isteyebilirsin.");
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.app_metadata?.email_unverified !== true) return;
      const { data: fresh } = await supabase.auth.getUser();
      if (!cancelled) setUnverified(fresh.user?.app_metadata?.email_unverified === true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!unverified) return null;

  async function resend() {
    if (sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/auth/eposta-dogrula/gonder", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; verified?: boolean };
      if (body.verified) {
        setUnverified(false);
        return;
      }
      if (!response.ok) {
        toast.error(response.status === 429 ? "Az önce gönderdik; birkaç dakika sonra tekrar dene." : body.error ?? "Gönderilemedi.");
        return;
      }
      toast.success("Doğrulama bağlantısını e-postana gönderdik. Gereksiz klasörüne de bak.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cp-verify-bar" role="status">
      <span>📩 Hesabını güvenceye almak için e-postanı doğrula.</span>
      <button type="button" className="cp-verify-bar-action" onClick={() => void resend()} disabled={sending}>
        {sending ? "Gönderiliyor…" : "Tekrar gönder"}
      </button>
    </div>
  );
}
