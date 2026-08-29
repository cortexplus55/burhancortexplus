import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sonuç" };

export default async function ExamPrepSonucPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ examId?: string; score?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  let analysis = "";
  if (query.examId) {
    const { data: attempt } = await supabase
      .from("practice_exam_attempts")
      .select("analysis, score")
      .eq("exam_id", query.examId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    analysis = (attempt?.analysis as string) ?? "";
  }

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page ap-exam-result">
        <div className="ap-exam-result-divider" aria-hidden />
        <h1>Sonuç</h1>
        <p className="text-3xl font-bold text-[var(--ap-gold)]">
          {query.score ?? "—"} puan
        </p>
        <section className="ap-exam-result-body">
          <h2>Odaklanılacak alanlar</h2>
          <p className="text-sm text-[var(--ap-muted)] whitespace-pre-wrap">
            {analysis || "Analiz hazırlanıyor; kısa süre içinde burada görünecek."}
          </p>
        </section>
        <Link href={`/deneme-sinavlari/${prepId}/calis`} className="ap-exam-continue ap-exam-continue--primary">
          Derse devam et
        </Link>
      </div>
    </AstraParitySorShell>
  );
}
