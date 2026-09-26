import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SURFACE_COPY } from "@/lib/ui/surface-copy";

function ErrorState({
  title = SURFACE_COPY.errorTitle,
  description = SURFACE_COPY.errorBody,
  onRetry,
  retryLabel = SURFACE_COPY.retry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--r-xl)] border border-[var(--c-border)] bg-surface-1 px-6 py-10 text-center",
        className
      )}
      role="alert"
    >
      <span className="flex size-12 items-center justify-center rounded-[var(--r-xl)] bg-danger-soft text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <p className="text-16 font-semibold text-[var(--c-text)]">{title}</p>
      <p className="max-w-md text-14 text-[var(--c-text-muted)]">{description}</p>
      {onRetry ? (
        <Button type="button" variant="primary" size="md" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

function EmptyStateCard({
  title,
  description,
  icon: Icon,
  primary,
  secondary,
  className,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  primary?: { href?: string; label: string; onClick?: () => void };
  secondary?: { href?: string; label: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--r-xl)] border border-[var(--c-border)] bg-surface-1 px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-[var(--r-xl)] bg-action-soft text-action">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <p className="text-16 font-semibold">{title}</p>
      <p className="max-w-md text-14 text-[var(--c-text-muted)]">{description}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {primary ? (
          primary.href ? (
            <Link href={primary.href} className={cn(buttonVariants({ variant: "primary" }))}>
              {primary.label}
            </Link>
          ) : (
            <Button type="button" variant="primary" onClick={primary.onClick}>
              {primary.label}
            </Button>
          )
        ) : null}
        {secondary ? (
          secondary.href ? (
            <Link href={secondary.href} className={cn(buttonVariants({ variant: "secondary" }))}>
              {secondary.label}
            </Link>
          ) : (
            <Button type="button" variant="secondary" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

export { ErrorState, EmptyStateCard };
