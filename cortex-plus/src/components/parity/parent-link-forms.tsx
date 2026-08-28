"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteChildByEmail, linkChildByCode } from "@/app/kayit/actions";

export function ParentLinkForms({
  onLinked,
}: {
  onLinked?: () => void;
}) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function submitCode() {
    startTransition(async () => {
      const result = await linkChildByCode(code);
      if (result.ok) {
        toast.success("İstek gönderildi. Çocuğun onaylayınca bağlanacak.");
        setCode("");
        onLinked?.();
      } else {
        toast.error(result.error ?? "Bağlantı kurulamadı.");
      }
    });
  }

  function submitEmail() {
    startTransition(async () => {
      const result = await inviteChildByEmail(email);
      if (result.ok) {
        if (result.warning) toast.warning(result.warning);
        else toast.success("Davet kaydedildi.");
        setEmail("");
        onLinked?.();
      } else {
        toast.error(result.error ?? "Davet gönderilemedi.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="astra-pay-card p-4">
        <h3 className="text-sm font-semibold">Davet kodu ile bağla</h3>
        <p className="mt-1 text-xs text-[var(--astra-muted)]">
          Çocuğunun profilindeki 6 haneli kodu gir.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="4KD9PX"
            maxLength={8}
            aria-label="Davet kodu"
            className="uppercase tracking-widest"
          />
          <Button
            type="button"
            onClick={submitCode}
            disabled={pending || code.trim().length < 4}
            className="astra-btn-primary shrink-0 rounded-full px-5"
          >
            Bağla
          </Button>
        </div>
      </div>

      <div className="astra-pay-card p-4">
        <h3 className="text-sm font-semibold">E-posta ile davet et</h3>
        <p className="mt-1 text-xs text-[var(--astra-muted)]">
          Çocuğun onayladığında bağlantı kurulur.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ogrenci@ornek.com"
            aria-label="Öğrenci e-postası"
          />
          <Button
            type="button"
            onClick={submitEmail}
            disabled={pending || !email.includes("@")}
            className="astra-btn-primary shrink-0 rounded-full px-5"
          >
            Davet et
          </Button>
        </div>
      </div>
    </div>
  );
}
