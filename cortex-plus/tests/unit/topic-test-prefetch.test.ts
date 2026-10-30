import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { lessonQuizContext } from "@/lib/learning/lesson-quiz-context";
import { readLessonV2 } from "@/lib/learning/lesson-v3";

/*
  Önceden yazılan konu testi dersi bilir (20 Ekim 2026, ürün sahibinin kararı: Seçenek A). Anahtar
  dersin parmak izini taşır; ders kaydedilince dersten önce yazılmış test yenilenir; yazım sürerken
  ders değiştiyse sonuç saklanmaz, başka yazımın satırına dokunulmaz.
*/
const read = (rel: string) => readSource(path.join(process.cwd(), rel));
const route = read("src/app/api/learning/exam-prep/node/route.ts");

let prefetch: typeof import("@/lib/learning/lesson-prefetch");
let topicTest: typeof import("@/lib/learning/topic-test-prefetch");

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "test-secret-for-prefetch");
  vi.resetModules();
  prefetch = await import("@/lib/learning/lesson-prefetch");
  topicTest = await import("@/lib/learning/topic-test-prefetch");
});

const lessonJson = {
  title: "Bronşiolit",
  sections: [
    {
      heading: "Bronşiolit",
      body: "**Bronşiolit** küçük hava yollarının viral enfeksiyonudur; tedavinin temeli destek tedavisidir.",
    },
  ],
};
const KEY = lessonQuizContext([readLessonV2(lessonJson)!])!.key;
const QUIZ = { id: "n-quiz", kind: "quiz", status: "ready", session_meta: {} };

type Row = { status: string; payload: unknown; topic_id?: string | null };
function fakeDb(state: { nodes: unknown[]; lessons: unknown[]; prefetch: Record<string, Row | undefined> }) {
  const deleted: string[] = [];
  const service = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = "select";
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "gt", "neq", "order", "not", "in", "or", "update"]) chain[name] = () => chain;
      chain.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      };
      chain.delete = () => {
        op = "delete";
        return chain;
      };
      chain.limit = () =>
        Promise.resolve({ data: table === "exam_prep_nodes" ? state.nodes : table === "exam_prep_lessons" ? state.lessons : [], error: null });
      chain.maybeSingle = () =>
        Promise.resolve({ data: table === "exam_prep_prefetch" ? (state.prefetch[String(filters.node_id)] ?? null) : null });
      chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        if (op === "delete" && table === "exam_prep_prefetch") {
          deleted.push(String(filters.node_id));
          delete state.prefetch[String(filters.node_id)];
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      };
      return chain;
    },
  } as never;
  return { service, deleted };
}

