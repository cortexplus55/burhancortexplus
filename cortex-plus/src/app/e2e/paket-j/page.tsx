import { notFound } from "next/navigation";
import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { QuestionReportButton } from "@/components/learning/question-report-button";
import { TwinQuestionCard } from "@/components/learning/twin-question-card";
import { CramSheetView } from "@/components/parity/cram-sheet-view";
import { buildCramSheet } from "@/lib/learning/cram-sheet";
import { WallFixture } from "./wall";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (Paket J denetimi): gerçek bileşenler, veritabanısız. Ağ uçları (soru bildirimi, ikiz soru)
 * testte `page.route` ile taklit edilir. Konuya özgü terim yok: içerik yer tutucu.
 */
export default function E2ePaketJPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const sheet = buildCramSheet({
    topics: [
      { key: "t1", label: "Birinci konu" },
      { key: "t2", label: "İkinci konu" },
    ],
    lessons: [],
    examPoints: [
      { topicKey: "t1", points: ["Birinci konunun sınavda sorulan maddesi"] },
      { topicKey: "t2", points: ["İkinci konunun sınavda sorulan maddesi"] },
    ],
    weakSpots: [{ text: "Sık karıştırdığın ifade: A ile B aynı şey değil", topic: "Birinci konu" }],
  });
  return (
    <main style={{ padding: 16, display: "grid", gap: 24 }}>
      <section aria-label="Şerit">
        <EmailVerifyBanner preview />
      </section>
      <section aria-label="Duvar">
        <WallFixture />
      </section>
      <section aria-label="Bildir">
        <QuestionReportButton source="node" targetId="e2e-attempt" questionRef="0" />
      </section>
      <section aria-label="İkiz">
        <TwinQuestionCard attemptId="e2e-attempt" index={0} />
      </section>
      <section aria-label="Kâğıt">
        <CramSheetView sheet={sheet} prepTitle="Örnek hazırlık" examDay={null} homeHref="/e2e/paket-j" />
      </section>
    </main>
  );
}
