import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { EMBEDDING_MODEL } from "@/lib/rag/pipeline";

/*
  Bekçi: kodun çağırabildiği her modelin bir fiyat satırı olmalı.

  `/admin/maliyetler` gideri `ai_usage_events × ai_model_prices` çarpımından
  buluyor ve fiyat satırı bulamadığı işlemi **sessizce atlıyor** — hata da
  vermiyor, sayfa sadece eksik bir toplam gösteriyor. Tablo aylarca hiç
  tohumlanmadığı için o toplam her zaman sıfırdı ve kimse fark etmedi.

  Yeni bir model devreye alınıp fiyatı girilmezse aynı sessizlik geri gelir.
  Bu test o yüzden var: migration'ı okuyup kodun kullandığı adlarla
  karşılaştırıyor. Uygulanmış tohum dosyası olduğu gibi durur; sonraki
  model kendi dosyasına yazılır.
*/
const MIGRATIONS = [
  "20260914120000_seed_ai_model_prices.sql",
  "20260925120000_seed_gpt41_mini_price.sql",
  "20260929200000_gpt41_price_yearly_allowance.sql",
  "20261002100000_gpt6_luna_price.sql",
].map((file) => path.resolve(__dirname, "../../supabase/migrations", file));

function pricedModels(): Map<string, { input: number; output: number }> {
  const sql = MIGRATIONS.map((file) => readFileSync(file, "utf8")).join("\n");
  const rows = new Map<string, { input: number; output: number }>();
  for (const m of sql.matchAll(
    /\('([^']+)',\s*([0-9.]+),\s*([0-9.]+)(?:,\s*now\(\))?\)/g,
  )) {
    rows.set(m[1], { input: Number(m[2]), output: Number(m[3]) });
  }
  return rows;
}

describe("ai_model_prices tohumu", () => {
  const priced = pricedModels();

  it("sekiz modelin hepsini okuyabiliyor (luna dahil)", () => {
    expect(priced.size).toBe(8);
  });

  it.each([
    ["standart metin", env.OPENAI_STANDARD_MODEL],
    ["ders taslağı", env.OPENAI_LESSON_MODEL],
    ["ücretsiz ders taslağı", env.OPENAI_LESSON_FREE_MODEL],
    ["gelişmiş metin", env.OPENAI_ADVANCED_MODEL],
    ["outline standart", env.OPENAI_OUTLINE_STANDARD_MODEL],
    ["outline büyük belge", env.OPENAI_OUTLINE_LARGE_MODEL],
    ["seslendirme", env.OPENAI_TTS_MODEL],
    ["çözümleme", env.OPENAI_STT_MODEL],
    ["gömme", EMBEDDING_MODEL],
  ])("%s modelinin fiyatı var: %s", (_label, model) => {
    expect(priced.has(model)).toBe(true);
  });

  it("her fiyat pozitif — sıfır fiyat sessizce bedava sayardı", () => {
    for (const [model, row] of priced) {
      expect(row.input, `${model} girdi fiyatı`).toBeGreaterThan(0);
    }
  });

  it("gelişmiş model standarttan pahalı", () => {
    const std = priced.get(env.OPENAI_STANDARD_MODEL)!;
    const adv = priced.get(env.OPENAI_ADVANCED_MODEL)!;
    expect(adv.input).toBeGreaterThan(std.input);
    expect(adv.output).toBeGreaterThan(std.output);
  });

  it("birim uyarısı belgede duruyor", () => {
    // Kolon adı jeton diyor, ses satırları karakter/kilobayt tutuyor.
    // Bu uyarı kaybolursa sonraki okuyan yanlış birimle satır ekler.
    const sql = MIGRATIONS.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sql).toMatch(/KARAKTER/);
    expect(sql).toMatch(/KILOBAYT/);
    expect(sql).toMatch(/TAHMIN/);
  });

  it("ders taslağı standarttan pahalı, gelişmişten pahalı değil", () => {
    const std = priced.get(env.OPENAI_STANDARD_MODEL)!;
    const lesson = priced.get(env.OPENAI_LESSON_MODEL)!;
    const adv = priced.get(env.OPENAI_ADVANCED_MODEL)!;
    expect(lesson.input).toBeGreaterThan(std.input);
    expect(lesson.input).toBeLessThanOrEqual(adv.input);
    expect(lesson.output).toBeGreaterThan(std.output);
    expect(lesson.output).toBeLessThanOrEqual(adv.output);
  });

  it("ücretsiz ders modeli abonenin ders modelinden ucuz", () => {
    // Astra gibi: abone daha akıllı modeli alır. İkisi eşitlenirse ücretsiz
    // hesabın maliyeti ~52 TL'den ~88 TL'ye çıkar (29 Eylül 2026 hesabı).
    const free = priced.get(env.OPENAI_LESSON_FREE_MODEL)!;
    const paid = priced.get(env.OPENAI_LESSON_MODEL)!;
    expect(free.input).toBeLessThan(paid.input);
    expect(free.output).toBeLessThan(paid.output);
  });
});
