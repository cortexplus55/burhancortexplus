import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseTeacherQuiz, quizSetIssues, stemFrame, tableLookupLike } from "@/lib/learning/teacher-quiz";
import { teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  Konu testi döngüsü (20 Ekim 2026). P4 kör kıyası: Pediatri solunum testimizin ilk dört sorusu kaynak
  tablosunun "Bulgular" hücresini köke koyup hepsi "En olası tanı hangisidir?" diye sordu; çok cevaplı
  soruda 4 şıktan 3'ü doğruydu. Pedagojik sorunlar yumuşak: soru düzeltilir ya da yedekle değişir,
  düzelmezse sayı tamamlanır; doğruluk sorunu olan soru hiçbir zaman geri konmaz.
*/
const why = (options: string[]) => options.map((option) => `${option} için kısa ve kendine özgü bir gerekçe.`);
const raw = (text: string, options: string[], correct: string | string[], extra: Record<string, unknown> = {}) => ({
  text,
  options,
  correct,
  multi: Array.isArray(correct),
  explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
  optionWhy: why(options),
  misconceptionTag: "ayırıcı tanı karışıklığı",
  learningObjective: "Bulgudan ayırıcı tanıya gider.",
  ...extra,
});
const DX = ["Yabancı cisim", "Pnömoni", "Krup", "Astım"];
const P4 = [
  raw("Bir çocukta havlar tarzda öksürük ve stridor birlikte görülüyor; ses kısıklığı da eşlik edebiliyor. En olası tanı hangisidir?", DX, "Krup"),
  raw(
    "Küçük bir bebekte ilk hışıltı atağı, viral hastalık belirtilerinin ardından ortaya çıkıyor ve muayenede ince ral ya da ronküs duyuluyor. En olası tanı hangisidir?",
    ["Krup", "Pnömoni", "Bronşiolit", "Astım"],
    "Bronşiolit",
  ),
  raw("Hışıltı atakları tekrarlayan bir çocukta yakınmalar egzersizle, alerjenlerle veya gece ortaya çıkabiliyor. En olası tanı hangisidir?", ["Yabancı cisim", "Astım", "Bronşiolit", "Krup"], "Astım"),
  raw("Ateşli bir çocukta takipne ve muayenede fokal akciğer bulgusu saptanıyor. En olası tanı hangisidir?", ["Pnömoni", "Bronşiolit", "Astım", "Yabancı cisim"], "Pnömoni"),
  raw(
    "Bronşiolit geçiren bir çocukta aşağıdaki bulgulardan hangileri yatış gereksinimini artırır?",
    ["Hipoksemi", "Ses kısıklığı", "Ciddi çekilme", "Apne"],
    ["Apne", "Hipoksemi", "Ciddi çekilme"],
  ),
];
const SPARES = [
  raw("Beş aylık bebekte bronşiolit izleniyor. Bu bebekte kaçınılması gereken yaklaşım hangisidir?", ["Rutin antibiyotik", "Hidrasyon izlemi", "Oksijen izlemi", "Solunum eforu izlemi"], "Rutin antibiyotik"),
  raw("Krup tanılı bir çocukta hangisi daha ağır hastalığı düşündürür?", ["İstirahatte stridor", "Ses kısıklığı", "Havlar öksürük", "Hafif burun akıntısı"], "İstirahatte stridor"),
  raw("Akut astım atağı geçiren çocukta ciddi uyarı işareti hangisidir?", ["Sessiz akciğer", "Hafif öksürük", "Burun akıntısı", "Gece uyanma"], "Sessiz akciğer"),
];
const FIXED = [
  raw("Üç aylık bebekte öksürük ve hışıltı başladı; öncesinde burun akıntısı vardı. Bu tabloda yönetimin temeli nedir?", ["Destek tedavisi", "Rutin antibiyotik", "Rutin bronkodilatör", "Sistemik steroid"], "Destek tedavisi"),
  raw("Salya akan, yutkunamayan ateşli çocukta epiglottit düşünülüyor. Muayenede kaçınılacak adım hangisidir?", ["Boğazı zorla açmak", "Sakin ortam", "Oturur pozisyon", "Oksijen hazırlığı"], "Boğazı zorla açmak"),
  raw("Astım kontrolünü değerlendirirken sorgulanacak bilgi hangisidir?", ["Kurtarıcı ilaç ihtiyacı", "Doğum ağırlığı", "Aşı takvimi", "Boy persentili"], "Kurtarıcı ilaç ihtiyacı"),
  raw("Pnömonide antibiyotik kararı neye dayanır?", ["Klinik değerlendirme", "Yalnız ateş", "Yalnız öksürük", "Yalnız yaş"], "Klinik değerlendirme"),
];
const draft = { questions: [...P4.slice(0, 4), P4[4], ...SPARES] };
const scoped = {
  topicLabel: "Solunum sistemi",
  prepTitle: "Pediatri (TUS)",
  pages: [{ page: 4, text: "Bronşiolit…" }],
  count: 5,
  multi: true,
  scope: "topic_test" as const,
};
const parsed = (items: unknown[]) => parseTeacherQuiz({ questions: items })!;

/** Sahte model: taslak, düzeltme (sırayla verilen yanıtlar), denetim (sırayla verilen sorunlar). */
function fakeAsk(opts: { draft: unknown; fixes?: unknown[]; verifies: unknown[] }) {
  const prompts = { draft: [] as string[], fix: [] as string[], verify: [] as string[] };
  let fix = 0;
  let verify = 0;
  const ask = vi.fn(async (system: string, user: string) => {
    if (system.includes("anahtarı görmeden")) return { solved: [] };
    if (system.includes("denetçisisin")) {
      prompts.verify.push(user);
      return opts.verifies[verify++] ?? { issues: [] };
    }
    if (system.startsWith("Sen aynı testi yazan")) {
      prompts.fix.push(user);
      return opts.fixes?.[fix++] ?? null;
    }
    prompts.draft.push(user);
    return opts.draft;
  });
  return { ask, prompts };
}
const issues = (list: [number, string][]) => ({ issues: list.map(([question, code]) => ({ question, code, severity: "high", problem: `${code} sorunu` })) });

describe("kod denetimi: kök kalıbı, madde kapsamı, dersle tekrar", () => {
  const questions = parsed(P4);

  it("P4: dört soru aynı kalıp; üçüncü ve dördüncü işaretlenir, ötekiler değil", () => {
    expect(stemFrame(P4[0].text)).toBe("olası tanı hangisidir");
    expect(stemFrame(P4[4].text)).toBe("yatış gereksinimini artırır");
    const found = quizSetIssues(questions, { pointsAvailable: 0 });
    expect(found.map((issue) => [issue.index, issue.code])).toEqual([
      [2, "I"],
      [3, "I"],
    ]);
    expect(found.every((issue) => !issue.forceFix)).toBe(true);
  });

  it("madde ikinci kez, sorulmamış madde varken: kapsam (düzeltme turu açar); hepsi sorulduysa tekrar serbest", () => {
    const withPoints = (points: string[]) => points.map((point, i) => ({ ...questions[i % 4], text: `Ayrı kök numarası ${i} hangisidir?`, point }));
    const gap = quizSetIssues(withPoints(["1", "1", "2"]), { pointsAvailable: 3 });
    expect(gap).toEqual([expect.objectContaining({ index: 1, code: "J", forceFix: true })]);
    expect(gap[0].problem).toContain("sorulmamış madde(ler): 3");
    expect(quizSetIssues(withPoints(["1", "2", "3", "1"]), { pointsAvailable: 3 })).toEqual([]);
    // Bölüm başlığı (madde yok) koda kapsam söylemez; denetçi yargılar.
    expect(quizSetIssues(withPoints(["Krup", "Krup"]), { pointsAvailable: 0 })).toEqual([]);
  });

  it("derste sorulan soruyla neredeyse aynı kök işaretlenir", () => {
    const [lessonTwin] = parsed([raw("Havlar tarzda öksürük ve stridor birlikte görülen çocukta en olası tanı hangisidir?", DX, "Krup")]);
    const found = quizSetIssues([lessonTwin], {
      pointsAvailable: 0,
      lessonChecks: ["Havlar tarzda öksürük ve stridor birlikte görülen bir çocukta en olası tanı hangisidir?"],
    });
    expect(found).toEqual([expect.objectContaining({ index: 0, code: "K", forceFix: false })]);
  });

  it("ölçüm: P4 köklerinin üçü tablo satırının ilk hücresini birebir taşıyor (yalnız günlük, kapı değil)", () => {
    const source = [
      "| Bulgular | Düşündürür | Ayırıcı ipucu |",
      "|---|---|---|",
      "| Havlar tarzda öksürük + stridor | Krup | Üst hava yolu; ses kısıklığı eşlik edebilir. |",
      "| Hışıltı + ilk atak + küçük bebek | Bronşiolit | Viral prodrom, ince ral/ronküs. |",
      "| Tekrarlayan hışıltı + tetikleyici | Astım | Egzersiz, alerjen, gece semptomları. |",
      "| Ateş + takipne + fokal akciğer bulgusu | Pnömoni | Yaşa göre takipne. |",
      "| Ani öksürük/boğulma + tek taraflı bulgu | Yabancı cisim | Ani başlangıç öyküsü. |",
    ].join("\n");
    expect(tableLookupLike(questions, [{ text: source }])).toBe(3);
    expect(tableLookupLike(parsed(FIXED), [{ text: source }])).toBe(0);
  });
});

describe("döngü: yumuşak sorun düzelir, yedekle değişir ya da geri konur", () => {
  it("P4 taslağı: H dört soruda; tek düzeltme turu, düzeltmeler aynı yerde, düzeltme kalan soruları görür", async () => {
    const { ask, prompts } = fakeAsk({ draft, fixes: [{ questions: FIXED }], verifies: [issues([[0, "H"], [1, "H"], [2, "H"], [3, "H"]])] });
    const loop = await teacherQuizLoop(ask, scoped);
    expect(loop.rounds).toBe(1);
    expect(prompts.fix).toHaveLength(1);
    expect(prompts.fix[0]).toContain("KALAN SORULAR");
    expect(prompts.fix[0]).toContain(SPARES[0].text);
    // Düzeltmenin denetimi testte kalanları görür. Bağımsız çözüm de "denetçisisin" sayılır;
    // o çağrının isteminde kabul edilen sorular yoktur.
    expect(prompts.verify.some((prompt) => prompt.includes("TESTİN KABUL EDİLEN SORULARI"))).toBe(true);
    expect(loop.questions.map((question) => question.text)).toEqual([...FIXED.map((item) => item.text), P4[4].text]);
    expect(loop.softKept).toBe(0);
    expect(loop.codes).toMatchObject({ H: 4, set_I: 2 });
  });

  it("kapsam eksiği (J): yeterli soru varken de bir tur açar; düzeltilen soru öğrenciye giden testte", async () => {
    const clean = { questions: [...SPARES, FIXED[2], P4[4], FIXED[3], FIXED[0], FIXED[1]] };
    const coverage = raw("Kronik inflamasyonlu çocukta yönetimde en kritik uyarı bulgusu hangisidir?", ["Bilinç değişikliği", "Hafif öksürük", "Burun akıntısı", "Gece uyanma"], "Bilinç değişikliği");
    const { ask, prompts } = fakeAsk({ draft: clean, fixes: [{ questions: [coverage] }], verifies: [issues([[2, "J"]])] });
    const loop = await teacherQuizLoop(ask, scoped);
    expect(loop.forced).toBe(true);
    expect(loop.rounds).toBe(1);
    expect(prompts.fix).toHaveLength(1);
    expect(loop.questions.map((question) => question.text)).toContain(coverage.text);
    expect(loop.questions).toHaveLength(5);
  });

  it("yedekte kalan kapsam sorunu tur açmaz (kesilecek soruyu düzeltmek boşa)", async () => {
    const clean = { questions: [...SPARES, FIXED[2], P4[4], FIXED[3], FIXED[0], FIXED[1]] };
    const { ask, prompts } = fakeAsk({ draft: clean, verifies: [issues([[7, "J"]])] });
    const loop = await teacherQuizLoop(ask, scoped);
    expect(prompts.fix).toHaveLength(0);
    expect(loop.forced).toBe(false);
    expect(loop.questions).toHaveLength(5);
  });

  it("düzeltme de H'de kalırsa: yalnız bir tur, sayı geri konan sorularla tamamlanır", async () => {
    const singles = [0, 1, 2, 3, 5, 6, 7];
    const allH = issues(singles.map((index) => [index, "H"] as [number, string]));
    const allHAgain = issues(singles.map((_, position) => [position, "H"] as [number, string]));
    const { ask, prompts } = fakeAsk({
      draft,
      fixes: [{ questions: [...FIXED, ...SPARES] }, { questions: [...FIXED, ...SPARES] }],
      verifies: [allH, allHAgain, allHAgain],
    });
    const loop = await teacherQuizLoop(ask, scoped);
    expect(prompts.fix).toHaveLength(1);
    expect(loop.rounds).toBe(1);
    expect(loop.questions).toHaveLength(5);
    expect(loop.softKept).toBe(4);
    expect(loop.salvaged[0]).toMatch(/^\[H\]/);
    expect(loop.questions.filter((question) => question.multi)).toHaveLength(1);
  });

  it("doğruluk sorunu (A) olan soru hiçbir zaman geri konmaz; harfsiz sorun da engeller", async () => {
    const verdict = { issues: [...issues([[0, "A"], [1, "A"], [2, "A"], [5, "H"], [6, "H"], [7, "H"]]).issues, { question: 3, severity: "high", problem: "Anahtar yanlış" }] };
    const { ask } = fakeAsk({ draft, fixes: [null], verifies: [verdict] });
    const loop = await teacherQuizLoop(ask, scoped);
    const texts = loop.questions.map((question) => question.text);
    for (const blocked of P4.slice(0, 4)) expect(texts).not.toContain(blocked.text);
    expect(loop.softKept).toBe(3);
    expect(loop.questions).toHaveLength(4);
  });

  it("düzeltme doğruluk sorunu getirirse ya da düzeltme çağrısı düşerse sayı yine düşmez", async () => {
    const h = issues([[0, "H"], [1, "H"], [2, "H"], [3, "H"]]);
    // Düzeltilen dört sorunun dördü de anahtar hatalı: eldeki pedagojik sorunlu eski sorular geri konur.
    const worse = fakeAsk({ draft, fixes: [{ questions: FIXED }], verifies: [h, issues([[0, "A"], [1, "A"], [2, "A"], [3, "A"]])] });
    const kept = await teacherQuizLoop(worse.ask, scoped);
    expect(kept.questions).toHaveLength(5);
    expect(kept.questions.map((question) => question.text)).not.toContain(FIXED[0].text);
    expect(kept.softKept).toBe(1);
    // Model çağrısı düşerse konu testi düşmez.
    const thrown = fakeAsk({ draft, verifies: [h] });
    thrown.ask.mockImplementation(async (system: string) => {
      if (system.includes("anahtarı görmeden")) return { solved: [] };
      if (system.startsWith("Sen aynı testi yazan")) throw new Error("timeout");
      if (system.includes("denetçisisin")) return h;
      return draft;
    });
    const survived = await teacherQuizLoop(thrown.ask, scoped);
    expect(survived.questions).toHaveLength(5);
    expect(survived.softKept).toBe(1);
    // Kapsam dışı yüzeyde bugünkü gibi hata yukarı çıkar.
    await expect(teacherQuizLoop(thrown.ask, { ...scoped, scope: undefined })).rejects.toThrow("timeout");
  });

  it("kapsam dışı yüzeyde aynı kalıplı kökler sorun değil; H harfi de engeller (bugünkü gibi)", async () => {
    const same = { questions: Array.from({ length: 7 }, (_, i) => raw(`Soru ${i}: çocukta görülen tabloda en olası tanı hangisidir?`, DX, "Krup")) };
    const unscoped = { ...scoped, scope: undefined, multi: false };
    const { ask } = fakeAsk({ draft: same, verifies: [{ issues: [] }] });
    const loop = await teacherQuizLoop(ask, unscoped);
    expect(loop.questions).toHaveLength(5);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(loop.codes).toEqual({});
    const blocked = fakeAsk({ draft: same, fixes: [null], verifies: [issues([[0, "H"], [1, "H"], [2, "H"]])] });
    const strict = await teacherQuizLoop(blocked.ask, unscoped);
    expect(strict.questions).toHaveLength(4);
    expect(strict.softKept).toBe(0);
  });

  it("ikinci geçiş: taslak testte olan soruları görür; kod onları kapsam ve kalıp sayımına katar", async () => {
    const [kept] = parsed([{ ...P4[0], point: "1" }]);
    const { ask, prompts } = fakeAsk({ draft: { questions: [P4[1], P4[2], ...FIXED] }, verifies: [{ issues: [] }] });
    const loop = await teacherQuizLoop(ask, { ...scoped, count: 4, avoid: [kept as QuizQuestion] });
    expect(prompts.draft[0]).toContain("TESTTE ZATEN OLAN SORULAR");
    expect(prompts.draft[0]).toContain(kept.text);
    expect(prompts.verify[0]).toContain("TESTİN KABUL EDİLEN SORULARI");
    // P4[1] ve P4[2] ilk geçişin sorusuyla birlikte kalıbın 2. ve 3. kullanımı: üçüncüsü yedekle değişir.
    expect(loop.codes.set_I).toBe(1);
    expect(loop.questions.map((question) => question.text)).not.toContain(P4[2].text);
    const runner = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    expect(runner).toContain('...(input.scope === "topic_test" ? { avoid: questions } : {}),');
  });
});
