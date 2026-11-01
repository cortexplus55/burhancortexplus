"use client";

import { useState } from "react";
import { fakeLevelApi } from "../level-fake";
import { OfficialSetupFlow, type OfficialSetupBody } from "@/components/parity/official-setup-flow";

/** Resmî kurulum fikstürü: oluşturma isteği sunucuya gitmez, gövde ekranda gösterilir. */
export function ResmiKurulumFixture({ exam }: { exam: "yks" | "lgs" | null }) {
  const [body, setBody] = useState<OfficialSetupBody | null>(null);
  return (
    <main style={{ padding: 0 }}>
      <OfficialSetupFlow
        initialExam={exam}
        submit={async (b) => {
          setBody(b);
          return { prepId: "e2e-prep" };
        }}
        onCreated={() => undefined}
        levelApi={fakeLevelApi({ guest: false })}
      />
      {body ? (
        <pre data-testid="picked" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify({
            title: body.title,
            examType: body.examType,
            examDate: body.examDate,
            dailyMinutes: body.dailyMinutes,
            topics: body.topics.length,
            hard: body.hardTopics.length,
            codes: (body.learningPreferences.officialPlan as { units: { codes: string[] }[] }).units.reduce((n, u) => n + u.codes.length, 0),
            units: (body.learningPreferences.officialPlan as { units: unknown[] }).units.length,
            alan: (body.learningPreferences.officialPlan as { alan: string | null }).alan,
            first: body.topics[0],
            scan: (body.learningPreferences.officialPlan as { units: { ratingSource?: string | null }[] }).units.filter((u) => u.ratingSource === "scan").length,
          })}
        </pre>
      ) : null}
    </main>
  );
}
