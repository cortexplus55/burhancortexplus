import { ParitySorShell } from "@/components/parity/sor-shell";
import { ReviewDeckSession } from "@/components/learning/review-deck-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { loadGeneralReviewDue } from "@/lib/learning/general-review";

export const metadata = { title: "Tekrar destem" };
// Oturum okuyan sayfa: Suspense sınırı yok, sayfa hazır olunca gelir (AGENTS.md).
export const dynamic = "force-dynamic";

/**
 * Genel tekrar destesi (8 Kasım 2026): sohbetten "Tekrarıma ekle" ile eklenen bilgiler günü gelince burada boşluk
 * doldurma kartı olarak sorulur. Cevap kartın arkasında; öğrenci kendini değerlendirir (Bildim / Bilemedim).
 */
export default async function TekrarPage() {
  const { supabase, user } = await requireStudentArea();
  const [shell, deck] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadGeneralReviewDue(createServiceClient(), user.id),
  ]);
  return (
    <ParitySorShell {...shell}>
      <ReviewDeckSession cards={deck.due} dueCount={deck.dueCount} total={deck.total} />
    </ParitySorShell>
  );
}
