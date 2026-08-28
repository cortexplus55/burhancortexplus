"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitAssignment } from "@/app/odevlerim/actions";

export function AssignmentSubmitForm({
  assignmentId,
  defaultContent,
}: {
  assignmentId: string;
  defaultContent?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        startTransition(async () => {
          formData.set("assignmentId", assignmentId);
          const result = await submitAssignment(formData);
          if (result.ok) toast.success("Teslim kaydedildi.");
          else toast.error(result.error ?? "Gönderilemedi.");
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="submission-content">Cevabın</Label>
        <Textarea
          id="submission-content"
          name="content"
          rows={5}
          required
          defaultValue={defaultContent}
          placeholder="Ödev cevabını yaz…"
        />
      </div>
      <Button type="submit" disabled={pending}>
        Teslim et
      </Button>
    </form>
  );
}
