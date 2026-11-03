"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ParityExamRunner } from "@/components/parity/exam-runner";
import { peekInstantExam } from "@/lib/learning/mock-exam/instant-exam";

/**
 * Anında açılış (3 Kasım 2026): havuz denemesinin soruları kurulumdan bellekte geldiyse ilk soru sunucu
 * çizimini beklemeden burada çizilir (oturum kabuğunun sade hâli). Sayfa gelince aynı sınav yerine geçer;
 * cevaplar taslakta olduğu için kaybolmaz. Kayıt yoksa sade yükleniyor göstergesi.
 */
export default function ExamPrepDenemeLoading() {
  const params = useParams<{ prepId: string; examId: string }>();
  const instant = params?.prepId && params?.examId ? peekInstantExam(params.prepId, params.examId) : null;
  return (
    <div className="cp-sor-root cp-sor-root--session">
      <main className="cp-sor-main">
        {instant ? (
          <ParityExamRunner examId={instant.examId} prepId={instant.prepId} title={instant.title} questions={instant.questions} />
        ) : (
          <div className="cp-exam-page flex min-h-[50vh] items-center justify-center" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--c-action)]" aria-label="Yükleniyor" />
          </div>
        )}
      </main>
    </div>
  );
}
