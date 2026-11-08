import Link from "next/link";
import type { ContinueStep } from "@/lib/learning/prep-cards";

/**
 * Ana ekranda "Kaldığın yerden devam" (8 Kasım 2026, ürün sahibinin onayı). Geri dönen öğrenci devam etmek için
 * Sınavlar'a gitmek zorundaydı. Tek satır, satış yok: en son çalışılan hazırlığın sıradaki adımına doğrudan gider.
 */
export function ContinueLine({ step }: { step: ContinueStep }) {
  return (
    <Link href={step.next.href} className="cp-continue-line cp-prep-card-next" data-kind={step.next.kind}>
      <span className="cp-prep-card-next-dot" aria-hidden />
      <span className="cp-prep-card-next-text">
        <small>Kaldığın yerden devam</small>
        <strong>{step.next.heading}</strong>
        <span className="cp-continue-line-meta">
          {step.next.kindLabel} · {step.prepTitle}
        </span>
      </span>
      <span className="cp-prep-card-next-min">~{step.next.minutes} dk</span>
      <span className="cp-continue-line-go" aria-hidden>
        →
      </span>
    </Link>
  );
}
