import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepReviewSession } from "@/components/parity/prep-review-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { loadDueReviewItems, loadTargetedReviewItems } from "@/lib/learning/review-items-store";
import { MistakeNotebookView } from "@/components/parity/mistake-notebook-view";
import { loadOpenMistakes, toClientGroups } from "@/lib/learning/mistake-notebook";
import { MASTERY_ROW_COLUMNS, masterySnapshotFromRow, targetedReviewTopics } from "@/lib/learning/learning-tracking";

export const metadata = { title: "Bugünkü tekrar" };
export const dynamic = "force-dynamic";

/**
 * Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): yanlış yapılan sorular ve dersin sınav
 * noktaları 1-3-7-14 gün sonra burada yeniden sorulur. Yolun DIŞINDA: düğüm yok, tamamlama yok,
 * önceden yazım yok — yol sırası ve kilitler değişmez. Yalnız bu hazırlığın tekrarı (hazırlıklar
 * birleşmez). Bekleme kutusu (Suspense, loading.tsx) yok: bu projede sayfayı boşaltıyor.
 */
export default async function PrepDueReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ hedef?: string }>;
}) {
  const { prepId } = await params;
  const { hedef } = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, target_score")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) redirect(examPrepHomeHref(prepId));

  // Faz 4 — ücretsiz hedefli tekrar ("Eksik & Tuzak Soruları Çalış", "Hatalarımı Şimdi Kapat"): Zayıf / Gelişiyor /
  // tuzak konuların kayıtlı soruları (günü gelmemiş olsalar da) ve aynı konuların Yanlışlar Defteri soruları.
  if (hedef === "1") {
    const [{ data: topicRows }, { data: masteryRows }] = await Promise.all([
      service.from("exam_prep_topics").select("label").eq("exam_prep_id", prepId),
      service.from("exam_prep_topic_mastery").select(MASTERY_ROW_COLUMNS).eq("user_id", user.id).eq("exam_prep_id", prepId),
    ]);
    const planned = (topicRows ?? []).map((row) => String(row.label ?? "").trim()).filter(Boolean);
    const targets = targetedReviewTopics(
      planned,
      ((masteryRows ?? []) as Record<string, unknown>[]).map(masterySnapshotFromRow),
      typeof prep.target_score === "number" ? prep.target_score : null,
    );
    const [targeted, mistakeGroups] = await Promise.all([
      loadTargetedReviewItems(service, { userId: user.id, prepId, topicLabels: targets, limit: 20 }),
      loadOpenMistakes(supabase, user.id),
    ]);
    const wanted = new Set(targets.map((label) => label.toLocaleLowerCase("tr-TR")));
    const mistakes = mistakeGroups.filter((group) => wanted.has(group.label.toLocaleLowerCase("tr-TR")));
    return (
      <ParitySorShell {...shell} chrome="session">
        <PrepReviewSession
          key={`hedef:${targeted.items.map((item) => item.id).join(":")}`}
          prepId={prepId}
          prepTitle={(prep.title as string | null) ?? (prep.exam_type as string | null) ?? "Sınav hazırlığı"}
          items={targeted.items}
          total={targeted.total}
          practice
        />
        {mistakes.length ? (
          <MistakeNotebookView groups={toClientGroups(mistakes)} masteredCount={0} />
        ) : null}
      </ParitySorShell>
    );
  }

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
