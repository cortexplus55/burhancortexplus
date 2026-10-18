"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rerunTeacherAnalysis } from "@/app/admin/actions";

/**
 * Yalnız yöneticiye görünen "Öğretmen analizini yeniden çalıştır" (18 Ekim 2026, plan 4.4).
 * Hazır analiz kendiliğinden yenilenmez; sayfa sınırı değiştiğinde ya da analiz eksik
 * çıktığında bu düğme kaydı baştan yazar. Öğrenciden kredi düşmez, denetim günlüğüne yazılır.
 */
export function DocumentReanalyzeButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        className="inline-flex min-h-8 items-center rounded-full border border-[var(--cp-border)] px-3 font-medium text-[var(--cs-text)] disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            const result = await rerunTeacherAnalysis(documentId);
            if (!result.ok) {
              toast.error(result.error ?? "Analiz yeniden çalıştırılamadı.");
              return;
            }
            setSummary(`${result.topics} konu · ${result.examPoints} sınav maddesi`);
            toast.success("Öğretmen analizi yenilendi.");
            router.refresh();
          })
        }
      >
        {pending ? "Analiz yazılıyor…" : "Öğretmen analizini yeniden çalıştır"}
      </button>
      {summary ? <span className="text-[var(--cs-muted)]">{summary}</span> : null}
    </span>
  );
}
