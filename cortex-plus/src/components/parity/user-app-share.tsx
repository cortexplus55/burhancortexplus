"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Uygulamayı okul akışına açar/kapatır.
 *
 * Paylaşım dışa açılan bir işlem, o yüzden düğme ne yaptığını açıkça
 * söylüyor: "okulunla paylaş" / "paylaşımı kaldır". Belirsiz bir anahtar
 * kullanıcının farkında olmadan içerik yayımlamasına yol açardı.
 */
export function UserAppShareToggle({
  appId,
  shared,
}: {
  appId: string;
  shared: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isShared, setIsShared] = useState(shared);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !isShared;
    try {
      const res = await fetch("/api/lab/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, shared: next }),
      });
      if (!res.ok) throw new Error();
      setIsShared(next);
      toast.success(
        next ? "Okulunla paylaşıldı." : "Paylaşım kaldırıldı.",
      );
      router.refresh();
    } catch {
      toast.error("Değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="ap-uapp-share"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isShared}
    >
      {isShared ? "Paylaşımı kaldır" : "Okulunla paylaş"}
    </button>
  );
}
