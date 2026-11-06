"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyAdminGatePin } from "@/app/admin/kapi/actions";

/** PIN kutusu. Doğrulanınca panelin ana sayfasına döner. */
export function AdminGateForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="adm-gate-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await verifyAdminGatePin(pin);
          if (result.ok) {
            setPin("");
            router.replace("/admin");
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <label htmlFor="admin-gate-pin" className="text-sm font-medium">
        PIN
      </label>
      <input
        id="admin-gate-pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="adm-input"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        maxLength={64}
        required
        autoFocus
      />
      {error ? (
        <p className="text-sm text-[var(--adm-bad)]" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="adm-btn adm-btn--primary" disabled={pending || pin.trim().length === 0}>
        {pending ? "Doğrulanıyor…" : "Girişi doğrula"}
      </button>
    </form>
  );
}
