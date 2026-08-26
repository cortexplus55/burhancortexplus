import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function OriginFormPanel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("mk-card p-6", className)} {...props} />;
}

export function OriginLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("mk-label block text-sm text-[var(--color-ash)]", className)}
      {...props}
    />
  );
}

export const OriginInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(function OriginInput({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn("mk-input-field", className)} {...props} />
  );
});

export const OriginTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function OriginTextarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn("mk-input-field min-h-[6rem] resize-y py-3", className)}
      {...props}
    />
  );
});

export function OriginFormHint({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return <p className={cn("mk-hint text-xs", className)} {...props} />;
}

export function OriginButton({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn("mk-btn-primary w-full justify-center py-3", className)}
      {...props}
    />
  );
}

export function OriginButtonOutline({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn("mk-btn-outline w-full justify-center py-3", className)}
      {...props}
    />
  );
}

export function OriginMarketingLink({
  className,
  href,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={cn(
        "mk-link-accent text-[var(--color-cloud)] underline-offset-4 hover:underline",
        className,
      )}
      {...props}
    />
  );
}

export const originSelectTriggerClass =
  "mk-select-trigger h-10 w-full border-0 shadow-none focus:ring-0";
