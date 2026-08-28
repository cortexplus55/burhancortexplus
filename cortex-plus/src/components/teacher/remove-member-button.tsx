"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeClassroomMember } from "@/app/ogretmen-paneli/actions";

export function RemoveMemberButton({
  memberId,
  classroomId,
}: {
  memberId: string;
  classroomId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-xs text-red-400"
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("memberId", memberId);
          fd.set("classroomId", classroomId);
          const result = await removeClassroomMember(fd);
          if (result.ok) toast.success("Öğrenci sınıftan çıkarıldı.");
          else toast.error(result.error ?? "İşlem başarısız.");
        });
      }}
    >
      Çıkar
    </Button>
  );
}
