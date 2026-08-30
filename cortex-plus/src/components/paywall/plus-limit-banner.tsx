"use client";

import Link from "next/link";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/astra-parity-sor.css";

export function PlusLimitBanner({
  message = "Bu ay Plus kotan doldu. Yeni ders üretmek için kredilerine bak veya dönemin yenilenmesini bekle.",
  onDismiss,
  variant = "chrome",
}: {
  message?: string;
  onDismiss?: () => void;
  variant?: "chrome" | "toast";
}) {
  return (
    <div
      className={cn("ap-plus-limit-banner", variant === "toast" && "ap-plus-limit-banner--toast")}
      role="status"
      aria-live="polite"
    >
      <AlertCircle className="ap-plus-limit-banner__icon" aria-hidden />
      <div className="ap-plus-limit-banner__copy">
        <strong>Aylık limitine ulaştın</strong>
        <p>{message}</p>
        <Link href="/krediler" onClick={onDismiss}>
          Limitleri gör
        </Link>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="ap-plus-limit-banner__close"
          aria-label="Kapat"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
