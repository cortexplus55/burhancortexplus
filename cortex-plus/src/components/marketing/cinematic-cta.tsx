import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function CinematicPrimaryCta({
  href = "/kayit",
  label = "Başla",
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("mk-btn-play", className)}>
      <span className="mk-btn-play-icon" aria-hidden>
        <Play className="h-4 w-4 fill-current" />
      </span>
      {label}
    </Link>
  );
}

export function CinematicCtaRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      <CinematicPrimaryCta />
      <Link
        href="/fiyatlandirma"
        className="mk-btn-outline inline-flex px-8 py-3.5 text-sm font-medium"
      >
        CORTEX PLUS SATIN AL
      </Link>
    </div>
  );
}
