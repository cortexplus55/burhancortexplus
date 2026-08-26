import Link from "next/link";
import { cn } from "@/lib/utils";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";

export function MarketingPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <AstraMarketingPage title={title}>
      <div className="mx-auto max-w-6xl px-4 pb-16">
        {description ? (
          <p className="mb-8 max-w-2xl text-[var(--mk-muted)]">{description}</p>
        ) : null}
        {children}
      </div>
    </AstraMarketingPage>
  );
}

export function MarketingCta() {
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <Link href="/kayit" className={cn("mk-btn-primary inline-flex px-8 py-3 text-sm")}>
        ÜCRETSİZ DENE
      </Link>
      <Link
        href="/fiyatlandirma"
        className={cn("mk-btn-outline inline-flex px-8 py-3 text-sm font-medium")}
      >
        Plus satın al
      </Link>
    </div>
  );
}
