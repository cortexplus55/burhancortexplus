"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center rounded-full border border-transparent",
    "text-[var(--c-text-muted)] outline-none transition-[background-color,transform,color] duration-fast ease-out",
    "hover:bg-surface-2 hover:text-[var(--c-text)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:size-[18px]",
    "before:absolute before:inset-[-4px] before:content-['']",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "size-9",
        md: "size-11",
      },
      variant: {
        ghost: "bg-transparent",
        secondary: "border-[var(--c-border-strong)] bg-surface-2",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "ghost",
    },
  }
);

type IconButtonProps = Omit<ButtonPrimitive.Props, "aria-label"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Erişilebilir ad — zorunlu. */
    "aria-label": string;
  };

function IconButton({
  className,
  size = "md",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="icon-button"
      className={cn(iconButtonVariants({ size, variant, className }))}
      {...props}
    />
  );
}

export { IconButton, iconButtonVariants };
export type { IconButtonProps };
