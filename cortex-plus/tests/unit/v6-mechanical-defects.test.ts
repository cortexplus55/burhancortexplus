import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  masterySnapshotFromRow,
  normalizeTopicKey,
  scoreTopicMastery,
  topicIsSolid,
  topicMasteryPercent,
  topicPercentsByKey,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { buildReadinessScreen, topicState } from "@/lib/learning/readiness-screen";
import { sectionStatusLine } from "@/lib/learning/path-sections";
import { buildPrepProgressView, solvedQuestions } from "@/lib/learning/prep-progress-view";
import { cardsFromLessonReviews } from "@/lib/learning/teaching-standards";
import { prefetchVariant } from "@/lib/learning/lesson-prefetch";
import { FREE_PICK_TOOLS, freeActivityPick, planActivityInsert } from "@/lib/learning/study-tools";
import { scorePodcastCheck } from "@/lib/learning/podcast-check";
import { dropRepeatedScreens } from "@/lib/learning/teacher-lesson";
import { focusedQuestionAllowed, foldedStems } from "@/lib/learning/focused-practice";
import { balancedOralTopics, oralQuestionPlan, oralScopeSources } from "@/lib/learning/oral-scope";
import { oralScoreFraction } from "@/lib/learning/oral-exam";
import { reversedFunctionNotation } from "@/lib/learning/function-notation";
import type { LessonScreen } from "@/lib/learning/lesson-v3";

const read = (path: string) => readFileSync(path, "utf8");

/** Kayıttaki `confidence` (12) eski /5 sönümüyle yazılmış; ekranlar onu değil ham sayıları okur. */
const ROW = {
  topic_key: "Fonksiyonlar",
  measured_level: "emerging",
  confidence: 12,
  evidence_count: 4,
  first_attempt_correct: 3,
  first_attempt_total: 4,
  independent_correct: 0,
  independent_total: 0,
  last_practiced_at: null,
};

function snapshot(partial: Partial<TopicMasterySnapshot>): TopicMasterySnapshot {
  return {
    topicKey: "Konu",
    measured: true,
    level: "emerging",
    confidence: 0,
    evidenceCount: 0,
    firstAttemptCorrect: 0,
    firstAttemptTotal: 0,
    independentCorrect: 0,
    independentTotal: 0,
    lastPracticedAt: null,
    ...partial,
  };
}

