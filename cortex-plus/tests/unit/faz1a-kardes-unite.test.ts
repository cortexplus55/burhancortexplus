import { describe, expect, it, vi } from "vitest";

/*
  Faz 1-A §5.3 (19 Kasım 2026): aynı kaynak sayfayı paylaşan kardeş üniteler üretim isteminde AÇIKÇA hariç tutulur.
  Örnek şartnamenin kendi örneği: aynı sayfada Ünite 1'in sonu ve Ünite 2'nin başı.
*/

const captured = vi.hoisted(() => ({ quiz: [] as Record<string, unknown>[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/learning/teacher-quiz-run", () => ({
  runTeacherQuiz: vi.fn(async (_service: unknown, input: Record<string, unknown>) => {
    captured.quiz.push(input);
    return { ok: true, questions: [], stages: { draftMs: 0, reviewMs: 0, repairMs: 0 } };
  }),
}));
vi.mock("@/lib/documents/clean-pages", () => ({
  documentRunningHeaders: vi.fn(async () => []),
  ensureCleanPages: vi.fn(async (_service: unknown, input: { pages: number[] }) =>
    input.pages.map((page) => ({ page, text: `Ünite 1 sayfa ${page}: kaldırma kuvveti sıvının yoğunluğuna bağlıdır.` })),
  ),
}));
vi.mock("@/lib/documents/generation-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/documents/generation-context")>();
  return { ...actual, prepTopicLabels: vi.fn(async () => ["Ünite 1", "Ünite 2", "Ünite 3"]) };
});
vi.mock("@/lib/learning/previous-items", () => ({ loadPreviousItems: vi.fn(async () => []) }));
vi.mock("@/lib/curriculum/prep-outcome", () => ({ loadOfficialOutcome: vi.fn(async () => null) }));
vi.mock("@/lib/learning/lesson-generation-failures", () => ({ recordLessonGenerationFailure: vi.fn(async () => undefined) }));

const {
  EXCLUDED_SIBLING_TOPICS_TEMPLATE,
  EXCLUDED_SIBLING_CAP,
  excludedSiblingBoundaryBlock,
  loadExcludedSiblingTopics,
  pagesFromSourceRefs,
  siblingTopicsSharingPages,
  siblingsOutsideBoundary,
} = await import("@/lib/learning/sibling-topics");
const { teacherUserPrompt } = await import("@/lib/learning/teacher-lesson");
const { cardsUserPrompt } = await import("@/lib/learning/teacher-cards");
const { teacherQuizPayload } = await import("@/lib/learning/node/quiz");
const { siblingBoundaryLine } = await import("@/lib/learning/node/teacher-pages");

const EXPECTED_BLOCK =
  "Kaynak sayfalarda şu kardeş ünite başlıkları da bulunuyor: «Ünite 2». Bu ünitede YALNIZCA «Ünite 1» kapsamındaki " +
  "bilgileri anlat ve yalnız bu başlıktan soru üret. Kardeş başlıklara ait tanımları, kanun maddelerini veya " +
  "formülleri bu üniteye KESİNLİKLE alma.";

