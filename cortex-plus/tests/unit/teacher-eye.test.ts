import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { examPointsBlock, examPointsVerifyBlock } from "@/lib/learning/exam-points";
import {
  examPointsForTopic,
  parseTeacherAnalysis,
  sanitizeAnalysisAgainstSource,
  teacherAnalysisPrompt,
  teacherBriefForTopic,
} from "@/lib/learning/teacher-brain";
import { teacherUserPrompt, verifyPartUserPrompt } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/*
  "Öğretmen gözü" (18 Ekim 2026, ürün sahibinin kararı). Pediatri belgesi öğrenci gözüyle
  incelendi: belge kendi sınav ipuçlarını kutularla işaretliyordu, ama öğretmen analizi 7 Ekim'den
  beri yeni hazırlıklarda çalışmıyor, ders/test/podcast motorları da analizi okumuyordu.
*/

const SOURCE =
  "1. Büyüme ve Gelişme\nTemel gelişim basamakları\n2 ay Başını kısa süre kaldırır Sosyal gülümseme\n" +
  "ALARM BULGULARI\nGelişimde gerileme her yaşta ciddidir. 18 ayda anlamlı kelime olmaması ayrıntılı değerlendirme gerektirir.";

const raw = {
  language: "tr",
  summary: "Büyüme eğrisi, gelişim basamakları ve alarm bulguları.",
  objectives: [{ statement: "Gelişim basamaklarını yaşa göre ayırt eder.", pageNumbers: [1] }],
  examFocus: { questionTypes: ["vaka"], keyFormulas: [], keyDefinitions: [] },
  misconceptions: [],
  topics: [
    {
      title: "Büyüme ve gelişmenin değerlendirilmesi",
      emphasis: "core",
      prerequisites: [],
      pageNumbers: [1],
      examPoints: [
        "Gelişimde gerileme her yaşta ciddidir; ayrıntılı değerlendirme gerektirir.",
        "18 ayda anlamlı kelime olmaması alarm bulgusudur.",
        "24 ayda yürüyememe alarm bulgusudur.",
      ],
      strategy: { examples: [], analogies: [], mnemonics: [], workedExamplePlan: "", checkQuestions: [] },
    },
  ],
};

describe("teacher eye: exam points from the teacher analysis", () => {
  it("asks the analysis for the document's own exam boxes", () => {
    const prompt = teacherAnalysisPrompt({ fileName: "pediatri.pdf", pages: [{ pageNumber: 1, text: SOURCE }], language: "tr", part: 1, parts: 1 });
    expect(prompt.schemaHint).toContain('"examPoints":string[]');
    for (const box of ["SINAV İPUCU", "AKILDA TUT", "ALARM BULGULARI"]) expect(prompt.userPrompt).toContain(box);
  });

  it("keeps exam points, reads old analyses without them, and drops a number the source never had", () => {
    const parsed = parseTeacherAnalysis(raw)!;
    expect(parsed.topics[0]!.examPoints).toHaveLength(3);
    const old = parseTeacherAnalysis({ ...raw, topics: [{ ...raw.topics[0], examPoints: undefined }] })!;
    expect(old.topics[0]!.examPoints).toEqual([]);
    const checked = sanitizeAnalysisAgainstSource(parsed, SOURCE).analysis;
    expect(checked.topics[0]!.examPoints).toEqual([
      "Gelişimde gerileme her yaşta ciddidir; ayrıntılı değerlendirme gerektirir.",
      "18 ayda anlamlı kelime olmaması alarm bulgusudur.",
    ]);
  });

  it("matches the prep topic by title or, when titles differ, by its pages", () => {
    const analysis = parseTeacherAnalysis(raw)!;
    // Konu haritası "Büyüme ve Gelişme", analiz "Büyüme ve gelişmenin değerlendirilmesi": kelimeyle eşleşir.
    expect(examPointsForTopic(analysis, "Büyüme ve Gelişme")).toHaveLength(3);
    // Başlık hiç tutmazsa konunun sayfasıyla.
    expect(examPointsForTopic(analysis, "Persentil ve kilometre taşları", [])).toHaveLength(0);
    expect(examPointsForTopic(analysis, "Persentil ve kilometre taşları", [1])).toHaveLength(3);
    const brief = teacherBriefForTopic(analysis, "Persentil ve kilometre taşları", [1]);
    expect(brief).toContain("SINAVDA SORULUR");
    expect(brief).toContain("* 18 ayda anlamlı kelime olmaması alarm bulgusudur.");
  });

  it("puts the same exam points in every engine with its own instruction", () => {
    const points = ["18 ayda anlamlı kelime olmaması alarm bulgusudur."];
    expect(examPointsBlock([], "lesson")).toBe("");
    expect(examPointsBlock(points, "lesson")).toContain("dersin omurgası");
    expect(examPointsBlock(points, "quiz")).toContain("Soruların çoğu bu maddeleri yoklasın");
    expect(examPointsBlock(points, "podcast")).toContain("son bölüm");
    expect(examPointsBlock(points, "oral")).toContain("Sorular bu maddeleri yoklasın");
    const input = { topicLabel: "Büyüme ve Gelişme", prepTitle: "Pediatri", pages: [{ page: 1, text: SOURCE }], upcomingTopics: [], examPoints: points };
    expect(teacherUserPrompt(input)).toContain("SINAVDA SORULUR");
    const lesson = { format: 3, title: "Büyüme", screens: [{ heading: "Gelişim", concept: "Gelişim", blocks: [{ type: "text", text: "Gelişim basamakları yaşa göre." }] }] } as LessonV3;
    const verify = verifyPartUserPrompt(lesson, { from: 0, to: 0, header: true, closing: true }, input);
    expect(verify).toContain(examPointsVerifyBlock(points));
    expect(verify).toContain("'high'");
  });
});
