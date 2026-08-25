"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleFeatureFlag } from "@/app/admin/actions";

export function FeatureFlagRow({
  flagKey,
  description,
  enabled,
}: {
  flagKey: string;
  description: string;
  enabled: boolean;
}) {
  const [checked, setChecked] = useState(enabled);
  const [, startTransition] = useTransition();

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <label htmlFor={`flag-${flagKey}`} className="cursor-pointer">
        <span className="text-sm font-medium">{flagKey}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </label>
      <Checkbox
        id={`flag-${flagKey}`}
        checked={checked}
        onCheckedChange={(value) => {
          const next = value === true;
          setChecked(next);
          startTransition(async () => {
            const result = await toggleFeatureFlag(flagKey, next);
            if (!result.ok) {
              setChecked(!next);
              toast.error(result.error ?? "Güncellenemedi.");
            }
          });
        }}
      />
    </li>
  );
}
