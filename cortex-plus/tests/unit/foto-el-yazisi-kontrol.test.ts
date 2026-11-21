import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SolveEvent } from "@/lib/solve/solve-run";
import type { Solution } from "@/lib/solve/question-solver";

/*
  Fotoğrafla el yazısı çözüm kontrolü (21 Kasım 2026, ürün sahibinin kararı; `teacher.v2` arkasında). Öğrenci soru
  fotoğrafında kendi çözümünü de çekmişse cevap söylenmez: doğru satırlar onaylanır, ilk hatalı satır nazikçe işaret
  edilir, tek yönlendirici soru sorulur; doğru çözüm "Doğrusunu göster" ile açılır. Ek model çağrısı yok; bayrak
  kapalıyken çözücünün istemleri ve olayları bayt bayt aynı. Örnekler sentetik (konu adı ya da canlı veri yok).
*/

vi.mock("server-only", () => ({}));

/* ---------- sahte model ve servisler ---------- */

type Call = { system: string; user: unknown };
const calls: Call[] = [];
let replyFor: (system: string) => unknown = () => ({});

vi.mock("@/lib/ai/openai-client", () => ({
  openaiClient: () => ({
    chat: {
      completions: {
        create: vi.fn(async (body: { messages: { content: unknown }[] }) => {
          const system = String(body.messages[0]?.content ?? "");
          calls.push({ system, user: body.messages[1]?.content });
          return {
            choices: [{ message: { content: JSON.stringify(replyFor(system)) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          };
        }),
      },
    },
  }),
}));
vi.mock("@/lib/billing/entitlements", () => ({ isPremiumUser: vi.fn(async () => false) }));
const reserveCredits = vi.fn<(...args: unknown[]) => Promise<{ ok: true; reservationId: string }>>(async () => ({ ok: true, reservationId: "r1" }));
const commitCredits = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
const refundCredits = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
vi.mock("@/lib/credits/service", () => ({
  reserveCredits: (...args: unknown[]) => reserveCredits(...args),
  commitCredits: (...args: unknown[]) => commitCredits(...args),
  refundCredits: (...args: unknown[]) => refundCredits(...args),
  recordUsage: vi.fn(async () => undefined),
  refusalCode: vi.fn(() => "insufficient_credits"),
}));
vi.mock("@/lib/learning/fast-access", () => ({ fastAllowedFor: vi.fn(async () => false) }));
vi.mock("@/lib/learning/student-pedagogy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/student-pedagogy")>()),
  studentPedagogyBlock: vi.fn(async () => ""),
}));
vi.mock("@/lib/ai/generation-slots", () => ({
  withGenerationSlot: async (_kind: string, run: () => Promise<void>) => run(),
}));
vi.mock("@/lib/billing/photo-abuse-guard", () => ({ recordUnreadablePhoto: vi.fn(async () => undefined) }));

const solver = await import("@/lib/solve/question-solver");
const work = await import("@/lib/solve/student-work");
const { runSolve } = await import("@/lib/solve/solve-run");
const { solutionMarkdown, solveUserLine } = await import("@/lib/solve/solution-markdown");
const { solvePhaseAfter } = await import("@/lib/solve/solve-client");

/* ---------- sentetik soru: 2x + 7 = 19 (doğru cevap B, x = 6) ---------- */

const OPTIONS = [
  { letter: "A", text: "4" },
  { letter: "B", text: "6" },
  { letter: "C", text: "12" },
  { letter: "D", text: "13" },
  { letter: "E", text: "26" },
];

function solutionJson(extra: Record<string, unknown> = {}) {
  return {
    readable: true,
    subject: "Örnek",
    question: "2x + 7 = 19 ise x kaçtır?",
    options: OPTIONS,
    kind: "mcq",
    intro: "Bilinmeyeni yalnız bırakıyoruz.",
    given: ["2x + 7 = 19"],
    asked: "x",
    steps: [
      { title: "Sabiti karşıya geçir", math: "2x = 19 - 7 = 12", say: "7 karşıya eksi olarak geçer." },
      { title: "Katsayıya böl", math: "x = 12 / 2 = 6", say: "İki tarafı 2'ye böldük." },
    ],
    answer: { letter: "B", value: "6", text: "x = 6" },
    optionsWhy: [{ letter: "B", why: "12 / 2 = 6.", correct: true }],
    trap: "Sabit karşıya geçerken işareti değişir.",
    tip: "Önce sabiti, sonra katsayıyı at.",
    check: "Kontrol: 2·6 + 7 = 19",
    ...extra,
  };
}

