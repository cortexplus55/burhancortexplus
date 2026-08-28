"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAssignment } from "@/app/ogretmen-paneli/actions";

export function AssignmentForm({
  classrooms,
  allowQuizAttach = false,
  quizzes = [],
}: {
  classrooms: { id: string; name: string }[];
  allowQuizAttach?: boolean;
  quizzes?: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-xl space-y-4"
      action={(formData) => {
        startTransition(async () => {
          const result = await createAssignment(formData);
          if (result.ok) toast.success("Ödev oluşturuldu.");
          else if (result.error === "plus_required")
            toast.error(
              (result as { message?: string }).message ?? "Plus gerekli.",
            );
          else if (result.error === "trial_exhausted")
            toast.error(
              (result as { message?: string }).message ?? "Deneme hakkın doldu.",
            );
          else toast.error(result.error ?? "Oluşturulamadı.");
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="assignment-classroom">Sınıf</Label>
        <select
          id="assignment-classroom"
          name="classroomId"
          required
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-title">Başlık</Label>
        <Input id="assignment-title" name="title" required minLength={2} maxLength={150} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-description">Açıklama</Label>
        <Textarea id="assignment-description" name="description" rows={3} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-due">Teslim tarihi</Label>
        <Input id="assignment-due" name="dueAt" type="date" className="w-48" />
      </div>

      {allowQuizAttach && quizzes.length ? (
        <div className="space-y-2">
          <Label htmlFor="assignment-quiz">Quiz (Plus)</Label>
          <select
            id="assignment-quiz"
            name="quizId"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Quiz bağlama</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        Ödev oluştur
      </Button>
    </form>
  );
}
