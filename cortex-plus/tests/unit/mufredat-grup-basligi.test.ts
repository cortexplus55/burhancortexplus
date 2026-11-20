/** /mufredat grup başlığı (19 Kasım 2026, Faz 3): sınıfsız sınav programı "null. sınıf" yazmaz. */
import { describe, expect, it } from "vitest";
import { programGroupLabel } from "@/lib/curriculum/program-group";
import { listProgramSummaries } from "@/lib/curriculum/registry";

describe("müfredat grup başlığı", () => {
  it("bütün programlarda başlık okunur: null, undefined ya da NaN yok", () => {
    const labels = listProgramSummaries().map((program) => programGroupLabel(program));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/null|undefined|NaN|^\. sınıf/);
  });

  it("sınav türleri adıyla, okul programları sınıfıyla", () => {
    expect(programGroupLabel({ kind: "tus", grade: null })).toBe("TUS");
    expect(programGroupLabel({ kind: "ales", grade: null })).toBe("ALES");
    expect(programGroupLabel({ kind: "yks", grade: null })).toBe("YKS (TYT / AYT)");
    expect(programGroupLabel({ kind: "okul", grade: 9 })).toBe("9. sınıf");
    expect(programGroupLabel({ kind: "okul", grade: null })).toBe("Diğer programlar");
    expect(programGroupLabel({ kind: "yeni", grade: undefined })).toBe("YENİ");
  });
});
