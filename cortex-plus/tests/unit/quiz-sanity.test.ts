import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { applyQuizSanity, quizSanitySystem, quizSanityUserPrompt, runQuizSanity } from "@/lib/learning/quiz-sanity";

const { teacherQuizLoop } = await import("@/lib/learning/teacher-quiz-run");

/*
  30 Ekim 2026, ürün sahibinin kararı: test üretiminde kalıpları kodla kovalamak yerine taslaktan hemen sonra tek
  hızlı doğrulayıcı çağrısı. Canlıda Muhasebe testinde "Reeskont maliyeti" diye uydurma bir terim ve "hangi maliyet?"
  sorusunda faiz oranı şıkkı çıkmıştı. Doğrulayıcı soru silmez; yalnız şıkları ve anahtarı düzeltir, süre aşılırsa
  taslak aynen kalır. Örnekler farklı derslerden: kural ders bağımsız.
*/

const why = (options: string[]) => options.map((option) => `${option} için kısa ve kendine özgü bir gerekçe.`);
const question = (text: string, options: string[], correct: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  text,
  options,
  correct: [correct],
  multi: false,
  explanation: "Doğru cevabın nedeni kısaca anlatılır.",
  optionWhy: why(options),
  ...extra,
});

const COST = question(
  "Satılan malın alış bedeli ve ona eklenen giderler hangi maliyettir?",
  ["Satılan malın maliyeti", "Reeskont maliyeti", "Dönem gideri", "Politika faizi"],
  "Satılan malın maliyeti",
  { optionReasons: { "Reeskont maliyeti": "eski gerekçe" } },
);
const MITOSIS = question(
  "Kromozomların hücrenin ortasında dizildiği evre hangisidir?",
  ["Profaz", "Metafaz", "Anafaz", "Telofaz"],
  "Profaz",
  { steps: ["Eski çözüm adımı profazı gösteriyordu."] },
);
const LAW = question(
  "Temyiz incelemesini hangi mahkeme yapar?",
  ["Yargıtay", "Asliye hukuk mahkemesi", "Sulh ceza hâkimliği", "Bölge adliye mahkemesi"],
  "Yargıtay",
);
const draft = [COST, MITOSIS, LAW];

const costPatch = {
  index: 0,
  options: ["Satılan malın maliyeti", "Üretim maliyeti", "Dönem gideri", "Fırsat maliyeti"],
  correct: "Satılan malın maliyeti",
  optionWhy: why(["Satılan malın maliyeti", "Üretim maliyeti", "Dönem gideri", "Fırsat maliyeti"]),
  explanation: "Alış bedeli ve alışa yüklenen giderler satılan malın maliyetini oluşturur.",
  why: "Uydurma terim ve faiz oranı maliyet türüyle değiştirildi.",
};
const mitosisPatch = {
  index: 1,
  options: MITOSIS.options,
  correct: "Metafaz",
  optionWhy: why(MITOSIS.options),
  explanation: "Kromozomlar metafazda ekvator düzleminde dizilir.",
  why: "Anahtar yanlıştı.",
};

