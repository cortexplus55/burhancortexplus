import { describe, expect, it, vi } from "vitest";
import { parseTeacherQuiz, quizSetIssues, stemFrame, tableLookupLike } from "@/lib/learning/teacher-quiz";
import { teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";

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
  optionCount: 4 as const,
  // Hafif doğrulayıcı (30 Ekim 2026) döngünün yapısından ayrı bir adım; kendi testi quiz-sanity.test.ts.
  sanity: false,
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

describe("tek geçiş: yapısal olarak sağlam soru silinmez", () => {
  it("denetçi harfi soruyu düşürmez; 5 soru tek taslakla döner", async () => {
    const { ask, prompts } = fakeAsk({ draft, verifies: [issues([[0, "H"], [1, "H"], [2, "H"], [3, "H"]])] });
    const loop = await teacherQuizLoop(ask, scoped);
    expect(prompts.fix).toHaveLength(0);
    expect(prompts.verify).toHaveLength(0);
    expect(loop.rounds).toBe(0);
    expect(loop.questions).toHaveLength(5);
    expect(loop.softKept).toBe(0);
  });

  it("ikinci geçiş istemi, eksik sayıda taslakta testte olan soruları görür", async () => {
    const short = { questions: parsed([P4[0], P4[1]]).map((item) => ({ ...item, correct: item.correct[0] })) };
    const { ask, prompts } = fakeAsk({
      draft: short,
      verifies: [],
    });
    ask.mockImplementation(async (system: string, user: string) => {
      prompts.draft.push(user);
      if (prompts.draft.length === 1) return short;
      return { questions: FIXED };
    });
    const loop = await teacherQuizLoop(ask, { ...scoped, count: 5 });
    expect(loop.questions.length).toBeGreaterThanOrEqual(2);
    expect(prompts.draft.some((prompt) => prompt.includes("SORU SAYISI"))).toBe(true);
  });
});
