import Link from "next/link";
import { Crown } from "lucide-react";
import {
  FOUNDER_CREDIT_ARIA,
  FOUNDER_CREDIT_LABEL,
  FOUNDER_CREDIT_SHORT,
  FOUNDER_CREDIT_TIP,
} from "@/lib/credits/chip-label";
import "@/styles/founder.css";

/** Üst çubuktaki kurucu çipi. Tıklayınca kredi sayfasının kurucu görünümü açılır. */
export function FounderChip({ className }: { className?: string }) {
  return (
    <Link
      href="/krediler"
      className={className ? `cp-founder-chip ${className}` : "cp-founder-chip"}
      aria-label={FOUNDER_CREDIT_ARIA}
      data-tip={FOUNDER_CREDIT_TIP}
    >
      <Crown className="cp-founder-chip__icon" aria-hidden />
      <span className="cp-founder-chip__full">{FOUNDER_CREDIT_LABEL}</span>
      <span className="cp-founder-chip__short">{FOUNDER_CREDIT_SHORT}</span>
    </Link>
  );
}

/** Ayarlardaki "Hesap türü" rozeti — çiple aynı görünüm, bağlantı değil. */
export function FounderBadge() {
  return (
    <span className="cp-founder-chip">
      <Crown className="cp-founder-chip__icon" aria-hidden />
      Kurucu
    </span>
  );
}
