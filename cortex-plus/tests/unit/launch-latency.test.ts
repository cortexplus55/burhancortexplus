import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { teacherQuizLoop } = await import("@/lib/learning/teacher-quiz-run");
const { waitForPrefetchReady } = await import("@/lib/learning/lesson-prefetch");
const { topicLessonInFlight } = await import("@/lib/learning/topic-test-prefetch");
const { preparingTitle } = await import("@/components/parity/node-generation-progress");

/*
  Lansman öncesi canlı test (24 Ekim 2026, ücretsiz görünüm, Biyoloji hazırlığı): EKG dersinden hemen sonra
  açılan konu testi 150-230 sn sürdü. Günlükte aynı test üç kez yazılmıştı: ders kaydedilmeden önce bir önceden
  yazım (143 sn, çöpe gitti), ders kaydedilince ikincisi (240 sn, saklanmadı) ve öğrencinin isteği 30 sn
  bekleyip sıfırdan yazdığı üçüncüsü. Turların çoğu yalnız pedagojik ("vaka yok") sorundandı.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const why = (options: string[]) => options.map((option) => `${option} için kısa ve kendine özgü bir gerekçe.`);
const raw = (text: string, options: string[], correct: string) => ({
  text,
  options,
  correct,
  multi: false,
  explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
  optionWhy: why(options),
  misconceptionTag: "iletim sırası karışıklığı",
  learningObjective: "Uyarının kalpteki yolunu ayırt eder.",
});
const NODES = ["SA düğümü", "AV düğümü", "His demeti", "Purkinje lifleri"];
const draftQuestions = [
  raw("Kalpte uyarı hangi yapıda oluşur?", NODES, "SA düğümü"),
  raw("Uyarının kısa süre beklediği yapı hangisidir?", NODES, "AV düğümü"),
  raw("Uyarıyı karıncık kas hücrelerine dağıtan yapı hangisidir?", NODES, "Purkinje lifleri"),
  raw("AV düğümünden sonra uyarıyı ileten yapı hangisidir?", NODES, "His demeti"),
  raw("Normal PR aralığı hangisidir?", ["0,12-0,20 sn", "0,30-0,40 sn", "0,02-0,05 sn", "0,50-0,60 sn"], "0,12-0,20 sn"),
  raw("Normal QRS süresi için hangisi doğrudur?", ["0,12 sn'den kısa", "0,30 sn'den uzun", "Tam 1 sn", "0,5 sn'den uzun"], "0,12 sn'den kısa"),
  raw("P dalgası neyi gösterir?", ["Kulakçık depolarizasyonu", "Karıncık repolarizasyonu", "Kapakların kapanması", "Kalp sesi"], "Kulakçık depolarizasyonu"),
  raw("T dalgası neyi gösterir?", ["Karıncık repolarizasyonu", "Kulakçık depolarizasyonu", "SA düğümünün uyarısı", "Kapak açılması"], "Karıncık repolarizasyonu"),
];
const FIXED = [0, 1, 2, 3, 4, 5].map((i) => raw(`Düzeltilmiş vaka sorusu ${i}: bir hastada uyarı hangi yapıda başlar?`, NODES, "SA düğümü"));
const input = {
  topicLabel: "Kalbin Uyarı İletimi ve EKG",
  prepTitle: "Biyoloji",
  pages: [{ page: 44, text: "SA → AV → His → Purkinje. PR 0,12–0,20 sn; QRS < 0,12 sn." }],
  count: 5,
  scope: "topic_test" as const,
};

function fakeAsk(verifies: unknown[]) {
  const calls = { draft: 0, fix: 0, verify: 0 };
  let verify = 0;
  const ask = vi.fn(async (system: string) => {
    if (system.includes("denetçisisin")) {
      calls.verify += 1;
      return verifies[verify++] ?? { issues: [] };
    }
    if (system.startsWith("Sen aynı testi yazan")) {
      calls.fix += 1;
      return { questions: FIXED };
    }
    calls.draft += 1;
    return { questions: draftQuestions };
  });
  return { ask, calls };
}
// Sekiz taslak sorunun altısında yalnız pedagojik sorun (H: vaka yok): öğrenciye gidecek 5 sorudan eksik kalır.
const softOnly = { issues: [0, 1, 2, 3, 4, 5].map((question) => ({ question, code: "H", severity: "high", problem: "vaka yok" })) };

describe("konu testi: öğrenci beklerken yalnız pedagojik sorun için tur açılmaz", () => {
  it("önceden yazım (urgent yok): bugünkü gibi bir düzeltme turu", async () => {
    const { ask, calls } = fakeAsk([softOnly]);
    const loop = await teacherQuizLoop(ask, input);
    expect(calls.fix).toBe(1);
    expect(loop.rounds).toBe(1);
  });

  it("öğrenci bekliyor (urgent): düzeltme çağrısı yok, sayı yumuşak kurtarmayla tamamlanır", async () => {
    const { ask, calls } = fakeAsk([softOnly]);
    const loop = await teacherQuizLoop(ask, { ...input, urgent: true });
    expect(calls).toEqual({ draft: 1, verify: 1, fix: 0 });
    expect(loop.rounds).toBe(0);
    expect(loop.questions).toHaveLength(5);
    expect(loop.softKept).toBeGreaterThan(0);
  });

  it("öğrenci bekliyor ama doğruluk sorunu var (A): yine düzeltilir, yanlış soru asla geri konmaz", async () => {
    const hard = {
      issues: [
        { question: 0, code: "A", severity: "high", problem: "anahtar yanlış" },
        ...[1, 2, 3, 4, 5].map((question) => ({ question, code: "H", severity: "high", problem: "vaka yok" })),
      ],
    };
    const { ask, calls } = fakeAsk([hard]);
    const loop = await teacherQuizLoop(ask, { ...input, urgent: true });
    expect(calls.fix).toBe(1);
    expect(loop.questions.map((question) => question.text)).not.toContain(draftQuestions[0].text);
  });

  it("node rotası: öğrenci isteği urgent, önceden yazım değil; deadline istek saatinden", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("urgent: input.charge !== false,");
    expect(route).toContain("const startedAt = input.requestStartedAt ?? Date.now();");
    expect(route).toContain("requestStartedAt: requestStarted,");
  });
});

/** `exam_prep_prefetch` satırını sırayla değiştiren sahte istemci. */
function prefetchRows(rows: (Record<string, unknown> | null)[]) {
  let i = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rows[Math.min(i++, rows.length - 1)] }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("önceden yazım süren testi bekle, ikinci kez yazma", () => {
  const fresh = () => new Date().toISOString();

  it("anahtarı tutmayan yazım beklenmez (dersten önce yazılan test)", async () => {
    let t = 0;
    const service = prefetchRows([{ status: "creating", updated_at: fresh(), payload: { prefetchVariant: "quiz:orta:" } }]);
    const ready = await waitForPrefetchReady(service, { userId: "u", nodeId: "n", maxMs: 30_000, variant: "quiz:orta:Labc", matchedMaxMs: 100_000 }, () => (t += 10));
    expect(ready).toBe(false);
    expect(t).toBeLessThan(100);
  });

  it("anahtarı tutan yazım 30 sn'den uzun da sürse beklenir ve hazır olunca alınır", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const creating = { status: "creating", updated_at: new Date().toISOString(), payload: { prefetchVariant: "quiz:orta:Labc" } };
      const rows = [...Array.from({ length: 50 }, () => creating), { status: "ready", updated_at: new Date().toISOString(), payload: {} }];
      const service = prefetchRows(rows);
      const pending = waitForPrefetchReady(
        service,
        { userId: "u", nodeId: "n", maxMs: 30_000, variant: "quiz:orta:Labc", matchedMaxMs: 100_000 },
        () => clock,
      );
      for (let step = 0; step < 60; step += 1) {
        clock += 1_000;
        await vi.advanceTimersByTimeAsync(1_000);
      }
      await expect(pending).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rota beklemeye anahtarı ve uzun sınırı veriyor", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("await waitForPrefetchReady(service, { userId, nodeId, maxMs: 30_000, variant, matchedMaxMs: PREFETCH_MATCHED_WAIT_MS });");
    expect(route).toMatch(/const PREFETCH_MATCHED_WAIT_MS = 100_000;/);
  });
});

