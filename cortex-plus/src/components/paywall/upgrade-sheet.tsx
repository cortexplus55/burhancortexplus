"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import "@/styles/astra-app.css";

export function UpgradeSheet({
  open,
  onOpenChange,
  message,
  returnPath,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
}) {
  if (!open) return null;

  const packagesBase = returnPath?.startsWith("/ogretmen-paneli")
    ? "/ogretmen-paneli/plus"
    : "/pay";
  const href = returnPath
    ? `${packagesBase}?returnTo=${encodeURIComponent(returnPath)}`
    : packagesBase;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="astra-app w-full max-w-md rounded-3xl border border-[var(--astra-border)] bg-[var(--astra-bg)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="upgrade-title" className="text-lg font-semibold">
            Daha iyi notlar al
          </h2>
          <button
            type="button"
            className="rounded-full p-1 text-[var(--astra-muted)]"
            aria-label="Kapat"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--astra-muted)]">{message}</p>
        <ul className="mt-4 space-y-1.5 text-sm text-[var(--astra-muted)]">
          <li>· Daha fazla kredi ve ücretsiz hak</li>
          <li>· Deneme sınavı üretimi ve analiz</li>
          <li>· Gelişmiş AI modeli (Plus aboneliği)</li>
        </ul>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={href}
            className="astra-btn-primary flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Plus&apos;a yükselt
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="text-[var(--astra-muted)]"
            onClick={() => onOpenChange(false)}
          >
            Sonra
          </Button>
        </div>
      </div>
    </div>
  );
}
