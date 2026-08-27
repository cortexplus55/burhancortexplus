"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { SIGNUP_STORAGE_KEY, type SignupPayload } from "@/lib/parity/signup";
import { completeSignup } from "../actions";
import "@/styles/astra-marketing.css";
import "@/styles/cinematic-home.css";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SignupFinalizer() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Hesabın hazırlanıyor…");
  const [failed, setFailed] = useState(false);

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

    (async () => {
      const maxAttempts = 6;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          setMessage("Oturum senkronize ediliyor…");
          router.refresh();
          await sleep(400);
        }

        const result = await completeSignup(payload);
        if (result.ok) {
          try {
            localStorage.removeItem(SIGNUP_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          if (result.linkWarning) toast.warning(result.linkWarning);
          router.replace(result.redirectTo);
          router.refresh();
          return;
        }

        if (
          result.error === "Oturum bulunamadı." &&
          attempt < maxAttempts
        ) {
          continue;
        }

        setFailed(true);
        setMessage(result.error);
        toast.error(result.error);
        return;
      }

      setFailed(true);
      setMessage("Oturum açılamadı. Giriş yapıp tekrar dene.");
    })();
  }, [router]);

  return (
    <div className="astra-marketing cinematic-marketing cinematic-auth flex min-h-dvh items-center justify-center px-4">
      <div className="mk-card w-full max-w-sm p-8 text-center">
        <p className="text-3xl" aria-hidden>
          {failed ? "⚠️" : "✨"}
        </p>
        <p className="mt-4 text-sm text-[var(--mk-muted)]">{message}</p>
        {failed ? (
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/giris"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Giriş yap
            </Link>
            <Link
              href="/kayit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium"
            >
              Kayıt sayfasına dön
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
