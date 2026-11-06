"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { reviewTeacherApplication } from "@/app/admin/actions";

/** Öğretmen başvurusuna karar. Panelin kendi düğme sınıfları (genel arayüz bileşenlerinin stilleri burada yüklü değil). */
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
      <button type="button" className="adm-btn adm-btn--primary" disabled={pending} onClick={() => decide("approved")}>
        Onayla
      </button>
      <button type="button" className="adm-btn" disabled={pending} onClick={() => decide("rejected")}>
        Reddet
      </button>
    </div>
  );
}
