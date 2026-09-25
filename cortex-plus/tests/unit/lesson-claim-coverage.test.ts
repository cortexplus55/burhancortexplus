import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import {
  claimsFromVerify,
  checklistConcepts,
  conceptInText,
  scoreLessonChecks,
  selectPagesForTitle,
  summaryQuantityMismatch,
  titleConcepts,
} from "@/lib/learning/lesson-claims";
import {
  auditLearnerLesson,
  exampleIsComplete,
  repairLearnerLesson,
  restatedResult,
} from "@/lib/learning/lesson-repair";
import { widenSourcePages } from "@/lib/learning/source-context";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const TOPIC = "İç Enerji, Entalpi ve Özgül Isılar";

const SOURCE = [
  "Kapalı sistemde kinetik ve potansiyel enerji ihmal edilirse iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
  "Isı alımı iç enerjiyi artırır ve ısı kaybı azaltır; işin işareti sistemin yaptığı işe ya da sisteme yapılan işe göre değişir.",
  "Rijit bir tank 30 kJ ısı alır ve iş etkileşimi yoktur; ΔU = Q − W = 30 kJ − 0 = 30 kJ olur.",
  "Entalpi, iç enerji ile akış işinin toplamıdır ve h = u + Pv bağıntısıyla yazılır.",
  "İdeal gaz için iç enerji değişimi Δu = c_v ΔT bağıntısıyla bulunur.",
  "İdeal gaz için entalpi değişimi Δh = c_p ΔT bağıntısıyla bulunur.",
  "Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.",
  "Sıvı ve katılarda özgül ısı için c_p yaklaşık c_v değerine eşittir.",
].join(" ");

const LIVE_CORRECTION =
  "Sadece iş yapımı veya ısı kaybı iç enerjiyi etkiler; her durumda değişim belirtilmelidir.";

function check(prompt: string, explanation: string): LessonV2["sections"][number]["check"] {
  return {
    type: "trueFalse",
    prompt,
    options: ["Doğru", "Yanlış"],
    answerIndex: 0,
    explanation,
  };
}

function energyLesson(): LessonV2 {
  return {
    title: TOPIC,
    overview: "Kapalı sistemde iç enerji değişimi ısı ve iş ile belirlenir.",
    sections: [
      {
        heading: "Enerji dengesi",
        body:
          "Kapalı sistemde toplam enerji E = U + KE + PE bağıntısıyla yazılır. " +
          "Bir sistemde ısı alındığında veya iş yapıldığında iç enerji değişir. " +
          "İç enerji bu durumda artış gösterir. " +
          "Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa, ΔU = 30 kJ olur.",
        check: check(
          "Kapalı sistemde toplam enerji iç enerji ile kinetik ve potansiyel enerjinin toplamıdır.",
          "Toplam enerji E = U + KE + PE bağıntısıyla yazılır.",
        ),
      },
      {
        heading: "Birinci yasa",
        body: "Kinetik ve potansiyel enerji ihmal edilince iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
        check: check(
          "Kinetik ve potansiyel enerji ihmal edilince iç enerji değişimi ΔU = Q − W bağıntısıdır.",
          "Kapalı sistemde iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
        ),
      },
      {
        heading: "Rijit tank",
        body: "Rijit bir tankta sınır hareket etmediği için iş etkileşimi sıfır kabul edilir.",
        check: check(
          "Rijit bir tankta sınır hareket etmiyorsa iş etkileşimi sıfırdır.",
          "Rijit tankta sınır hareket etmediği için iş etkileşimi sıfırdır.",
        ),
      },
    ],
    example: {
      prompt: "Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa iç enerji değişimi nedir?",
      solution: "Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa, ΔU = 30 kJ olur.",
    },
    commonMistake: {
      claim: "Isı kaybı her zaman iç enerjiyi azaltır.",
      correction: LIVE_CORRECTION,
    },
    summary: [
      "Soru: KE ve PE ihmal edilen kapalı sistemde ana denklem?: Cevap: ΔU=Q-W",
      "Rijit bir tank 25 kJ ısı alıyor ve başka iş etkileşimi yok: W=0 olduğundan ΔU=25 kJ",
      "Kapalı sistemde iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
    ],
  };
}

