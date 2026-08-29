"use client";

import Link from "next/link";
import { AlertCircle, X } from "lucide-react";
import "@/styles/cortex-premium.css";

export function CreditLimitToast({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-[85] flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-400 px-4 py-3 text-sm text-[#1a1200] shadow-lg">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Aylık limitine yaklaştın</p>
          <p className="mt-0.5 text-[#3d2e00]">{message}</p>
          <Link
            href="/krediler"
            className="mt-2 inline-block font-semibold underline"
            onClick={() => onOpenChange(false)}
          >
            Limitleri gör
          </Link>
        </div>
        <button
          type="button"
          className="rounded-full p-1 hover:bg-black/10"
          aria-label="Kapat"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
