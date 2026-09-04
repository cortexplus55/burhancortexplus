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
      // `ap-empty` öğrenci kabuğunun kendi dosyasında tanımlı; eski
      // `astra-pay-card--premium` sınıfı burada hiç uygulanmıyordu, çünkü
      // kuralı `.astra-app.cortex-premium-app` altına kapsanmış.
      <div className="ap-empty astra-pay-card astra-pay-card--premium">
        {Icon ? (
          <span className="ap-empty-icon">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        ) : null}
        <p className="ap-empty-title">{title}</p>
        <p className="ap-empty-desc">{description}</p>
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
      <section className="ap-section astra-pay-card astra-pay-card--premium">
        <h2 className="ap-section-title">{title}</h2>
        {description ? <p className="ap-section-desc">{description}</p> : null}
        <div className="ap-section-body">{children}</div>
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
