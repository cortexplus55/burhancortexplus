import { notFound } from "next/navigation";
import { RedPenSheet } from "@/components/parity/red-pen-sheet";
import { deriveRedPen } from "@/lib/learning/mock-exam/red-pen";
import { BARE_RESULT_NOTE } from "@/lib/learning/mock-exam/score-notes";
import { analyzeWorkSteps, stepFeedbackLine } from "@/lib/learning/mock-exam/work-steps";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (20 Kasım 2026, Faz 7): Kırmızı Kalemli Hoca kâğıdı, gerçek türetmeyle (`deriveRedPen`), veritabanısız.
 * Üç hâl: satır satır kısmi puan, notlandırmanın sınırı, tam puan. İçerik yer tutucu; tema `localStorage.theme`.
 */
export default function E2eKirmiziKalemPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const criteria = [
    { criterion: "Bağıntıyı doğru kurar", points: 4, met: true },
    { criterion: "Ara işlemi adım adım gösterir ve her adımda birimi korur", points: 3, met: false },
    { criterion: "Sonucu birimiyle yazar", points: 3, met: false },
  ];
  const steps = analyzeWorkSteps("2x + 3 = 11\n2x = 11 + 3\nx = 7");
  const partial = deriveRedPen({ maxPoints: 10, awarded: 6, criteria, steps, scoreNote: stepFeedbackLine(steps) ?? undefined });
  const allMet = criteria.map((row) => ({ ...row, met: true }));
  const capped = deriveRedPen({ maxPoints: 10, awarded: 6, criteria: allMet, scoreNote: BARE_RESULT_NOTE });
  const full = deriveRedPen({ maxPoints: 10, awarded: 10, criteria: allMet });
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "grid", gap: 16 }}>
      <RedPenSheet redPen={partial} earned={6} max={10} className="e2e-redpen-partial" />
      <RedPenSheet redPen={capped} earned={6} max={10} className="e2e-redpen-capped" />
      <RedPenSheet redPen={full} earned={10} max={10} className="e2e-redpen-full" />
    </div>
  );
}
