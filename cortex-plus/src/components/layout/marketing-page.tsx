import Link from "next/link";
import { cn } from "@/lib/utils";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { CinematicPrimaryCta } from "@/components/marketing/cinematic-cta";

export function MarketingPage({
  title,
  description,
  children,
  variant = "marketing",
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  variant?: "marketing" | "auth" | "legal";
}) {
  return (
    <AstraMarketingPage
      title={title}
      description={description}
      variant={variant}
    >
      {variant === "marketing" ? (
        <div className="mx-auto max-w-6xl px-4 pb-16" data-cinematic-reveal>
          {children}
        </div>
      ) : (
        children
      )}
    </AstraMarketingPage>
  );
}

export function MarketingCta() {
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <CinematicPrimaryCta label="Başla" />
      <Link
        href="/fiyatlandirma"
        className={cn("mk-btn-outline inline-flex px-8 py-3 text-sm font-medium")}
      >
        CORTEX PLUS SATIN AL
      </Link>
    </div>
  );
}
