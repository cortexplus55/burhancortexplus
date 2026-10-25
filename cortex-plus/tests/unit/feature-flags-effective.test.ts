import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("etkisiz özellik bayrakları", () => {
  it("paytr_live ve rag_sources panelde salt okunur; canlı ödeme PAYTR_TEST_MODE", () => {
    const page = read("src/app/admin/feature-flags/page.tsx");
    expect(page).toContain("INEFFECTIVE");
    expect(page).toContain('key: "paytr_live"');
    expect(page).toContain('key: "rag_sources"');
    expect(page).toContain("PAYTR_TEST_MODE");
    expect(page).toContain("paytrMode()");
    expect(page).toContain("locked");
    expect(page).toContain('key: "weekly_survey"');
    const rows = read("src/components/admin/admin-rows.tsx");
    expect(rows).toContain("locked");
    expect(rows).toContain("Salt okunur");
    expect(rows).toContain("Kod okumuyor");
  });

  it("kod bu bayrakları okumuyor; veli yolları artık yenilenmiyor", () => {
    const flags = read("src/lib/admin/feature-flags.ts");
    expect(flags).not.toContain("paytr_live");
    expect(flags).not.toContain("rag_sources");
    expect(read("src/app/kayit/actions.ts")).not.toMatch(/revalidatePath\("\/veli/);
    expect(read("src/app/actions.ts")).not.toMatch(/revalidatePath\("\/veli/);
  });
});