/** İşaret hatası 2. satırda; sonraki satırlar hatayı taşıyor (sonuç D). */
const WRONG_WORK = {
  present: true,
  lines: ["2x + 7 = 19", "2x = 19 + 7", "2x = 26", "x = 13"],
  answer: { letter: "D", value: "13" },
  resultOk: false,
  steps: [
    { n: 1, ok: true },
    { n: 2, ok: false, kind: "isaret", note: "terim karşıya geçerken işaret değişmeli" },
    { n: 3, ok: true },
    { n: 4, ok: true },
  ],
  hint: "İlk satırın doğru; 2. satırda 7'yi karşıya geçirirken işaretine dikkat etmemişsin.",
  question: "Bir terim eşitliğin öbür yanına geçince işaretine ne olur?",
};

const RIGHT_WORK = {
  present: true,
  lines: ["2x + 7 = 19", "2x = 19 - 7 = 12", "x = 12 / 2 = 6"],
  answer: { letter: "B", value: "6" },
  resultOk: true,
  steps: [{ n: 1, ok: true }, { n: 2, ok: true }, { n: 3, ok: true }],
  hint: "Hepsi doğru.",
  question: "",
};

function solutionOf(extra: Record<string, unknown> = {}): Solution {
  return solver.parseSolution(solutionJson(extra))!;
}

function readOf(studentWork: Record<string, unknown>) {
  return work.parseStudentWork(solutionJson({ studentWork }));
}

/** Satır sayısından bağımsız: metinde tek başına duran bir sayı geçiyor mu ("26" içindeki 6 sayılmaz). */
const hasNumber = (text: string, value: string) => new RegExp(`(?<![\\d.,])${value}(?![\\d.,])`).test(text);

/* ---------- okuma ---------- */

describe("okuma çıktısı: öğrencinin satırları ayrı", () => {
  it("satırlar sırayla, numara öneki atılır, okunamayan satır yerinde işaretlenir", () => {
    const read = readOf({
      present: true,
      lines: ["1. 2x + 7 = 19", "okunamadı", "2) x = 6"],
      answer: { letter: "b" },
    });
    expect(read.present).toBe(true);
    expect(read.lines).toEqual(["2x + 7 = 19", "[okunamadı]", "x = 6"]);
    expect(read.answer.letter).toBe("B");
    expect(read.basis).toEqual({ letter: "B", value: "6" });
  });

  it("satır yoksa, present false ise, hepsi okunamadıysa ya da hepsi basılı soruysa öğrenci çözümü yok sayılır", () => {
    expect(work.parseStudentWork(solutionJson()).present).toBe(false);
    expect(readOf({ present: false, lines: ["x = 6"] })).toMatchObject({ present: false, lines: [] });
    expect(readOf({ present: true, lines: ["[okunamadı]", "okunamadı"] }).present).toBe(false);
    expect(readOf({ present: true, lines: ["2x + 7 = 19 ise x kaçtır?"] }).present).toBe(false);
  });

  it("modelin satır kararları satırlara bağlanır; satır dışı numara düşer", () => {
    const read = readOf({ ...WRONG_WORK, steps: [...WRONG_WORK.steps, { n: 9, ok: false }] });
    expect(read.modelSteps.map((step) => [step.n, step.status])).toEqual([
      [1, "ok"],
      [2, "error"],
      [3, "ok"],
      [4, "ok"],
    ]);
    expect(read.modelSteps[1]?.kind).toBe("isaret");
  });
});

/* ---------- karar ---------- */

