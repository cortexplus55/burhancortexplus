import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyOrder,
  balanceExamDrafts,
  balanceQuizQuestions,
  orderSensitive,
  planBalancedOrders,
  poolChoiceOrders,
  singleLetter,
} from "@/lib/learning/option-balance";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { decodeOrder, encodeOrder, toLevelItem } from "@/lib/level-check/store";
import { mapPoolRows } from "@/lib/content-pool/serve";

/**
 * Paket 2 (6 Kasım 2026) — sınav düzeyinde dengeli şık dağılımı. Canlı havuz denemesinde 10 sorunun doğru şık yeri
 * 1,1,1,1,0,0,1,0,0,0 idi (hepsi A ya da B). Örnekler farklı derslerden; üretim kodunda ders sözcüğü yok.
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function maxRun(letters: readonly (number | null)[]): number {
  let best = 0;
  let run = 0;
  let last: number | null = null;
  for (const letter of letters) {
    run = letter !== null && letter === last ? run + 1 : 1;
    last = letter;
    best = Math.max(best, run);
  }
  return best;
}

function counts(letters: readonly number[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const letter of letters) out[letter] += 1;
  return out;
}

const HISTORY_OPTIONS = ["Lozan", "Sevr", "Mondros", "Mudanya", "Ankara"];

function quiz(index: number, correctAt = 0, size = 5): QuizQuestion {
  const options = Array.from({ length: size }, (_, i) => `${HISTORY_OPTIONS[i % 5]} seçeneği ${index}-${i}`);
  return { text: `Tarih sorusu ${index}: hangi antlaşma bu maddeyi içerir?`, options, correct: [options[correctAt]!], multi: false };
}

describe("dengeli şık karıştırıcı", () => {
  it("canlı havuz denemesinin dizisi (hepsi A/B) dengeli dağılır, ardışık üç aynı harf yok", () => {
    const live = [1, 1, 1, 1, 0, 0, 1, 0, 0, 0];
    const items = live.map((answer, i) => ({
      id: `item-${i}`,
      choices: ["birinci", "ikinci", "üçüncü", "dördüncü", "beşinci"].map((c) => `${c} ${i}`),
      answer,
    }));
    const orders = poolChoiceOrders(items, "deneme-1");
    const letters = items.map((item, i) => {
      const shown = applyOrder(item.choices, orders[i]!);
      return shown.indexOf(item.choices[item.answer]!);
    });
    expect(Math.max(...counts(letters))).toBe(2);
    expect(Math.min(...counts(letters))).toBe(2);
    expect(maxRun(letters)).toBeLessThan(3);
    // Deterministik: aynı girdi aynı sıra.
    expect(poolChoiceOrders(items, "deneme-1")).toEqual(orders);
  });

  it("4 şıklı testte her harf eşit, şık metinleri ve doğru cevap korunur", () => {
    const questions = Array.from({ length: 8 }, (_, i) => quiz(i, 0, 4));
    const balanced = balanceQuizQuestions(questions);
    const letters = balanced.map((q) => singleLetter(q.options, q.correct)!);
    expect(counts(letters).slice(0, 4)).toEqual([2, 2, 2, 2]);
    expect(maxRun(letters)).toBeLessThan(3);
    balanced.forEach((q, i) => {
      expect([...q.options].sort()).toEqual([...questions[i]!.options].sort());
      expect(q.correct).toEqual(questions[i]!.correct);
      expect(q.options).toContain(q.correct[0]);
    });
  });

  it("her önekte harf sayıları en çok bir farklı (5 şıklı, 23 soru)", () => {
    const balanced = balanceQuizQuestions(Array.from({ length: 23 }, (_, i) => quiz(i, i % 2)));
    const letters = balanced.map((q) => singleLetter(q.options, q.correct)!);
    for (let n = 1; n <= letters.length; n += 1) {
      const c = counts(letters.slice(0, n));
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
    }
    expect(maxRun(letters)).toBeLessThan(3);
  });

  it("4 ve 5 şıklı karışık test de desteklenir", () => {
    const questions = Array.from({ length: 12 }, (_, i) => quiz(i, 0, i % 2 ? 4 : 5));
    const letters = balanceQuizQuestions(questions).map((q) => singleLetter(q.options, q.correct)!);
    expect(maxRun(letters)).toBeLessThan(3);
    expect(Math.max(...counts(letters))).toBeLessThanOrEqual(3);
  });

  it("çok cevaplı soruda doğru şık metinleri aynı, sıra deterministik", () => {
    const options = ["Mitokondri", "Ribozom", "Lizozom", "Golgi", "Koful"];
    const multi: QuizQuestion = { text: "Hangileri zarlı organeldir?", options, correct: ["Mitokondri", "Lizozom", "Golgi"], multi: true };
    const [out] = balanceQuizQuestions([multi]);
    expect([...out!.options].sort()).toEqual([...options].sort());
    expect(out!.correct).toEqual(multi.correct);
    expect(balanceQuizQuestions([multi])[0]!.options).toEqual(out!.options);
  });

  it("şık açıklaması (optionWhy) şıkla birlikte taşınır", () => {
    const options = ["Enflasyon", "Deflasyon", "Stagflasyon", "Dezenflasyon", "Hiperenflasyon"];
    const why = options.map((o) => `${o} gerekçesi`);
    const q: QuizQuestion = { text: "Fiyatlar genel düzeyinin sürekli artışı hangisidir?", options, correct: ["Enflasyon"], multi: false, optionWhy: why };
    const third = balanceQuizQuestions([quiz(90, 0), quiz(91, 0), q])[2]!;
    third.options.forEach((option, i) => expect(third.optionWhy?.[i]).toBe(`${option} gerekçesi`));
  });

  it("öncül kümesi ve harf atıflı açıklama karıştırılmaz", () => {
    expect(orderSensitive(["Yalnız I", "I ve II", "I ve III", "II ve III", "I, II ve III"])).toBe(true);
    expect(orderSensitive(["a", "b", "Hepsi"])).toBe(true);
    expect(orderSensitive(["x", "y"], ["B seçeneğinde yazım yanlışı vardır."])).toBe(true);
    // "A kümesi" gibi içerik adı şık atfı değildir.
    expect(orderSensitive(["{1,2}", "{3}"], ["A kümesinin elemanları yazılır."])).toBe(false);
    const roman: QuizQuestion = {
      text: "Hangileri doğrudur?",
      options: ["Yalnız I", "I ve II", "I ve III", "II ve III", "I, II ve III"],
      correct: ["Yalnız I"],
      multi: false,
    };
    expect(balanceQuizQuestions([roman])[0]!.options).toEqual(roman.options);
  });

  it("gösterilmiş önek yerinde kalır; parça parça dengeleme bütün dengelemeyle aynı", () => {
    const questions = Array.from({ length: 7 }, (_, i) => quiz(i, 0));
    const whole = balanceQuizQuestions(questions);
    // Akan test: önce ilk 4 soru, sonra kalanı gösterilenlerin harfleriyle.
    const head = balanceQuizQuestions(questions.slice(0, 4));
    const streamed = balanceQuizQuestions([...head, ...questions.slice(4)], 4);
    expect(streamed.slice(0, 4)).toEqual(head);
    expect(streamed).toEqual(whole);
  });

  it("yazılı deneme kâğıdı: açık uçlu ve doğru/yanlış dokunulmaz, çoktan seçmeliler dengelenir", () => {
    const mcq = (i: number) => ({
      text: `Ekonomi sorusu ${i}: hangisi para politikası aracıdır?`,
      type: "mcq",
      options: [`Reeskont ${i}`, `Vergi ${i}`, `Gümrük ${i}`, `Harç ${i}`, `Bütçe ${i}`],
      correctAnswers: [`Reeskont ${i}`],
      explanation: "",
      optionWhy: [] as string[],
    });
    const open = { text: "Açıklayınız.", type: "open", options: [] as string[], correctAnswers: [] as string[], explanation: "", optionWhy: [] as string[] };
    const tf = { text: "Doğru mu?", type: "true_false", options: ["Doğru", "Yanlış"], correctAnswers: ["Doğru"], explanation: "", optionWhy: [] as string[] };
    const drafts = [mcq(0), open, mcq(1), tf, mcq(2), mcq(3), mcq(4), mcq(5)];
    const out = balanceExamDrafts(drafts);
    expect(out[1]).toBe(open);
    expect(out[3]).toBe(tf);
    const letters = out.filter((q) => q.type === "mcq").map((q) => singleLetter(q.options, q.correctAnswers)!);
    expect(Math.max(...counts(letters))).toBe(2);
    expect(maxRun(letters)).toBeLessThan(3);
  });

  it("planBalancedOrders geçmişi sürdürür: son iki harf aynıysa üçüncüsü başka", () => {
    const [order] = planBalancedOrders([{ key: "x", options: ["a", "b", "c", "d"], correct: [0] }], [2, 2]);
    expect(order!.indexOf(0)).not.toBe(2);
  });
});

describe("havuz yüzeyleri aynı sırayı kayda/belirtece yazar", () => {
  it("havuz testi gövdesi (mapPoolRows) dengeli ve doğru cevap metinle", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      outcome_id: "o",
      difficulty: "medium",
      stem: `Coğrafya sorusu ${i}`,
      choices: [`Akdeniz ${i}`, `Karadeniz ${i}`, `Ege ${i}`, `Marmara ${i}`, `İç Anadolu ${i}`],
      answer: 0,
      explanation: null,
    }));
    const body = mapPoolRows(rows, "hazirlik-1");
    const letters = body.map((q) => q.options.indexOf(q.correct[0]!));
    expect(Math.max(...counts(letters))).toBe(2);
    expect(body.every((q, i) => q.correct[0] === `Akdeniz ${i}` && q.options.includes(q.correct[0]!))).toBe(true);
  });

  it("seviye kontrolü: sıra belirteçte, gösterilen yer özgün yere çevrilir", () => {
    const order = [3, 0, 4, 1, 2];
    expect(decodeOrder(encodeOrder(order))).toEqual(order);
    expect(decodeOrder("0012")).toBeNull();
    expect(decodeOrder(undefined)).toBeNull();
    const item = toLevelItem(
      { id: "i", unit_id: "u", outcome_id: "o", difficulty: "medium", stem: "s", choices: ["a", "b", "c", "d", "e"], qa: null },
      order,
    );
    expect(item.choices).toEqual(["d", "a", "e", "b", "c"]);
    // Öğrenci 2. sıradaki şıkkı ("a") seçti: özgün yer order[1] = 0.
    expect(order[1]).toBe(0);
  });

  it("bütün havuz yüzeyleri ve yazılı deneme dengeleyiciyi kullanır (kaynak bekçisi)", () => {
    expect(read("src/lib/learning/mock-exam/pool-exam.ts")).toMatch(/poolChoiceOrders\(/);
    expect(read("src/lib/content-pool/serve.ts")).toMatch(/poolChoiceOrders\(/);
    expect(read("src/app/api/level-check/start/route.ts")).toMatch(/levelChoiceOrders\(/);
    expect(read("src/app/api/level-check/answer/route.ts")).toMatch(/decodeOrder\(claims\.ord/);
    expect(read("src/lib/learning/mock-exam/create.ts")).toMatch(/balanceExamDrafts\(drafts\)/);
    expect(read("src/lib/learning/mock-exam/create.ts")).not.toMatch(/function rotateCorrectOptions/);
    const run = read("src/lib/learning/teacher-quiz-run.ts");
    expect(run).toMatch(/balanceQuizQuestions\(questions, Math\.min\(published\.length/);
    expect(run).toMatch(/balanceQuizQuestions\(\[\.\.\.published, question\], published\.length\)/);
    expect(read("src/lib/learning/teacher-podcast-run.ts")).toMatch(/balanceQuizQuestions\(/);
  });
});
