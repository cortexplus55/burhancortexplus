import { describe, expect, it } from "vitest";
import { sanitizeStudentContent, studentSafeText } from "@/lib/learning/student-safe-text";
import { repairBrokenInterval, rejoinIntervalCells, splitTableCells } from "@/lib/learning/interval-text";
import { spokenSentence } from "@/lib/learning/podcast-formats";
import { readFileSync } from "node:fs";

describe("öğrenci sızıntısı", () => {
  it("iç kural cümlelerini ve cevap harfini siler", () => {
    const raw = [
      "SINAV MÜFREDATI TAMAMLAMASI: Glukoz eşiği 180'dir.",
      "Şekil 2'nin eğrisi burada görünmediği için belirlenemez.",
      "Bu konu sınav kapsamı dışındadır.",
      "Katlı oranlar kanunu sınav kapsamı dışındadır.",
      "Açıklamada cevap B'dir diye yazma.",
      "Ders: Fizyoloji. Dönem 2026–2027",
      "Model sayı uydurma yapmasın.",
      "Eşik 180 mg/dL kalır.",
    ].join("\n");
    const clean = sanitizeStudentContent(raw);
    expect(clean).not.toMatch(/SINAV MÜFREDATI/i);
    expect(clean).not.toMatch(/görünmediği için/);
    expect(clean).not.toMatch(/Bu konu sınav kapsamı dışındadır/);
    expect(clean).toMatch(/Katlı oranlar kanunu sınav kapsamı dışındadır/);
    expect(clean).not.toMatch(/cevap B'dir/);
    expect(clean).not.toMatch(/Dönem 2026/);
    expect(clean).not.toMatch(/sayı uydurma/);
    expect(clean).toContain("180");
    expect(studentSafeText(raw)).toBe(clean);
  });

  it("kopuk aralığı tek hücreye toplar", () => {
    expect(repairBrokenInterval("[−3: | 5]")).toBe("[−3, 5]");
    expect(rejoinIntervalCells(["[−3:", "5]"])).toEqual(["[−3, 5]"]);
    expect(splitTableCells("| yaş | [−3: | 5] |")).toEqual(["yaş", "[−3, 5]"]);
  });

  it("podcast satır başındaki Ece ve Deniz adını söker", () => {
    expect(spokenSentence("Ece: Glukoz eşiği 180'dir.")).toBe("Glukoz eşiği 180'dir.");
    expect(spokenSentence("Deniz: Eşleme oka gider.")).toBe("Eşleme oka gider.");
  });

  it("Yanlış etiketi ile gövde arasında ayraç vardır", () => {
    const ui = readFileSync("src/components/parity/exam-lesson-steps.tsx", "utf8");
    const claim = ui.slice(ui.indexOf('als-tag als-tag--warn">Yanlış'), ui.indexOf("als-mistake-fix"));
    expect(claim).toContain('{" · "}');
  });
});
