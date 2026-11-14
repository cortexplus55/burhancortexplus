"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { UiScope } from "@/lib/ui-v2/scope";
import { fixtureAccount } from "../ana-ekran/fixture";

/** Yalnız test fikstürü (E2E_FIXTURE=1). `v2`: /araclar'ın `ui.v2.studyo` açıkken yaptığı gibi (Faz 8). */
export function StudyoFixture({ plus, v2 = false }: { plus: boolean; v2?: boolean }) {
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={fixtureAccount(plus)}>
      <UiScope keys={v2 ? ["studyo"] : []}>
        <ToolsHub gated={v2} />
      </UiScope>
    </ParitySorShell>
  );
}
