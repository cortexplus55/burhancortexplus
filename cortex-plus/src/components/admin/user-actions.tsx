"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustCredits, setUserRole } from "@/app/admin/actions";

/**
 * Bir kullanıcı satırındaki işlemler: kredi ekle/düş ve yetki değiştir.
 *
 * Kredi kutusu tek alan ve işaretli sayı kabul ediyor (50 ekler, -50 düşer).
 * İki ayrı düğme yerine bunun seçilmesinin sebebi hata payı: "ekle" ve "düş"
 * yan yana dururken yanlışına basmak kolay, eksi işareti ise bilinçli bir
 * hareket.
 */
export function UserActions({
  userId,
  isAdmin,
  isTeacher,
  isSelf,
}: {
  userId: string;
  isAdmin: boolean;
  isTeacher: boolean;
  /** Kendi satırında yöneticiliği geri alma düğmesi kapalı. */
  isSelf: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message ?? "Tamamlandı.");
      else toast.error(result.error ?? "İşlem yapılamadı.");
    });
  }

  const delta = Number(amount);
  const creditReady = Number.isInteger(delta) && delta !== 0;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="±kredi"
        aria-label="Eklenecek kredi (düşmek için başına eksi koy)"
        className="adm-input w-24"
      />
      <button
        type="button"
        className="adm-btn"
        disabled={pending || !creditReady}
        onClick={() =>
          run(async () => {
            const result = await adjustCredits({ userId, delta });
            if (result.ok) setAmount("");
            return result;
          })
        }
      >
        Uygula
      </button>

      <button
        type="button"
        className="adm-btn"
        disabled={pending}
        onClick={() => run(() => setUserRole({ userId, role: "teacher", grant: !isTeacher }))}
      >
        {isTeacher ? "Öğretmenliği al" : "Öğretmen yap"}
      </button>

      <button
        type="button"
        className={`adm-btn${isAdmin ? " adm-btn--danger" : ""}`}
        disabled={pending || (isAdmin && isSelf)}
        title={
          isAdmin && isSelf
            ? "Kendi yöneticiliğini geri alamazsın; panele giriş kapanır."
            : undefined
        }
        onClick={() => run(() => setUserRole({ userId, role: "admin", grant: !isAdmin }))}
      >
        {isAdmin ? "Yöneticiliği al" : "Yönetici yap"}
      </button>
    </div>
  );
}
