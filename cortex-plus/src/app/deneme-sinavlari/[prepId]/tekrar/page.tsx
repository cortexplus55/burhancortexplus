import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepReviewSession } from "@/components/parity/prep-review-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { loadDueReviewItems } from "@/lib/learning/review-items-store";

export const metadata = { title: "Bugünkü tekrar" };
export const dynamic = "force-dynamic";

/**
 * Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): yanlış yapılan sorular ve dersin sınav
 * noktaları 1-3-7-14 gün sonra burada yeniden sorulur. Yolun DIŞINDA: düğüm yok, tamamlama yok,
 * önceden yazım yok — yol sırası ve kilitler değişmez. Yalnız bu hazırlığın tekrarı (hazırlıklar
 * birleşmez). Bekleme kutusu (Suspense, loading.tsx) yok: bu projede sayfayı boşaltıyor.
 */
export default async function PrepDueReviewPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) redirect(examPrepHomeHref(prepId));

  const { items, total } = await loadDueReviewItems(service, {
    userId: user.id,
    prepId,
    examDate: (prep.exam_date as string | null) ?? null,
  });

  return (
    <ParitySorShell {...shell} chrome="session">
      <PrepReviewSession
        key={items.map((item) => item.id).join(":")}
        prepId={prepId}
        prepTitle={(prep.title as string | null) ?? (prep.exam_type as string | null) ?? "Sınav hazırlığı"}
        items={items}
        total={total}
      />
    </ParitySorShell>
  );
}