describe("auto / check / solve kararı", () => {
  it("bayrak kapalıyken her istek bugünkü çözücü; açık kontrol isteği geri çevrilir", () => {
    for (const intent of ["auto", "solve", "check"] as const) {
      for (const image of [true, false]) {
        expect(work.studentWorkMode({ intent, enabled: false, image })).toBe("off");
      }
    }
    expect(work.checkIntentRefused("check", false)).toBe(true);
    expect(work.checkIntentRefused("auto", false)).toBe(false);
    expect(work.checkIntentRefused("solve", false)).toBe(false);
    expect(work.checkIntentRefused("check", true)).toBe(false);
  });

  it("bayrak açıkken: auto yalnız fotoğrafta, solve kapalı, check fotoğrafta da yazılıda da", () => {
    expect(work.studentWorkMode({ intent: "auto", enabled: true, image: true })).toBe("auto");
    expect(work.studentWorkMode({ intent: "auto", enabled: true, image: false })).toBe("off");
    expect(work.studentWorkMode({ intent: "solve", enabled: true, image: true })).toBe("off");
    expect(work.studentWorkMode({ intent: "check", enabled: true, image: true })).toBe("check");
    expect(work.studentWorkMode({ intent: "check", enabled: true, image: false })).toBe("check");
  });

  it("istek alanı: yalnız solve ve check tanınır, öbürü auto", () => {
    expect(work.parseSolveIntent("check")).toBe("check");
    expect(work.parseSolveIntent("solve")).toBe("solve");
    expect(work.parseSolveIntent(null)).toBe("auto");
    expect(work.parseSolveIntent("CHECK")).toBe("auto");
  });

  it("kontrol: check her zaman, auto yalnız satır görülünce", () => {
    const none = work.parseStudentWork(solutionJson());
    expect(work.checkActive("check", none)).toBe(true);
    expect(work.checkActive("auto", none)).toBe(false);
    expect(work.checkActive("auto", readOf(WRONG_WORK))).toBe(true);
    expect(work.checkActive("off", readOf(WRONG_WORK))).toBe(false);
  });
});

/* ---------- kontrol sonucu ---------- */

describe("ilk hatalı satır", () => {
  it("işaret hatası 2. satırda; önceki satır ✓, sonraki satırlar değerlendirilmez; sonuç uyuşmaz", () => {
    const check = work.buildStudentCheck(readOf(WRONG_WORK), solutionOf());
    expect(check.state).toBe("error");
    expect(check.firstError).toMatchObject({ line: 2, kind: "isaret" });
    expect(check.lines.map((line) => line.status)).toEqual(["ok", "error", "unknown", "unknown"]);
    expect(check.result).toBe("mismatch");
    expect(check.studentAnswer).toBe("D) 13");
    // Model aynı satırı işaret etti ve cevabı söylemedi: onun cümlesi ve sorusu kalır.
    expect(check.explanation).toBe(WRONG_WORK.hint);
    expect(check.question).toBe(WRONG_WORK.question);
  });

  it("kodun bulduğu hesap hatası modelin kararını geçer; model başka satır derse kodun cümlesi", () => {
    const check = work.buildStudentCheck(
      readOf({
        ...WRONG_WORK,
        steps: [{ n: 1, ok: true }, { n: 2, ok: true }, { n: 3, ok: false, kind: "islem", note: "26 yanlış" }],
      }),
      solutionOf(),
    );
    expect(check.firstError?.line).toBe(2);
    expect(check.firstError?.kind).toBe("isaret");
    expect(check.explanation).toBe(
      "1. satıra kadar kurulumun doğru; 2. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.",
    );
    expect(check.question).toBe("Bu terimi eşitliğin öbür yanına geçirirken işaretine ne olur?");
  });

  it("satırlar doğru ve sonuç doğru: 'Çözümün doğru', soru yok", () => {
    const check = work.buildStudentCheck(readOf(RIGHT_WORK), solutionOf());
    expect(check.state).toBe("correct");
    expect(check.lines.every((line) => line.status === "ok")).toBe(true);
    expect(check.explanation).toBe(work.CHECK_CORRECT_LINE);
    expect(check.question).toBe("");
  });

  it("satırlar tutarlı ama sonuç yanlış: satır uydurulmaz, kurulum sorulur", () => {
    const check = work.buildStudentCheck(
      readOf({ present: true, lines: ["2x + 7 = 19", "x + 7 = 19 / 2", "x = 9,5 - 7 = 2,5"], answer: {} }),
      solutionOf(),
    );
    expect(check.state).toBe("error");
    expect(check.firstError).toBeNull();
    expect(check.result).toBe("mismatch");
    expect(check.question).toBe("Sorunun tam olarak neyi istediğini ilk satırda doğru kurdun mu?");
  });

  it("kavram hatasını model bulur (kod sayıyla karar veremez)", () => {
    const check = work.buildStudentCheck(
      readOf({
        present: true,
        lines: ["2x + 7 = 19", "x + 7 = 19 / 2", "x = 9,5 - 7 = 2,5"],
        steps: [{ n: 2, ok: false, kind: "kavram", note: "bölme bütün terimlere uygulanmalı" }],
      }),
      solutionOf(),
    );
    expect(check.firstError).toMatchObject({ line: 2, kind: "kavram" });
    expect(check.lines[2]?.status).toBe("unknown");
  });

  it("öğrenci bitirmediyse 'devam et'; ara satır sonuç sayılmaz", () => {
    const check = work.buildStudentCheck(readOf({ present: true, lines: ["2x + 7 = 19", "2x = 19 - 7"] }), solutionOf());
    expect(check.state).toBe("incomplete");
    expect(check.result).toBe("unknown");
    expect(check.question).toBe("Buradan sonra hangi büyüklüğü bulman gerekiyor?");
  });

  it("sonuç doğru ama arada hata varsa hata yine söylenir", () => {
    const check = work.buildStudentCheck(
      readOf({ ...WRONG_WORK, answer: { letter: "B" }, lines: ["2x + 7 = 19", "2x = 19 + 7", "x = 6"] }),
      solutionOf(),
    );
    expect(check.state).toBe("error");
    expect(check.result).toBe("match");
    expect(check.explanation).toContain("Vardığın sonuç doğru");
  });

  it("satırı görülmeyen kontrol isteği: 'satırlarını göremedim'", () => {
    const check = work.buildStudentCheck(work.parseStudentWork(solutionJson()), solutionOf());
    expect(check).toMatchObject({ state: "no_work", lines: [], question: "" });
    expect(work.buildStudentCheck(readOf({ present: true, lines: ["[okunamadı]"] }), solutionOf()).explanation).toContain(
      "okuyamadım",
    );
  });
});

