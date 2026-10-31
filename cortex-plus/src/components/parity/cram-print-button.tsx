"use client";

import { Printer } from "lucide-react";
import { CRAM_PRINT_LABEL } from "@/lib/learning/cram-sheet";

/** Tarayıcının yazdırma penceresi: "PDF olarak kaydet" de oradan seçilir. Baskıda düğme gizli (cram-sheet.css). */
export function CramPrintButton() {
  return (
    <button type="button" className="cp-cram-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      <span>{CRAM_PRINT_LABEL}</span>
    </button>
  );
}
