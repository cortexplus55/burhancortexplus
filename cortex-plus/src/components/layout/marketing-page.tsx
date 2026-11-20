import Link from "next/link";
import { cn } from "@/lib/utils";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { CinematicPrimaryCta } from "@/components/marketing/cinematic-cta";

export function MarketingPage({
  title,
  description,
  children,
  variant = "marketing",
  contentClassName,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  variant?: "marketing" | "auth" | "legal";
  /** İçerik kabının ek sınıfları (ör. uzun liste sayfasında daha geniş alt boşluk). */
  contentClassName?: string;
}) {
  return (
    <ParityMarketingPage
      title={title}
      description={description}
      variant={variant}
    >
      {variant === "marketing" ? (
        <div className={cn("mx-auto max-w-6xl px-4 pb-16", contentClassName)} data-cinematic-reveal>
          {children}
        </div>
      ) : (
        children
      )}
    </ParityMarketingPage>
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
