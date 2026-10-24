import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  19 Ekim 2026: video sahne resimleri `ai_usage_events`'e birim = 1 resim yazılıyordu ama `gpt-image-1`
  fiyat satırı yoktu; /admin/maliyetler video giderini saymıyordu. Fiyat 1.000 resim başına (düşük kalite,
  1024x1536: $0,016 / resim). Kayıt birimi değişirse fiyat satırı da değişmeli.
*/
describe("görsel model fiyat satırı", () => {
  it("video resmi birim = 1 resim yazılır; fiyat 1.000 resim başına", () => {
    const run = readFileSync("src/lib/learning/video-run.ts", "utf8");
    // 24 Ekim 2026: kayıt gerçekten kullanılan modelle (resim modeli merdiveni, `imageModelLadder`).
    expect(run).toContain('model: imageModel, tokensIn: 1, tokensOut: 0');
    expect(run).toContain('quality: "low"');
    expect(run).toContain('size: "1024x1536"');
    const sql = readFileSync("supabase/migrations/20261019140000_image_model_price.sql", "utf8").replace(/^--.*$/gm, "");
    expect(sql).toContain("VALUES ('gpt-image-1', 16.0, 0)");
    expect(sql).toContain("ON CONFLICT (model) DO NOTHING");
  });
});
