import { describe, expect, it } from "vitest";
import { canonicalIssues, explanationAnswerIssue, numericResultIssue, v14CodeIssue } from "@/lib/content-pool/gate-v14";
import { applyReview } from "@/lib/content-pool/schema";
import { parseCompactReview, verifySchema } from "@/lib/content-pool/generate";
import { GATE_VERSION } from "@/lib/content-pool/gate";

describe("GATE v14", () => {
  it("sürüm 14", () => expect(GATE_VERSION).toBe(14));

  it("katman 1: kanonik sabit ve tarih", () => {
    expect(canonicalIssues("Avogadro sayısı 6,02 × 10^23 tanedir.")).toEqual([]);
    expect(canonicalIssues("Avogadro sayısı 6,5 × 10^23 tanedir.")).toHaveLength(1);
    expect(canonicalIssues("Yer çekimi ivmesi 10 m/s² alınız.")).toEqual([]);
    expect(canonicalIssues("Yer çekimi ivmesi 12 m/s² alınız.")).toEqual([]); // açık varsayım: soru kendi kabulünü verir
    expect(canonicalIssues("Yer çekimi ivmesi 12 m/s² olduğundan")).toHaveLength(1);
    expect(canonicalIssues("Cumhuriyetin ilanı 29 Ekim 1923 tarihindedir.")).toEqual([]);
    expect(canonicalIssues("Cumhuriyetin ilanı 29 Ekim 1924 tarihindedir.")).toHaveLength(1);
    expect(canonicalIssues("Işık hızı 3·10^8 m/s kabul edilir.")).toEqual([]);
  });

  it("katman 2: açıklamanın sonucu başka şıkkı veremez", () => {
    const base = { choices: ["4", "6", "8", "10"], answer: 1 };
    expect(numericResultIssue({ ...base, explanation: "2 + 4 = 6 bulunur." })).toBeNull();
    expect(numericResultIssue({ ...base, explanation: "2 · 4 = 8 bulunur." })).toMatch(/başka şıkkı/);
    expect(numericResultIssue({ ...base, explanation: "Sonuç 6; 8 seçen çarpar." })).toBeNull();
    expect(numericResultIssue({ choices: ["Ankara", "İzmir"], answer: 0, explanation: "= 3" })).toBeNull();
  });

  it("katman 4 (kod): açıklamadaki şık harfi anahtarla aynı olmalı", () => {
    const base = { choices: ["a", "b", "c", "d"], answer: 2 };
    expect(explanationAnswerIssue({ ...base, explanation: "Doğru cevap C seçeneğidir." })).toBeNull();
    expect(explanationAnswerIssue({ ...base, explanation: "Doğru cevap: B" })).toMatch(/başka şıkkı/);
    expect(explanationAnswerIssue({ ...base, explanation: "Cevabı bulmak için..." })).toBeNull();
    expect(v14CodeIssue({ stem: "Soru", ...base, explanation: "Yanıt D" })).toMatch(/başka şıkkı/);
  });

  it("katman 3: çeldirici kanıtı yoksa ret, alan yoksa eski davranış", () => {
    const items = [{ choices: ["a", "b", "c", "d"] }, { choices: ["a", "b", "c", "d"] }];
    const parsed = parseCompactReview('{"r":[{"i":0,"cozum":1,"uyum":1,"celdirici":0},{"i":1,"cozum":1,"uyum":1}]}', items)!;
    expect(parsed.rows[0]!.distractors_ok).toBe(false);
    expect(parsed.rows[1]!.distractors_ok).toBeUndefined();
    const pool = items.map((c) => ({ ...c, outcome_code: "x", difficulty: "easy" as const, stem: "s", answer: 1, explanation: "e" }));
    const applied = applyReview(pool, { lesson_ok: true, lesson_issues: [], items: parsed.rows });
    expect(applied.rejected.map((r) => r.reason)).toEqual(["çeldirici kanıtı yok"]);
    expect(applied.kept).toHaveLength(1);
    expect(verifySchema(4).schema.properties.r.items.required).toContain("celdirici");
  });
});

import { triadIssue, explanationConclusion } from "@/lib/content-pool/gate-v14";
describe("katman 4 üçlü mutabakat", () => {
  const base = { choices: ["Ankara", "İzmir", "Bursa", "Konya", "Adana"], answer: 1 };
  it("sonuç şık metniyle anahtarı veriyorsa geçer", () => {
    expect(triadIssue({ ...base, explanation: "Liman kenti.\nDoğru cevap: İzmir" })).toBeNull();
    expect(triadIssue({ ...base, explanation: "Liman kenti.\nDoğru cevap: B) İzmir" })).toBeNull();
  });
  it("sonuç başka şıksa ret", () => {
    expect(triadIssue({ ...base, explanation: "x\nDoğru cevap: Bursa" })).toMatch(/aynı değil/);
  });
  it("sonuç okunamıyorsa ret", () => {
    expect(triadIssue({ ...base, explanation: "Liman kentidir." })).toMatch(/okunamadı/);
  });
  it("sayısal şıkta = sonucu anahtar ise geçer", () => {
    expect(triadIssue({ choices: ["1", "2", "3", "4", "5"], answer: 2, explanation: "1+2 = 3" })).toBeNull();
    expect(explanationConclusion({ choices: ["a b", "c"], explanation: "Doğru yanıt: c" })).toBe(1);
  });
});
