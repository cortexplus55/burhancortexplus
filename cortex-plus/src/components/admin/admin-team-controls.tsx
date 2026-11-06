"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { grantAdminByEmail, revokeAdminRole } from "@/app/admin/yoneticiler/actions";

/** E-postayla yönetici ekleme kutusu. */
export function AdminGrantForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="adm-team-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await grantAdminByEmail(email);
          if (result.ok) {
            toast.success(result.message);
            setEmail("");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      <input
        type="email"
        inputMode="email"
        autoComplete="off"
        className="adm-input"
        placeholder="ornek@cortexplus.app"
        aria-label="Yönetici yapılacak hesabın e-postası"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button type="submit" className="adm-btn adm-btn--primary" disabled={pending || !email.trim()}>
        {pending ? "Ekleniyor…" : "Yönetici yap"}
      </button>
    </form>
  );
}

/** Tek tıkla geri alma; onay satır içinde (uygulama içi tarayıcıda window.confirm açılmıyor). */
export function AdminRevokeButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirming(true)}>
        Yetkiyi geri al
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-[var(--adm-muted)]">{name} yönetici olmaktan çıksın mı?</span>
      <button
        type="button"
        className="adm-btn adm-btn--danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeAdminRole(userId);
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else {
              toast.error(result.error);
            }
            setConfirming(false);
          })
        }
      >
        Evet, geri al
      </button>
      <button type="button" className="adm-btn" disabled={pending} onClick={() => setConfirming(false)}>
        Vazgeç
      </button>
    </div>
  );
}
