"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { grantCredits } from "@/app/admin/actions";

export function GrantCredits({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("50");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        max={10000}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="w-24"
        aria-label="Hediye kredi miktarı"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await grantCredits(userId, Number(amount));
            if (result.ok) toast.success("Kredi tanımlandı.");
            else toast.error(result.error ?? "İşlem başarısız.");
          })
        }
      >
        Kredi ver
      </Button>
    </div>
  );
}
