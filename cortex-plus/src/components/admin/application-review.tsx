"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewTeacherApplication } from "@/app/admin/actions";

export function ApplicationReview({ applicationId }: { applicationId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewTeacherApplication({ applicationId, decision });
      if (result.ok) toast.success("Başvuru güncellendi.");
      else toast.error(result.error ?? "İşlem başarısız.");
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => decide("approved")}
      >
        Onayla
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => decide("rejected")}
      >
        Reddet
      </Button>
    </div>
  );
}
