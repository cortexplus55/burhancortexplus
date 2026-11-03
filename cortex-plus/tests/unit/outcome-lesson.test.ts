import { describe, expect, it } from "vitest";
import { poolUnit } from "@/lib/content-pool/keys";
import {
  generateOutcomeLesson,
  mergeOutcomeLesson,
  outcomeBlueprintKind,
  outcomeFirstPrompt,
  outcomeLessonIssues,
  parseOutcomeFirst,
} from "@/lib/content-pool/outcome-lesson";
import { POOL_SPEND_FILTER } from "@/lib/content-pool/fill-server";

describe("kazanım dersi (Paket 3b)", () => {
  it("iskeleti olmayan programlar genel lise şablonu yerine sınav iskeleti alır", () => {
    expect(outcomeBlueprintKind("yks")).toBe("sinav");
    expect(outcomeBlueprintKind("lgs")).toBe("sinav");
    expect(outcomeBlueprintKind("tus")).toBe("klinik");
    expect(outcomeBlueprintKind("kpss")).toBe("kpss");
  });

  it("ortak tavan bütün havuz üretim kodlarını sayar", () => {
    expect(POOL_SPEND_FILTER).toContain("SHARED_CONTENT%");
    expect(POOL_SPEND_FILTER).toContain("REINFORCE_%");
    expect(POOL_SPEND_FILTER).toContain("OUTCOME_LESSON%");
  });

  it("bölüm sayısı 6–8 dışında kapıdan geçmez", () => {
    const lesson = { title: "T", overview: "x".repeat(30), sections: [{ outcome_code: "K1", heading: "B", explanation: "y".repeat(50), key_points: ["a"] }], summary: "s".repeat(30), cards: [{ front: "a", back: "b" }] };
    expect(outcomeLessonIssues(lesson, "K1", "yks", 5).some((i) => i.startsWith("bölüm sayısı 1"))).toBe(true);
  });

  it("ilk yanıt plan + tek bölümle okunur, kalanla birleşir", () => {
    const section = { outcome_code: "?", heading: "Bölüm", explanation: "e".repeat(60), key_points: ["kp"] };
    const first = parseOutcomeFirst(JSON.stringify({ title: "Ders", overview: "o".repeat(30), plan: ["b1", "b2", "b3", "b4", "b5", "b6"], key_terms: [], sections: [section, section] }), "K1");
    expect(first?.sections).toHaveLength(1);
    expect(first?.sections[0]!.outcome_code).toBe("K1");
    const merged = mergeOutcomeLesson(first!, JSON.stringify({ sections: Array(5).fill(section), summary: "s".repeat(40), cards: [{ front: "a", back: "b" }] }), "K1");
    expect(merged?.sections).toHaveLength(6);
    expect(merged?.sections.every((s) => s.outcome_code === "K1")).toBe(true);
  });

  it("ilk ekran ikinci çağrıdan önce yayımlanır; bozuk ders havuza yazılmaz", async () => {
    const unit = poolUnit("yks-2026-tarih#1")!;
    const code = unit.outcomes[0]!.code;
    expect(outcomeFirstPrompt(unit, code).system).toContain("sınavına hazırlayan");
    const order: string[] = [];
    const section = { outcome_code: code, heading: "Bölüm", explanation: "e".repeat(60), key_points: ["kp"] };
    const llm = async () => {
      order.push(`call${order.filter((o) => o.startsWith("call")).length + 1}`);
      const text = order.length === 1
        ? JSON.stringify({ title: "Ders", overview: "o".repeat(30), plan: ["b1", "b2", "b3", "b4", "b5", "b6"], key_terms: [], sections: [section] })
        : JSON.stringify({ sections: Array(5).fill(section), summary: "s".repeat(40), cards: [{ front: "a", back: "b" }] });
      return { text, tokensIn: 1, tokensOut: 1, model: "m" };
    };
    const out = await generateOutcomeLesson(unit, code, llm, { models: { generate: "m", verify: "v" }, onFirst: async () => void order.push("first") });
    expect(order).toEqual(["call1", "first", "call2"]);
    expect(out.ok).toBe(false);
    expect(out.lesson?.sections).toHaveLength(6);
  });
});
