import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_FIX_ROUNDS,
  REPAIR_CONCURRENCY,
  STUDENT_FIX_DEADLINE_MS,
  repairBudget,
  repairGroups,
} from "@/lib/learning/repair-budget";
import { teacherItemLoop } from "@/lib/learning/teacher-item-loop";
import {
  mockProgressCounter,
  mockProgressLine,
  postMockExamWithProgress,
  splitNdjson,
  type MockExamProgress,
} from "@/lib/learning/mock-exam/progress";
import {
  QUIZ_PLAYABLE_TARGET_MS,
  QUIZ_PREFETCHED_TARGET_MS,
  QUIZ_STREAM_COUNT,
  blockPracticeNodes,
  mergeStreamedQuestions,
  playableQuestions,
  practiceTopicKey,
  quizOpenStagesLog,
  settledQuizPayload,
  showsSlowWarning,
} from "@/lib/learning/quiz-delivery";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

afterEach(() => vi.unstubAllGlobals());

/*
 * Canlı test P1-1 (25 Ekim 2026): konu testi ve yazılı deneme öğrenci beklerken arka plan bütçesiyle
 * (200 sn, iki toplu düzeltme turu) koşuyordu; deneme ekranı "Konu 3 hazırlanıyor"da 3,5 dk durdu.
 */