describe("ders yazılırken konu testi önceden yazılmaz", () => {
  const service = (lessonNodes: string[], attempts: number) =>
    ({
      from: (table: string) => {
        if (table === "exam_prep_nodes") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            then: (resolve: (value: unknown) => void) => resolve({ data: lessonNodes.map((id) => ({ id })) }),
          };
          return chain;
        }
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: () => Promise.resolve({ count: attempts }),
        };
        return chain;
      },
    }) as never;

  it("son 10 dakikada açılmış ders denemesi varsa yazım sürüyor sayılır", async () => {
    await expect(topicLessonInFlight(service(["l1"], 1), { prepId: "p", userId: "u", topicId: "t" })).resolves.toBe(true);
    await expect(topicLessonInFlight(service(["l1"], 0), { prepId: "p", userId: "u", topicId: "t" })).resolves.toBe(false);
    await expect(topicLessonInFlight(service([], 3), { prepId: "p", userId: "u", topicId: "t" })).resolves.toBe(false);
  });

  it("rota yalnız önceden yazımda ve kaydedilmiş ders yokken atlar", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toMatch(/prefetch &&\s*kind === "quiz" &&\s*teachingV2 &&\s*topic\?\.id &&\s*!quizLesson &&\s*\(await topicLessonInFlight/);
    expect(route).toContain('return NextResponse.json({ ok: true, skipped: "lesson_building" });');
  });
});

describe("bekleme ekranı etkinliğin adını söyler", () => {
  it("test açılırken 'Dersin hazırlanıyor' yazmaz", () => {
    expect(preparingTitle("quiz")).toBe("Testin hazırlanıyor…");
    expect(preparingTitle("lesson")).toBe("Dersin hazırlanıyor…");
    expect(preparingTitle("flashcards")).toBe("Kartların hazırlanıyor…");
    expect(preparingTitle(undefined)).toBe("Hazırlanıyor…");
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("title={preparingTitle(kind)}");
  });
});
