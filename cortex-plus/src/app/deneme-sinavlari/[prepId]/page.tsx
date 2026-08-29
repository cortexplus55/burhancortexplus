import Link from "next/link";
import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sınav hazırlığı" };

export default async function ExamPrepDetailPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prep }, { data: topics }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title, exam_type, target_score")
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exam_prep_topics")
      .select("label, sort_order")
      .eq("exam_prep_id", prepId)
      .order("sort_order"),
  ]);

  if (!prep) notFound();

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-4">
        <Link href="/deneme-sinavlari" className="ap-back-pill">
          ← Geri
        </Link>
        <h1 className="text-xl font-semibold">{prep.title ?? prep.exam_type}</h1>
        {prep.target_score ? (
          <p className="text-sm text-[var(--ap-muted)]">Hedef puan: %{prep.target_score}</p>
        ) : null}
        <ol className="ap-topic-numbered-list">
          {(topics ?? []).map((topic, index) => (
            <li key={topic.sort_order}>
              <span className="ap-topic-num">{index + 1}</span>
              <span className="ap-topic-label">{topic.label}</span>
            </li>
          ))}
        </ol>
        <Link href={`/deneme-sinavlari/${prepId}/calis`} className="ap-exam-continue ap-exam-continue--primary">
          Derse devam et
        </Link>
      </div>
    </AstraParitySorShell>
  );
}
