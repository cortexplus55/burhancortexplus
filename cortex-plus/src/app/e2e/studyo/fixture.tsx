"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { fixtureAccount } from "../ana-ekran/fixture";

/** Yalnız test fikstürü (E2E_FIXTURE=1). */
export function StudyoFixture({ plus }: { plus: boolean }) {
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={fixtureAccount(plus)}>
      <ToolsHub />
    </ParitySorShell>
  );
}
