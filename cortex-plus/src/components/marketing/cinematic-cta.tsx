import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CinematicPrimaryCta({
  href = "/kayit",
  label = "Ücretsiz dene",
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("mk-astra-btn-primary", className)}>
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function CinematicCtaRow({ className }: { className?: string }) {
  return (
    <div className={cn("mk-astra-cta-row mk-astra-cta-row--center", className)}>
      <CinematicPrimaryCta />
      <Link href="/ornek" className="mk-astra-btn-secondary">
        Ürünü gör
      </Link>
    </div>
  );
}
