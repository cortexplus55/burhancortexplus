import Link from "next/link";
import {
  FOUNDER_CREDIT_ARIA,
  FOUNDER_CREDIT_LABEL,
  FOUNDER_CREDIT_SHORT,
  FOUNDER_CREDIT_TIP,
} from "@/lib/credits/chip-label";
import "@/styles/founder.css";

/**
 * Kurucu çipi (profil paneli). Tıklayınca kredi sayfasının kurucu görünümü açılır. 14 Kasım 2026 (ürün sahibinin kararı):
 * Kurucu Sigma görünümündedir, altın değil: kırmızı tonlu çip, köşe işareti Σ, mono büyük harf etiket.
 */
export function FounderChip({ className }: { className?: string }) {
  return (
    <Link
      href="/krediler"
      className={className ? `cp-founder-chip ${className}` : "cp-founder-chip"}
      aria-label={FOUNDER_CREDIT_ARIA}
      data-tip={FOUNDER_CREDIT_TIP}
    >
      <b className="cp-founder-chip__mark" aria-hidden>
        Σ
      </b>
      <span className="cp-founder-chip__full">{FOUNDER_CREDIT_LABEL}</span>
      <span className="cp-founder-chip__short">{FOUNDER_CREDIT_SHORT}</span>
    </Link>
  );
}

/** Ayarlar ve Abonelik sayfasındaki "Hesap türü" rozeti: çiple aynı görünüm, bağlantı değil. */
export function FounderBadge() {
  return (
    <span className="cp-founder-chip">
      <b className="cp-founder-chip__mark" aria-hidden>
        Σ
      </b>
      Kurucu
    </span>
  );
}
