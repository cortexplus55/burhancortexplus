import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORT_SLA, supportSlaLine } from "@/lib/support/sla";

/*
  Destek cevap süresi sözü (plan 4.9). Ürün sahibinin kararı (19 Ekim 2026): 24 saat içinde, hafta sonu
  dahil; sorumlu operasyon adresi. Söz tek kaynaktan (`sla.ts`) okunur, destek sayfasında yazar, günlük
  özet 24 saati geçen açık talepleri sayar.
*/
describe("destek cevap süresi", () => {
  it("24 saat ve operasyon adresi", () => {
    expect(SUPPORT_SLA.hours).toBe(24);
    expect(SUPPORT_SLA.email).toBe("cortexplus@cortexplus.app");
    expect(supportSlaLine()).toBe("24 saat içinde cortexplus@cortexplus.app adresinden cevap veririz.");
  });

  it("destek sayfası ve günlük özet sözü tek kaynaktan okur", () => {
    const root = path.resolve(__dirname, "..", "..", "src");
    expect(readFileSync(path.join(root, "app", "destek", "page.tsx"), "utf8")).toContain("supportSlaLine()");
    expect(readFileSync(path.join(root, "lib", "admin", "daily-digest.ts"), "utf8")).toContain("SUPPORT_SLA.hours");
  });
});
