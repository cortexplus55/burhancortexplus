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
  karşılaştırıyor.
*/
const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260914120000_seed_ai_model_prices.sql",
);

function pricedModels(): Map<string, { input: number; output: number }> {
  const sql = readFileSync(MIGRATION, "utf8");
  const rows = new Map<string, { input: number; output: number }>();
  for (const m of sql.matchAll(
    /\('([^']+)',\s*([0-9.]+),\s*([0-9.]+)\)/g,
  )) {
    rows.set(m[1], { input: Number(m[2]), output: Number(m[3]) });
  }
  return rows;
}

describe("ai_model_prices tohumu", () => {
  const priced = pricedModels();

  it("beş modelin hepsini okuyabiliyor", () => {
    expect(priced.size).toBe(5);
  });

  it.each([
    ["standart metin", env.OPENAI_STANDARD_MODEL],
    ["gelişmiş metin", env.OPENAI_ADVANCED_MODEL],
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
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/KARAKTER/);
    expect(sql).toMatch(/KILOBAYT/);
    expect(sql).toMatch(/TAHMIN/);
  });
});
