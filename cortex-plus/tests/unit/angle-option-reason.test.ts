import { describe, expect, it } from "vitest";
import { angleOptionReasonIssues } from "@/lib/learning/angle-option-reason";

describe("angle option explanations", () => {
  it("rejects the contradictory distractor explanations seen in the live diagnostic", () => {
    expect(angleOptionReasonIssues({
      text: "180 derece neye eşittir?",
      options: ["π", "2π", "π/2", "3π"],
      optionWhy: [
        "180 derece π radyana eşittir.",
        "Bu, 90 derecelik açı ölçüsünü belirtir.",
        "Bu, 540 derecelik yarım turda yanlış bir hesaplamadır.",
        "Bu, üç yarım tura karşılık gelir.",
      ],
    })).toContain("2π: derece açıklaması şıkla çelişiyor.");
    expect(angleOptionReasonIssues({
      text: "Dereceyi radyana çevirmek için hangi oran kullanılır?",
      options: ["180/π", "π/180", "π/2", "1/180"],
      optionWhy: [
        "Bu, ters yöndeki dönüşümün oranıdır.",
        "Bu, doğru dönüşüm oranıdır.",
        "Bu, tam bir dönüşü ifade eden değerdir.",
        "Bu oran π çarpanını eksik bırakır.",
      ],
    })).toContain("π/2: tur açıklaması şıkla çelişiyor.");
  });

  it("keeps correct angle mappings and ignores unrelated subjects", () => {
    expect(angleOptionReasonIssues({
      text: "Bir tam tur kaç radyana eşittir?",
      options: ["π/2", "2π", "π", "3π/2"],
      optionWhy: [
        "Bu 90 dereceyi gösterir.",
        "Bu tam turu, yani 360 dereceyi gösterir.",
        "Bu 180 dereceyi gösterir.",
        "Bu 270 dereceyi gösterir.",
      ],
    })).toEqual([]);
    expect(angleOptionReasonIssues({
      text: "Hangi sinyal doğrudur?",
      options: ["π/2"],
      optionWhy: ["Bu 360 dereceyi gösterir."],
    })).toEqual([]);
  });
});