const goodPatch = {
  sections: [
    {
      index: 0,
      body:
        "Kapalı sistemde toplam enerji E = U + KE + PE bağıntısıyla yazılır. " +
        "İç enerji değişimini ısı ve iş birlikte belirler.",
    },
  ],
  addedSections: [
    {
      heading: "Entalpi ve özgül ısı",
      body:
        "Entalpi h = u + Pv bağıntısıyla yazılır. İdeal gazda özgül ısılar Δu = c_v ΔT ve Δh = c_p ΔT bağıntılarıyla bulunur. " +
        "Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.",
      check: check(
        "Entalpi iç enerji ile akış işinin toplamı mıdır?",
        "Entalpi h = u + Pv bağıntısıyla yazılır.",
      ),
    },
  ],
  example: {
    prompt: "Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa iç enerji değişimi nedir?",
    solution: "Veri: Q = 30 kJ ve W = 0. ΔU = Q − W = 30 kJ − 0 = 30 kJ olur.",
  },
  summary: [
    "Kapalı sistemde iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
    "Entalpi h = u + Pv bağıntısıyla yazılır.",
    "İdeal gazda özgül ısılar Δu = c_v ΔT ve Δh = c_p ΔT bağıntılarıyla bulunur.",
    "Rijit bir tank 30 kJ ısı alır ve iş yoksa ΔU = Q − W = 30 kJ − 0 = 30 kJ olur.",
  ],
  commonMistake: {
    claim: "Isı kaybı her zaman iç enerjiyi azaltır.",
    correction:
      "İç enerji değişimini ısı ile iş birlikte belirler ve bağıntı ΔU = Q − W şeklindedir. Isı alımı iç enerjiyi artırır.",
  },
};

