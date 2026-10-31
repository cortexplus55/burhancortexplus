import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADVANTAGE_BADGES,
  ADVANTAGE_ROWS,
  ADVANTAGE_SECTION,
  FORBIDDEN_BRAND_NAMES,
  PRICING_ADVANTAGE,
  allAdvantageCopy,
} from "@/lib/marketing/advantage-content";
import * as landing from "@/lib/marketing/landing-content";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { DEFAULT_STANDARD } from "@/lib/learning/mock-exam/types";

/* Vitrin farkları (1 Kasım 2026): rakip marka adı yok, her Cortex iddiasının kodda kanıtı var. */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const MARKETING_FILES = [
  "src/lib/marketing/advantage-content.ts",
  "src/lib/marketing/landing-content.ts",
  "src/components/marketing/advantage-sections.tsx",
  "src/components/landing/landing-page.tsx",
  "src/app/fiyatlandirma/page.tsx",
  "src/app/ozellikler/page.tsx",
  "src/app/ornek/page.tsx",
];

describe("vitrin farkları", () => {
  it("vitrin metninde rakip marka adı geçmez", () => {
    const copy = `${allAdvantageCopy()}\n${JSON.stringify(landing)}`;
    for (const brand of FORBIDDEN_BRAND_NAMES) {
      expect(copy.toLocaleLowerCase("tr")).not.toContain(brand.toLocaleLowerCase("tr"));
    }
  });

  it("pazarlama dosyalarının arayüz metninde 'Astra' yok", () => {
    for (const file of MARKETING_FILES) {
      const src = stripComments(readFileSync(file, "utf8")).replace(/export const FORBIDDEN_BRAND_NAMES[^\n]*\n/, "");
      expect(src, file).not.toMatch(/astra/i);
    }
  });

  it("başlık ve sütunlar ürün sahibinin istediği gibi", () => {
    expect(ADVANTAGE_SECTION.title).toBe("Neden Öğrenciler Yabancı Uygulamaları Bırakıp Cortex Plus'a Geçiyor?");
    expect(ADVANTAGE_SECTION.columns.others).toContain("Yabancı AI Uygulamaları");
    expect(ADVANTAGE_ROWS).toHaveLength(7);
    expect(ADVANTAGE_BADGES).toHaveLength(6);
    expect(PRICING_ADVANTAGE.items).toHaveLength(4);
  });

  it("her Cortex satırının kodda kanıt dosyası var", () => {
    for (const row of ADVANTAGE_ROWS) {
      expect(row.evidence.length, row.id).toBeGreaterThan(0);
      for (const ref of row.evidence) {
        const path = ref.split(" ")[0];
        expect(() => readFileSync(path), path).not.toThrow();
      }
    }
  });

  it("sayılar koddan: 20 soruluk deneme ve Plus sayfa sınırı", () => {
    expect(DEFAULT_STANDARD.questionCount).toBe(20);
    expect(ADVANTAGE_ROWS[0].cortex.body).toContain(`${DEFAULT_STANDARD.questionCount} soruluk`);
    expect(PRICING_ADVANTAGE.items[0].body).toContain(String(PHOTO_PAGE_LIMITS.plus));
    expect(PHOTO_PAGE_LIMITS.plus).toBeGreaterThanOrEqual(100);
  });

  it("bölümler istemci kodu ya da istek içermez (misafir ücretli iş tetiklemez)", () => {
    const src = readFileSync("src/components/marketing/advantage-sections.tsx", "utf8");
    expect(src).not.toMatch(/"use client"|fetch\(|\/api\//);
  });
});
