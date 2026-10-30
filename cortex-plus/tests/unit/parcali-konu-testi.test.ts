import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  30 Ekim 2026, Astra ile yan yana tur (aynı Makroekonomi notu): öğrenci beklerken açılan konu testi 5 parçaya bölünüp
  aynı anda yazılıyor (#409). Parçalar birbirinin sorusunu görmüyordu; yalnız "Aynı konunun ayrı bir noktasını sor"
  satırı vardı. Canlı testte 5 sorudan 4'ü Cagan'ın hiperenflasyon eşiğini sordu, cevabı dördünde "Hiperenflasyon".
  "Aynı cevap en çok iki" (#430) ve "neredeyse aynı kök" kuralları her parçanın kendi tek sorusuna bakıyordu.
*/
const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(async () => ({ ok: true, reservationId: "res-1", cost: 10 })),
  commitCredits: vi.fn(async () => undefined),
  refundCredits: vi.fn(async () => undefined),
  recordUsage: vi.fn(async () => undefined),
}));
const ai = vi.hoisted(() => ({ prompts: [] as string[], shardDrafts: 0, passDrafts: 0 }));

const OPTIONS = ["Deflasyon", "Dezenflasyon", "Hiperenflasyon", "Stagflasyon"];
const why = OPTIONS.map((option) => `${option} için kısa ve kendine özgü bir gerekçe.`);
const question = (text: string, correct: string) => ({
  text,
  options: OPTIONS,
  correct,
  multi: false,
  explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
  optionWhy: why,
  misconceptionTag: "kavram karışıklığı",
  learningObjective: "Enflasyonla ilgili kavramları ayırt eder.",
});
// Canlıdaki dört soru (kökleri farklı, bilgisi aynı) ve beşinci parçanın sorusu.
const SAME = [
  "Aylık enflasyon oranının Cagan'ın tanımındaki eşiği geçtiği bir ekonomide hangi kavram kullanılır?",
  "Bir ekonomide aylık enflasyon oranı %52 olarak ölçülüyor. Cagan’ın tanımına göre bu durum hangi kavramla sınıflandırılır?",
  "Aylık enflasyonun Cagan’ın tanımındaki eşiği aştığı bir ekonomi hangi kavramla adlandırılır?",
  "Bir ekonomide fiyatlar çok hızlı yükseliyor. Cagan’ın tanımındaki aylık eşik de aşılmışsa bu durum hangi kavramla adlandırılır?",
];
const FIFTH = question("Bir ülkede genel fiyat düzeyi uzun süre boyunca düşmektedir. Bu durum hangi kavramla adlandırılır?", "Deflasyon");
// İkinci geçişin (öbür soruları görerek yazan) soruları.
const FRESH = [
  question("Enflasyon %60'tan %40'a inerken fiyatlar artmayı sürdürüyorsa ortaya çıkan durum hangisidir?", "Dezenflasyon"),
  question("Yüksek işsizlik ile enflasyonun aynı dönemde görüldüğü durum hangisidir?", "Stagflasyon"),
  question("Fiyatlar aylık %70 artarken ekonominin içinde bulunduğu durumu hangi kavram anlatır?", "Hiperenflasyon"),
];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => credits);
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, OPENAI_API_KEY: "k", OPENAI_CONTENT_MODEL: "luna-test" } };
});
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (params: { messages: { role: string; content: string }[] }) => {
          const system = params.messages[0]?.content ?? "";
          const user = params.messages[1]?.content ?? "";
          ai.prompts.push(`${system}\n${user}`);
          let content: string;
          if (system.includes("denetçisisin") || system.includes("anahtarı görmeden")) {
            content = JSON.stringify({ issues: [], solved: [] });
          } else if (/Bu üretim \d+\/\d+/.test(user)) {
            const index = ai.shardDrafts++;
            content = JSON.stringify({ questions: [index < SAME.length ? question(SAME[index]!, "Hiperenflasyon") : FIFTH] });
          } else {
            ai.passDrafts += 1;
            content = JSON.stringify({ questions: FRESH });
          }
          return { choices: [{ message: { content } }], usage: {} };
        },
      },
    };
  },
}));

const { runTeacherQuiz, shardBrief, shardTargets } = await import("@/lib/learning/teacher-quiz-run");

