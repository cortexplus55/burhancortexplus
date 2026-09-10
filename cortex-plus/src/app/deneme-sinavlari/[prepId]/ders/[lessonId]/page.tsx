import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonToolbar } from "@/components/parity/exam-lesson-toolbar";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Ders" };

export default async function ExamPrepLessonPage({
  params,
}: {
  params: Promise<{ prepId: string; lessonId: string }>;
}) {
  const { prepId, lessonId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prep }, { data: lesson }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title")
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exam_prep_lessons")
      .select("id, title, content_md, content_json, liked, exam_prep_id, created_at, topic_id")
      .eq("id", lessonId)
      .maybeSingle(),
  ]);

  if (!prep || !lesson || lesson.exam_prep_id !== prepId) notFound();

  const content = (lesson.content_md as string) ?? "";
  // Yapı varsa adım adım göster; eski dersler markdown olarak açılmayı sürdürür.
  const structured = lesson.content_json
    ? (lessonV2Schema.safeParse(lesson.content_json).data ?? null)
    : null;

  const created = lesson.created_at
    ? new Date(lesson.created_at as string).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <AstraParitySorShell {...shell}>
      <article className="ap-exam-page ap-lesson-page">
        <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
          ← Geri
        </Link>
        <div className="ap-exam-result-divider" aria-hidden />
        <p className="ap-lesson-kicker">{prep.title ?? "Sınav hazırlığı"}</p>
        <h1>{lesson.title}</h1>
        {created ? <p className="ap-lesson-date">{created}</p> : null}

        <ExamLessonToolbar
          lessonId={lesson.id}
          text={content}
          initialLiked={Boolean(lesson.liked)}
        />

        {structured ? (
          <ExamLessonSteps lesson={structured} />
        ) : (
          <ExamLessonBody content={content} />
        )}

        <div className="ap-exam-result-actions">
          <Link
            href={
              lesson.topic_id
                ? `/deneme-sinavlari/${prepId}/calis?topic=${lesson.topic_id}`
                : `/deneme-sinavlari/${prepId}/calis`
            }
            className="ap-exam-continue ap-exam-continue--primary"
          >
            Konuya dön
          </Link>
          <Link href={`/deneme-sinavlari/${prepId}`} className="ap-exam-continue">
            Konu yoluna dön
          </Link>
        </div>
      </article>
    </AstraParitySorShell>
  );
}
