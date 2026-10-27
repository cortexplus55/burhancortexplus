import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStudentPedagogyCache,
  detectTargetExam,
  getStudentPedagogicalContext,
  parseFocusSubject,
  parseGradeLevel,
  pedagogyPromptBlock,
  withStudentProfile,
  type StudentPedagogicalContext,
} from "@/lib/learning/student-pedagogy";

afterEach(() => {
  clearStudentPedagogyCache();
});

function ctx(partial: Partial<StudentPedagogicalContext> = {}): StudentPedagogicalContext {
  return {
    gradeLevel: null,
    targetExam: null,
    tutorStyle: "step_by_step",
    focusSubject: null,
    ...partial,
  };
}

describe("öğrenci pedagojik profili", () => {
  it("sınıfı kayıt seçeneğine çevirir; tanınmayanı yok sayar", () => {
    expect(parseGradeLevel("12. sınıf")).toBe("12. sınıf");
    expect(parseGradeLevel("8.sınıf")).toBe("8. sınıf");
    expect(parseGradeLevel("mezun")).toBe("Mezun");
    expect(parseGradeLevel("4. sınıf")).toBeNull();
    expect(parseGradeLevel("")).toBeNull();
  });

  it("hedef metninden sınavı tanır", () => {
    expect(detectTargetExam("TUS hazırlık")).toBe("TUS");
    expect(detectTargetExam("YKS / AYT matematik")).toBe("YKS");
    expect(detectTargetExam("LGS 8. sınıf")).toBe("LGS");
    expect(detectTargetExam("KPSS lisans")).toBe("KPSS");
    expect(detectTargetExam("Okul sınavları")).toBe("Okul sınavları");
    expect(detectTargetExam(" spor ")).toBeNull();
  });

  it("odak dersi temizler", () => {
    expect(parseFocusSubject("  Matematik  ")).toBe("Matematik");
    expect(parseFocusSubject("12")).toBeNull();
    expect(parseFocusSubject("")).toBeNull();
  });

  it("profil bloğu TUS / LGS / YKS yüzeyine göre değişir; kaynak kuralı kalır", () => {
    const tus = pedagogyPromptBlock(ctx({ targetExam: "TUS" }), "lesson");
    expect(tus).toContain("Hedef sınav: TUS");
    expect(tus).toContain("klinik vaka");
    expect(tus).toContain("Kaynak, doğruluk");

    const lgs = pedagogyPromptBlock(ctx({ gradeLevel: "8. sınıf", targetExam: "LGS" }), "quiz");
    expect(lgs).toContain("günlük");
    expect(lgs).toContain("8. sınıf");

    const yks = pedagogyPromptBlock(ctx({ targetExam: "YKS", tutorStyle: "hints_first" }), "solve");
    expect(yks).toContain("ÖSYM");
    expect(yks).toContain("ipucu");
  });

  it("boş profil istemi değiştirmez", () => {
    expect(withStudentProfile("SİSTEM", "")).toBe("SİSTEM");
    expect(withStudentProfile("SİSTEM", pedagogyPromptBlock(null, "lesson"))).toBe("SİSTEM");
    expect(pedagogyPromptBlock(ctx({ focusSubject: "Tarih" }), "cards")).toContain("Odak ders: Tarih");
  });

  it("okunamaz profil null döner; üretim düşmez", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.reject(new Error("network")),
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.reject(new Error("network")) }),
            }),
          }),
        }),
      }),
    };
    await expect(getStudentPedagogicalContext("user-1", client as never)).resolves.toBeNull();
  });

  it("okunan profili bir dakika bellekte tutar", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { grade_level: "12. sınıf", tutor_style: "direct_solve", focus_subject: "Fizik" } });
    const goalSingle = vi.fn().mockResolvedValue({ data: { goal_text: "YKS hazırlık" } });
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            table === "profiles"
              ? { maybeSingle }
              : { order: () => ({ limit: () => ({ maybeSingle: goalSingle }) }) },
        }),
      }),
    };
    const first = await getStudentPedagogicalContext("user-2", client as never);
    const second = await getStudentPedagogicalContext("user-2", client as never);
    expect(first).toEqual({
      gradeLevel: "12. sınıf",
      targetExam: "YKS",
      tutorStyle: "direct_solve",
      focusSubject: "Fizik",
      goalText: "YKS hazırlık",
    });
    expect(second).toEqual(first);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
