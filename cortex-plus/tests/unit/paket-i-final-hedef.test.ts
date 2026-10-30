import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeCall, type FakeResult } from "./helpers/query-recorder";

const mocks = vi.hoisted(() => ({ flag: vi.fn(), tracking: vi.fn() }));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: mocks.flag,
}));
vi.mock("@/lib/learning/learning-tracking-persist", () => ({
  recordLearningTrackingAfterComplete: mocks.tracking,
}));

import {
  ALL_TOPICS_KINDS,
  ALL_TOPICS_LABEL,
  finalStepTopic,
  prepWideTargetTopic,
  rankFinalStepTopics,
} from "@/lib/learning/prep-wide-target";
import { buildLocalSessionPayload } from "@/lib/learning/exam-local-session";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import { askedItemsFromPayload, collectAskedItems } from "@/lib/learning/previous-items";
import { teacherTrueFalseLoop } from "@/lib/learning/teacher-practice";
import { writeBackMockToPrep } from "@/lib/learning/mock-exam/prep-writeback";
import type { MockGradeItem } from "@/lib/learning/mock-exam";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";

/*
  Paket I #8 (30 Ekim 2026) — final adımları etiketteki konuyu hedeflemiyordu. Canlı: "Zayıf nokta" 1. konu
  etiketliyken sorular 5.-6. konudan; "Son kontrol"ün 5 sorusu iki konudan ve etiket başka konu; son kartlar
  zor konudan değil 2. haftanın konusundan; sözlü "Tüm sınav" başlığı tek konu; yol oraya gelmeden çözülen deneme
  "Yazılı deneme" adımını bitirdi; aynı 3-4 bilgi test, odaklı pratik, D/Y ve kartlarda 4-5 kez soruldu.
  Örnekler farklı derslerden; seçici yalnız sayılara bakar.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function snap(topicKey: string, correct: number, total: number): TopicMasterySnapshot {
  return {
    topicKey,
    measured: total > 0,
    level: correct / Math.max(1, total) >= 0.55 ? "emerging" : "weak",
    confidence: 0,
    evidenceCount: total,
    firstAttemptCorrect: correct,
    firstAttemptTotal: total,
    independentCorrect: correct,
    independentTotal: total,
    lastPracticedAt: "2026-10-20T09:00:00.000Z",
  };
}

const planned = ["Diziler", "Yığın", "Kuyruk", "Ağaçlar", "Heap", "AVL"];

describe("tek seçici: en düşük ölçülen başarı, sonra en çok açık yanlış", () => {
  it("ölçülen zayıflar başarıya göre, eşitlikte açık yanlışa göre; ölçülmemiş ve yanlışsız konu zayıf değil", () => {
    const ranked = rankFinalStepTopics({
      plannedTopics: planned,
      mastery: [snap("yığın", 3, 5), snap("heap", 2, 5), snap("avl", 2, 5), snap("diziler", 5, 5), snap("kuyruk", 1, 2)],
      openMisses: [{ topicLabel: "AVL" }, { topicLabel: "AVL" }, { topicLabel: "Kuyruk" }, { topicLabel: "sohbetten serbest konu" }],
      targetScore: 70,
    });
    expect(ranked.map((row) => row.label)).toEqual(["AVL", "Heap", "Yığın", "Kuyruk"]);
    expect(ranked[0]).toMatchObject({ percent: 40, measured: true, openWrongs: 2 });
    // "Ağaçlar" ölçülmemiş ve yanlışı yok: önceden listeye girip zayıf nokta testine giriyordu.
    expect(ranked.some((row) => row.label === "Ağaçlar")).toBe(false);
    expect(finalStepTopic({ plannedTopics: planned, mastery: [snap("diziler", 5, 5)], openMisses: [], targetScore: 70 })).toBeNull();
  });

  it("zayıf nokta, odaklı pratik ve son kartlar aynı konuyu alır", () => {
    const mastery = [snap("kuyruk", 1, 4), snap("heap", 3, 4)];
    const ranked = rankFinalStepTopics({ plannedTopics: planned, mastery, openMisses: [], targetScore: 70 }).map((row) => row.label);
    for (const kind of ["gaps", "focused", "flashcards"] as const) {
      expect(prepWideTargetTopic({ kind, requestedTopic: "", adaptiveFocus: null, practiceTopics: ranked, mastery, plannedTopics: planned })).toBe("Kuyruk");
    }
  });

  it("Hazırsın önerisi aynı seçiciden", () => {
    const mastery = [snap("diziler", 6, 10), snap("heap", 4, 10)];
    const screen = buildReadinessScreen({
      plannedTopics: planned,
      mastery,
      openMissesByTopic: [],
      mockScorePct: null,
      targetScore: 70,
      nodes: [],
      links: { focused: "/f", home: "/h" },
    });
    const chosen = finalStepTopic({ plannedTopics: planned, mastery, openMisses: [], targetScore: 70 });
    expect(chosen).toBe("Heap");
    expect(screen.actions[0]?.label).toBe(`Odaklı pratik: ${chosen}`);
  });

  it("son kontrol, yazılı deneme ve Hazırsın bütün konulardır; yeniden hedeflenmez ve 1. konunun adını yazmaz", () => {
    for (const kind of ["final_check", "written_exam", "readiness"] as const) {
      expect(ALL_TOPICS_KINDS.has(kind)).toBe(true);
      expect(prepWideTargetTopic({ kind, requestedTopic: "", adaptiveFocus: null, practiceTopics: ["Heap"], mastery: [], plannedTopics: planned })).toBeNull();
    }
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain("if (ALL_TOPICS_KINDS.has(node.kind))");
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx")).toContain(
      "else if (ALL_TOPICS_KINDS.has(node.kind as PlanNodeKind)) topicLabel = ALL_TOPICS_LABEL;",
    );
    // Sözlü "Tüm sınav" başlığı düğümün konusu değil.
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("? ALL_TOPICS_LABEL");
    expect(ALL_TOPICS_LABEL).toBe("Tüm konular");
  });
});

describe("yerel oturum: etiket, sorular ve kanıt aynı konu", () => {
  const prep = { userId: "u1", prepId: "p1", prepTitle: "Veri Yapıları", targetScore: 70, learningPreferences: null };
  const masteryRows = [
    { topic_key: "heap", measured_level: "weak", confidence: 0, evidence_count: 5, first_attempt_correct: 1, first_attempt_total: 5, independent_correct: 1, independent_total: 5, last_practiced_at: null },
    { topic_key: "kuyruk", measured_level: "emerging", confidence: 0, evidence_count: 5, first_attempt_correct: 3, first_attempt_total: 5, independent_correct: 3, independent_total: 5, last_practiced_at: null },
  ];
  const lessonFor = (prompt: string) => ({
    sections: [{ heading: prompt, check: { prompt, options: ["a1", "b1", "c1", "d1"], answerIndex: 0, explanation: "Açıklama metni" } }],
  });
  const handler =
    (lessons: { content_json: unknown; topic_id: string }[]) =>
    (call: FakeCall): FakeResult | undefined => {
      if (call.table === "exam_prep_topics") return { data: planned.map((label, index) => ({ id: `t${index}`, label })) };
      if (call.table === "exam_prep_topic_mastery") return { data: masteryRows };
      if (call.table === "exam_prep_misconceptions") return { data: [] };
      if (call.table === "exam_prep_nodes") return { data: [{ id: "n1", kind: "gaps", status: "ready", session_meta: { topicTitle: "Diziler" } }] };
      if (call.table === "exam_prep_lessons") return { data: lessons };
      if (call.table === "exam_prep_node_attempts") return { data: [] };
      if (call.table === "exam_prep_prefetch") return { data: [] };
      return undefined;
    };

  it("zayıf nokta tek konuya yazılır (en zayıf); devralınan 1. konuya ya da altı konuya değil", async () => {
    const plan = await buildLocalSessionPayload(fakeSupabase(handler([])).service as never, { ...prep, kind: "gaps" });
    expect(plan).toEqual({ action: "generate", topics: ["Heap"] });
  });

  it("son kontrol hazır sorularla ancak bütün konuları kapsıyorsa açılır; eksik konuya konu başına bir soru yazılır", async () => {
    const lessons = [
      { content_json: lessonFor("Heap sorusu nedir acaba?"), topic_id: "t4" },
      { content_json: lessonFor("Kuyruk sorusu nedir acaba?"), topic_id: "t2" },
    ];
    const plan = await buildLocalSessionPayload(fakeSupabase(handler(lessons)).service as never, { ...prep, kind: "final_check" });
    expect(plan.action).toBe("generate");
    if (plan.action !== "generate") return;
    // En zayıf önce gelen hazır iki soru tohum; geri kalan dört konu yazılır.
    expect(plan.fill?.seed.map((question) => question.topic)).toEqual(["Heap", "Kuyruk"]);
    expect(plan.topics).toEqual(["Diziler", "Yığın", "Ağaçlar", "AVL"]);
    expect(plan.fill?.perTopic).toBe(1);
  });

  it("rota: hazır sorulu zayıf nokta / odaklı pratikte etiket ve içerik seçilen konu", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("const chosen = local.topics[0]!;");
    expect(route).toContain("topicLabel = chosen;");
    expect(route).toContain("payload: { ...local.payload, testedTopic: chosen }");
    // İstemci, sunucunun seçtiği konuyu oturum ve sonuç başlığına yazar.
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("if (chosen) setTopicLabel(chosen);");
  });
});

describe("adım ancak kendi oturumu bitince tamamlanır (yazılı deneme)", () => {
  const item = (topicLabel: string, verdict: MockGradeItem["verdict"]): MockGradeItem => ({
    questionId: `q-${topicLabel}`,
    userAnswer: "x",
    isCorrect: verdict === "dogru",
    pointsEarned: verdict === "dogru" ? 1 : 0,
    pointsMax: 1,
    verdict,
    explanation: "",
    feedback: null,
    topicId: null,
    topicLabel,
  });
  const input = {
    userId: "u1",
    prepId: "p1",
    scope: "all",
    practiceExamId: "e9",
    practiceAttemptId: "pa9",
    scorePct: 35,
    items: [item("Yevmiye", "yanlis"), item("Envanter", "dogru")],
  };
  const handler = (status: string) => (call: FakeCall): FakeResult | undefined => {
    if (call.table === "exam_preps") return { data: { id: "p1", target_score: 60 } };
    if (call.table === "exam_prep_nodes" && call.op === "select") return { data: { id: "n-w", status } };
    if (call.table === "exam_prep_node_attempts" && call.op === "insert") return { data: { id: "att-9", status: "active" } };
    return {};
  };

  beforeEach(() => {
    mocks.flag.mockReset().mockResolvedValue(true);
    mocks.tracking.mockReset().mockResolvedValue({ nextNodeId: null, tracking: null, topicGain: null });
  });

  it("yol oraya gelmeden (kilitli) çözülen deneme adımı bitirmez; kanıt kaybolmaz", async () => {
    const fake = fakeSupabase(handler("locked"));
    expect(await writeBackMockToPrep(fake.service as never, input)).toBeNull();
    expect(fake.rpcCalls.some((call) => call.name === "complete_exam_prep_node")).toBe(false);
    expect(fake.calls.some((call) => call.op === "update" && call.table === "exam_prep_nodes")).toBe(false);
    expect(mocks.tracking).toHaveBeenCalledTimes(1);
    expect(mocks.tracking.mock.calls[0]![1]).toMatchObject({ nodeId: null, attemptId: null, kind: "written_exam" });
  });

  it("öğrencinin açtığı ya da sırası gelmiş (ready) adım kendi oturumudur: tamamlanır", async () => {
    const fake = fakeSupabase(handler("ready"));
    expect(await writeBackMockToPrep(fake.service as never, input)).toMatchObject({ nodeId: "n-w" });
    const complete = fake.rpcCalls.find((call) => call.name === "complete_exam_prep_node");
    expect(complete?.args).toMatchObject({ p_node_id: "n-w", p_score: 35, p_total: 100 });
    // "choose" düğümü ready yapar; düğüm sayfası da (kurulum yönlendirmesinden önce).
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toContain('update({ status: "ready" }).eq("id", nodeId).eq("status", "locked")');
  });
});

describe("etkinlikler arası tekrar yasağı", () => {
  it("her tür sorduğunu bildirir: test kökü ve yoklanan bölüm, önerme, kart, sözlü, dinleme kontrolü", () => {
    expect(
      askedItemsFromPayload({
        type: "quiz",
        testedTopic: "Diziler",
        questions: [
          { text: "Aritmetik dizide ortak fark nedir?", point: "Ortak fark ve genel terim" },
          { text: "Geometrik dizide oran nedir?", point: "3", topic: "Geometrik diziler" },
        ],
      }),
    ).toEqual([
      { text: "Aritmetik dizide ortak fark nedir?", topic: "Diziler" },
      { text: "Yoklanan bölüm: Ortak fark ve genel terim", topic: "Diziler" },
      // Madde numarası tek başına anlamsız: listeye girmez.
      { text: "Geometrik dizide oran nedir?", topic: "Geometrik diziler" },
    ]);
    expect(askedItemsFromPayload({ type: "true_false", items: [{ text: "Kuyruk FIFO çalışır." }] })[0]?.text).toBe("Kuyruk FIFO çalışır.");
    expect(askedItemsFromPayload({ type: "cards", cards: [{ front: "LIFO?", back: "Yığın" }] })[0]?.text).toBe("LIFO? Yığın");
    expect(askedItemsFromPayload({ type: "oral", questions: [{ prompt: "AVL dengesini anlat." }] })[0]?.text).toBe("AVL dengesini anlat.");
    expect(askedItemsFromPayload({ type: "podcast", check: [{ text: "Heap kökü neyi tutar?" }] })[0]?.text).toBe("Heap kökü neyi tutar?");
  });

  it("aynı konunun öğeleri önce; konusu yazmayan öğe kaydın konusuyla eşlenir", () => {
    const list = collectAskedItems(
      [
        { payload: { type: "true_false", testedTopic: "Yığın", items: [{ text: "Yığın LIFO çalışır." }] }, topicId: "t1" },
        { payload: { type: "cards", cards: [{ front: "Kuyruk kuralı?", back: "FIFO" }] }, topicId: "t2" },
        { payload: { type: "quiz", questions: [{ text: "Kuyruğa ekleme nereden yapılır?" }] }, topicId: "t2" },
      ],
      { topic: "Kuyruk", topicId: "t2" },
    );
    expect(list).toEqual(["Kuyruk kuralı? FIFO", "Kuyruğa ekleme nereden yapılır?", "Yığın LIFO çalışır."]);
  });

  it("doğru/yanlış yazarı önceki etkinliklerin sorduğunu görür; rota bütün türlere listeyi verir", async () => {
    const prompts: string[] = [];
    await teacherTrueFalseLoop(
      async (_system, user) => {
        prompts.push(user);
        return { items: [] };
      },
      { topicLabel: "Kuyruk", prepTitle: "Veri Yapıları", pages: [{ page: 1, text: "Kuyruk FIFO çalışır." }], count: 2, avoid: ["Kuyruğa ekleme nereden yapılır?"] },
    );
    expect(prompts[0]).toContain("BU KONUDA DAHA ÖNCE SORULANLAR");
    expect(prompts[0]).toContain("- Kuyruğa ekleme nereden yapılır?");
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    for (const kind of ['kind: "quiz"', 'kind: "cards"', 'kind: "true_false"', 'kind: "oral"']) {
      expect(route).toContain(`${kind},\n          excludeNodeId: input.nodeId ?? null,\n          topic: input.topicLabel,`);
    }
  });
});