/* ---------- sızıntı ---------- */

describe("cevap kontrol metninde sızmaz", () => {
  const solution = solutionOf();
  const lines = WRONG_WORK.lines;

  it("doğru ara değer, 'doğrusu …' kalıbı, doğru şık harfi ve metin cevap sızıntıdır", () => {
    expect(work.revealsAnswer("2. satırda işaret var; sonuç 12 çıkmalı.", solution, lines)).toBe(true);
    expect(work.revealsAnswer("Doğrusu 2x = 12 olmalı.", solution, lines)).toBe(true);
    expect(work.revealsAnswer("Doğru cevap: B", solution, lines)).toBe(true);
    expect(work.revealsAnswer("B şıkkına ulaşmak için işareti düzelt.", solution, lines)).toBe(true);
    expect(work.revealsAnswer("x = 6 bulmalısın.", solution, lines)).toBe(true);
    const words = solver.parseSolution(
      solutionJson({
        options: [
          { letter: "A", text: "artar" },
          { letter: "B", text: "azalır" },
        ],
        answer: { letter: "B", value: "azalır", text: "Değer azalır." },
        steps: [],
      }),
    )!;
    expect(work.revealsAnswer("Sonuçta değer azalır, bunu düşün.", words, [])).toBe(true);
  });

  it("soruda verilen ve öğrencinin kendi yazdığı sayılar, satır numaraları serbest", () => {
    expect(work.revealsAnswer("2. satırda 7'yi karşıya geçirirken işaretine bak.", solution, lines)).toBe(false);
    expect(work.revealsAnswer("3. satırdaki 26 nereden geldi?", solution, lines)).toBe(false);
    expect(work.revealsAnswer("Bir terim karşıya geçince işareti ne olur?", solution, lines)).toBe(false);
  });

  it("modelin sızdıran cümlesi, sorusu ve notu yerine kodun metni gelir", () => {
    const check = work.buildStudentCheck(
      readOf({
        ...WRONG_WORK,
        steps: [{ n: 2, ok: false, kind: "isaret", note: "doğrusu 2x = 12" }],
        hint: "2. satırda hata var, doğrusu 2x = 12 olmalı.",
        question: "Sonuç 6 olmaz mıydı?",
      }),
      solution,
    );
    expect(check.explanation).toBe(
      "1. satıra kadar kurulumun doğru; 2. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.",
    );
    expect(check.question).toBe("Bu terimi eşitliğin öbür yanına geçirirken işaretine ne olur?");
    const text = [check.explanation, check.question, ...check.lines.map((line) => work.lineNote(line))].join(" ");
    expect(hasNumber(text, "12")).toBe(false);
    expect(hasNumber(text, "6")).toBe(false);
    // Kodun karar veremediği satırda modelin notu gösterilir; doğru satırı söylüyorsa yalnız türü kalır.
    const concept = work.buildStudentCheck(
      readOf({
        present: true,
        lines: ["2x + 7 = 19", "x + 7 = 19 / 2", "x = 9,5 - 7 = 2,5"],
        steps: [{ n: 2, ok: false, kind: "kavram", note: "doğrusu 2x = 12" }],
      }),
      solution,
    );
    expect(work.lineNote(concept.lines[1]!)).toBe("kavram hatası");
    const kept = work.buildStudentCheck(
      readOf({
        present: true,
        lines: ["2x + 7 = 19", "x + 7 = 19 / 2", "x = 9,5 - 7 = 2,5"],
        steps: [{ n: 2, ok: false, kind: "kavram", note: "bölme bütün terimlere uygulanmalı" }],
      }),
      solution,
    );
    expect(work.lineNote(kept.lines[1]!)).toBe("kavram hatası: bölme bütün terimlere uygulanmalı");
  });

  it("sohbete kaydedilen metin doğru cevabı ve çözüm adımlarını taşımaz", () => {
    const checked = work.withStudentCheck(solution, readOf(WRONG_WORK));
    const markdown = solutionMarkdown(checked);
    expect(markdown.startsWith("**Çözümünü kontrol ettim**")).toBe(true);
    expect(markdown).not.toContain("Doğru cevap");
    expect(markdown).not.toContain("Çözüm adımları");
    expect(markdown).not.toContain(solution.tip);
    expect(hasNumber(markdown, "12")).toBe(false);
    expect(hasNumber(markdown, "6")).toBe(false);
    expect(markdown).toContain("2. ✗ `2x = 19 + 7` — işaret hatası");
    expect(markdown).toContain(`> 🤔 ${WRONG_WORK.question}`);
    expect(markdown).toContain("Doğrusunu göster");
    // Denetimin düzeltme notu cevabı söyleyebilir: kaydedilmez. Genel not kalır.
    expect(solutionMarkdown(checked, "Denetim: doğrusu 6.")).not.toContain("Denetim");
    expect(solutionMarkdown(checked, "Emin değiliz")).toContain("_Emin değiliz_");
    const user = solveUserLine(checked, undefined, true);
    expect(user.split("\n")[0]).toBe("📷 Çözümümü kontrol et");
    expect(user).toContain("Benim çözümüm:\n1. 2x + 7 = 19");
    // Kontrol yokken bugünkü metin.
    expect(solutionMarkdown(solution).startsWith("**Doğru cevap: B) 6**")).toBe(true);
  });

  it("öğretmene sor istemi cevabı taşımaz", () => {
    const check = work.buildStudentCheck(readOf(WRONG_WORK), solution);
    const prompt = work.studentCheckDiscussPrompt(solution, check);
    expect(prompt).toContain("Hata 2. satırda görünüyor (işaret hatası).");
    expect(prompt).toContain("Doğru cevabı söyleme");
    expect(hasNumber(prompt, "12")).toBe(false);
    expect(prompt).not.toMatch(/(?<![\d.,])6(?![\d.,])/);
  });
});