describe("EXCLUDED_SIBLING_TOPICS sınır bloğu (§1, §5.3)", () => {
  it("şablon şartnamedeki metnin kendisi; blok kardeş adlarını ve etkin başlığı yerine koyar", () => {
    expect(EXCLUDED_SIBLING_TOPICS_TEMPLATE).toBe(
      "Kaynak sayfalarda şu kardeş ünite başlıkları da bulunuyor: [EXCLUDED_SIBLING_TOPICS]. Bu ünitede YALNIZCA " +
        "[ACTIVE_TOPIC_TITLE] kapsamındaki bilgileri anlat ve yalnız bu başlıktan soru üret. Kardeş başlıklara ait " +
        "tanımları, kanun maddelerini veya formülleri bu üniteye KESİNLİKLE alma.",
    );
    expect(excludedSiblingBoundaryBlock("Ünite 1", ["Ünite 2"])).toBe(EXPECTED_BLOCK);
    expect(excludedSiblingBoundaryBlock("Ünite 1", ["Ünite 2", "Ünite 3"])).toContain("«Ünite 2», «Ünite 3»");
  });

  it("kardeş yoksa blok yok; etkin başlık ve tekrarlar ayıklanır; istem şişmesin diye üst sınır var", () => {
    expect(excludedSiblingBoundaryBlock("Ünite 1", [])).toBe("");
    expect(excludedSiblingBoundaryBlock("Ünite 1", ["Ünite 1", "ünite 1 "])).toBe("");
    expect(excludedSiblingBoundaryBlock("Ünite 1", ["Ünite 2", "Ünite 2"])).toBe(EXPECTED_BLOCK);
    const many = Array.from({ length: EXCLUDED_SIBLING_CAP + 5 }, (_, i) => `Ünite ${i + 2}`);
    expect(excludedSiblingBoundaryBlock("Ünite 1", many).match(/«/g)!.length).toBe(EXCLUDED_SIBLING_CAP + 1);
  });

  it("kardeş = aynı kaynak sayfasını paylaşan ünite; sayfası kesişmeyen ünite kardeş değildir", () => {
    const active = { label: "Ünite 1", pages: [{ documentId: "d1", page: 4 }, { documentId: "d1", page: 5 }] };
    const others = [
      { label: "Ünite 2", pages: [{ documentId: "d1", page: 5 }, { documentId: "d1", page: 6 }] },
      { label: "Ünite 3", pages: [{ documentId: "d1", page: 9 }] },
      { label: "Ünite 4", pages: [{ documentId: "d2", page: 5 }] },
    ];
    expect(siblingTopicsSharingPages(active, others)).toEqual(["Ünite 2"]);
    expect(siblingsOutsideBoundary(["Ünite 2", "Ünite 3"], ["Ünite 2"])).toEqual(["Ünite 3"]);
    expect(pagesFromSourceRefs([{ documentId: "d1", fileName: "x.pdf", pages: [5, 6] }])).toEqual([
      { documentId: "d1", page: 5 },
      { documentId: "d1", page: 6 },
    ]);
  });

  it("hazırlığın konularından kardeşleri okur (source_refs, yoksa sayfa bağları)", async () => {
    const rows = [
      { id: "t1", label: "Ünite 1", source_refs: [{ documentId: "d1", pages: [4, 5] }], document_topic_node_id: null },
      { id: "t2", label: "Ünite 2", source_refs: [], document_topic_node_id: "n2" },
      { id: "t3", label: "Ünite 3", source_refs: [{ documentId: "d1", pages: [9] }], document_topic_node_id: null },
    ];
    const links = [{ topic_id: "n2", document_id: "d1", page_number: 5 }];
    const builder = (data: unknown) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        limit: async () => ({ data, error: null }),
      };
      return chain;
    };
    const service = { from: (table: string) => builder(table === "exam_prep_topics" ? rows : links) };
    const found = await loadExcludedSiblingTopics(service as never, { prepId: "p1", topicLabel: "Ünite 1", topicId: "t1" });
    expect(found).toEqual(["Ünite 2"]);
    const failing = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { code: "x" } }) }) }) }) };
    expect(await loadExcludedSiblingTopics(failing as never, { prepId: "p1", topicLabel: "Ünite 1" })).toEqual([]);
  });
});

describe("üretim istemi kardeşleri hariç tutma bloğuna ekler (§5.3)", () => {
  it("ders yazarı istemi (runTeacherLesson → teacherUserPrompt)", () => {
    const prompt = teacherUserPrompt({
      topicLabel: "Ünite 1",
      prepTitle: "Fizik",
      pages: [{ page: 5, text: "Kaldırma kuvveti sıvının yoğunluğuna bağlıdır." }],
      upcomingTopics: [],
      siblingTopics: ["Ünite 2", "Ünite 3"],
      excludedSiblingTopics: ["Ünite 2"],
    });
    expect(prompt).toContain(EXPECTED_BLOCK);
    // Kapsam satırı yalnız sayfası kesişmeyen öbür konuyu sayar; kardeş katı blokta.
    const blockless = prompt.replace(EXPECTED_BLOCK, "");
    expect(blockless).toContain("Ünite 3");
    expect(blockless).not.toContain("Ünite 2");
    // Belgesiz derste sayfa yok: blok da yok.
    expect(
      teacherUserPrompt({ topicLabel: "Ünite 1", prepTitle: "Fizik", pages: [], upcomingTopics: [], mode: "topic", excludedSiblingTopics: ["Ünite 2"] }),
    ).not.toContain("kardeş ünite başlıkları");
  });

  it("konu testi (teacherQuizPayload) test yazarına bloğu verir", async () => {
    captured.quiz.length = 0;
    await teacherQuizPayload(
      {
        service: {},
        userId: "u1",
        kind: "quiz",
        prepId: "p1",
        topicLabel: "Ünite 1",
        prepTitle: "Fizik",
        sourceBlock: "",
        excludedSiblingTopics: ["Ünite 2"],
        charge: false,
      } as never,
      {} as never,
      { documentId: "d1", pages: [5] },
      5,
    );
    const brief = String(captured.quiz[0]?.brief ?? "");
    expect(brief).toContain(EXPECTED_BLOCK);
    expect(brief.replace(EXPECTED_BLOCK, "")).toContain("Ünite 3");
    expect(brief.replace(EXPECTED_BLOCK, "")).not.toContain("Ünite 2");
  });

  it("kart, Doğru/Yanlış ve sayfa motorları aynı bloğu okur", () => {
    const cards = cardsUserPrompt({
      topicLabel: "Ünite 1",
      prepTitle: "Fizik",
      pages: [{ page: 5, text: "Ünite 1 sonu." }],
      count: 6,
      scopeLine: excludedSiblingBoundaryBlock("Ünite 1", ["Ünite 2"]),
    });
    expect(cards).toContain(EXPECTED_BLOCK);
    expect(siblingBoundaryLine({ topicLabel: "Ünite 1", excludedSiblingTopics: ["Ünite 2"] }, { documentId: "d1", pages: [5] })).toBe(
      EXPECTED_BLOCK,
    );
    expect(siblingBoundaryLine({ topicLabel: "Ünite 1", excludedSiblingTopics: ["Ünite 2"] }, null)).toBe("");
  });
});
