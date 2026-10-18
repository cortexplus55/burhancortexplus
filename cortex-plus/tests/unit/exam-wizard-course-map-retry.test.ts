import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  Çoklu belge kurulumu (18 Ekim 2026, plan 1.3 canlı bulgusu): iki dosyanın ortak konu
  haritası birkaç turda bitiyor; sihirbaz ilk iki denemede "konular hâlâ hazırlanıyor"
  (409) alıp öğrenciyi açıklamasız materyal ekranına düşürdü, üçüncü "Devam et" geçti.

  Kural: harita hazırlanıyor dedikçe aynı ("Dosyaların inceleniyor") ekranda sınırlı sayıda
  yeniden sorulur; yine de materyal ekranına dönülürse neden orada da yazılır.
*/
const source = readFileSync(
  path.resolve(__dirname, "..", "..", "src", "components", "parity", "exam-create-wizard.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("sihirbaz: ortak konu haritası beklenir", () => {
  it("409 sürdükçe harita sınırlı sayıda yeniden istenir, ekran değişmez", () => {
    expect(source).toMatch(/const COURSE_MAP_RETRIES = (\d+);/);
    const retries = Number(source.match(/const COURSE_MAP_RETRIES = (\d+);/)![1]);
    expect(retries).toBeGreaterThanOrEqual(3);
    expect(source).toContain("attempt < COURSE_MAP_RETRIES && course.ok && res?.status === 409");
    // Tek seferlik eski yeniden deneme kalıbı geri gelmesin.
    expect(source).not.toContain("if (res?.status === 409) {\n          // A map was pending");
  });

  it("materyal ekranı da konu çıkarma uyarısını gösterir", () => {
    const materialStep = source.slice(source.indexOf('{step === "material" ? ('), source.indexOf('className={dragOver'));
    expect(materialStep).toContain("{intakeAlert ? (");
    expect(materialStep).toContain('role="alert"');
  });
});