/* ---------- çözücü akışı: çağrı sayısı ve bayt bayt aynı istem ---------- */

const IMAGE = "data:image/png;base64,AAAA";

function replies(analytic: Record<string, unknown>, verdict: Record<string, unknown> = { approved: true }) {
  return (system: string) => {
    if (system.includes("Bu bir denetim isteğidir")) return verdict;
    if (system.includes("hakemisin")) return solutionJson({ sure: true });
    if (system.includes("BAĞIMSIZ çözen ikinci")) return solutionJson();
    return analytic;
  };
}

async function run(input: { work?: "off" | "auto" | "check"; text?: string; image?: boolean }, analytic: Record<string, unknown>) {
  calls.length = 0;
  replyFor = replies(analytic);
  const events: SolveEvent[] = [];
  await runSolve(
    {
      service: {} as never,
      userId: "u1",
      idempotencyKey: "solve:u1:op",
      ...(input.image === false ? {} : { imageDataUrl: IMAGE }),
      ...(input.text ? { text: input.text } : {}),
      ...(input.work ? { work: input.work } : {}),
    },
    (event) => events.push(event),
  );
  return events;
}

const solutionEvent = (events: SolveEvent[]) => events.find((event) => event.type === "solution") as Extract<SolveEvent, { type: "solution" }>;
const analyticCall = () => calls.find((call) => call.system.startsWith("Sen sınav sorularını çözen titiz"))!;
const userText = (call: Call) => (Array.isArray(call.user) ? (call.user[0] as { text: string }).text : String(call.user));

