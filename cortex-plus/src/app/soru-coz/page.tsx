import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { QuestionSolver } from "@/components/learning/question-solver";
import { SOLVER_ACCENT, SolverHero } from "@/components/learning/solver-hero";
import { requireUser } from "@/lib/auth/session";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { parseTutorStyle } from "@/lib/learning/tutor-style";
import { getStudentAccountContext } from "@/lib/student/account-context";
import "@/styles/question-solver.css";

export const metadata = { title: "Soru çöz" };
export const dynamic = "force-dynamic";

/*
  Soru çöz (23 Ekim 2026): fotoğraf ya da yazılı soru, her ders. Yeni motor `src/lib/solve/` (iki bağımsız çözüm, kod
  kontrolü, denetim). Ücretsiz hesapta günde 1 fotoğraf ve 3 mesaj (24 Ekim 2026). Hazırlık sayfasından gelince
  (`?hazirlik=`) şıklı soru o hazırlığın tekrar listesine eklenebilir.

  8 Kasım 2026 (ürün sahibinin onayı): sayfa Çalışma Stüdyosu'ndaki kartıyla aynı dilde açılır: 3B simge, ad, renk,
  "← Çalışma Stüdyosu". Günlük fotoğraf hakkı cümlesi yalnız ücretsiz hesaba (Plus ve kurucu görmüyordu ama okuyordu).
*/
export default async function SoruCozPage({ searchParams }: { searchParams: Promise<{ hazirlik?: string }> }) {
  const { supabase, user } = await requireUser();
  const { hazirlik } = await searchParams;

  const [{ data: profile }, account] = await Promise.all([
    supabase.from("profiles").select("tutor_style").eq("id", user.id).maybeSingle(),
    getStudentAccountContext(supabase, user.id).catch(() => null),
  ]);
  const tutorStyle = parseTutorStyle(profile?.tutor_style);
  const freeAccount = account?.showsUpgradeChrome ?? false;

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
    <AppShell width="read">
      <div className="cp-solver-page" style={{ ["--solver-accent" as string]: SOLVER_ACCENT }}>
        {prep ? (
          <Link href={examPrepHomeHref(prep.id)} className="cp-solver-back">
            <ArrowLeft aria-hidden /> {prep.title}
          </Link>
        ) : (
          <Link href="/araclar" className="cp-solver-back">
            <ArrowLeft aria-hidden /> Çalışma Stüdyosu
          </Link>
        )}
        <SolverHero freeAccount={freeAccount} />
        <QuestionSolver prep={prep} tutorStyle={tutorStyle} />
      </div>
    </AppShell>
  );
}