describe("hafif test doğrulayıcısı: yamaları uygular, soru silmez", () => {
  it("uydurma terim ve türü uymayan şık değişir; kök, sıra ve soru sayısı aynı kalır", () => {
    const result = applyQuizSanity(draft, { patches: [costPatch] });
    expect(result.questions).toHaveLength(3);
    expect(result.questions.map((item) => item.text)).toEqual(draft.map((item) => item.text));
    expect(result.questions[0].options).toEqual(costPatch.options);
    expect(result.questions[0].options).not.toContain("Reeskont maliyeti");
    expect(result.questions[0].correct).toEqual(["Satılan malın maliyeti"]);
    // Şık açıklamaları yamayla birlikte gelir; eski şıkka bağlı gerekçe kalmaz.
    expect(result.questions[0].optionWhy).toEqual(costPatch.optionWhy);
    expect(result.questions[0].optionReasons).toBeUndefined();
    expect(result.questions[1]).toBe(MITOSIS);
    expect(result.questions[2]).toBe(LAW);
    expect(result).toMatchObject({ patched: 1, keyChanged: 0, rejected: 0 });
    expect(result.reasons).toEqual([costPatch.why]);
  });

  it("çözüp anahtarı düzeltir; eski çözüm adımları yeni anahtarla çelişmesin diye düşer", () => {
    const result = applyQuizSanity(draft, { patches: [mitosisPatch] });
    expect(result.questions[1].correct).toEqual(["Metafaz"]);
    expect(result.questions[1].steps).toBeUndefined();
    expect(result.questions[1].explanation).toBe(mitosisPatch.explanation);
    expect(result).toMatchObject({ patched: 1, keyChanged: 1, rejected: 0 });
  });

  it("anahtar yerinde kalırsa çözüm adımları korunur", () => {
    const keep = { ...mitosisPatch, correct: "Profaz", explanation: "Kromozomların yoğunlaştığı evre profazdır." };
    const result = applyQuizSanity(draft, { patches: [keep] });
    expect(result.questions[1].steps).toEqual(MITOSIS.steps);
    expect(result.keyChanged).toBe(0);
  });

  it("eksik ya da tutarsız yama alınmaz, soru taslaktaki hâliyle kalır", () => {
    const broken = [
      { ...costPatch, options: costPatch.options.slice(0, 3), optionWhy: costPatch.optionWhy.slice(0, 3) },
      { ...costPatch, index: 2, options: ["Yargıtay", "yargıtay.", "Danıştay", "Sayıştay"], correct: "Yargıtay" },
      { ...mitosisPatch, correct: "Interfaz" },
      { ...mitosisPatch, optionWhy: why(["Profaz", "Metafaz"]) },
      { ...mitosisPatch, explanation: "" },
      { ...mitosisPatch, correct: ["Metafaz", "Anafaz"] },
      { ...costPatch, index: 7 },
      { ...costPatch, index: "0" },
      { ...costPatch, options: ["", "Üretim maliyeti", "Dönem gideri", "Fırsat maliyeti"] },
    ];
    const result = applyQuizSanity(draft, { patches: broken });
    expect(result.questions).toEqual(draft);
    expect(result).toMatchObject({ patched: 0, keyChanged: 0, rejected: broken.length });
  });

  it("aynı soruya ikinci yama alınmaz; çok cevaplı soruda birden çok doğru kabul edilir", () => {
    const multi = question("Hangileri yargı organıdır?", ["Yargıtay", "Danıştay", "TBMM", "Cumhurbaşkanı"], "Yargıtay", {
      multi: true,
      correct: ["Yargıtay"],
    });
    const patch = {
      index: 0,
      options: multi.options,
      correct: ["Yargıtay", "Danıştay"],
      optionWhy: why(multi.options),
      explanation: "Yargıtay ve Danıştay yüksek yargı organlarıdır.",
    };
    const result = applyQuizSanity([multi], { patches: [patch, { ...patch, correct: ["TBMM"] }] });
    expect(result.questions[0].correct).toEqual(["Yargıtay", "Danıştay"]);
    expect(result).toMatchObject({ patched: 1, keyChanged: 1, rejected: 1 });
  });

  it("okunamayan cevap hiçbir şeyi değiştirmez", () => {
    for (const raw of [null, {}, { patches: "yok" }, { patches: [null] }, "metin"]) {
      expect(applyQuizSanity(draft, raw).questions).toEqual(draft);
    }
  });
});