describe("iç enerji lesson claims", () => {
  it("splits the live title and ignores the generic word kavramları", () => {
    expect(titleConcepts(TOPIC)).toEqual(["İç Enerji", "Entalpi", "Özgül Isılar"]);
    expect(titleConcepts("Basınç ve Sıcaklık Kavramları")).toEqual(["Basınç", "Sıcaklık"]);
    expect(conceptInText("Özgül Isılar", "özgül ısı c_p ile yazılır")).toBe(true);
  });

  it("keeps basınç on its mapped page and widens iç enerji onto the enthalpy page", () => {
    const pressure = selectPagesForTitle("Basınç ve Sıcaklık Kavramları", [3], [
      { pageNumber: 3, text: "Basınç yüzeye uygulanır. Sıcaklık termometre ile okunur." },
      { pageNumber: 9, text: "Kavramları burada listelenir." },
    ]);
    expect(pressure).toEqual([3]);

    const energy = selectPagesForTitle(TOPIC, [4], [
      { pageNumber: 4, text: "Kapalı sistemde ΔU = Q − W yazılır. Rijit tank 30 kJ ısı alır." },
      { pageNumber: 8, text: "Entalpi h = u + Pv. Özgül ısılar c_p ve c_v olarak tanımlanır." },
    ]);
    expect(energy).toEqual([4, 8]);
  });

  it("flags the live correction, the unsigned sentences, the flashcard summary and the 25 kJ line", () => {
    expect(summaryLineProblem("Soru: KE ve PE ihmal edilen kapalı sistemde ana denklem?: Cevap: ΔU=Q-W")).toBe(
      "flashcard",
    );
    expect(summaryLineProblem("P_mutlak = P_atm - P_vakum")).toBeNull();
    expect(summaryLineProblem("Mutlak basınç, gösterge basıncına atmosfer eklenince bulunur: P = F/A.")).toBeNull();
    expect(
      summaryQuantityMismatch(
        "Rijit bir tank 25 kJ ısı alıyor ve başka iş etkileşimi yok: W=0 olduğundan ΔU=25 kJ",
        "30 kJ",
        SOURCE,
      ),
    ).toBe(true);
    expect(summaryQuantityMismatch("Rijit tank 30 kJ ısı alır.", "30 kJ", SOURCE)).toBe(false);
    expect(
      exampleIsComplete("Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa, ΔU = 30 kJ olur."),
    ).toBe(false);
    expect(restatedResult("Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa, ΔU = 30 kJ olur.")).toBe(
      true,
    );
    expect(restatedResult("25 °C = 298 K olarak da okunur.")).toBe(false);
    expect(exampleIsComplete("P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa.")).toBe(true);
    expect(exampleIsComplete("Veri: Q = 30 kJ ve W = 0. ΔU = Q − W = 30 kJ − 0 = 30 kJ olur.")).toBe(true);

    const codes = auditLearnerLesson(energyLesson(), { source: SOURCE, topicLabel: TOPIC }).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("claim_wrong");
    expect(codes).toContain("coverage_gap");
    expect(codes).toContain("example_incomplete");
    expect(codes).toContain("summary_weak");
  });

  it("does not demand enthalpy when the mapped source never mentions it", () => {
    const thin = "Kapalı sistemde iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır. Isı ve iş birlikte değerlendirilir.";
    const codes = auditLearnerLesson(energyLesson(), { source: thin, topicLabel: TOPIC }).map((issue) => issue.detail);
    expect(codes).not.toContain("Entalpi");
    expect(codes).not.toContain("Özgül Isılar");
  });

  it("drops the wrong correction and the 25 kJ flashcard when repair fails", async () => {
    const verify = vi.fn(async () => ({
      bad: [
        { quote: "Isı kaybı her zaman iç enerjiyi azaltır.", reason: "wrong" },
        { quote: LIVE_CORRECTION, reason: "wrong" },
      ],
    }));
    const complete = vi.fn<(prompt: string) => Promise<unknown>>(async () => null);
    const result = await repairLearnerLesson(
      energyLesson(),
      { source: SOURCE, topicLabel: TOPIC },
      complete,
      verify,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(String(complete.mock.calls[0][0])).toMatch(/^Yalnızca bozuk parçaları/);
    const published = JSON.stringify(result.lesson);
    expect(result.lesson.commonMistake).toBeUndefined();
    expect(published).not.toMatch(/Soru:/);
    expect(published).not.toMatch(/Cevap:/);
    expect(published).not.toMatch(/25 kJ/);
    expect(published).not.toMatch(/iş yapıldığında iç enerji değişir/);
    expect(published).not.toMatch(/artış gösterir/);
    expect(result.lesson.example).toBeUndefined();
    expect(result.dropped).toContain("claim_wrong");
    expect(published).toMatch(/entalpi/i);
    expect(published).toMatch(/özgül ısı/i);
    expect(result.dropped).not.toContain("coverage_gap");
    expect(claimsFromVerify({ bad: [{ quote: "Isı kaybı her zaman iç enerjiyi azaltır.", reason: "wrong" }] }, energyLesson())).toEqual(
      [],
    );
  });

  it("repairs the correction, the substitution and the missing concepts in one call", async () => {
    const verify = vi.fn(async () => ({ bad: [{ quote: LIVE_CORRECTION, reason: "wrong" }] }));
    const complete = vi.fn(async () => goodPatch);
    const result = await repairLearnerLesson(
      energyLesson(),
      { source: SOURCE, topicLabel: TOPIC },
      complete,
      verify,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.lesson.commonMistake?.correction).toMatch(/ΔU = Q − W/);
    expect(result.lesson.commonMistake?.correction).toMatch(/Isı alımı/);
    expect(result.lesson.example?.solution).toMatch(/30 kJ − 0 = 30 kJ/);
    const body = result.lesson.sections.map((section) => section.body).join(" ");
    expect(body).toMatch(/entalpi/i);
    expect(body).toMatch(/özgül ısı/i);
    expect(result.lesson.summary?.join(" ")).not.toMatch(/Soru:|25 kJ|\?:/);
    expect(result.succeeded).toContain("claim_wrong");
    expect(result.dropped).not.toContain("coverage_gap");
  });

  it("still runs one fact check when the lesson is already clean", async () => {
    const lesson = energyLesson();
    lesson.sections[0].body =
      "Kapalı sistemde toplam enerji E = U + KE + PE bağıntısıyla yazılır. Entalpi h = u + Pv bağıntısıyla yazılır. Özgül ısılar Δu = c_v ΔT bağıntısıyla bulunur. Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.";
    lesson.example = {
      prompt: "Rijit bir tank 30 kJ ısı alıyorsa ve iş etkileşimi yoksa iç enerji değişimi nedir?",
      solution: "Veri: Q = 30 kJ ve W = 0. ΔU = Q − W = 30 kJ − 0 = 30 kJ olur.",
    };
    delete lesson.commonMistake;
    lesson.summary = [
      "Kapalı sistemde iç enerji değişimi ΔU = Q − W bağıntısıyla yazılır.",
      "Entalpi h = u + Pv bağıntısıyla yazılır.",
      "Özgül ısılar Δu = c_v ΔT bağıntısıyla bulunur ve c_p − c_v = R eşitliği yazılır.",
    ];
    const verify = vi.fn(async () => ({ bad: [] }));
    const complete = vi.fn(async () => goodPatch);
    const result = await repairLearnerLesson(lesson, { source: SOURCE, topicLabel: TOPIC }, complete, verify);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(result.requested).toEqual([]);
    expect(typeof result.verifyMs).toBe("number");
  });

  it("drops a source-contradicting claim that every regex gate missed", async () => {
    const topicLabel = "İzokorik süreç";
    const wrong = "İzokorik süreçte hareketli sınır işi pozitiftir.";
    const source = [
      "İzokorik süreçte hacim sabittir ve hareketli sınır işi sıfırdır.",
      "İzokorik süreçte elektrik veya karıştırıcı işi olabilir.",
      "Sabit hacimde enerji değişimi ΔU = m c_v ΔT bağıntısıyla yazılır.",
      "1 kg hava 300 K değerinden 400 K değerine çıkar ve ΔU = 1 × 0.718 × (400 − 300) = 71.8 kJ olur.",
      "Kompresör verimi bu sayfanın dışında kalır ve derse girmez.",
    ].join(" ");
    const lesson: LessonV2 = {
      title: topicLabel,
      overview: "İzokorik süreçte hacim sabittir ve hareketli sınır işi sıfırdır.",
      sections: [
        {
          heading: "Sınır işi",
          body: `İzokorik süreçte hacim sabittir ve hareketli sınır işi sıfırdır. ${wrong}`,
          check: check(
            "İzokorik süreçte hareketli sınır işi sıfır mıdır?",
            "Hacim sabit olduğu için hareketli sınır işi sıfırdır.",
          ),
        },
        {
          heading: "Enerji değişimi",
          body: "Sabit hacimde enerji değişimi ΔU = m c_v ΔT bağıntısıyla yazılır.",
          check: check(
            "Sabit hacimde enerji değişimi hangi bağıntıyla yazılır?",
            "Enerji değişimi ΔU = m c_v ΔT bağıntısıyla yazılır.",
          ),
        },
        {
          heading: "Diğer işler",
          body: "İzokorik süreçte elektrik veya karıştırıcı işi olabilir.",
          check: check(
            "İzokorik süreçte elektrik işi olabilir mi?",
            "Elektrik veya karıştırıcı işi hacim sabitken de olabilir.",
          ),
        },
      ],
      example: {
        prompt: "1 kg hava 300 K değerinden 400 K değerine çıkarsa enerji değişimi nedir?",
        solution: "ΔU = m c_v ΔT = 1 × 0.718 × (400 − 300) = 71.8 kJ",
      },
      summary: [
        "İzokorik süreçte hacim sabittir ve hareketli sınır işi sıfırdır.",
        "İzokorik süreçte elektrik veya karıştırıcı işi olabilir.",
        "Sabit hacimde enerji değişimi ΔU = m c_v ΔT bağıntısıyla yazılır.",
      ],
    };
    const input = { source, topicLabel };
    expect(auditLearnerLesson(lesson, input).map((issue) => issue.code)).not.toContain("claim_wrong");

    const cleanVerify = vi.fn(async () => ({ bad: [] }));
    const untouched = await repairLearnerLesson(lesson, input, async () => null, cleanVerify);
    expect(cleanVerify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(untouched.lesson)).toContain(wrong);

    const verify = vi.fn(async (_prompt: string) => ({ bad: [{ quote: wrong, reason: "wrong" }] }));
    const complete = vi.fn(async () => null);
    const result = await repairLearnerLesson(lesson, input, complete, verify);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.requested).toContain("claim_wrong");
    const published = JSON.stringify(result.lesson);
    expect(published).not.toContain("hareketli sınır işi pozitiftir");
    expect(published).toContain("hareketli sınır işi sıfırdır");
    const prompt = String(verify.mock.calls[0]?.[0] ?? "");
    expect(prompt).toContain("hareketli sınır işi sıfırdır");
    expect(prompt).not.toContain("Kompresör verimi");
  });
});

