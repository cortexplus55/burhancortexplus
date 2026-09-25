import { describe, expect, it, vi } from "vitest";
import { consolidateTopics, storedTopicsNeedRefold, type FoldPage } from "@/lib/documents/topic-fold";
import { layoutBoard, studentVisibleText, alignSymbolSubscripts } from "@/lib/learning/lesson-board";
import { trueFalseIndexes } from "@/lib/learning/lesson-chrome";
import { repairLearnerLesson, scopeLessonToTopic } from "@/lib/learning/lesson-repair";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const PHYSICS = "Ideal Gaz Denklemi ve Gerçek Gazlar";
const PHYSICS_SOURCE = [
  "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır.",
  "Evrensel gaz sabiti kaynakta R_u olarak durur.",
  "m = 0.5 kg. R = 0.287 kJ/(kg·K). T = 300 K. V = 0.40 m³.",
  "h = 300 kJ/kg bu hesapta geçmez.",
].join(" ");

const CHEMISTRY = "Mol Kavramı ve Kimyasal Hesaplamalar";
const CHEMISTRY_SOURCE = [
  "Kimya Dersi Notları: Mol Kavramı ve Kimyasal Hesaplamalar",
  "Tanecik sayısı ile mol sayısı arasındaki bağıntı N = n × N_A şeklindedir.",
  "Mol sayısı, kütle ve mol kütlesi arasındaki bağıntı n = m / M şeklindedir.",
  "m = 36 g. M = 18 g/mol.",
  "Gaz hacmi ile mol sayısı arasındaki bağıntı n = V / 22,4 şeklindedir.",
  "Örneğin 4 g hidrojen ile 32 g oksijen tepkimeye girince 36 g su oluşur.",
  "Suda hidrojenin oksijene kütle oranı her zaman 1/8 dir.",
].join(" ");

const HISTORY = "Gülhane Hatt-ı Hümayunu";
const HISTORY_SOURCE = [
  "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi.",
  "Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı.",
  "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
].join(" ");

function check(partial: Partial<SectionCheck> & Pick<SectionCheck, "prompt" | "options" | "answerIndex">): SectionCheck {
  return {
    type: "mcq",
    explanation: "Kaynaktaki ifade bu seçenekle kurulur ve dersin anlatımında durur.",
    ...partial,
  };
}

function physicsLesson(): LessonV2 {
  return {
    title: "Basınç Hesabının Uzun Özeti",
    overview: "İdeal gaz basıncı, kütle sıcaklık ve hacimle yazılır.",
    sections: [
      {
        heading: "İdeal gaz",
        body: "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Evrensel gaz sabiti Rₐ ile gösterilir. Bu bağıntı kapalı bir kap için kullanılır.",
        check: check({
          prompt: "İdeal gaz denklemi aşağıdakilerden hangisi için doğrudur?",
          options: ["Kapalı kap", "Açık kap", "Yalnız sıvı", "Yalnız katı"],
          answerIndex: 0,
        }),
      },
      {
        heading: "Birim",
        body: "Basınç paskal ile ölçülür. Kilopaskal, paskalın bin katıdır ve hesap sonunda yazılır.",
        check: check({
          prompt: "Basıncın SI birimi hangisidir?",
          options: ["Pascal", "Kilogram", "Saniye", "Mol"],
          answerIndex: 0,
        }),
      },
      {
        heading: "Hacim",
        body: "Hacim metreküp ile ölçülür. Kütle kilogram, sıcaklık kelvin cinsinden verilir.",
        check: check({
          prompt: "Hacim hangi birimle verilir?",
          options: ["Metreküp", "Pascal", "Kelvin", "Kilogram"],
          answerIndex: 0,
        }),
      },
    ],
    example: {
      prompt:
        "İdeal gaz denklemi kullanılarak basınç hesaplanırken dikkat edilmesi gereken doğru husus nedir?. m = 0.5 kg. R = 0.287 kJ. T = 300 K. V = 0.40 m³. h = 300 kJ/kg.",
      solution: "P = 0.5 × 0.287 × 300 / 0.40. Sonuç: P ≈ 107.6 kPa.",
    },
    summary: [
      "**İdeal gaz denklemi** basıncı kütle, sıcaklık ve hacimle ilişkilendirir.",
      "İdeal gaz denklemi basıncı kütle, sıcaklık ve hacimle ilişkilendirir.",
      "Sıcaklık kelvin cinsinden alınır.",
      "Hacim metreküp cinsinden alınır.",
    ],
  };
}

