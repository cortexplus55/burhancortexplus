"use client";

import { SetupScreens } from "@/components/parity/exam-node/open-screens";
import type { NodeLifecycle } from "@/components/parity/exam-node/use-node-lifecycle";

/** Yalnız test fikstürü (E2E_FIXTURE=1). */
const PREVIEW = {
  title: "Fikstür: Hücre",
  heading: "Hücrenin yapısı",
  paragraphs: ["Hücre, canlıların yapı ve işlev birimidir.", "Zar, sitoplazma ve çekirdekten oluşur."],
};

export function HavuzDersFixture({ auto }: { auto: boolean }) {
  const life = {
    prepId: "e2e-prep",
    nodeId: "e2e-node",
    kind: "lesson",
    stage: "setup",
    loading: false,
    reviewSaved: false,
    rewriteLesson: false,
    autoOpening: auto,
    initialLessonPreview: auto ? PREVIEW : null,
    instantLesson: auto ? PREVIEW : null,
    meta: { setupLabel: "Ders" },
    topicLabel: "Hücre",
    unitTitle: "Hücre",
    familiarity: null,
    activityMinutes: 10,
    generationError: null,
    generationFailure: null,
    router: { push: () => undefined },
    setStage: () => undefined,
    start: async () => undefined,
  } as unknown as NodeLifecycle;
  return (
    <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "1rem" }}>
      <SetupScreens life={life} />
    </main>
  );
}