describe("çözücü akışı", () => {
  beforeEach(() => {
    reserveCredits.mockClear();
    commitCredits.mockClear();
    refundCredits.mockClear();
  });

  it("bayrak kapalı (work yok ya da off): istemler bugünkü, öğrencinin satırları okunmaz", async () => {
    for (const mode of [undefined, "off"] as const) {
      const events = await run({ work: mode }, solutionJson({ studentWork: WRONG_WORK }));
      expect(calls).toHaveLength(3);
      expect(calls[0]?.system === solver.SOLVER_SYSTEM || calls[1]?.system === solver.SOLVER_SYSTEM).toBe(true);
      expect(calls.some((call) => call.system === solver.ADVOCATE_SYSTEM)).toBe(true);
      expect(calls.every((call) => !call.system.includes(work.STUDENT_WORK_IGNORE_RULE))).toBe(true);
      expect(calls.every((call) => !call.system.includes(work.STUDENT_WORK_READ_RULE))).toBe(true);
      expect(userText(analyticCall())).toBe(solver.solverUserText());
      const solution = solutionEvent(events).solution;
      expect(solution.studentCheck).toBeUndefined();
      expect(Object.keys(solution)).not.toContain("studentCheck");
      expect(events.map((event) => event.type)).toEqual(["stage", "solution", "stage", "verified", "done"]);
    }
  });

  it("auto: el yazısı görülünce kontrol; çağrı sayısı ve ücret aynı", async () => {
    const off = await run({}, solutionJson({ studentWork: WRONG_WORK }));
    const offCalls = calls.length;
    const events = await run({ work: "auto" }, solutionJson({ studentWork: WRONG_WORK }));
    expect(calls.length).toBe(offCalls);
    expect(events.map((event) => event.type)).toEqual(off.map((event) => event.type));
    const analytic = analyticCall();
    expect(analytic.system).toContain(work.STUDENT_WORK_READ_RULE);
    expect(analytic.system).toContain(work.STUDENT_WORK_CHECK_RULE);
    expect(calls.filter((call) => call !== analytic).every((call) => call.system.includes(work.STUDENT_WORK_IGNORE_RULE))).toBe(true);
    const check = solutionEvent(events).solution.studentCheck;
    expect(check).toMatchObject({ state: "error", firstError: { line: 2, kind: "isaret" }, result: "mismatch" });
    expect(reserveCredits).toHaveBeenCalledTimes(2);
    expect(reserveCredits.mock.calls.every((args) => args[2] === "IMAGE_SOLUTION")).toBe(true);
    expect(commitCredits).toHaveBeenCalledTimes(2);
  });

  it("auto: el yazısı yoksa bugünkü çözüm (kontrol yok)", async () => {
    const events = await run({ work: "auto" }, solutionJson());
    expect(solutionEvent(events).solution.studentCheck).toBeUndefined();
  });

  it("check: istemde kontrol isteği; satır yoksa 'göremedim'", async () => {
    const events = await run({ work: "check" }, solutionJson());
    expect(userText(analyticCall())).toContain(work.CHECK_USER_LINE);
    expect(analyticCall().system).toContain("Öğrenci kendi çözümünün kontrol edilmesini istedi");
    expect(solutionEvent(events).solution.studentCheck?.state).toBe("no_work");
  });

  it("check yazılı soruda da çalışır (sohbet mesajı ücretiyle)", async () => {
    const events = await run(
      { work: "check", image: false, text: "2x + 7 = 19 ise x kaçtır? Benim çözümüm: 2x = 19 - 7 = 12, x = 6" },
      solutionJson({ studentWork: RIGHT_WORK }),
    );
    expect(solutionEvent(events).solution.studentCheck?.state).toBe("correct");
    expect(reserveCredits.mock.calls[0]?.[2]).toBe("AI_CHAT_STANDARD");
  });

  it("denetim doğru cevabı düzeltirse kontrol yeni cevaba göre yeniden kurulur", async () => {
    calls.length = 0;
    // Analitik ve şık eleyici B dedi; denetçi itiraz etti, hakem D'yi kesinleştirdi (sentetik).
    replyFor = (system) => {
      if (system.includes("Bu bir denetim isteğidir")) return { approved: false, issue: "Kökte başka bir koşul var." };
      if (system.includes("hakemisin")) {
        return solutionJson({
          steps: [{ math: "x = 26 / 2 = 13", say: "Koşula göre." }],
          answer: { letter: "D", value: "13", text: "x = 13" },
          sure: true,
        });
      }
      if (system.includes("BAĞIMSIZ çözen ikinci")) return solutionJson();
      return solutionJson({ studentWork: WRONG_WORK });
    };
    const events: SolveEvent[] = [];
    await runSolve({ service: {} as never, userId: "u1", idempotencyKey: "k", imageDataUrl: IMAGE, work: "auto" }, (event) =>
      events.push(event),
    );
    const revised = events.find((event) => event.type === "revised") as Extract<SolveEvent, { type: "revised" }>;
    expect(revised.solution.answer.letter).toBe("D");
    expect(revised.solution.studentCheck?.result).toBe("match");
    let phase = solvePhaseAfter({ kind: "solving", stage: "solving" }, solutionEvent(events));
    phase = solvePhaseAfter(phase, revised);
    expect(phase.kind === "done" && phase.solution.studentCheck?.result).toBe("match");
  });
});

