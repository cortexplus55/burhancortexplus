"use client";

import { useState } from "react";
import { OfficialCurriculumPanel, type OfficialCurriculumPick } from "@/components/parity/official-curriculum-panel";

/** Resmî müfredat panelinin fikstürü: seçimin sihirbaza ne döndürdüğünü gösterir. */
export function MufredatFixture() {
  const [pick, setPick] = useState<OfficialCurriculumPick | null>(null);
  return (
    <main className="apw" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <OfficialCurriculumPanel gradeLevel="5. sınıf" onClose={() => undefined} onPick={setPick} onChatFallback={() => undefined} />
      {pick ? (
        <pre data-testid="picked">
          {JSON.stringify({ ref: pick.ref, topics: pick.map.topics.length, total: pick.map.total })}
        </pre>
      ) : null}
    </main>
  );
}
