"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateCreditRule } from "@/app/admin/actions";

export function CreditRuleRow({
  actionCode,
  creditCost,
  modelTier,
  description,
}: {
  actionCode: string;
  creditCost: number;
  modelTier: string;
  description: string | null;
}) {
  const [value, setValue] = useState(String(creditCost));
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{description ?? actionCode}</p>
        <p className="text-xs text-muted-foreground">
          {actionCode} · <Badge variant="secondary">{modelTier}</Badge>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={1000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24"
          aria-label={`${actionCode} kredi bedeli`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || value === String(creditCost)}
          onClick={() =>
            startTransition(async () => {
              const result = await updateCreditRule({
                actionCode,
                creditCost: Number(value),
              });
              if (result.ok) toast.success("Kural güncellendi.");
              else toast.error(result.error ?? "Güncellenemedi.");
            })
          }
        >
          Kaydet
        </Button>
      </div>
    </li>
  );
}
