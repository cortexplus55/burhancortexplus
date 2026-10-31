"use client";

import { useState } from "react";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { nodeGateForCode } from "@/components/parity/exam-node/gates";

/** Ücretsiz duvar: sunucunun `free_topic_limit` 402'si istemcide bu kapıya döner. */
export function WallFixture() {
  const [open, setOpen] = useState(false);
  const gate = nodeGateForCode(
    "free_topic_limit",
    { message: "", beyondFreeDaily: false },
    false,
    { firstTopic: { title: "Birinci konu", done: 5, total: 5, lessonsDone: 2, bestScore: 80, completed: true } },
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        2. konuyu aç
      </button>
      <UpgradeSheet
        open={open}
        onOpenChange={setOpen}
        message={gate.message}
        headline={gate.headline}
        wins={gate.wins}
        returnPath="/e2e/paket-j"
      />
    </>
  );
}
