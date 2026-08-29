"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import "@/styles/astra-app.css";
import "@/styles/cortex-premium.css";

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

  const packagesBase = "/pay";
  const href = returnPath
    ? `${packagesBase}?returnTo=${encodeURIComponent(returnPath)}`
    : packagesBase;

  return (
    <div
      className="astra-app cortex-premium-app fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="cortex-premium-upgrade-sheet w-full max-w-md rounded-3xl border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="cortex-premium-section-eyebrow">Plus</p>
            <h2 id="upgrade-title" className="cortex-premium-upgrade-sheet__title mt-1">
              Daha hızlı öğrenmek için yükselt
            </h2>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-[var(--astra-muted)] hover:bg-white/5"
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
            className="cortex-premium-btn-primary"
            onClick={() => onOpenChange(false)}
          >
            Plus&apos;a yükselt
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="cortex-premium-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            Sonra
          </Button>
        </div>
      </div>
    </div>
  );
}
