"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClassroom } from "@/app/ogretmen-paneli/actions";

export function ClassroomForm() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end"
      action={(formData) => {
        startTransition(async () => {
          const result = await createClassroom(formData);
          if (result.ok) toast.success("Sınıf oluşturuldu.");
          else toast.error(result.error ?? "Oluşturulamadı.");
        });
      }}
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="classroom-name">Sınıf adı</Label>
        <Input id="classroom-name" name="name" required minLength={2} maxLength={80} />
      </div>
      <Button type="submit" disabled={pending}>
        Oluştur
      </Button>
    </form>
  );
}
