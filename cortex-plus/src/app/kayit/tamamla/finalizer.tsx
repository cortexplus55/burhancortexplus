"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SIGNUP_STORAGE_KEY, type SignupPayload } from "@/lib/parity/signup";
import { completeSignup } from "../actions";
import "@/styles/astra-marketing.css";

export function SignupFinalizer() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Hesabın hazırlanıyor…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let payload: SignupPayload | null = null;
    try {
      const raw = localStorage.getItem(SIGNUP_STORAGE_KEY);
      if (raw) payload = JSON.parse(raw) as SignupPayload;
    } catch {
      payload = null;
    }

    if (!payload) {
      router.replace("/ogretmen");
      return;
    }

    completeSignup(payload)
      .then((result) => {
        try {
          localStorage.removeItem(SIGNUP_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        if (result.ok) {
          if (result.linkWarning) toast.warning(result.linkWarning);
          router.replace(result.redirectTo);
          router.refresh();
          return;
        }
        setMessage(result.error);
        toast.error(result.error);
      })
      .catch(() => {
        setMessage("Bir sorun oluştu. Panele yönlendiriliyorsun.");
        router.replace("/ogretmen");
      });
  }, [router]);

  return (
    <div className="astra-marketing flex min-h-dvh items-center justify-center px-4">
      <div className="mk-card w-full max-w-sm p-8 text-center">
        <p className="text-3xl" aria-hidden>
          ✨
        </p>
        <p className="mt-4 text-sm text-[var(--mk-muted)]">{message}</p>
      </div>
    </div>
  );
}
