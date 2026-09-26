import { describe, expect, it } from "vitest";
import { parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { publishOralQuestions } from "@/lib/learning/oral-exam";
import { pagesMarkedInSource } from "@/lib/learning/source-context";
import { quantityClaimGrounded } from "@/lib/learning/teacher-brain";
import {
  repairQuizPedagogy,
  validateOralPedagogy,
  validateQuizPedagogy,
} from "@/lib/learning/teaching-standards";
import {
  checkCalculationChains,
  checkSimpleMathClaims,
  runIndependentValidation,
  settleRejectedLesson,
} from "@/lib/learning/validation-pipeline";
import { coherenceFailures, publishCoherentLesson } from "@/lib/learning/lesson-coherence";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const QUIZ_GATE = {
  requireObjective: false,
  requireMisconceptionTag: true,
  requireDistractorRefutation: true,
} as const;

const CHEM_SOURCE = [
  "[s.4] kimya.pdf: 0,25 mol H2SO4 için mol kütlesi M = 98 g/mol. Kütle m = n × M bağıntısıyla bulunur.",
  "[s.5] kimya.pdf: Sınırlayıcı bileşen, tepkimede ilk tükenen maddedir. Kuramsal verim, sınırlayıcı bileşenden hesaplanan en yüksek ürün miktarıdır.",
].join("\n");

const LAW_SOURCE =
  "[s.2] anayasa.pdf: Kanun-i Esasi 1876'da ilan edildi. Meşrutiyet, padişahın yetkisini bir anayasa ile sınırladı.";

const BIO_SOURCE =
  "[s.1] hucre.pdf: Mitozda kromozom sayısı korunur. Mayozda kromozom sayısı yarıya iner ve genetik çeşitlilik artar.";

function bareQuestion(
  text: string,
  options: string[],
  correct: string,
  explanation: string,
): QuizQuestion {
  return { text, options, correct: [correct], multi: false, explanation };
}

function chemQuiz(): unknown {
  return {
    questions: [
      bareQuestion(
        "0,25 mol H2SO4 kaç gramdır?",
        ["24,5 g", "98 g", "0,25 g", "245 g"],
        "24,5 g",
        "m = 0,25 × 98 = 24,5 g. 98 g mol kütlesini kütle sanmaktır.",
      ),
      bareQuestion(
        "Sınırlayıcı bileşen hangisidir?",
        ["İlk tükenen madde", "En çok kullanılan çözücü", "Katalizör", "Ürünün kendisi"],
        "İlk tükenen madde",
        "Sınırlayıcı bileşen ilk tükenen maddedir. Çözücü sınırlayıcı değildir.",
      ),
      bareQuestion(
        "Kuramsal verim neye göre hesaplanır?",
        ["Sınırlayıcı bileşene göre", "Artan maddeye göre", "Çözücüye göre", "Kabın hacmine göre"],
        "Sınırlayıcı bileşene göre",
        "Kuramsal verim sınırlayıcı bileşenden hesaplanır. Artan maddeye göre değil.",
      ),
    ],
  };
}

function lawQuiz(): unknown {
  return {
    questions: [
      bareQuestion(
        "Kanun-i Esasi hangi yılda ilan edildi?",
        ["1876", "1839", "1908", "1924"],
        "1876",
        "Kanun-i Esasi 1876'da ilan edildi.",
      ),
      bareQuestion(
        "Meşrutiyet padişahın yetkisini neyle sınırlar?",
        ["Bir anayasa ile", "Bir ferman ile", "Bir savaş ile", "Bir vergi ile"],
        "Bir anayasa ile",
        "Meşrutiyet yetkiyi bir anayasa ile sınırlar.",
      ),
      bareQuestion(
        "1876 belgesi hangisidir?",
        ["Kanun-i Esasi", "Sened-i İttifak", "Islahat Fermanı", "Teşkilat-ı Esasiye"],
        "Kanun-i Esasi",
        "1876 belgesi Kanun-i Esasi'dir.",
      ),
    ],
  };
}

function bioQuiz(): unknown {
  return {
    questions: [
      bareQuestion(
        "Mitozda kromozom sayısına ne olur?",
        ["Korunur", "Yarıya iner", "İkiye katlanır", "Yok olur"],
        "Korunur",
        "Mitozda kromozom sayısı korunur.",
      ),
      bareQuestion(
        "Mayozda kromozom sayısına ne olur?",
        ["Yarıya iner", "Korunur", "Dörde katlanır", "Sabit kalır"],
        "Yarıya iner",
        "Mayozda kromozom sayısı yarıya iner.",
      ),
      bareQuestion(
        "Genetik çeşitlilik hangi bölünmede artar?",
        ["Mayoz", "Mitoz", "Amitoz", "Sitokinez"],
        "Mayoz",
        "Genetik çeşitlilik mayozda artar.",
      ),
    ],
  };
}

function publishQuiz(raw: unknown) {
  const parsed = parseQuizQuestions(raw);
  expect(parsed).not.toBeNull();
  const repaired = repairQuizPedagogy(parsed!);
  expect(validateQuizPedagogy(repaired, QUIZ_GATE)).toEqual([]);
  const again = repairQuizPedagogy(repaired);
  expect(again.map((q) => q.explanation)).toEqual(repaired.map((q) => q.explanation));
  const independent = runIndependentValidation({
    draft: JSON.stringify({ questions: repaired }),
    parsed: { questions: repaired },
    pedagogyIssues: validateQuizPedagogy(repaired, QUIZ_GATE),
    minItems: 3,
    requireSourceSupport: true,
    sourceExcerpt: CHEM_SOURCE,
    sourcePages: pagesMarkedInSource(CHEM_SOURCE),
  });
  expect(independent.ok).toBe(true);
  return repaired;
}

describe("quiz and oral after the lesson pipeline", () => {
  it("repairs a schema-valid quiz instead of calling it a format error", () => {
    for (const raw of [chemQuiz(), lawQuiz(), bioQuiz()]) {
      const questions = publishQuiz(raw);
      expect(questions.every((q) => (q.learningObjective?.length ?? 0) >= 8)).toBe(true);
      expect(questions.every((q) => (q.misconceptionTag?.length ?? 0) >= 2)).toBe(true);
    }
  });

  it("keeps a correct stoichiometry result and drops a wrong one", () => {
    expect(checkSimpleMathClaims("0,25 × 98 = 24,5")).toEqual([]);
    expect(checkCalculationChains("0,25 × 98 = 24,5")).toEqual([]);
    expect(checkSimpleMathClaims("88/44 = 2")).toEqual([]);
    expect(quantityClaimGrounded("0,25 × 98 = 24,5 g", CHEM_SOURCE)).toBe(true);
    expect(quantityClaimGrounded("0,25 × 98 = 30 g", CHEM_SOURCE)).toBe(false);

    const oral = publishOralQuestions(
      {
        questions: [
          {
            prompt: "0,25 mol H2SO4 kaç gramdır?",
            expectedPoints: ["0,25 × 98 = 24,5 g"],
            modelAnswer: "0,25 × 98 = 24,5 g",
          },
          {
            prompt: "Sınırlayıcı bileşen nedir?",
            expectedPoints: ["Tepkimede ilk tükenen maddedir."],
            modelAnswer: "Sınırlayıcı bileşen tepkimede ilk tükenen maddedir.",
          },
          {
            prompt: "Kuramsal verim nereden hesaplanır?",
            expectedPoints: ["0,25 × 98 = 30 g", "Sınırlayıcı bileşenden hesaplanır."],
            modelAnswer: "Kuramsal verim sınırlayıcı bileşenden hesaplanır.",
          },
        ],
      },
      3,
      CHEM_SOURCE,
    );
    expect(oral).not.toBeNull();
    expect(oral![0].expectedPoints.join(" ")).toContain("24,5");
    expect(oral![0].rubricCriteria.length).toBeGreaterThan(0);
    expect(oral!.some((q) => q.expectedPoints.some((p) => p.includes("30")))).toBe(false);
    const shared = publishOralQuestions(
      {
        questions: [
          {
            prompt: "Sınırlayıcı bileşen nedir?",
            expectedPoints: ["Tamamen tükenen tek bir maddedir."],
            modelAnswer: "Sınırlayıcı bileşen tamamen tükenen tek bir maddedir.",
          },
          {
            prompt: "Verim hangi oranla okunur?",
            expectedPoints: ["Gerçekleşen ürün kuramsal ürüne bölünür."],
            modelAnswer: "Gerçekleşen ürün kuramsal ürüne bölünür.",
          },
          {
            prompt: "Gerçekleşen ürün neye bölünür?",
            expectedPoints: ["Kuramsal ürüne bölünür."],
            modelAnswer: "Gerçekleşen ürün kuramsal ürüne bölünür.",
          },
        ],
      },
      3,
      "Sınırlayıcı bileşen mol oranıyla bulunur. Verim, gerçekleşen ürünün kuramsal ürüne bölünmesidir. Sınırlayıcı bileşen tamamen tükenen tek bir maddedir.",
      true,
    );
    expect(shared).not.toBeNull();
    expect(shared!.length).toBeGreaterThanOrEqual(2);
    const sharedText = shared!.map((q) => `${q.prompt} ${q.expectedPoints.join(" ")} ${q.modelAnswer}`).join("\n");
    expect(sharedText).not.toMatch(/\btepkimde\b/);
    expect(sharedText).toMatch(/mol oranıyla|kuramsal|tükenen|stokiyometrik orandaysa/i);
    expect(validateOralPedagogy(oral!)).toEqual([]);
    const independent = runIndependentValidation({
      draft: JSON.stringify({ questions: oral }),
      parsed: { questions: oral },
      pedagogyIssues: validateOralPedagogy(oral!),
      minItems: 3,
      requireSourceSupport: true,
      sourceExcerpt: CHEM_SOURCE,
      sourcePages: [4, 5],
    });
    expect(independent.ok).toBe(true);
  });

  it("publishes verbal and biology oral questions from the same repair", () => {
    const law = publishOralQuestions(
      {
        questions: [
          {
            prompt: "Kanun-i Esasi hangi yılda ilan edildi?",
            expectedPoints: ["1876'da ilan edildi."],
            modelAnswer: "Kanun-i Esasi 1876'da ilan edildi.",
          },
          {
            prompt: "Meşrutiyet padişahın yetkisini neyle sınırlar?",
            expectedPoints: ["Bir anayasa ile sınırladı."],
            modelAnswer: "Meşrutiyet padişahın yetkisini bir anayasa ile sınırladı.",
          },
          {
            prompt: "1876 belgesinin adı nedir?",
            expectedPoints: ["Kanun-i Esasi."],
            modelAnswer: "1876 belgesi Kanun-i Esasi'dir.",
          },
        ],
      },
      3,
      LAW_SOURCE,
    );
    const bio = publishOralQuestions(
      {
        questions: [
          {
            prompt: "Mitozda kromozom sayısına ne olur?",
            expectedPoints: ["Kromozom sayısı korunur."],
            modelAnswer: "Mitozda kromozom sayısı korunur.",
          },
          {
            prompt: "Mayozda kromozom sayısına ne olur?",
            expectedPoints: ["Kromozom sayısı yarıya iner."],
            modelAnswer: "Mayozda kromozom sayısı yarıya iner.",
          },
          {
            prompt: "Genetik çeşitlilik hangi bölünmede artar?",
            expectedPoints: ["Mayozda genetik çeşitlilik artar."],
            modelAnswer: "Genetik çeşitlilik mayozda artar.",
          },
        ],
      },
      3,
      BIO_SOURCE,
    );
    expect(law).toHaveLength(3);
    expect(bio).toHaveLength(3);
    expect(validateOralPedagogy(law!)).toEqual([]);
    expect(validateOralPedagogy(bio!)).toEqual([]);
    expect(law!.some((q) => q.expectedPoints.join(" ").includes("1876"))).toBe(true);
    for (const questions of [law!, bio!]) {
      const independent = runIndependentValidation({
        draft: JSON.stringify({ questions }),
        parsed: { questions },
        pedagogyIssues: validateOralPedagogy(questions),
        minItems: 3,
        requireSourceSupport: true,
        sourceExcerpt: questions === law ? LAW_SOURCE : BIO_SOURCE,
        sourcePages: pagesMarkedInSource(questions === law ? LAW_SOURCE : BIO_SOURCE),
      });
      expect(independent.ok).toBe(true);
    }
  });

  it("does not let the lesson settler turn a quiz into an accepted lesson", () => {
    const broken: LessonV2 = {
      title: "Mol kavramı",
      sections: [
        {
          heading: "Mol",
          body: "Bu sayı atom veya molekül sayısını ifade eder. Böylece tanecik sayısını hesaplamak kolaylaşır.",
        },
      ],
    };
    const published = publishCoherentLesson(broken, CHEM_SOURCE, "Mol kavramı");
    expect(published.sections.length).toBeGreaterThan(0);
    expect(Array.isArray(coherenceFailures(published))).toBe(true);
    const quiz = chemQuiz();
    const settled = settleRejectedLesson(JSON.stringify(quiz), [
      "Kaynakta olmayan sayı: '24,5 g' kaynakta yok.",
    ]);
    expect(settled.accepted).toBe(false);
    expect(parseQuizQuestions(JSON.parse(settled.content))).not.toBeNull();
    publishQuiz(quiz);
  });
});