describe("lesson score and result layout", () => {
  it("counts every original check and keeps the retry out of the score", () => {
    const lesson = {
      sections: [{ check: { prompt: "a" } }, { check: { prompt: "b" } }, { check: { prompt: "c" } }, {}],
    };
    expect(scoreLessonChecks(lesson, { lessonMisses: [0] })).toEqual({ score: 2, total: 3, retried: 1 });
    expect(scoreLessonChecks(lesson, { lessonMisses: [0, 0, 2] })).toEqual({ score: 1, total: 3, retried: 2 });
    expect(scoreLessonChecks({ sections: [{}] }, {})).toEqual({
      score: 1,
      total: 1,
      retried: 0,
    });
  });

  it("reads a teacher checklist concept that the source actually contains", () => {
    const note = [
      "Kapsam listesi — bu derste hepsi geçecek:",
      "- (core) concept: özgül ısı",
      "Başka satır",
    ].join("\n");
    expect(checklistConcepts(note)).toEqual(["özgül ısı"]);
  });

  it("centers the finished lesson card", () => {
    const css = readFileSync(resolve(__dirname, "../../src/styles/parity-shell.css"), "utf8");
    const block = css.slice(css.indexOf(".cp-exam-node-result {"), css.indexOf(".cp-exam-node-actions {"));
    expect(block).toMatch(/margin:\s*1\.5rem auto/);
    expect(block).toMatch(/text-align:\s*center/);
    expect(block).toMatch(/align-items:\s*center/);
    expect(css).toMatch(/justify-content:\s*safe center/);
    expect(css).toMatch(/@media \(max-width: 420px\) \{[\s\S]*\.cp-exam-node-result/);
  });
});

describe("widenSourcePages", () => {
  it("adds the page that contains the missing title concept", async () => {
    const pages = [
      { page_number: 4, text_content: "Kapalı sistemde ΔU = Q − W yazılır." },
      { page_number: 8, text_content: "Entalpi h = u + Pv bağıntısıyla yazılır. Özgül ısı c_p burada tanımlanır." },
    ];
    const service = {
      from: () => {
        const filters: { field?: string; value?: string } = {};
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.in = () => Promise.resolve({ data: [pages[0]], error: null });
        builder.ilike = (_field: string, pattern: string) => {
          filters.value = pattern;
          return builder;
        };
        builder.limit = () => {
          const needle = (filters.value ?? "").replace(/%/g, "").toLocaleLowerCase("tr");
          const hits = pages.filter((page) => page.text_content.toLocaleLowerCase("tr").includes(needle));
          return Promise.resolve({ data: hits.slice(0, 2), error: null });
        };
        return builder;
      },
    };
    const widened = await widenSourcePages(
      service as never,
      "doc",
      TOPIC,
      [4],
      "Kapalı sistemde ΔU = Q − W yazılır.",
    );
    expect(widened).toEqual([4, 8]);
  });

  it("keeps the mapped pages when the page search is unavailable", async () => {
    const service = {
      from: () => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        return builder;
      },
    };
    await expect(
      widenSourcePages(service as never, "doc", "Basınç ve Sıcaklık Kavramları", [3], "Basınç yüzeye uygulanır."),
    ).resolves.toEqual([3]);
  });
});
