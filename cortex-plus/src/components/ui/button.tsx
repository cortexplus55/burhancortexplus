"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";


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