/* ---------- uç: bayrak ve istek ---------- */

const isFeatureEnabled = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => false);
const runSolveMock = vi.fn(async (_input: { work?: string }, emit: (event: SolveEvent) => void) => {
  emit({ type: "done", ms: 1 });
});

describe("POST /api/ai/solve", () => {
  async function loadRoute() {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/api/guards", () => ({
      withUser: vi.fn(async () => ({ ok: true, ctx: { userId: "u1", service: {} } })),
      errorResponse: (status: number, code: string) => Response.json({ code }, { status }),
    }));
    vi.doMock("@/lib/admin/feature-flags", () => ({ isFeatureEnabled }));
    vi.doMock("@/lib/ai/moderation", () => ({ moderate: vi.fn(async () => ({ action: "allow" })) }));
    vi.doMock("@/lib/abuse/record", () => ({ recordAbuse: vi.fn() }));
    vi.doMock("@/lib/ai/conversation-title", () => ({ titleConversation: vi.fn() }));
    vi.doMock("@/lib/solve/solve-chat-save", () => ({ saveSolveToChat: vi.fn(async () => null) }));
    vi.doMock("@/lib/solve/solve-run", () => ({ runSolve: runSolveMock }));
    return (await import("@/app/api/ai/solve/route")).POST;
  }

  async function post(fields: { intent?: string; image?: boolean; text?: string }) {
    const POST = await loadRoute();
    const form = new FormData();
    if (fields.image !== false) form.append("file", new File([new Uint8Array([1, 2, 3])], "soru.png", { type: "image/png" }));
    if (fields.text) form.append("text", fields.text);
    if (fields.intent) form.append("intent", fields.intent);
    const response = await POST(new Request("http://localhost/api/ai/solve", { method: "POST", body: form }));
    const body = await response.text();
    return { status: response.status, body };
  }

  beforeEach(() => {
    runSolveMock.mockClear();
    isFeatureEnabled.mockReset();
  });

  it("bayrak kapalıyken açık kontrol isteği 409 check_unavailable; çözücü çalışmaz", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const result = await post({ intent: "check" });
    expect(result.status).toBe(409);
    expect(JSON.parse(result.body)).toMatchObject({ code: "check_unavailable" });
    expect(runSolveMock).not.toHaveBeenCalled();
  });

  it("bayrak kapalıyken isteksiz fotoğraf bugünkü gibi (work off)", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    expect((await post({})).status).toBe(200);
    expect(runSolveMock.mock.calls[0]?.[0].work).toBe("off");
    expect(isFeatureEnabled.mock.calls[0]?.slice(1)).toEqual(["teacher.v2", "u1"]);
  });

  it("bayrak açıkken: fotoğraf auto, 'Soruyu çöz' off, 'Çözümümü kontrol et' check, yazılı soru off", async () => {
    isFeatureEnabled.mockResolvedValue(true);
    const modes: string[] = [];
    for (const fields of [{}, { intent: "solve" }, { intent: "check" }, { image: false, text: "2x + 7 = 19 ise x kaçtır?" }]) {
      runSolveMock.mockClear();
      expect((await post(fields)).status).toBe(200);
      modes.push(String(runSolveMock.mock.calls[0]?.[0].work));
    }
    expect(modes).toEqual(["auto", "off", "check", "off"]);
  });
});
