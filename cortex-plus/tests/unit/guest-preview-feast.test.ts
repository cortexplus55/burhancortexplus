import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GUEST_PREVIEW_COLUMN,
  GUEST_PREVIEW_CTA,
  GUEST_PREVIEW_HREF,
  GUEST_PREVIEW_OPEN,
  WEEKLY_PLUS_PLAN_NAME,
  tierComparisonRows,
} from "@/lib/billing/tier-presentation";
import { HERO_FOOT } from "@/lib/marketing/landing-content";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("misafir ön izleme şöleni", () => {
  it("/ornek görsel şöleni Görev 1–5 kartlarını model çağrısı olmadan gösterir", () => {
    const page = read("src/app/ornek/page.tsx");
    expect(page).toContain("DemoWalkthrough");
    expect(page).not.toMatch(/generateJson|openai|chargeCredits/);
    expect(read("src/components/demo/demo-walkthrough.tsx")).toContain("DemoVisualFeast");
    const feast = read("src/components/demo/demo-visual-feast.tsx");
    expect(feast).toContain("Formül Kartı");
    expect(feast).toContain("Sınav Tuzağı");
    expect(feast).toContain("Hafıza Çivisi");
    expect(feast).toContain("Kaydırılabilir Karşılaştırma");
    expect(feast).toContain("Sokratik İpucu Kalkanı");
    expect(feast).toContain("İnteraktif Simülasyon");
    expect(feast).toContain("/araclar/birim-cember");
    expect(feast).toContain("FormulaCard");
    expect(feast).toContain("ExamTrapCard");
    expect(feast).toContain("MemoryHookCard");
    expect(feast).toContain("ComparisonCarousel");
  });

  it("fiyat tablosunda kayıtsız sütun ön izleme ve /ornek düğmesi", () => {
    expect(GUEST_PREVIEW_COLUMN).toBe("Ön İzleme (Kayıtsız)");
    expect(GUEST_PREVIEW_HREF).toBe("/ornek");
    expect(GUEST_PREVIEW_CTA).toContain("Kayıt Olmadan Örnek Dersi Gör");
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).toContain("GUEST_PREVIEW_COLUMN");
    expect(cards).toContain("GUEST_PREVIEW_CTA");
    expect(cards).not.toMatch(/\[\"Misafir\"/);
    const rows = tierComparisonRows();
    for (const label of ["Örnek ders", "İnteraktif simülasyonlar", "Paylaşılan düello"]) {
      expect(rows.find((row) => row.label === label)?.guest).toBe(GUEST_PREVIEW_OPEN);
    }
  });

  it("kayıt adım 1 ve 3 ile ana sayfa kahramanı /ornek'e gider", () => {
    expect(HERO_FOOT.sample.href).toBe("/ornek");
    expect(HERO_FOOT.sample.label).toMatch(/örnek dersi incele/i);
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard.match(/href=\"\/ornek\"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(wizard).toContain("PreviewLessonLink");
    // 31 Ekim 2026 (Paket J1 #2): ilk adım "level" (sınıf + hedef sınav tek ekranda).
    expect(wizard).toMatch(/step === \"level\"[\s\S]*<PreviewLessonLink/);
    expect(wizard).toMatch(/step === \"account\"[\s\S]*<PreviewLessonLink/);
  });
});

describe("paket adları tutarlı", () => {
  it("haftalık paket her iki yüzeyde Sınav Haftası (7 Günlük Plus)", () => {
    expect(WEEKLY_PLUS_PLAN_NAME).toBe("Sınav Haftası (7 Günlük Plus)");
    expect(read("src/components/landing/landing-page.tsx")).toContain("WEEKLY_PLUS_PLAN_NAME");
    expect(read("src/components/parity/subscription-cards.tsx")).toContain("WEEKLY_PLUS_PLAN_NAME");
  });

  it("ana sayfa Sigma şeridi kredi tablosundaki sayıları kullanır", () => {
    const landing = read("src/components/landing/landing-page.tsx");
    expect(landing).toContain("lp-sigma-strip");
    expect(landing).toContain('href="/fiyatlandirma"');
    expect(landing).toContain("Sigma Paketi");
    const sigma = allowanceInWork(PLAN_ALLOWANCES.sigmaMonthly);
    // Faz 4: Sigma 14.500 kredi (ders 22, mesaj 1); şerit plan kartıyla aynı karşılığı yazar (`planWorkEquivalent`).
    expect(sigma).toEqual({ lessons: 659, messages: 14500 });
    // Faz 5 §4.2: şerit merkezi metinden okur (`PLAN_MARKETING_COPY`); orası `planWorkEquivalent` kullanır.
    expect(landing).toContain("PLAN_MARKETING_COPY");
    expect(read("src/lib/marketing/plan-copy.ts")).toContain("planWorkEquivalent(allowance)");
  });
});
