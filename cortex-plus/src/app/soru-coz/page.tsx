import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { QuestionSolver } from "@/components/learning/question-solver";
import { requireUser } from "@/lib/auth/session";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import "@/styles/question-solver.css";

export const metadata = { title: "Soru çöz" };
export const dynamic = "force-dynamic";

/*
  Soru çöz (23 Ekim 2026): fotoğraf ya da yazılı soru, her ders. Yeni motor `src/lib/solve/` (iki bağımsız çözüm, kod
  kontrolü, denetim). Ücretsiz hesapta günde 1 fotoğraf ve 3 mesaj (24 Ekim 2026). Hazırlık sayfasından gelince
  (`?hazirlik=`) şıklı soru o hazırlığın tekrar listesine eklenebilir.
*/
export default async function SoruCozPage({ searchParams }: { searchParams: Promise<{ hazirlik?: string }> }) {
  const { supabase, user } = await requireUser();
  const { hazirlik } = await searchParams;

  let prep: { id: string; title: string } | null = null;
  if (hazirlik && /^[0-9a-f-]{36}$/i.test(hazirlik)) {
    const { data } = await supabase
      .from("exam_preps")
      .select("id, title, exam_type")
      .eq("id", hazirlik)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      prep = {
        id: data.id as string,
        title: (data.title as string | null) ?? (data.exam_type as string | null) ?? "Sınav hazırlığı",
      };
    }
  }

  return (
    <AppShell title="Soru çöz">
      <div className="cp-solver-page">
        {prep ? (
          <Link href={examPrepHomeHref(prep.id)} className="cp-solver-back">
            ← {prep.title}
          </Link>
        ) : null}
        <header className="cp-solver-intro-head">
          <h1>Soru çöz</h1>
          <p>
            Sorunun fotoğrafını çek ya da soruyu yaz. Birkaç saniyede adım adım çözüm, her şıkkın açıklaması ve
            akılda kalacak kısa kural gelir. Ücretsiz hesapta günde 1 fotoğraf sorusu.
          </p>
        </header>
        <QuestionSolver prep={prep} />
      </div>
    </AppShell>
  );
}
