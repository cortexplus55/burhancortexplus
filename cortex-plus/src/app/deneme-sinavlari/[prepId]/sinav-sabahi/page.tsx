import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { formatDayLong } from "@/lib/format";
import { CramSheetView } from "@/components/parity/cram-sheet-view";
import { loadCramSheet } from "@/lib/learning/cram-sheet-load";

export const metadata = { title: "Sınav sabahı kâğıdı" };
export const dynamic = "force-dynamic";

/**
 * Sınav sabahı kâğıdı (31 Ekim 2026, Paket J3 #14): hazırlığın kayıtlı derslerinden formüller, sınav ipuçları,
 * tuzaklar, hafıza çivileri, "Sınavda sorulur" maddeleri ve öğrencinin en çok yanıldığı noktalar tek sayfada.
 * Model çağrısı yok, kredi düşmez. Yazdır düğmesi tarayıcının penceresini açar ("PDF olarak kaydet" oradan).
 * Bekleme kutusu (Suspense, loading.tsx) yok: bu projede sayfayı boşaltıyor.
 */
export default async function CramSheetPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, target_score")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const sheet = await loadCramSheet(createServiceClient(), {
    prepId,
    userId: user.id,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
  });
  const prepTitle = (prep.title as string | null) ?? (prep.exam_type as string | null) ?? "Sınav hazırlığı";
  const examDay = formatDayLong((prep.exam_date as string | null) ?? null);

  return (
    <ParitySorShell {...shell} chrome="focus" backHref={examPrepHomeHref(prepId)}>
      <CramSheetView sheet={sheet} prepTitle={prepTitle} examDay={examDay} homeHref={examPrepHomeHref(prepId)} />
    </ParitySorShell>
  );
}
