"use client";

import Link from "next/link";
import { AlertCircle, X } from "lucide-react";
import { periodWord } from "@/lib/credits/period";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { cn } from "@/lib/utils";
import "@/styles/parity-shell.css";

export function PlusLimitBanner({
  message,
  onDismiss,
  variant = "chrome",
}: {
  message?: string;
  onDismiss?: () => void;
  variant?: "chrome" | "toast";
}) {
  const account = useStudentShellAccount();
  const weekly = account?.periodKind === "weekly";
  const title = `${periodWord(weekly ? "weekly" : "monthly")} limitine ulaştın`;
  const body =
    message ??
    (weekly
      ? "Bu haftaki kotan doldu. Ek paket alabilir ya da dönemin yenilenmesini bekleyebilirsin."
      : "Bu ayki kotan doldu. Ek paket alabilir ya da dönemin yenilenmesini bekleyebilirsin.");

  return (
    <div
      className={cn("cp-plus-limit-banner", variant === "toast" && "cp-plus-limit-banner--toast")}
      role="status"
      aria-live="polite"
    >
      <AlertCircle className="cp-plus-limit-banner__icon" aria-hidden />
      <div className="cp-plus-limit-banner__copy">
        <strong>{title}</strong>
        <p>{body}</p>
        <Link href="/krediler" onClick={onDismiss}>
          Limitleri gör
        </Link>
        {" · "}
        <Link href="/paketler" onClick={onDismiss}>
          Ek paket al
        </Link>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="cp-plus-limit-banner__close"
          aria-label="Kapat"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
