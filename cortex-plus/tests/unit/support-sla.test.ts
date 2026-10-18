import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORT_SLA, supportSlaLine } from "@/lib/support/sla";

/*
  Destek cevap süresi sözü (plan 4.9, 19 Ekim 2026): hafta içi 24 saat, hafta sonu 48 saat,
  sorumlu operasyon adresi. Söz tek kaynaktan (`sla.ts`) okunur ve destek sayfasında yazar.
*/
describe("destek cevap süresi", () => {
  it("24 / 48 saat ve operasyon adresi", () => {
    expect(SUPPORT_SLA.weekdayHours).toBe(24);
    expect(SUPPORT_SLA.weekendHours).toBe(48);
    expect(SUPPORT_SLA.email).toBe("cortexplus@cortexplus.app");
    expect(supportSlaLine()).toBe(
      "Hafta içi 24 saat, hafta sonu 48 saat içinde cortexplus@cortexplus.app adresinden cevap veririz.",
    );
  });

  it("destek sayfası sözü tek kaynaktan yazar", () => {
    const page = readFileSync(path.resolve(__dirname, "..", "..", "src", "app", "destek", "page.tsx"), "utf8");
    expect(page).toContain("supportSlaLine()");
  });
});
