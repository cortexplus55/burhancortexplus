"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { shareQuizAsAssignment } from "@/app/ogretmen-paneli/actions";

export function ShareQuizForm({
  quizId,
  quizTitle,
  classrooms,
}: {
  quizId: string;
  quizTitle: string;
  classrooms: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  if (!classrooms.length) return null;

  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 border-t border-[var(--astra-border)] pt-2"
      action={(formData) => {
        startTransition(async () => {
          formData.set("quizId", quizId);
          formData.set("title", quizTitle);
          const result = await shareQuizAsAssignment(formData);
          if (result.ok) toast.success("Quiz sınıfa ödev olarak paylaşıldı.");
          else toast.error(result.error ?? "Paylaşılamadı.");
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`share-${quizId}`} className="text-xs">
          Sınıfa paylaş
        </Label>
        <select
          id={`share-${quizId}`}
          name="classroomId"
          required
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Paylaş
      </Button>
    </form>
  );
}