describe("Kusur 1 — tek yüzde, kanıt alt sınırı, çözüldü sayacı", () => {
  it("yol, sözlü seçici, İlerleme ve Hazırsın aynı konu yüzdesini gösterir", () => {
    const label = "Fonksiyonlar";
    const expected = topicMasteryPercent(masterySnapshotFromRow(ROW));
    expect(expected).toBe(75);

    // Sözlü konu seçici ve İlerleme (prep-insights-load) aynı okuyucu.
    const oral = topicPercentsByKey([ROW]).get(normalizeTopicKey(label));
    // Yol: [prepId]/page.tsx → topicPercents → sectionStatusLine.
    const pathPct = topicMasteryPercent(scoreTopicMastery(masterySnapshotFromRow(ROW)));
    const pathLine = sectionStatusLine({ done: 1, total: 3, locked: false, complete: false, active: true }, pathPct);
    const progress = buildPrepProgressView({
      nodes: [{ id: "n1", kind: "lesson", title: "Ders", status: "done", sessionMeta: { topicTitle: label } }],
      attempts: [],
      topicLabels: [label],
      gaps: [],
      examDate: null,
      targetScore: null,
      dailyMinutes: null,
      measuredReadinessPct: null,
      topicMastery: [{ label, confidence: oral ?? 0 }],
    });
    const ready = buildReadinessScreen({
      plannedTopics: [label],
      mastery: [masterySnapshotFromRow(ROW)],
      openMissesByTopic: [],
      mockScorePct: null,
      targetScore: 70,
      nodes: [],
      links: { home: "/deneme-sinavlari/p" },
    });

    expect(oral).toBe(expected);
    expect(pathPct).toBe(expected);
    expect(pathLine).toContain(`%${expected}`);
    expect(progress.topics[0]?.pct).toBe(expected);
    expect(ready.topics[0]?.pct).toBe(expected);
    expect([oral, pathPct, progress.topics[0]?.pct, ready.topics[0]?.pct]).not.toContain(ROW.confidence);
  });

  it("dört ekranın kaynağı aynı fonksiyon (kayıtlı confidence okunmaz)", () => {
    // 30 Ekim 2026: hâkimiyet konuya tek eşleştiriciyle bağlanır (`masteryByPlannedTopic`); yüzde yine ham sayılardan.
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx")).toContain("masteryByPlannedTopic(");
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx")).toContain("topicMasteryPercent(snapshot)");
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx")).not.toContain("topicStatusPct");
    expect(read("src/lib/learning/prep-insights-load.ts")).toContain("masteryByPlannedTopic(");
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("masteryByPlannedTopic(topicLabels, masterySnapshots)");
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("topicMasteryView(snapshot, targetScore)");
    expect(read("src/lib/learning/readiness-screen.ts")).toContain("pct: readinessTopicPercent(snapshot)");
  });

  it("tek soruluk konu Sağlam değildir; üç kanıtla olur", () => {
    const one = snapshot({ evidenceCount: 1, firstAttemptCorrect: 1, firstAttemptTotal: 1 });
    // Paket I #7 (30 Ekim 2026): 1-2 cevaplı konu ölçülmemiş sayılır, sayı göstermez ("%33" öncülü kalktı).
    expect(topicMasteryPercent(one)).toBe(0);
    expect(topicIsSolid(one, 70)).toBe(false);
    expect(topicState(one, 70)).toBe("unmeasured");
    const screen = buildReadinessScreen({
      plannedTopics: ["Konu"],
      mastery: [one],
      openMissesByTopic: [],
      mockScorePct: null,
      targetScore: 70,
      nodes: [],
      links: { home: "/x" },
    });
    expect(screen.topics[0]?.state).not.toBe("ready");

    const three = snapshot({ evidenceCount: 3, firstAttemptCorrect: 3, firstAttemptTotal: 3 });
    expect(topicMasteryPercent(three)).toBe(100);
    expect(topicState(three, 70)).toBe("ready");
  });

  it("çözüldü sayacı aynı soruyu bir kez sayar, 100'lük paydayı soru saymaz", () => {
    const quiz = { type: "quiz", questions: [{ text: "Bileşke fonksiyon nedir?" }, { text: "Ters fonksiyon nedir?" }] };
    const view = buildPrepProgressView({
      nodes: [
        { id: "q1", kind: "quiz", title: "Test", status: "done", sessionMeta: { topicTitle: "Fonksiyonlar" } },
        { id: "q2", kind: "focused", title: "Odak", status: "done", sessionMeta: { topicTitle: "Fonksiyonlar" } },
        { id: "w1", kind: "written_exam", title: "Deneme", status: "done", sessionMeta: { topicTitle: "Fonksiyonlar" } },
      ],
      attempts: [
        { nodeId: "q1", score: 2, total: 2, createdAt: "2026-10-27T10:00:00Z", solved: solvedQuestions(quiz) },
        { nodeId: "q2", score: 1, total: 2, createdAt: "2026-10-27T11:00:00Z", solved: solvedQuestions(quiz) },
        { nodeId: "w1", score: 60, total: 100, createdAt: "2026-10-27T12:00:00Z" },
      ],
      topicLabels: ["Fonksiyonlar"],
      gaps: [],
      examDate: null,
      targetScore: null,
      dailyMinutes: null,
      measuredReadinessPct: null,
    });
    expect(view.topics[0]?.solved).toBe(2);
  });
});

describe("Kusur 2 — sızıntı ve kopyalar", () => {
  it("K4'te kaçırılan ders sorusu K5'in kart destesine girmez", () => {
    const rows = [
      { source_kind: "lesson_review", topic_label: "K4 Türev", question_preview: "Türevin tanımı nedir?", corrected: "Limit" },
      { source_kind: "lesson_review", topic_label: "K5 İntegral", question_preview: "Belirsiz integral nedir?", corrected: "Ters türev" },
      { source_kind: "lesson_review", topic_label: null, question_preview: "Konusuz eski kayıt sorusu?", corrected: "Bilinmez" },
    ];
    const k5 = cardsFromLessonReviews(rows, "K5 İntegral");
    expect(k5.map((card) => card.front)).toEqual(["Belirsiz integral nedir?"]);
    expect(cardsFromLessonReviews(rows, "K4 Türev").map((card) => card.front)).toEqual(["Türevin tanımı nedir?"]);
    // Önceden yazılan deste de konuya bağlı: K4'ün destesi K5'te verilmez.
    expect(prefetchVariant("spaced", { topicLabel: "K4 Türev" })).not.toBe(prefetchVariant("spaced", { topicLabel: "K5 İntegral" }));
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("cardsFromLessonReviews(data, topicLabel)");
  });

  it("art arda aynı ders adımı elenir; yeni sorusu varsa yalnız soru kalır", () => {
    const text = "Bileşke fonksiyonda önce içteki fonksiyon uygulanır, sonra dıştaki fonksiyon uygulanır.";
    const check = {
      type: "check",
      check: {
        type: "mcq",
        prompt: "f(x)=x+1, g(x)=2x ise (g∘f)(1) kaçtır?",
        options: ["4", "3", "2", "5"],
        answerIndex: 0,
        explanation: "f(1)=2, g(2)=4.",
        optionWhy: ["Doğru.", "f∘g.", "f(1).", "Toplam."],
      },
    };
    const screens = [
      { heading: "Bileşke", concept: "Bileşke", blocks: [{ type: "text", text }] },
      { heading: "Bileşke", concept: "Bileşke", blocks: [{ type: "text", text }] },
      { heading: "Bileşke", concept: "Bileşke", blocks: [{ type: "text", text }, check] },
    ] as unknown as LessonScreen[];
    const kept = dropRepeatedScreens([], screens);
    expect(kept).toHaveLength(2);
    expect(kept[1]?.blocks.map((block) => block.type)).toEqual(["check"]);
  });

  it("odaklı pratik iki şıklı Doğru/Yanlış'ı ve konu testinin birebir kökünü reddeder", () => {
    const asked = foldedStems(["Bileşke fonksiyonda hangi fonksiyon önce uygulanır?"]);
    expect(focusedQuestionAllowed({ text: "f birebir midir?", options: ["Doğru", "Yanlış"] }, asked)).toBe(false);
    expect(
      focusedQuestionAllowed(
        { text: "Bileşke fonksiyonda hangi fonksiyon önce uygulanır?", options: ["f", "g", "ikisi", "hiçbiri"] },
        asked,
      ),
    ).toBe(false);
    expect(
      focusedQuestionAllowed({ text: "f(x)=2x ise f⁻¹(6) kaçtır?", options: ["3", "12", "6", "1/12"] }, asked),
    ).toBe(true);
  });
});

describe("Kusur 3 — etkinlik seçici ve sözlü", () => {
  const topic = { id: "t2", label: "Konu 2" };
  const nodes = [
    { id: "lesson-2", kind: "lesson", sortOrder: 4, dayIndex: 2, status: "done", sessionMeta: { topicTitle: "Konu 2", topicId: "t2", sourcePages: [5, 6] } },
    { id: "quiz-2", kind: "quiz", sortOrder: 5, dayIndex: 2, status: "ready", sessionMeta: { topicTitle: "Konu 2", topicId: "t2" } },
    { id: "tf-2", kind: "true_false", sortOrder: 6, dayIndex: 2, status: "locked", sessionMeta: { topicTitle: "Konu 2", topicId: "t2" } },
    // Hazırlık geneli deste konuya bağlı değil; oral yalnız üç konuda bir: K2'de yok.
    { id: "cards-all", kind: "flashcards", sortOrder: 20, dayIndex: 9, status: "locked", sessionMeta: {} },
    { id: "lesson-3", kind: "lesson", sortOrder: 7, dayIndex: 3, status: "locked", sessionMeta: { topicTitle: "Konu 3", topicId: "t3" } },
  ];

  it("yedi karonun yedisi açılır: düğüm varsa onu, yoksa konunun bölümüne ekletir", () => {
    expect(FREE_PICK_TOOLS).toHaveLength(7);
    const picks = FREE_PICK_TOOLS.map((tool) => [tool.id, freeActivityPick(nodes, "prep-1", topic, tool.id, [topic])] as const);
    for (const [, pick] of picks) expect(pick.ok).toBe(true);
    const byTool = Object.fromEntries(picks);
    expect(byTool.lesson).toMatchObject({ kind: "node", nodeId: "lesson-2" });
    expect(byTool.quiz).toMatchObject({ kind: "node", nodeId: "quiz-2" });
    expect(byTool.true_false).toMatchObject({ kind: "node", nodeId: "tf-2" });
    expect(byTool.flashcards).toMatchObject({ kind: "create", nodeKind: "spaced", topicId: "t2" });
    expect(byTool.oral).toMatchObject({ kind: "create", nodeKind: "oral", topicId: "t2" });
    expect(byTool.podcast).toMatchObject({ kind: "podcast" });
    expect(byTool.video).toMatchObject({ kind: "video" });

    const insert = planActivityInsert(nodes, topic, "oral");
    expect(insert.afterSort).toBe(6);
    expect(insert.dayIndex).toBe(2);
    expect(insert.sessionMeta).toMatchObject({ topicTitle: "Konu 2", topicId: "t2", sourcePages: [5, 6], studentPicked: true });

    const route = read("src/app/api/learning/exam-prep/activity/route.ts");
    expect(route).toContain('rpc("exam_path_insert_after"');
    expect(read("src/components/parity/free-activity-picker.tsx")).toContain("/api/learning/exam-prep/activity");
  });

  it("sözlü 'Tüm sınav' K1..KN'den dengeli örnekler", () => {
    const labels = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"];
    const chosen = balancedOralTopics(labels, 4);
    expect(chosen).toHaveLength(4);
    expect(chosen[0]).toBe("K1");
    expect(chosen[chosen.length - 1]).toBe("K8");
    const plan = oralQuestionPlan(labels, 8);
    expect(new Set(plan).size).toBeGreaterThanOrEqual(4);
    expect(plan.filter((label) => label === "K1").length).toBeLessThanOrEqual(2);
    const sources = oralScopeSources(
      labels.map((label, i) => ({ label, documentId: "d1", pages: [i * 3 + 1, i * 3 + 2, i * 3 + 3] })),
      8,
    );
    expect(sources.map((row) => row.label)).toEqual(labels);
    expect(sources.reduce((sum, row) => sum + row.pages.length, 0)).toBeLessThanOrEqual(16);
  });

  it("sözlü yüzde ve kesir aynı pay/paydadan", () => {
    const fraction = oralScoreFraction({ items: [{ ratio: 1 }, { ratio: 0.4 }] as never, total: 2 });
    expect(fraction.label).toBe("1,4/2");
    expect(fraction.pct).toBe(Math.round((fraction.points / fraction.total) * 100));
    expect(fraction.pct).toBe(70);
  });
});

describe("Kusur 4 — podcast, ders sayacı, Devam et, bileşke", () => {
  it("podcast 'Dinledim, devam' tamamlama fonksiyonunun kabul ettiği puanı gönderir (503 değil)", () => {
    // complete_exam_prep_node `p_total < 1` için invalid_score atar; rota bunu 503 completion_failed yapar.
    const rpcAccepts = (score: { score: number; total: number }) => score.total >= 1 && score.score <= score.total;
    const noCheck = scorePodcastCheck({ type: "podcast" }, {});
    const check = [{ text: "A?", options: ["x", "y", "z", "w"], correct: ["x"], multi: false }];
    const skipped = scorePodcastCheck({ type: "podcast", check }, {});
    expect(noCheck).toEqual({ score: 1, total: 1 });
    expect(skipped).toEqual({ score: 1, total: 1 });
    expect(rpcAccepts(noCheck)).toBe(true);
    expect(rpcAccepts(skipped)).toBe(true);
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toContain("if (!(scored.total >= 1))");
  });

  it("onarılan ders karıştırılmış yayımlanmış ekranların yerine geçmez (sayaç doğruyu yanlış saymaz)", () => {
    const run = read("src/lib/learning/teacher-lesson-run.ts");
    expect(run).toContain("repaired.screens.slice(finished.screens.length)");
    expect(run).not.toMatch(/delivered = repaired;/);
  });

  it("'Dersi bitir' kilidi finally ile ve en geç 3 sn'de açılır", () => {
    const steps = read("src/components/parity/exam-lesson-steps.tsx");
    expect(steps).toContain("export const ADVANCE_UNLOCK_MS = 3000;");
    expect(steps).toMatch(/finally \{\s*window\.clearTimeout\(unlock\);\s*setAdvancing\(false\);/);
    expect(read("src/components/parity/exam-node-session.tsx")).toContain(
      "return finish(Object.keys(payloadAnswers).length ? payloadAnswers : undefined);",
    );
  });

  it("bileşke ve ters fonksiyonun tersine çevrilmesi yakalanır, doğrusu geçer", () => {
    expect(reversedFunctionNotation("(g∘f)(x) = f(g(x)) olur.")).toHaveLength(1);
    expect(reversedFunctionNotation("$(g \\circ f)(x) = f(g(x))$")).toHaveLength(1);
    expect(reversedFunctionNotation("f⁻¹(y) = x ancak ve ancak f(y) = x")).toHaveLength(1);
    expect(reversedFunctionNotation("f^{-1}(y) = x \\iff f(y) = x")).toHaveLength(1);
    expect(reversedFunctionNotation("(g∘f)(x) = g(f(x)); önce f uygulanır.")).toEqual([]);
    expect(reversedFunctionNotation("f⁻¹(y) = x ⟺ f(x) = y")).toEqual([]);
    expect(reversedFunctionNotation("(f∘g)(x) = f(g(x))")).toEqual([]);
    for (const file of ["src/lib/learning/teacher-lesson.ts", "src/lib/learning/teacher-quiz.ts", "src/lib/learning/explain-review.ts"]) {
      expect(read(file)).toContain("FUNCTION_NOTATION_RULE");
    }
  });
});
