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
import { HERO } from "@/lib/marketing/landing-content";
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

  it("kayıt adım 1 ve 6 ile ana sayfa kahramanı /ornek'e gider", () => {
    expect(HERO.secondary.href).toBe("/ornek");
    expect(HERO.secondary.label).toMatch(/örnek bir dersi incele/i);
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard.match(/href=\"\/ornek\"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(wizard).toContain("PreviewLessonLink");
    expect(wizard).toMatch(/step === \"grade\"[\s\S]*<PreviewLessonLink/);
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
    expect(sigma).toEqual({ lessons: 2000, messages: 20000 });
  });
});
