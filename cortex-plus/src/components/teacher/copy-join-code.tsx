"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyJoinCode({ code }: { code: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Katılım kodu kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı.");
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy}>
      Kod: {code} · Kopyala
    </Button>
  );
}
