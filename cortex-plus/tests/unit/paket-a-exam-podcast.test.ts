// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/components/parity/review-tools", () => ({ ReviewTools: () => null }));

import { resolveOptionCount } from "@/lib/learning/student-pedagogy";
import { optionCountIssue, quizSystem, quizVerifySystem } from "@/lib/learning/teacher-quiz";
import { equivalentOptionPair } from "@/lib/learning/option-equivalence";
import { EQUIVALENT_OPTIONS_RULE, SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";
import {
  buildBlueprint,
  expandedAllocationNote,
  promisedAllocation,
  slotFromTopicRow,
} from "@/lib/learning/mock-exam/allocate";
import { ExamQuestionReviewClient, correctOptionSet } from "@/components/parity/exam-question-review-client";
import { podcastLengthSpec } from "@/lib/learning/podcast-formats";
import { podcastBelowFloor, podcastWordCount, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import { podcastStructureIssues } from "@/lib/learning/teacher-podcast";
import { completePodcast, teacherPodcastLoop } from "@/lib/learning/teacher-podcast-run";
import { estimatedDurationMs } from "@/lib/learning/podcast-duration";

afterEach(cleanup);

/*
  Paket A (28 Ekim 2026). Canlıda çıkan beş kusur:
  - 10. sınıf / YKS / Tıp öğrencisine 4 şıklı soru gidiyordu (Türkiye'de lise ve üstü 5 şık).
  - Deneme kurulumu 3+3+3+3+2+2+2+2 dedi, üretim K1'e 5, K2'ye 1 soru verdi.
  - Çok cevaplı soruda yalnız ilk doğru "Doğru yanıt" rozetini aldı; öğrencinin işaretlediği ikinci doğru kırmızıydı.
  - Diyalog podcast'i düzeltme turunda 0:50'ye çöktü; ses 7 dakikada zaman aşımına düştü.
  - Ders notundaki "8-12 mm" genel literatürle "düzeltildi"; OCR köşe notunu ("Amfi 2") attı.
*/

describe("şık sayısı öğrencinin sınavına göre", () => {
  it("10. sınıf, YKS ve Tıp hedefi 5 şık (A-E); 7. sınıf ve LGS 4 şık (A-D)", () => {
    expect(resolveOptionCount({ gradeLevel: "10. sınıf" })).toBe(5);
    expect(resolveOptionCount({ targetExam: "YKS" })).toBe(5);
    expect(resolveOptionCount({ goalText: "Tıp fakültesi sınavları" })).toBe(5);
    expect(resolveOptionCount({ prepTitle: "Pediatri vize" , goalText: "Tıp fakültesi" })).toBe(5);
    expect(resolveOptionCount({ gradeLevel: "7. sınıf" })).toBe(4);
    expect(resolveOptionCount({ targetExam: "LGS" })).toBe(4);
    // Bilgi yoksa 5; hazırlığın adı bir sınav söylüyorsa o sınavın biçimi.
    expect(resolveOptionCount({})).toBe(5);
    expect(resolveOptionCount({ gradeLevel: "7. sınıf", prepTitle: "YKS Biyoloji" })).toBe(5);
  });

  it("yazar şık sayısını harfleriyle okur; kod tam sayıyı ister", () => {
    expect(quizSystem("document", "practice", false, undefined, false, 5)).toContain("tam 5 şık (A, B, C, D, E)");
    expect(quizSystem("document", "practice", false, undefined, false, 4)).toContain("tam 4 şık (A, B, C, D)");
    const question = (options: string[]) =>
      ({ text: "Soru?", options, answer: options[0] }) as unknown as Parameters<typeof optionCountIssue>[0];
    expect(optionCountIssue(question(["a", "b", "c", "d", "e"]), 5)).toBeNull();
    expect(optionCountIssue(question(["a", "b", "c", "d"]), 5)).toMatch(/5 olmalı \(A, B, C, D, E\)/);
    expect(optionCountIssue(question(["a", "b", "c", "d", "e"]), 4)).toMatch(/4 olmalı \(A, B, C, D\)/);
  });
});

describe("deneme: kurulumun sözü = teslim edilen dağılım", () => {
  const topics = Array.from({ length: 8 }, (_, index) =>
    // Konu metninin uzunluğu dağılıma girmez: önizleme bilmiyordu, üretim biliyordu.
    slotFromTopicRow({ id: `t${index + 1}`, label: `Konu ${index + 1}`, passageChars: index === 0 ? 40_000 : 600 }),
  );

  it("8 konu, 20 soru → 3+3+3+3+2+2+2+2; konu metni uzun olan fazla almaz", () => {
    const promised = promisedAllocation(topics, 20);
    expect(promised.rows.map((row) => row.count)).toEqual([3, 3, 3, 3, 2, 2, 2, 2]);
    expect(promised.total).toBe(20);
    expect(promised.expanded).toBe(false);
    expect(expandedAllocationNote(promised)).toBeNull();
    const blueprint = buildBlueprint({ topics, preset: "standard", syllabus: null, allowNumeric: false, questionCount: 20 });
    expect(blueprint.allocation.map((row) => row.count)).toEqual([3, 3, 3, 3, 2, 2, 2, 2]);
    expect(blueprint.slots).toHaveLength(20);
  });

  // 30 Ekim 2026 (Paket I #4): toplam artık büyümez; konu fazlaysa 10 konu seçilir ve kurulum söyler.
  it("konu sayısı soru sayısını aşınca toplam seçilen sayıda kalır, konular seçilir ve kurulum bunu söyler", () => {
    const many = Array.from({ length: 12 }, (_, index) => slotFromTopicRow({ id: `m${index}`, label: `Konu ${index}` }));
    const promised = promisedAllocation(many, 10);
    expect(promised.rows.every((row) => row.count === 1)).toBe(true);
    expect(promised.total).toBe(10);
    expect(promised.rows).toHaveLength(10);
    expect(promised.expanded).toBe(false);
    expect(promised.skippedTopics).toHaveLength(2);
    expect(expandedAllocationNote(promised)).toBe(
      "12 konudan 10 tanesi soruluyor: sınav ağırlığı yüksek olanlar önce, kalanlar listeye yayılarak. Bütün konular için soru sayısını artır.",
    );
    const blueprint = buildBlueprint({ topics: many, preset: "standard", syllabus: null, allowNumeric: false, questionCount: 10 });
    expect(blueprint.questionCount).toBe(10);
    expect(blueprint.slots).toHaveLength(10);
  });
});

describe("çok cevaplı soru: her doğru şık etiketli, eşdeğer şık yok", () => {
  const question = {
    id: "q1",
    question_text: "Aşağıdakilerden hangileri büyüme geriliğinde ilk istenen tetkiklerdendir?",
    options: ["Tam kan sayımı", "Tiroid fonksiyon testleri", "Kemik iliği biyopsisi", "Beyin MR", "Genetik panel"],
    correct_answer: "Tam kan sayımı",
    correct_answers: ["Tam kan sayımı", "Tiroid fonksiyon testleri"],
    question_type: "multi_mcq",
  };

  it("doğru kümesi correct_answers'tan; eski kayıtta correct_answer", () => {
    expect([...correctOptionSet(question)]).toEqual(["Tam kan sayımı", "Tiroid fonksiyon testleri"]);
    expect([...correctOptionSet({ correct_answer: "Tam kan sayımı", correct_answers: null })]).toEqual(["Tam kan sayımı"]);
  });

  it("inceleme sayfasında iki doğrunun ikisi de 'Doğru Yanıt'; işaretlenen doğru kırmızı görünmez", () => {
    const { container } = render(
      createElement(ExamQuestionReviewClient, {
        prepId: "p1",
        examId: "e1",
        examTitle: "Pediatri",
        score: 100,
        questions: [question],
        reviews: [
          {
            id: "r1",
            question_id: "q1",
            user_answer: "Tam kan sayımı|Tiroid fonksiyon testleri",
            is_correct: true,
            explanation: null,
            liked: false,
            verdict: "dogru",
          },
        ],
      }),
    );
    expect(screen.getAllByText("Doğru Yanıt")).toHaveLength(2);
    expect(screen.getAllByText("İşaretledin")).toHaveLength(2);
    expect(container.querySelectorAll(".bg-rose-500")).toHaveLength(0);
  });

  it("eşdeğer şık çifti yakalanır; yazar ve denetçi aynı kuralı okur", () => {
    expect(equivalentOptionPair(["Resesif", "Çekinik", "Baskın", "Eş baskın", "Ara kalıtım"])).not.toBeNull();
    expect(equivalentOptionPair(["Baskın", "Çekinik", "Eş baskın", "Ara kalıtım", "Çok alellik"])).toBeNull();
    expect(quizSystem("document")).toContain(EQUIVALENT_OPTIONS_RULE);
    expect(quizVerifySystem("document")).toContain(EQUIVALENT_OPTIONS_RULE);
    expect(quizVerifySystem("topic")).toContain(EQUIVALENT_OPTIONS_RULE);
  });
});

describe("kaynak sayı önceliği ve OCR köşe notları", () => {
  it("SOURCE_NUMBER_PRIORITY ders, test ve pratikte yazar ve denetçide aynı metin", () => {
    for (const file of [
      "src/lib/learning/teacher-lesson.ts",
      "src/lib/learning/teacher-quiz.ts",
      "src/lib/learning/teacher-practice.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.match(/\$\{SOURCE_NUMBER_PRIORITY\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
    expect(quizSystem("document")).toContain(SOURCE_NUMBER_PRIORITY);
    expect(quizVerifySystem("document")).toContain(SOURCE_NUMBER_PRIORITY);
    expect(SOURCE_NUMBER_PRIORITY).toContain("8-12 mm");
  });

  it("OCR ve sayfa temizliği kısa başlık ve köşe notunu atmaz", () => {
    expect(readFileSync("src/lib/documents/extract-image-text.ts", "utf8")).toContain("Amfi 2");
    expect(readFileSync("src/lib/documents/clean-pages.ts", "utf8")).toContain("köşe notu");
  });
});

const sentence = (seed: number) =>
  `Bölüm ${seed} için büyüme eğrisinde ${seed + 2}. persentil izlenir, çünkü eğilim tek ölçümden daha çok bilgi verir ve kayma erken fark edilir.`;

function episodeOf(length: PodcastEpisode["length"], chapters: number, linesPer: number, offset = 0): PodcastEpisode {
  return {
    title: "Büyüme izlemi",
    length,
    chapters: Array.from({ length: chapters }, (_, c) => ({
      title: `Kavram ${offset + c + 1}`,
      lines: Array.from({ length: linesPer }, (_, l) => ({ speaker: "ada" as const, text: sentence(offset * 100 + c * 10 + l) })),
    })),
  };
}

describe("podcast 50 saniyelik metinde kalmaz", () => {
  const input = { topicLabel: "Büyüme izlemi", prepTitle: "Pediatri", pages: [{ page: 3, text: "Persentil…" }], length: "basit" as const };

  it("taban ~4 dakikanın altına inmez, tavan ~10 dakika; 50 saniyelik metin 'Metin kısa'", () => {
    for (const length of ["diyalog", "soru_cevap", "basit", "derin"] as const) {
      const spec = podcastLengthSpec(length);
      expect(estimatedDurationMs(spec.words.min, spec.speakers)).toBeGreaterThanOrEqual(3.5 * 60_000);
      expect(estimatedDurationMs(spec.words.max, spec.speakers)).toBeLessThanOrEqual(10.1 * 60_000);
    }
    const fiftySeconds = episodeOf("basit", 2, 2);
    expect(estimatedDurationMs(podcastWordCount(fiftySeconds), "single")).toBeLessThan(60_000);
    expect(podcastBelowFloor(fiftySeconds)).toBe(true);
    expect(podcastStructureIssues(fiftySeconds).some((issue) => issue.startsWith("Metin kısa"))).toBe(true);
  });

  it("düzeltici metni yarıya indirirse düzeltme reddedilir; 'Metin kısa' tek başına düzeltme turu açmaz", async () => {
    const draft = episodeOf("basit", 4, 4);
    const collapsed = episodeOf("basit", 4, 2);
    const roles: string[] = [];
    let verify = 0;
    const ask = vi.fn(async (system: string, _user: string, role?: string) => {
      roles.push(role ?? "draft");
      if (system.includes("denetçisisin")) {
        verify += 1;
        return verify === 1 ? { issues: [{ where: "chapters[1].lines[0]", problem: "Kaynakta yok", severity: "high" }] } : { issues: [] };
      }
      if (role === "fix") return collapsed;
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, input);
    expect(loop.floorRejected).toBe(1);
    expect(loop.episode).not.toBeNull();
    expect(podcastWordCount(loop.episode!)).toBeGreaterThan(podcastWordCount(collapsed));
    expect(roles.filter((role) => role === "fix")).toHaveLength(1);
  });

  it("tamamlama turu yalnız ek bölüm yazar; tekrar bölümünden önce girer ve metni tabana taşır", async () => {
    const short = episodeOf("basit", 4, 2);
    const addition = episodeOf("basit", 5, 3, 10);
    const ask = vi.fn(async (system: string) => (system.includes("denetçisisin") ? { issues: [] } : addition));
    const result = await completePodcast(ask, short, input, Date.now());
    expect(result.verdict).toMatch(/completed|still_short/);
    expect(podcastWordCount(result.episode)).toBeGreaterThan(podcastWordCount(short));
    const titles = result.episode.chapters.map((chapter) => chapter.title);
    expect(titles[titles.length - 1]).toBe("Kavram 4");
    expect(titles).toContain("Kavram 11");
  });

  it("süre turu tamamlama turunu kullanır; oynatıcı sesi bölüm bölüm ister", () => {
    const run = readFileSync("src/lib/learning/teacher-podcast-run.ts", "utf8");
    expect(run).toContain("const completed = await completePodcast(ask, episode, input, started);");
    expect(run).toContain("DURATION_ROUND_TIMEOUT_MS");
    const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
    expect(player).toContain("chapters: [chapter], stream: true");
    expect(player).toContain("AUDIO_CHAPTER_PARALLEL");
  });
});
