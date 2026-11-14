"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";


/**
 * Tasarım sistemi rolü (Faz 0, 14 Kasım 2026): yalnız `data-variant` niteliğine yazılır, görünümü değiştirmez.
 * Denetim betiği (`scripts/design-audit.mjs`) ekranda birden çok `brand` olup olmadığını bununla sayar.
 */
const BUTTON_ROLE: Record<string, "brand" | "glass" | "weak" | "inverse" | "link" | "danger"> = {
  primary: "brand",
  default: "brand",
  brand: "brand",
  secondary: "glass",
  outline: "glass",
  ghost: "weak",
  link: "link",
  danger: "danger",
  destructive: "danger",
  "danger-ghost": "danger",
};

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    loadingLabel?: string;
    block?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  loadingLabel,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const busy = Boolean(loading);
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={BUTTON_ROLE[variant ?? "primary"] ?? "brand"}
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