function chemistryLesson(): LessonV2 {
  return {
    title: "Kimyasal Hesapların Uzun Özeti",
    sections: [
      {
        heading: "Mol",
        body: "Tanecik sayısı ile mol sayısı arasındaki bağıntı N = n × N_A şeklindedir. Mol sayısı n = m / M bağıntısıyla yazılır. Örneğin, 36 g suyun mol sayısı n = 36 g / 18 g/mol = 2 mol.",
        check: check({
          prompt: "N için N_A içeren bağıntı hangisidir?",
          options: ["N = n × N_A", "n = m / M", "N = n × N_A (Tanecik", "n = m / M (Kütle"],
          answerIndex: 0,
        }),
      },
      {
        heading: "Kütle",
        body: "Kütle gram cinsinden ölçülür. Mol kütlesinin birimi g/mol olarak yazılır ve M ile gösterilir.",
        check: check({
          prompt: "Mol kütlesi hangi birimle yazılır?",
          options: ["g/mol", "kg/m³", "kJ", "Pa"],
          answerIndex: 0,
        }),
      },
      {
        heading: "Korunum",
        body: "Kimyasal tepkimede giren kütlelerin toplamı ürünlerin toplamına eşittir. Bu ifade kütlenin korunumunu anlatır.",
        check: check({
          prompt: "Tepkime sonunda toplam kütle için hangisi doğrudur?",
          options: ["Giren kütleye eşittir", "Her zaman sıfırdır", "Yalnız gaza aittir", "Sıcaklıkla yok olur"],
          answerIndex: 0,
        }),
      },
    ],
    example: {
      prompt: "Bu hesap hangi sonucu verir?. n = 36 g. l = 2 mol.",
      solution: "n = 36 g / 18 g/mol = 2 mol",
    },
    summary: [
      "**mol kütlesi**, bir mol maddenin gram cinsinden kütlesidir.",
      "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
      "Bir maddenin bir molünün gram cinsinden kütlesine mol kütlesi denir.",
      "Avogadro sayısı bir moldeki tanecik sayısını verir.",
      "Kütle gram ile ölçülür.",
    ],
  };
}

function historyLesson(): LessonV2 {
  return {
    title: "Osmanlı Belgelerinin Uzun Tarihi",
    sections: [
      {
        heading: "İlan",
        body: "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi ve yazılı bir vaat olarak duyuruldu.",
        check: {
          type: "trueFalse",
          prompt: "Belge 1839 yılında ilan edildi mi?",
          options: ["DOĞRU MU", "YANLIŞ MI"],
          answerIndex: 0,
          explanation: "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi.",
        },
      },
      {
        heading: "Güvenlik",
        body: "Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı ve bunu herkese duyurdu.",
        check: check({
          prompt: "Belge can ve mal güvenliğini neye bağlar?",
          options: ["Yazılı bir vaade", "Sözlü bir gelenek", "Yabancı bir antlaşma", "Yerel bir örf"],
          answerIndex: 0,
        }),
      },
      {
        heading: "Vergi",
        body: "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu ve bunu metne yazdı.",
        check: check({
          prompt: "Vergi toplanmadan önce ne şart koşulur?",
          options: ["Bir kurulun onayı", "Yabancı elçinin izni", "Halk oylaması", "Lonca kararı"],
          answerIndex: 0,
        }),
      },
    ],
    example: {
      prompt: "Bu belge can ve mal güvenliğini neye bağladı?",
      solution: "Belge, can ve mal güvenliğini yazılı bir vaade bağladı.",
    },
    summary: [
      "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi.",
      "Belge can ve mal güvenliğini yazılı bir vaade bağladı.",
      "Vergi için bir kurulun onayı şart koşuldu.",
    ],
  };
}

