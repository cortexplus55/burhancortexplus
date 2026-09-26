import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden",
    "border border-transparent font-semibold whitespace-nowrap transition-colors",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        neutral: "bg-surface-3 text-[var(--c-text)]",
        brand: "bg-brand-soft text-brand",
        action: "bg-action-soft text-action",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
        ai: "bg-ai-soft text-ai",
        default: "bg-action-soft text-action",
        secondary: "bg-surface-3 text-[var(--c-text)]",
        destructive: "bg-danger-soft text-danger",
        outline: "border-[var(--c-border-strong)] text-[var(--c-text)]",
        ghost: "bg-transparent text-[var(--c-text-muted)]",
        link: "bg-transparent text-action underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-6 rounded-[var(--r-sm)] px-2 text-12",
        md: "h-7 rounded-pill px-2.5 text-12",
      },
      kicker: {
        true: "uppercase tracking-[0.08em]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
      kicker: false,
    },
  }
);

function Badge({
  className,
  variant = "neutral",
  size = "sm",
  kicker = false,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size, kicker }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

/** Chip = Badge alias (Prompt 7). */
const Chip = Badge;
const chipVariants = badgeVariants;

export { Badge, Chip, badgeVariants, chipVariants };
