import Link from "next/link";
import { formatDateShort } from "@/lib/format";
import type { PlusChildOption } from "@/lib/parent/plus-children";

export function ParentPlusStatus({ child }: { child: PlusChildOption }) {
  if (!child.hasPlus) {
    return (
      <section className="astra-pay-card mt-4 p-4">
        <p className="text-sm font-medium">{child.name} şu an ücretsiz</p>
        <p className="mt-1 text-xs text-[var(--astra-muted)]">
          Raporlar zaten açık. Plus veya Sigma, kotayı onun hesabına tanımlar.
          Ödemeyi sen yaparsın.
        </p>
      </section>
    );
  }

  return (
    <section className="astra-pay-card mt-4 p-4">
      <p className="text-sm font-medium">
        {child.name} için {child.planBadge ?? "Plus"} açık
      </p>
      <p className="mt-1 text-xs text-[var(--astra-muted)]">
        Kota çocuğunun hesabında. Raporların senin panelinde ücretsiz kalır.
        {child.periodEnd
          ? ` Dönem ${formatDateShort(child.periodEnd)} tarihine kadar.`
          : ""}
      </p>
      <Link
        href="/odemeler"
        className="mt-3 inline-block text-xs font-semibold text-[var(--astra-primary)]"
      >
        Ödeme geçmişi
      </Link>
    </section>
  );
}