function optionKey(option: string): string {
  return option
    .toLocaleLowerCase("tr")
    .replace(/\([^)]*\)/g, "")
    .replace(/\([^)]*$/g, "")
    .replace(/[^a-z0-9çğıöşü]/g, "");
}

function rhsTokens(equation: string): string[] {
  return (equation.split("=").slice(1).join("=").match(/[A-Za-zΔδ][A-Za-z0-9_]*/g) ?? []).filter(
    (token) => token.length >= 2,
  );
}

describe("live lesson card replay", () => {
  it("rebuilds a physics example without a pasted stem, a truncated unit, or an unused given", () => {
    const lesson = scopeLessonToTopic(physicsLesson(), PHYSICS_SOURCE, PHYSICS);
    const example = lesson.example;
    expect(example?.prompt.endsWith("?")).toBe(true);
    expect(example?.prompt).not.toMatch(/\?\./);
    expect(example?.prompt).not.toMatch(/husus nedir/i);
    expect(example?.prompt).not.toMatch(/(?<![A-Za-z])h\s*=/);
    expect(example?.prompt).not.toMatch(/(?<![A-Za-z])P\s*=/);
    expect(example?.prompt).toMatch(/kJ\/\(kg·K\)|kJ\/kg·K/);
    expect(example?.solution).toMatch(/P\s*=\s*mRT\/V/);
    expect(example?.solution).toMatch(/0\.5\s*kg|0\.5 kg/);
    expect(example?.solution).toMatch(/107\.6\s*kPa/);
    expect(JSON.stringify(lesson)).not.toContain("Rₐ");
    expect(JSON.stringify(lesson)).toMatch(/Rᵤ|R_u/);
    const visible = (lesson.summary ?? []).map(studentVisibleText).join(" ");
    expect(visible).not.toContain("**");
    expect(new Set((lesson.summary ?? []).map((line) => studentVisibleText(line).toLocaleLowerCase("tr"))).size).toBe(
      lesson.summary?.length,
    );
    const retry = reviewQuestionFor(lesson.sections[0]?.check ?? physicsLesson().sections[0].check!, "tr");
    expect(retry.prompt.toLocaleLowerCase("tr").replace(/\s+/g, " ")).not.toBe(
      "ideal gaz denklemi aşağıdakilerden hangisi için doğrudur?",
    );
    expect(retry.prompt).not.toContain("başka sözcüklerle");
  });

  it("repairs a chemistry example, a leaking stem, and truncated duplicate options", () => {
    const lesson = scopeLessonToTopic(chemistryLesson(), CHEMISTRY_SOURCE, CHEMISTRY);
    const bodies = lesson.sections.map((section) => section.body).join("\n");
    const worked = `${bodies}\n${lesson.example?.solution ?? ""}`;
    expect(worked).toMatch(/n\s*=\s*m\s*\/\s*M/);
    expect(worked).toMatch(/36\s*g/);
    expect(worked).toMatch(/18\s*g\/mol/);
    expect(worked).toMatch(/2\s*mol/);
    if (lesson.example) {
      expect(lesson.example.prompt.endsWith("?")).toBe(true);
      expect(lesson.example.prompt).not.toMatch(/\?\./);
      expect(lesson.example.prompt).not.toMatch(/hangi sonucu verir/i);
      expect(lesson.example.prompt).not.toMatch(/(?<![A-Za-z])n\s*=\s*36/);
      expect(lesson.example.prompt).not.toMatch(/(?<![A-Za-z])l\s*=/);
      const sectionFold = bodies.toLocaleLowerCase("tr").replace(/[^a-z0-9]/g, "");
      const solutionFold = lesson.example.solution.toLocaleLowerCase("tr").replace(/[^a-z0-9]/g, "");
      expect(sectionFold.includes(solutionFold)).toBe(false);
    }
    const formula = lesson.sections
      .map((section) => section.check)
      .find((item) => /n\s*=\s*n/i.test(item?.options[item.answerIndex] ?? "") || /N_A/.test(item?.options.join(" ") ?? ""));
    expect(formula?.options.length).toBeGreaterThanOrEqual(2);
    const keys = (formula?.options ?? []).map(optionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect((formula?.options ?? []).join(" ")).not.toMatch(/\([^)]*$/);
    const answer = formula?.options[formula.answerIndex] ?? "";
    for (const token of rhsTokens(answer)) {
      expect(formula?.prompt ?? "").not.toContain(token);
    }
    expect(formula?.prompt).not.toMatch(/hangi bağıntıyla/i);
    const visible = (lesson.summary ?? []).map(studentVisibleText).join("\n");
    expect(visible).not.toContain("**");
    const meanings = (lesson.summary ?? []).map((line) =>
      studentVisibleText(line).toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9 ]/g, "").replace(/\s+/g, " ").trim(),
    );
    expect(new Set(meanings).size).toBe(meanings.length);
    const board = layoutBoard("Örneğin, 36 g suyun mol sayısı\nn = m / M = 36 g / 18 g/mol = 2 mol");
    expect(board[0]?.text).toMatch(/şöyle hesaplanır:$/);
    expect(layoutBoard("Birimi g/mol'dür.").map((line) => line.text).join(" ")).toContain("Birimi");
  });

  it("keeps a history lesson narrative and still changes the retry stem", async () => {
    const verify = vi.fn(async () => ({ bad: [] }));
    const result = await repairLearnerLesson(
      historyLesson(),
      { source: HISTORY_SOURCE, topicLabel: HISTORY },
      async () => null,
      verify,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    const lesson = result.lesson;
    expect(lesson.example?.solution).toMatch(/yazılı bir vaade/);
    expect(JSON.stringify(lesson)).not.toMatch(/=\s*\d/);
    expect(lesson.example?.solution ?? "").not.toMatch(/\d+\s*(kJ|mol|g)\b/);
    expect(trueFalseIndexes(["YANLIŞ MI", "DOĞRU MU"])).toEqual({ wrong: 0, right: 1 });
    expect(trueFalseIndexes(["DOĞRU MU", "YANLIŞ MI"])).toEqual({ wrong: 1, right: 0 });
    const original = historyLesson().sections[1]?.check;
    const retry = reviewQuestionFor(original!, "tr");
    expect(retry.prompt.toLocaleLowerCase("tr")).not.toBe(original?.prompt.toLocaleLowerCase("tr"));
    expect(retry.options[retry.answerIndex]).toBe(original?.options[original.answerIndex]);
  });

  it("does not collapse a short numbered note into one topic", () => {
    const pages: FoldPage[] = [
      {
        pageNumber: 1,
        headings: [
          "Kimya Dersi Notları: Mol Kavramı ve Kimyasal Hesaplamalar",
          "1. Mol Kavramı",
          "2. Mol Kütlesi",
          "3. Gazlarda Mol Hacmi",
          "4. Kütlenin Korunumu Kanunu",
          "5. Sabit Oranlar Kanunu",
        ],
      },
    ];
    const stored = [{ title: CHEMISTRY, learningObjective: null, pageNumbers: [1] }];
    const { topics } = consolidateTopics(stored, pages, 1);
    expect(topics.length).toBeGreaterThan(1);
    expect(topics.map((topic) => topic.title).join(" ")).toMatch(/Kütlenin Korunumu/);
    expect(topics.map((topic) => topic.title).join(" ")).toMatch(/Sabit Oranlar/);
    expect(storedTopicsNeedRefold([{ title: CHEMISTRY }], pages, 1)).toBe(true);
    expect(alignSymbolSubscripts("Rₐ = 8.314", "Evrensel gaz sabiti R_u ile gösterilir.")).toBe("Rᵤ = 8.314");
  });
});
