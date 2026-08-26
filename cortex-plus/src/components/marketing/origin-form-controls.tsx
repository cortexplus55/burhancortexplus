"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectContent, SelectItem } from "@/components/ui/select";

/** @deprecated Prefer `Checkbox` — same Origin styling app-wide */
export const OriginCheckbox = Checkbox;

export function OriginConsentRow({
  className,
  children,
  id,
  checked,
  onCheckedChange,
  ...rootProps
}: React.ComponentProps<typeof Checkbox> & {
  children: React.ReactNode;
}) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("mk-consent-row flex items-start gap-3 text-sm", className)}>
      <Checkbox
        id={fieldId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
        {...rootProps}
      />
      <label htmlFor={fieldId} className="mk-prose cursor-pointer leading-relaxed dark:text-[var(--color-ash)]">
        {children}
      </label>
    </div>
  );
}

export function OriginSelectContent({
  className,
  ...props
}: React.ComponentProps<typeof SelectContent>) {
  return (
    <SelectContent
      className={cn(
        "border border-white/10 bg-[var(--color-graphite)] text-[var(--color-cloud)] shadow-none ring-0 dark:border-white/10 dark:bg-[var(--color-graphite)] dark:text-[var(--color-cloud)]",
        className,
      )}
      {...props}
    />
  );
}

export function OriginSelectItem({
  className,
  ...props
}: React.ComponentProps<typeof SelectItem>) {
  return (
    <SelectItem
      className={cn(
        "focus:bg-[var(--color-steel)] focus:text-[var(--color-cloud)] data-highlighted:bg-[var(--color-steel)] data-highlighted:text-[var(--color-cloud)]",
        className,
      )}
      {...props}
    />
  );
}
