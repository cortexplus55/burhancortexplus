import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { poolUnit } from "@/lib/content-pool/keys";
import { generateReinforceItems, REINFORCE_PAIRS, type LlmCall } from "@/lib/content-pool/generate";
import { istanbulDayStart, reinforceRows } from "@/lib/content-pool/reinforce-new";
import { newTestNotice, NEW_TEST_LABEL } from "@/components/level-check/reinforce-box";
const STEMS = [
  "Hücre zarının seçici geçirgenliği hangi seçenekte doğru verilmiştir?",
  "Enzimlerin çalışmasını etkileyen sıcaklık değişimi neyi gösterir?",
  "Fotosentezde ışığa bağımlı tepkimelerin ürünü aşağıdakilerden hangisidir?",
  "Mitokondri ile kloroplastın ortak özelliği nedir?",
  "Bir deneyde bağımsız değişken olarak seçilen etken hangisidir?",
];

/*
  Paket 3 (3 Kasım 2026): "🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç". Tek kazanım, tam 2 model çağrısı
  (yazar + gpt-6-luna kör çözücü), aynı GATE v14 + üçlü mutabakat; havuzdaki kökler tekrar yazılmaz.
*/
const unit = poolUnit("yks-2026-tarih#2")!;
const code = unit.outcomes[0]!.code;

function llm(opts: { wrongKey?: boolean; noConclusion?: boolean } = {}) {
  const calls: string[] = [];
  const fn: LlmCall = async ({ model, system, user }) => {
    calls.push(model);
    if (system.includes("soru yazan")) {
      const pairs = /tam 1 soru yaz: (.*)\.\n/.exec(user)![1]!.split(", ");
      return {
        model,
        tokensIn: 10,
        tokensOut: 10,
        text: JSON.stringify({
          items: pairs.map((p, i) => ({
            outcome_code: p.split("|")[0],
            difficulty: p.split("|")[1],
            // Kökler birbirinden gerçekten farklı olmalı: yakın kopya kontrolü (near-duplicate.ts) benzer kökü eler.
            stem: STEMS[i % STEMS.length]!,
            choices: ["Birinci seçenek", "İkinci seçenek", "Üçüncü seçenek", "Dördüncü seçenek", "Beşinci seçenek"],
            answer: 2,
            explanation: opts.noConclusion ? "Üçüncü seçenek kazanımla örtüşür." : "Kazanımla örtüşen budur.\nDoğru cevap: Üçüncü seçenek",
          })),
        }),
      };
    }
    const blind = JSON.parse(/Sorular \[i,kod,kök,şıklar\]:\n([\s\S]*)$/.exec(user)![1]!) as [number][];
    return { model, tokensIn: 5, tokensOut: 5, text: JSON.stringify({ r: blind.map(([i]) => [i, opts.wrongKey ? 0 : 2, 1]) }) };
  };
  return Object.assign(fn, { calls });
}

describe("yeni pekiştirme testi", () => {
  it("tek kazanıma 5 soru; tam 2 çağrı (yazar + kör çözücü)", async () => {
    const f = llm();
    const out = await generateReinforceItems(unit, code, f, { models: { generate: "w", verify: "gpt-6-luna" } });
    expect(out.items).toHaveLength(REINFORCE_PAIRS.length);
    expect(f.calls).toEqual(["w", "gpt-6-luna"]);
    expect(out.usage.map((u) => u.actionCode)).toEqual(["REINFORCE_ITEMS", "REINFORCE_VERIFY"]);
  });
  it("kör çözücü anahtara uymazsa soru yazılmaz", async () => {
    const out = await generateReinforceItems(unit, code, llm({ wrongKey: true }), { models: { generate: "w", verify: "v" } });
    expect(out.items).toHaveLength(0);
  });
  it("açıklamanın sonucu okunamazsa kapıda düşer, doğrulama çağrısı yapılmaz", async () => {
    const f = llm({ noConclusion: true });
    const out = await generateReinforceItems(unit, code, f, { models: { generate: "w", verify: "v" } });
    expect(out.items).toHaveLength(0);
    expect(f.calls).toEqual(["w"]);
  });
  it("havuzdaki kök tekrar yazılmaz", async () => {
    const out = await generateReinforceItems(unit, code, llm(), { models: { generate: "w", verify: "v" }, existingStems: ["Hücre zarının seçici geçirgenliği hangi seçenekte doğru verilir?"] });
    expect(out.items).toHaveLength(REINFORCE_PAIRS.length - 1);
  });
  it("satır origin='reinforce' (CHECK yoksa qa.origin) ve 0 kredi metinleri", () => {
    const rows = reinforceRows(unit, unit.outcomes[0]!.outcomeId, [{ outcome_code: code, difficulty: "easy", stem: "s", choices: ["a", "b"], answer: 0, explanation: "e" }], "u1", "gpt-6-luna", false);
    expect(rows[0]).not.toHaveProperty("origin");
    expect(rows[0]!.qa.origin).toBe("reinforce");
    expect(reinforceRows(unit, "o", [], "u", "m", true)).toEqual([]);
    expect(NEW_TEST_LABEL).toBe("🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç");
    expect(newTestNotice("limit", 3)).toMatch(/günde 3/);
    expect(newTestNotice("locked")).toMatch(/Ücretsiz/);
  });
  it("gün sınırı İstanbul gününe göre", () => {
    expect(istanbulDayStart(new Date("2026-11-03T22:30:00Z"))).toBe("2026-11-03T21:00:00.000Z");
    expect(istanbulDayStart(new Date("2026-11-03T20:30:00Z"))).toBe("2026-11-02T21:00:00.000Z");
  });
});
