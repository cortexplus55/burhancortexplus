import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `premium` = oturum açık öğrenci kabuğu (misafir/auth ile aynı cam + altın). `plain` = admin / klasik shadcn. */
type UiVariant = "premium" | "astra" | "plain" | "default";

function resolveVariant(variant: UiVariant): "premium" | "plain" {
  if (variant === "plain") return "plain";
  if (variant === "default") return "premium";
  if (variant === "astra") return "premium";
  return "premium";
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  variant = "premium",
  icon: Icon,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  variant?: UiVariant;
  icon?: LucideIcon;
}) {
  const v = resolveVariant(variant);

  if (v === "premium") {
    return (
      <div className="astra-pay-card astra-pay-card--premium border-dashed p-8 text-center">
        {Icon ? (
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-[var(--astra-primary)]">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        ) : null}
        <p className="font-semibold text-[var(--astra-text)]">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--astra-muted)]">
          {description}
        </p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="cortex-premium-btn-primary mt-5 inline-flex w-auto min-w-[10rem] px-6"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  variant = "premium",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: UiVariant;
}) {
  const v = resolveVariant(variant);

  if (v === "premium") {
    return (
      <section className="astra-pay-card astra-pay-card--premium p-4 md:p-5">
        <h2 className="cortex-premium-section-title text-lg">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--astra-muted)]">{description}</p>
        ) : null}
        <div className="mt-4">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-medium">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