const calls: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;
function captureFetch() {
  calls.length = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response("{}", { status: 202 });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

const saved = [{ title: "Bronşiolit", content_json: lessonJson, created_at: "2026-10-20T10:00:00Z" }];
const base = { origin: "https://cortexplus.app", userId: "u1", prepId: "p1", afterSortOrder: 3, topicId: "t1" };

describe("anahtar dersin parmak izini taşır", () => {
  it("ders yokken anahtar eskisiyle aynı; ders varken farklı; öbür türler ders anahtarını okumaz", () => {
    const topic = { topicLabel: "Solunum" };
    expect(prefetch.prefetchVariant("quiz", { ...topic, difficulty: "orta" })).toBe("quiz:orta");
    expect(prefetch.prefetchVariant("quiz", { ...topic, difficulty: "orta", lessonKey: "Labc123" })).toBe("quiz:orta:Labc123");
    expect(prefetch.prefetchVariant("quiz", { ...topic, lessonKey: "Labc123" })).not.toBe(prefetch.prefetchVariant("quiz", topic));
    for (const kind of ["lesson", "podcast", "oral", "true_false", "flashcards"]) {
      expect(prefetch.prefetchVariant(kind, { ...topic, lessonKey: "Labc123" })).toBe(prefetch.prefetchVariant(kind, topic));
    }
  });
});

describe("ders kaydedilince sıradaki test derse göre yenilenir", () => {
  it("dersten önce yazılmış hazır test silinir, yenisi istenir", async () => {
    captureFetch();
    const db = fakeDb({ nodes: [QUIZ], lessons: saved, prefetch: { "n-quiz": { status: "ready", payload: { prefetchVariant: "quiz:orta" }, topic_id: "t1" } } });
    await topicTest.refreshQuizPrefetchAfterLesson(db.service, base);
    expect(db.deleted).toEqual(["n-quiz"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ nodeId: "n-quiz", prefetch: true, action: "start" });
  });

  it("dersten önce başlamış (eski anahtarlı) yazım da yenilenir; bu derse göre olan dokunulmaz", async () => {
    captureFetch();
    const stale = fakeDb({ nodes: [QUIZ], lessons: saved, prefetch: { "n-quiz": { status: "creating", payload: { prefetchVariant: "quiz:orta" }, topic_id: "t1" } } });
    await topicTest.refreshQuizPrefetchAfterLesson(stale.service, base);
    expect(stale.deleted).toEqual(["n-quiz"]);
    expect(calls).toHaveLength(1);
    captureFetch();
    for (const status of ["ready", "creating"]) {
      const fresh = fakeDb({ nodes: [QUIZ], lessons: saved, prefetch: { "n-quiz": { status, payload: { prefetchVariant: `quiz:orta:${KEY}` }, topic_id: "t1" } } });
      await topicTest.refreshQuizPrefetchAfterLesson(fresh.service, base);
      expect(fresh.deleted).toEqual([]);
    }
    expect(calls).toHaveLength(0);
  });

  it("sıradaki bir ders parçasıysa, başka konunun testiyse ya da ders yoksa hiçbir şey yapılmaz; kayıt yoksa istenir", async () => {
    captureFetch();
    const lessonNext = fakeDb({ nodes: [{ ...QUIZ, id: "n-part", kind: "lesson" }], lessons: saved, prefetch: {} });
    await topicTest.refreshQuizPrefetchAfterLesson(lessonNext.service, base);
    const otherTopic = fakeDb({ nodes: [QUIZ], lessons: saved, prefetch: { "n-quiz": { status: "ready", payload: { prefetchVariant: "quiz:orta" }, topic_id: "t2" } } });
    await topicTest.refreshQuizPrefetchAfterLesson(otherTopic.service, base);
    const noLesson = fakeDb({ nodes: [QUIZ], lessons: [], prefetch: { "n-quiz": { status: "ready", payload: { prefetchVariant: "quiz:orta" }, topic_id: "t1" } } });
    await topicTest.refreshQuizPrefetchAfterLesson(noLesson.service, base);
    expect(calls).toHaveLength(0);
    expect([...lessonNext.deleted, ...otherTopic.deleted, ...noLesson.deleted]).toEqual([]);
    const empty = fakeDb({ nodes: [QUIZ], lessons: saved, prefetch: {} });
    await topicTest.refreshQuizPrefetchAfterLesson(empty.service, base);
    expect(calls).toHaveLength(1);
  });
});

describe("yazım bitince: ders değiştiyse ya da satır başkasınınsa saklanmaz", () => {
  const input = (variant: string, lessonKey: string | null) => ({
    origin: base.origin,
    userId: "u1",
    prepId: "p1",
    node: QUIZ,
    topicId: "t1",
    variant,
    lessonKey,
  });

  it("kendi satırı, ders aynı: saklanır", async () => {
    captureFetch();
    const db = fakeDb({ nodes: [], lessons: saved, prefetch: { "n-quiz": { status: "creating", payload: { prefetchVariant: `quiz:orta:${KEY}` } } } });
    expect(await topicTest.quizPrefetchStorable(db.service, input(`quiz:orta:${KEY}`, KEY))).toBe(true);
    // Etiketsiz satır (eski yazım) kendi satırı sayılır.
    const legacy = fakeDb({ nodes: [], lessons: [], prefetch: { "n-quiz": { status: "creating", payload: null } } });
    expect(await topicTest.quizPrefetchStorable(legacy.service, input("quiz:orta", null))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("satırı ders kaydından sonra başka yazım aldı: saklanmaz, ona dokunulmaz", async () => {
    captureFetch();
    const db = fakeDb({ nodes: [], lessons: saved, prefetch: { "n-quiz": { status: "creating", payload: { prefetchVariant: `quiz:orta:${KEY}` } } } });
    expect(await topicTest.quizPrefetchStorable(db.service, input("quiz:orta", null))).toBe(false);
    expect(db.deleted).toEqual([]);
    const gone = fakeDb({ nodes: [], lessons: saved, prefetch: {} });
    expect(await topicTest.quizPrefetchStorable(gone.service, input("quiz:orta", null))).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("yazım sürerken ders kaydedildi (yenileme çalışmadı): kendi satırı silinir, derse göre yenisi istenir", async () => {
    captureFetch();
    const db = fakeDb({ nodes: [], lessons: saved, prefetch: { "n-quiz": { status: "creating", payload: { prefetchVariant: "quiz:orta" } } } });
    expect(await topicTest.quizPrefetchStorable(db.service, input("quiz:orta", null))).toBe(false);
    expect(db.deleted).toEqual(["n-quiz"]);
    expect(calls).toHaveLength(1);
  });
});

describe("rota: ders kaydının her yolu testi yeniler; test yazımı satırına anahtarını yazar", () => {
  it("devralınan, hazır ve soğuk ders kaydından sonra; saklamadan önce denetim", () => {
    expect(route).toMatch(/payload: finished\.payload \}\);\s*refreshTopicQuiz\(topicId\);/);
    expect(route).toContain('if (kind === "lesson") refreshTopicQuiz(topicId);');
    expect(route).toMatch(/saveTopicLesson\(service, \{ prepId, topicId, payload \}\);\s*refreshTopicQuiz\(topicId\);/);
    expect(route).toMatch(/await saveTopicLesson\(input\.service, \{ prepId: input\.prepId, topicId: input\.topicId, payload \}\);\s*input\.onLessonSaved\?\.\(input\.topicId\);/);
    expect(route).toContain("onLessonSaved: refreshTopicQuiz,");
    expect(route).toContain('if (kind === "quiz") await tagQuizPrefetchClaim(service, { nodeId, variant });');
    const check = route.indexOf("quizPrefetchStorable(service, {");
    expect(check).toBeGreaterThan(0);
    expect(route.indexOf("storePrefetchedLesson(service, nodeId, { ...payload, prefetchVariant: variant }, { warm })")).toBeGreaterThan(check);
  });
});
