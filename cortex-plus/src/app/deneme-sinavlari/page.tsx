import { ParityExamPrep } from "@/components/parity/exam-prep";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadPrepCards } from "@/lib/learning/prep-cards";
import { toFeedRows, toSummary } from "@/lib/parity/school-feed";

export const metadata = { title: "Sınav hazırlığı" };

/*
  Sayfa tümüyle dinamik çiziliyor. Aynı sebep `/calisma-plani`'ndaki gibi:
  sarmalanan istemci bileşeni `useSearchParams()` kullanıyor, Suspense sınırı
  da yayında açılmıyordu. Sayfa zaten oturum gerektiriyor.
*/
export const dynamic = "force-dynamic";

export default async function DenemeSinavlariPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Ana listede son sekiz; hepsi "Sınav hazırlıklarım" sayfasında.
  const [cards, { data: profile }] = await Promise.all([
    loadPrepCards(supabase, user.id, 8),
    supabase
      .from("profiles")
      .select("school_name, grade_level")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Okul agi RPC'leri migration ile geliyor; fonksiyon yoksa sayfa cokmesin
  // diye bos akisla devam ediyoruz (sekme "okulunu sec" halini gosterir).
  const [summaryRes, feedRes] = await Promise.all([
    supabase.rpc("school_summary"),
    supabase.rpc("school_feed", { p_limit: 30 }),
  ]);
  const schoolSummary = toSummary(summaryRes.data);
  const schoolRows = toFeedRows(feedRes.data);
  const activePrep =
    cards.find((card) => card.topicsTotal > 0 && card.topicsDone < card.topicsTotal) ??
    cards.find((card) => card.topicsTotal > 0) ??
    cards[0] ??
    null;
  const otherPreps = cards.filter((card) => card.id !== activePrep?.id);

  return (
    <ParitySorShell {...shell}>
      <ParityExamPrep
        activePrep={activePrep}
        otherPreps={otherPreps}
        userInitial={shell.userInitial}
        initialSchoolName={profile?.school_name ?? ""}
        schoolSummary={schoolSummary}
        schoolRows={schoolRows}
        gradeLevel={(profile?.grade_level as string | null) ?? null}
      />
    </ParitySorShell>
  );
}