const POINTS = [
  "Enflasyon genel fiyat düzeyinin sürekli artmasıdır; tek malın fiyatı yetmez",
  "TÜFE hanehalkının, Yİ-ÜFE üreticinin fiyat değişimini ölçer",
  "Dezenflasyon oranın düşmesidir, deflasyon fiyatların düşmesidir",
  "Hiperenflasyon: Cagan'a göre aylık %50'nin üzeri",
];
const input = {
  userId: "u1",
  actionCode: "QUIZ_GENERATE" as const,
  idempotencyKey: "k1",
  topicLabel: "Enflasyonun Tanımı ve Ölçülmesi",
  prepTitle: "Makroekonomi",
  pages: [{ page: 1, text: "Enflasyon genel fiyat düzeyinin sürekli artmasıdır. Hiperenflasyon: aylık %50'nin üzeri." }],
  count: 5,
  optionCount: 4 as const,
  scope: "topic_test" as const,
  urgent: true,
  examPoints: POINTS,
  sanity: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  ai.prompts = [];
  ai.shardDrafts = 0;
  ai.passDrafts = 0;
});

describe("parçalı konu testi: parçalar ayrı hedef alır, birleşen test aynı bilgiyi tekrar etmez", () => {
  it("her parça ayrı bir 'Sınavda sorulur' maddesini sorar; madde azsa aynı maddeyi alan başka yönünü sorar", () => {
    const targets = shardTargets({ examPoints: POINTS, scope: "topic_test" }, 5);
    expect(targets.slice(0, 4)).toEqual(POINTS);
    expect(targets[4]).toBe(POINTS[0]);
    expect(shardBrief(undefined, 1, 5, targets)).toContain(`YALNIZ şunu sor: «${POINTS[1]}»`);
    expect(shardBrief(undefined, 4, 5, targets)).toContain("başka bir yönünü");
    expect(shardBrief(undefined, 1, 5, targets)).not.toContain("başka bir yönünü");
    // Madde yoksa dersin terimleri; o da yoksa eski satır.
    const lesson = { key: "L1", text: "", checks: [], terms: ["TÜFE", "Yİ-ÜFE", "Dezenflasyon"], missing: [] };
    expect(shardTargets({ examPoints: [], scope: "topic_test", lesson }, 3)).toEqual(["TÜFE", "Yİ-ÜFE", "Dezenflasyon"]);
    expect(shardTargets({ examPoints: [], scope: "topic_test" }, 3)).toEqual([]);
    expect(shardBrief(undefined, 0, 3, [])).toContain("Aynı konunun ayrı bir noktasını sor.");
  });

  it("canlıdaki dört aynı soru teslim edilmez; ikinci geçiş öbür soruları görerek tamamlar", async () => {
    const shown: string[][] = [];
    const out = await runTeacherQuiz({} as never, { ...input, onPlayable: (window) => shown.push(window.map((q) => q.text)) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Parça istemleri hedeflerini taşıdı.
    for (const point of POINTS) expect(ai.prompts.some((prompt) => prompt.includes(`«${point}»`))).toBe(true);
    // Taklit model hedefi yok sayıp dört parçada aynı bilgiyi yazıyor (gerçek modele hedef ayrı madde verir). Testin
    // bütününe bakan kural yine de dördünü teslim etmez: aynı cevap en çok iki, neredeyse aynı kök elenir.
    const answers = out.questions.map((q) => q.correct[0]);
    expect(answers.filter((answer) => answer === "Hiperenflasyon").length).toBeLessThanOrEqual(2);
    expect(out.questions.filter((q) => SAME.includes(q.text)).length).toBeLessThanOrEqual(2);
    expect(out.questions).toHaveLength(5);
    expect(ai.passDrafts).toBeGreaterThanOrEqual(1);
    // Öğrenciye akan pencerelerde de: gösterilen hiçbir soru sonradan elenmedi, aynı bilgi dört kez akmadı.
    const everShown = new Set(shown.flat());
    expect([...everShown].filter((text) => SAME.includes(text)).length).toBeLessThanOrEqual(2);
    for (const text of everShown) expect(out.questions.map((q) => q.text)).toContain(text);
  });
});
