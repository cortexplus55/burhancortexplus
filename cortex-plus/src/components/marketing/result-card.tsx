import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Sonuç ekranı gövdesi — ödeme sonucu ve doğrulama hatası için ortak.
 *
 * Üçü de aynı ince kalıptaydı: bir kutunun içinde "·" ile ayrılmış iki düz
 * bağlantı. Ödeme sonrası ekranı bu kalıbın en yanlış durduğu yerdi; insan
 * parasını verdikten hemen sonra oraya düşüyor ve karşısında ne bir onay
 * işareti ne de basılacak bir düğme buluyordu.
 *
 * Durum rengi marka amberinden ayrı tutuldu. Amber burada "vurgu" demek;
 * "başarılı" ile "başarısız" aynı renkle anlatılamaz, o yüzden yeşil ve
 * kırmızı yalnızca bu ikisini ayırmak için var.
 */
export function ResultCard({
  icon: Icon,
  tone,
  detail,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  icon: LucideIcon;
  tone: "success" | "error";
  /** Başlığın tekrarı değil, sırada ne olduğu. */
  detail: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <div className="mk-card mx-auto max-w-md p-8 text-center">
      <span className={`mk-result-icon mk-result-icon--${tone}`} aria-hidden>
        <Icon className="h-6 w-6" />
      </span>

      <p className="mt-5 text-sm leading-relaxed text-[var(--mk-muted)]">
        {detail}
      </p>

      <Link
        href={primaryHref}
        className="mk-btn-primary mt-6 inline-flex w-full items-center justify-center px-6 py-3 text-sm"
      >
        {primaryLabel}
      </Link>

      <Link
        href={secondaryHref}
        className="mt-4 inline-block text-sm font-medium text-[var(--mk-muted)] underline underline-offset-4 hover:text-[var(--mk-text)]"
      >
        {secondaryLabel}
      </Link>
    </div>
  );
}
