import { notFound } from "next/navigation";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { CoachLine, StreakBadge } from "@/components/learning/coach-chrome";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (dönüşüm paketi, 7 Kasım 2026): ilk adım başlatıcısı ve koç katmanı, veritabanısız. Telefonda
 * taşma ve dokunma alanı ölçümü için; `?hedef=` ile düzey değiştirilebilir.
 */
export default async function E2eIlkAdimPage({ searchParams }: { searchParams: Promise<{ hedef?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  const profile =
    params.hedef === "yks"
      ? { gradeLevel: "12. sınıf", goalText: "YKS hazırlık" }
      : params.hedef === "universite"
        ? { gradeLevel: "Üniversite", goalText: "Üniversite vize ve final" }
        : params.hedef === "kpss"
          ? { gradeLevel: "Mezun", goalText: "KPSS hazırlık" }
          : { gradeLevel: "10. sınıf", goalText: "Okul sınavları" };
  return (
    <main style={{ padding: "1rem" }}>
      <FirstStepLauncher firstName="Öğrenci" gradeLevel={profile.gradeLevel} goalText={profile.goalText} />
      <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.5rem" }}>
        <StreakBadge streak={3} />
        <CoachLine input={{ correct: true, streak: 3 }} />
        <CoachLine input={{ correct: false, streak: 0 }} />
      </div>
    </main>
  );
}
