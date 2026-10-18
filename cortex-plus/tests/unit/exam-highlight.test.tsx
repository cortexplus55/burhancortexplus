// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { stripEmphasis, studentTextParts } from "@/lib/learning/lesson-board";
import { calloutTone } from "@/lib/learning/lesson-chrome";
import { EMPHASIS_RULE, TEACHER_SYSTEM, VERIFY_SYSTEM, conceptStructureIssues, screenStructureIssues } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

afterEach(cleanup);

/*
  Renkli vurgu, sınav kutuları ve ezber kodu (18 Ekim 2026, ürün sahibinin kararı: "önemli
  noktaları farklı renkte ve akılda kalıcı kodluyor; bizde var mı?"). Pediatri belgesi kendi
  sınav ipuçlarını kutularla işaretliyordu; ders bunları öne çıkarmıyordu.
*/
describe("exam highlight", () => {
  it("marks ==…== as an exam point, keeps **terms** bold, and leaves code comparisons alone", () => {
    const parts = studentTextParts("**Sosyal gülümseme** yoksa ==18 ayda anlamlı kelime olmaması== alarm bulgusudur.");
    expect(parts.find((part) => part.exam)?.text).toBe("18 ayda anlamlı kelime olmaması");
    expect(parts.find((part) => part.bold && !part.exam)?.text).toBe("Sosyal gülümseme");
    expect(studentTextParts("if (a == b == c) return").some((part) => part.exam)).toBe(false);
    expect(stripEmphasis("==İlk 24 saatte sarılık== **patolojiktir**")).toBe("İlk 24 saatte sarılık patolojiktir");
  });

  it("renders the exam point as an orange mark", () => {
    const { container } = render(<RichBody text="Bu durumda ==safralı kusma== obstrüksiyon düşündürür." />);
    const mark = container.querySelector("mark.als-exam");
    expect(mark?.textContent).toBe("safralı kusma");
  });

  it("gives the document's own boxes their own colors", () => {
    expect(calloutTone({ title: "Sınav ipucu: ilk 24 saat", tone: "exam" })).toBe("exam");
    expect(calloutTone({ title: "Akılda tut: büyüme geriliği" })).toBe("remember");
    expect(calloutTone({ title: "Ezber kodu: VPAH" })).toBe("mnemonic");
    expect(calloutTone({ title: "Alarm bulguları" })).toBe("warn");
  });

  it("teaches the writer and the verifier the same rule", () => {
    expect(TEACHER_SYSTEM).toContain(EMPHASIS_RULE);
    for (const box of ["SINAV İPUCU", "AKILDA TUT", "ALARM BULGULARI", "Ezber kodu"]) expect(EMPHASIS_RULE).toContain(box);
    expect(VERIFY_SYSTEM).toContain("I) Ezber kodu");
    expect(VERIFY_SYSTEM).toContain("A-I 'high'");
  });

  it("keeps the colors rare: at most a few marks per screen, one memory code per concept", () => {
    const many = { heading: "Alarm", concept: "Alarm", blocks: [{ type: "text", text: "==a1 b1== ==a2 b2== ==a3 b3== ==a4 b4== yeterince uzun bir açıklama metni." }] } as LessonV3["screens"][number];
    expect(screenStructureIssues(many, 0, { pages: [] }).some((issue) => issue.problem.includes("sınav vurgusu"))).toBe(true);
    const note = (title: string) => ({ type: "note", note: { title, body: "V: VSD, P: pulmoner darlık, A: aort, H: hipertrofi.", tone: "mnemonic" } });
    const screens = [
      { heading: "Fallot", concept: "Fallot", blocks: [{ type: "text", text: "Dört bileşen." }, note("Ezber kodu: VPAH"), note("Ezber kodu: başka")] },
    ] as LessonV3["screens"];
    expect(conceptStructureIssues(screens, { concept: "Fallot", screens: [0] }).some((issue) => issue.problem.includes("ezber kodu"))).toBe(true);
  });
});
