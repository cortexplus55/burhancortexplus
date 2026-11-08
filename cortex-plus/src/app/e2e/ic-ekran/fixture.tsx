"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepRadarChart } from "@/components/parity/prep-radar-chart";
import { QuizStudio } from "@/components/learning/studio/quiz-studio";
import { MistakeNotebookView } from "@/components/parity/mistake-notebook-view";
import { fixtureAccount } from "../ana-ekran/fixture";

/** Yalnız test fikstürü (E2E_FIXTURE=1). */
export function IcEkranFixture({ screen }: { screen: string }) {
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={fixtureAccount(false)}>
      {screen === "test" ? (
        <QuizStudio creditCost={10} documents={[]} initialDocumentId={null} />
      ) : screen === "defter" ? (
        <main style={{ padding: "1.5rem 1rem", maxWidth: "48rem", margin: "0 auto" }}>
          <MistakeNotebookView groups={[]} masteredCount={0} />
        </main>
      ) : (
        <main style={{ padding: "1.5rem 1rem", maxWidth: "36rem", margin: "0 auto" }}>
          <PrepRadarChart
            view={{
              label: "Fikstür hazırlığı",
              readinessPct: 0,
              targetScore: 95,
              axes: [
                { id: "coverage", label: "Konu Kapsamı", pct: 0 },
                { id: "accuracy", label: "Test Doğruluğu", pct: 0 },
                { id: "mock", label: "Deneme Performansı", pct: 0 },
                { id: "retention", label: "Tekrar & Kalıcılık", pct: 0 },
                { id: "tempo", label: "Tempo & Düzen", pct: 0 },
              ],
            }}
          />
        </main>
      )}
    </ParitySorShell>
  );
}