describe("öğrenci bekliyor: kısa bütçe", () => {
  it("urgent tek tur, 40 sn, dörtlü paralel onarım; arka plan eskisi gibi", () => {
    expect(repairBudget(true)).toEqual({
      deadlineMs: STUDENT_FIX_DEADLINE_MS,
      maxFixRounds: 1,
      secondPassDeadlineMs: 60_000,
      fixConcurrency: REPAIR_CONCURRENCY,
    });
    expect(STUDENT_FIX_DEADLINE_MS).toBe(40_000);
    const background = repairBudget(false);
    expect(background.maxFixRounds).toBe(BACKGROUND_FIX_ROUNDS);
    expect(background.fixConcurrency).toBe(1);
    expect(repairBudget(undefined)).toEqual(background);
  });

  it("gruplar sırayı korur, en çok N grup, boş liste boş", () => {
    expect(repairGroups([], 4)).toEqual([]);
    expect(repairGroups([1, 2, 3], 4)).toEqual([[1], [2], [3]]);
    expect(repairGroups([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(repairGroups([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
    expect(repairGroups([1, 2, 3, 4, 5, 6, 7], 4).flat()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("bozuk öğe paralel onarılır, yalnız bozuk olan", () => {
  it("sorunlu öğeler gruplara bölünür ve aynı anda düzeltilir; temiz öğeye dokunulmaz", async () => {
    const fixedBatches: string[][] = [];
    let inFlight = 0;
    let peak = 0;
    const loop = await teacherItemLoop<string>({
      count: 6,
      started: Date.now(),
      deadlineMs: 40_000,
      maxFixRounds: 1,
      fixConcurrency: 4,
      draft: async () => ["ok1", "bad1", "ok2", "bad2", "bad3", "bad4", "ok3"],
      review: async (items) => items.map((item) => (item.startsWith("bad") ? ["sorun"] : [])),
      fix: async (failing) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        fixedBatches.push(failing.map((row) => row.item));
        return failing.map((row) => row.item.replace("bad", "fixed"));
      },
    });
    expect(peak).toBe(4);
    expect(fixedBatches.flat().sort()).toEqual(["bad1", "bad2", "bad3", "bad4"]);
    expect(loop.items).toEqual(["ok1", "ok2", "ok3", "fixed1", "fixed2", "fixed3"]);
    expect(loop.rounds).toBe(1);
  });

  it("düşen grubun öğeleri reddedilenlerde kalır, öbür grup kazanılır", async () => {
    const loop = await teacherItemLoop<string>({
      count: 4,
      started: Date.now(),
      deadlineMs: 40_000,
      maxFixRounds: 1,
      fixConcurrency: 2,
      draft: async () => ["ok1", "bad1", "bad2"],
      review: async (items) => items.map((item) => (item.startsWith("bad") ? ["sorun"] : [])),
      fix: async (failing) => (failing[0].item === "bad1" ? null : ["fixed2"]),
    });
    expect(loop.items).toEqual(["ok1", "fixed2"]);
    expect(loop.rejected.map((row) => row.item)).toEqual(["bad1"]);
  });
});

describe("deneme ilerlemesi gerçek konu sayısından", () => {
  it("sayaç biten konuyu sayar, toplamı aşmaz", () => {
    const seen: MockExamProgress[] = [];
    const tick = mockProgressCounter(3, (progress) => seen.push(progress));
    tick("Birim çember");
    tick("Ters fonksiyon");
    tick("Toplam formülü");
    tick("fazla");
    expect(seen.map((row) => row.done)).toEqual([0, 1, 2, 3, 3]);
    expect(seen[1]).toEqual({ done: 1, total: 3, label: "Birim çember" });
  });

  it("ekran satırı donmaz: her biten konu sayıyı değiştirir", () => {
    expect(mockProgressLine({ done: 0, total: 0, label: null })).toBe("Konular okunuyor…");
    expect(mockProgressLine({ done: 2, total: 5, label: "Hücre zarı" })).toBe("5 konunun 2'i hazır · son biten: Hücre zarı");
    expect(mockProgressLine({ done: 5, total: 5, label: "x" })).toContain("sorular toparlanıyor");
  });

  it("NDJSON satırları yarım parçadan bölünür", () => {
    const first = splitNdjson('{"type":"progress","done":1,"total":2,"label":"A"}\n{"type":"pro');
    expect(first.lines).toEqual([{ type: "progress", done: 1, total: 2, label: "A" }]);
    expect(first.rest).toBe('{"type":"pro');
  });

  it("akış okunur: ilerleme ekrana, son satır sonuç", async () => {
    const encoder = new TextEncoder();
    const lines = [
      { type: "progress", done: 0, total: 2, label: null },
      { type: "progress", done: 1, total: 2, label: "A" },
      { type: "progress", done: 2, total: 2, label: "B" },
      { type: "done", status: 200, data: { ok: true, examId: "e1" } },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).Accept).toBe("application/x-ndjson");
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const text = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
            controller.enqueue(encoder.encode(text.slice(0, 30)));
            controller.enqueue(encoder.encode(text.slice(30)));
            controller.close();
          },
        });
        return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
      }),
    );
    const seen: number[] = [];
    const out = await postMockExamWithProgress("/api/x", () => ({}), (progress) => seen.push(progress.done));
    expect(seen).toEqual([0, 1, 2]);
    expect(out).toEqual({ status: 200, data: { ok: true, examId: "e1" } });
  });

  it("üretim düşüşünde bir kez yeniden ister; hak yoksa istemez", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "generation_failed" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, examId: "e2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await postMockExamWithProgress("/api/x", () => ({}), () => {}, { delayMs: 1 });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const credits = vi.fn(async () => new Response(JSON.stringify({ code: "insufficient_credits" }), { status: 402 }));
    vi.stubGlobal("fetch", credits);
    await postMockExamWithProgress("/api/x", () => ({}), () => {}, { delayMs: 1 });
    expect(credits).toHaveBeenCalledTimes(1);
  });
});

function practiceQuestion(text: string): QuizQuestion {
  return {
    text,
    options: ["Uygulanır", "Ertelenir", "Düşer", "Askıdadır"],
    correct: ["Uygulanır"],
    multi: false,
    explanation: "Koşul tamamsa işlem yürür.",
  };
}

describe("aynı konunun bloğu ve akan ilk pencere", () => {
  const node = (
    id: string,
    kind: string,
    sort: number,
    topicId: string,
    status?: string,
  ) => ({ id, kind, sort_order: sort, status: status ?? null, session_meta: { topicId } });

  it("dersin ardından sonraki derse kadar yalnız aynı konunun test, doğru/yanlış ve kartları", () => {
    const nodes = [
      node("lesson", "lesson", 1, "t1"),
      node("quiz", "quiz", 2, "t1"),
      node("tf", "true_false", 3, "t1"),
      node("cards", "flashcards", 4, "t1"),
      node("done", "quiz", 5, "t1", "done"),
      node("other", "quiz", 6, "t2"),
      node("pod", "podcast", 7, "t1"),
      node("next-lesson", "lesson", 8, "t1"),
      node("after", "quiz", 9, "t1"),
    ];
    expect(blockPracticeNodes(nodes, 1, "id:t1").map((row) => row.id)).toEqual(["quiz", "tf", "cards"]);
    expect(blockPracticeNodes(nodes, 1, null)).toEqual([]);
    for (const topicId of ["vatandaslik", "derisim", "dizi", "article"]) {
      const mixed = [
        node("lesson", "lesson", 1, topicId),
        node("own", "quiz", 2, topicId),
        node("foreign", "true_false", 3, "baska"),
        node("stop", "lesson", 4, topicId),
        node("later", "flashcards", 5, topicId),
      ];
      expect(blockPracticeNodes(mixed, 1, `id:${topicId}`).map((row) => row.id)).toEqual(["own"]);
    }
  });

  it("konu anahtarı kimlik, yoksa başlık; bitmiş adım completed da atlanır", () => {
    expect(practiceTopicKey({ topicId: "  abc  " })).toBe("id:abc");
    expect(practiceTopicKey({ topicTitle: "Madde Bir" })).toBe("title:madde bir");
    expect(practiceTopicKey(null)).toBeNull();
    const done = [{ id: "x", kind: "quiz", sort_order: 2, status: "completed", session_meta: { topicTitle: "Madde Bir" } }];
    expect(blockPracticeNodes(done, 1, "title:madde bir")).toEqual([]);
  });

  it("ilk pencere üç soru, tekrar elenir, cevaplanan önek yerinde kalır", () => {
    const questions = ["alfa kuralı", "beta eşiği", "gama sırası", "delta istisnası", "epsilon tanımı"].map(practiceQuestion);
    expect(playableQuestions(questions)).toHaveLength(QUIZ_STREAM_COUNT);
    expect(playableQuestions([...questions, practiceQuestion("alfa kuralı")]).map((row) => row.text)).toEqual([
      "alfa kuralı",
      "beta eşiği",
      "gama sırası",
    ]);
    const shown = [practiceQuestion("alfa kuralı")];
    const merged = mergeStreamedQuestions(shown, questions);
    expect(merged[0]).toBe(shown[0]);
    expect(merged.map((row) => row.text)).toEqual(["alfa kuralı", "beta eşiği", "gama sırası", "delta istisnası", "epsilon tanımı"]);
  });

  it("yavaş uyarı test, kart ve tekrarda yok; takılı test kesik sayılmaz", () => {
    expect(showsSlowWarning("quiz")).toBe(false);
    expect(showsSlowWarning("true_false")).toBe(false);
    expect(showsSlowWarning("flashcards")).toBe(false);
    expect(showsSlowWarning("spaced")).toBe(false);
    expect(showsSlowWarning("oral")).toBe(true);
    expect(showsSlowWarning("lesson")).toBe(true);
    const settled = settledQuizPayload({ building: true, builtAt: 1, upcoming: ["a"], questions: [practiceQuestion("alfa kuralı")], type: "quiz" });
    expect(settled.building).toBeUndefined();
    expect(settled.truncated).toBeUndefined();
    expect(settled.questions).toHaveLength(1);
    expect(QUIZ_PLAYABLE_TARGET_MS).toBe(45_000);
    expect(QUIZ_PREFETCHED_TARGET_MS).toBe(3_000);
    expect(quizOpenStagesLog({ topic: "Konu", kind: "quiz", stages: { draftMs: 1, reviewMs: 2, repairMs: 3 }, kept: 5, streamed: true }).playableTargetMs).toBe(45_000);
  });
});

describe("kablolama", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("deneme: konu bağlamı paralel, motorlar urgent, ilerleme akışı", () => {
    const create = read("src/lib/learning/mock-exam/create.ts");
    expect(create).toMatch(/await Promise\.all\(\s*slots\.map\(async \(slot\) => \{/);
    expect(create.match(/urgent: true/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(create).toContain(".finally(() => progress(row.topicLabel))");
    const route = read("src/app/api/learning/exam-prep/mock-exam/route.ts");
    expect(route).toContain('includes("application/x-ndjson")');
    const setup = read("src/components/parity/mock-exam-setup.tsx");
    expect(setup).not.toContain("setInterval");
    expect(setup).toContain("postMockExamWithProgress");
  });

  it("etkinlik bitince sıradaki önceden yazılır; öğrenci isteği urgent", () => {
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    const complete = node.slice(node.indexOf('if (action === "complete")'));
    expect(complete.indexOf("requestNextPrefetch(")).toBeGreaterThan(complete.indexOf("completion_failed"));
    expect(node.match(/urgent: input\.charge !== false/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("test motoru bütçesi urgent'a bağlı, onarım paralel", () => {
    const run = read("src/lib/learning/teacher-quiz-run.ts");
    expect(run).toContain("repairBudget(true)");
    expect(run).toContain("repairGroups(toFix, budget.fixConcurrency)");
    expect(run).toContain("secondPassDeadline");
    expect(run).toContain("onPlayable");
    expect(run).toContain("playableQuestions");
  });

  it("ders açılınca bloktaki test, doğru/yanlış ve kartlar yazılır; ilk pencere akar", () => {
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(node).toContain("requestBlockPracticePrefetch");
    expect(node).toContain("streamQuiz");
    expect(node).toContain("settledQuizPayload");
    expect(node).toContain("quiz_open_stages");
    expect(node).toContain(
      "requestNextPrefetch(service, { origin: options.origin, userId, prepId, sortOrder: node.sort_order as number })",
    );
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("warnSlow={showsSlowWarning(kind)}");
    expect(session).toContain("mergeStreamedQuestions");
    const finish = session.slice(session.indexOf("async function finish"), session.indexOf("function updateAnswer"));
    const optimistic = finish.slice(0, finish.indexOf("setLoading(true)"));
    expect(optimistic.indexOf('setStage("result")')).toBeGreaterThan(-1);
    expect(optimistic.indexOf('setStage("result")')).toBeLessThan(optimistic.indexOf("postComplete"));
    expect(optimistic).not.toContain("toast.error");
    const progress = read("src/components/parity/node-generation-progress.tsx");
    expect(progress).toContain("slow && warnSlow && !note");
    expect(progress).toContain("Bu işlem birkaç dakika sürebilir.");
  });
});