describe("hafif test doğrulayıcısı: tek çağrı, süre tavanı", () => {
  const input = { mode: "document" as const, topicLabel: "Maliyet Muhasebesi", source: "Satılan malın maliyeti …", questions: draft };

  it("tek çağrı yapar; istem üç işi ve aynı tür çeldirici kuralını taşır", async () => {
    const ask = vi.fn(async () => ({ patches: [costPatch] }));
    const result = await runQuizSanity(ask, input);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.patched).toBe(1);
    expect(result.timedOut).toBe(false);
    const [system, user] = ask.mock.calls[0] as unknown as [string, string];
    expect(system).toContain("SİLMEZSİN");
    expect(system).toContain("UYDURMA TERİM");
    expect(system).toContain("ŞIK TÜRÜ");
    expect(system).toContain("ANAHTAR");
    expect(user).toContain("KAYNAK:");
    expect(user).toContain("Reeskont maliyeti");
  });

  it("belgesiz konuda kaynak yerine konu bilgisi istenir", () => {
    expect(quizSanityUserPrompt({ ...input, mode: "topic" })).not.toContain("KAYNAK:");
    expect(quizSanitySystem("topic")).toContain("ders kitaplarında");
  });

  it("süre aşılırsa taslak aynen döner", async () => {
    const ask = vi.fn(() => new Promise<unknown>(() => undefined));
    const result = await runQuizSanity(ask, input, 20);
    expect(result.timedOut).toBe(true);
    expect(result.questions).toEqual(draft);
    expect(result.patched).toBe(0);
  });

  it("çağrı düşerse taslak aynen döner; boş testte çağrı yapılmaz", async () => {
    const failed = await runQuizSanity(vi.fn(async () => Promise.reject(new Error("429"))), input);
    expect(failed.questions).toEqual(draft);
    const ask = vi.fn(async () => ({ patches: [] }));
    await runQuizSanity(ask, { ...input, questions: [] });
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("test motoru doğrulayıcıyı taslaktan sonra bir kez koşar", () => {
  const raw = (text: string, options: string[], correct: string) => ({
    text,
    options,
    correct,
    multi: false,
    explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
    optionWhy: why(options),
    misconceptionTag: "evre karışıklığı",
    learningObjective: "Mitoz evrelerini ayırt eder.",
  });
  const PHASES = ["Profaz", "Metafaz", "Anafaz", "Telofaz"];
  const draftQuestions = [
    raw("Kromozomların ekvatorda dizildiği evre hangisidir?", PHASES, "Profaz"),
    raw("Kardeş kromatitlerin kutuplara çekildiği evre hangisidir?", PHASES, "Anafaz"),
    raw("Çekirdek zarının yeniden oluştuğu evre hangisidir?", PHASES, "Telofaz"),
    raw("Kromozomların yoğunlaşmaya başladığı evre hangisidir?", PHASES, "Profaz"),
    raw("İğ ipliklerinin sentromere bağlandığı evre hangisidir?", PHASES, "Metafaz"),
    raw("Sitokinezin başladığı evre hangisidir?", PHASES, "Telofaz"),
  ];
  const loopInput = {
    topicLabel: "Mitoz Bölünme",
    prepTitle: "YKS Biyoloji",
    pages: [{ page: 12, text: "Profaz, metafaz, anafaz, telofaz. Metafazda kromozomlar ekvatorda dizilir." }],
    count: 5,
    optionCount: 4 as const,
  };

  it("anahtarı düzeltilen soru öğrenciye düzeltilmiş hâliyle gider", async () => {
    const roles: string[] = [];
    const ask = vi.fn(async (system: string, _user: string, role?: string) => {
      roles.push(role ?? "");
      if (system.startsWith("Sen hızlı bir test editörü")) {
        return {
          patches: [
            {
              index: 0,
              options: PHASES,
              correct: "Metafaz",
              optionWhy: why(PHASES),
              explanation: "Kromozomlar metafazda ekvator düzleminde dizilir.",
              why: "Anahtar yanlıştı.",
            },
          ],
        };
      }
      if (system.includes("anahtarı görmeden")) return { solved: [] };
      return { questions: draftQuestions };
    });
    const loop = await teacherQuizLoop(ask, loopInput);
    const sanityCalls = ask.mock.calls.filter(([system]) => system.startsWith("Sen hızlı bir test editörü"));
    expect(sanityCalls).toHaveLength(1);
    expect(roles[0]).toBe("draft");
    expect(roles[1]).toBe("fix");
    const fixed = loop.questions.find((item) => item.text === draftQuestions[0].text);
    expect(fixed?.correct).toEqual(["Metafaz"]);
    expect(loop.questions).toHaveLength(5);
  });

  it("sanity: false yalnız taslak çağrısı yapar", async () => {
    const systems: string[] = [];
    const ask = vi.fn(async (system: string) => {
      systems.push(system);
      return { questions: draftQuestions };
    });
    await teacherQuizLoop(ask, { ...loopInput, sanity: false });
    expect(systems.filter((system) => system.startsWith("Sen hızlı bir test editörü"))).toHaveLength(0);
    expect(systems.length).toBeGreaterThan(0);
  });
});
