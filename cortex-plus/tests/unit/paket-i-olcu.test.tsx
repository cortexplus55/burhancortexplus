// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  activityTally,
  activityVerdicts,
  cardItemVerdict,
  isBareAnswerText,
  quizItemVerdict,
  tallyLine,
  tallyPercent,
  tallyScore,
} from "@/lib/learning/answer-tally";
import { sameOptionSet } from "@/lib/learning/exam-quiz";
import { scoreFlashcardsV2, extractMisconceptions } from "@/lib/learning/teaching-standards";
import {
  buildLearningIndicators,
  computeTopicMasterySummary,
  foldTopicMastery,
  isMeasuredTopic,
  topicMasteryPercent,
  topicMasteryView,
  type AnswerEvidenceDraft,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { lessonsCompleted, masteryPercentText, METRIC_LABEL, pathCompletion } from "@/lib/learning/prep-metrics";
import { buildPrepProgressView } from "@/lib/learning/prep-progress-view";
import { buildReadinessScreen, topicAnswerTally } from "@/lib/learning/readiness-screen";
import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";

/*
  Paket I #7 (30 Ekim 2026) — rakamlar birbirini tutmuyordu. İki öğrencide canlı: "Hazırlık %4" ile "Program
  ilerlemesi %3" aynı ekranda; "45 ders" ile "20 ders"; "36 denemeden 15 doğru, 22 yanlış"; son kontrolde 7 "Doğru"
  işareti, sonuç 6/8; kart "6.6/8"; 1/22 konu ölçülmüşken "Konu hâkimiyeti %78"; 1/1 doğru "%33"; "Hazırsın"
  ekranını açmak ders sayıldı. Örnekler farklı derslerden; hiçbir kural derse özel kelime taşımaz.
*/

afterEach(() => cleanup());

const read = (path: string) => readFileSync(path, "utf8");

function snap(topicKey: string, correct: number, total: number, over: Partial<TopicMasterySnapshot> = {}): TopicMasterySnapshot {
  return {
    topicKey,
    measured: total > 0,
    level: "emerging",
    confidence: 0,
    evidenceCount: total,
    firstAttemptCorrect: correct,
    firstAttemptTotal: total,
    independentCorrect: correct,
    independentTotal: total,
    lastPracticedAt: "2026-10-28T09:00:00.000Z",
    ...over,
  };
}

const step = (id: string, kind: PlanNodeKind, status: NodeStatus) => ({ id, kind, status });

describe("her ölçü tek modülden (prep-metrics.ts)", () => {
  it("Tamamlama: 'Hazırsın' karar ekranı adım sayılmaz; ders sayısı ders türlerinden", () => {
    const before = [step("a", "lesson", "done"), step("b", "quiz", "done"), step("c", "podcast", "ready"), step("r", "readiness", "ready")];
    const after = before.map((node) => (node.kind === "readiness" ? { ...node, status: "done" as const } : node));
    // Hazırsın ekranı görülünce düğüm biter (kural kalır), ama sayılar değişmez.
    expect(pathCompletion(after)).toEqual(pathCompletion(before));
    expect(pathCompletion(before)).toEqual({ done: 2, total: 3, pct: 67 });
    expect(lessonsCompleted(after)).toBe(1);
    expect(lessonsCompleted([step("x", "focused", "done"), step("y", "spaced", "done"), step("z", "readiness", "done")])).toBe(2);
  });

  it("Tamamlama yanlış cevapla düşmez, Hazırlık düşebilir — ayrı ad, ayrı sayı", () => {
    const planned = ["Türev", "İntegral"];
    const nodesBefore = [step("1", "lesson", "done"), step("2", "quiz", "ready"), step("3", "lesson", "locked")];
    const nodesAfter = [step("1", "lesson", "done"), step("2", "quiz", "done"), step("3", "lesson", "ready")];
    const prior = [snap("türev", 4, 4)];
    const wrong: AnswerEvidenceDraft[] = Array.from({ length: 4 }, (_, index) => ({
      topicKey: "türev",
      learningObjective: null,
      questionIndex: index,
      correct: false,
      isFirstAttempt: true,
      hintAssisted: false,
      independentSuccess: false,
      wrongType: "quiz_miss",
      sourceKind: "quiz",
      questionPreview: null,
    }));
    const before = buildLearningIndicators({ nodes: nodesBefore, topics: prior, plannedTopicKeys: planned });
    const after = buildLearningIndicators({ nodes: nodesAfter, topics: foldTopicMastery(wrong, prior), plannedTopicKeys: planned });
    expect(after.programProgress.pct).toBeGreaterThan(before.programProgress.pct);
    expect(after.examReadiness.pct).toBeLessThan(before.examReadiness.pct);
    expect(METRIC_LABEL.completion).not.toBe(METRIC_LABEL.readiness);
    // Değerlendirme sayfası ve hazırlık sayfası aynı adları okur; "Program ilerlemesi" adı kalktı.
    expect(read("src/components/parity/exam-prep-assessment.tsx")).not.toContain("Program ilerlemesi");
    expect(read("src/lib/learning/prep-progress-view.ts")).not.toContain("readinessScore(");
  });

  it("hazırlık sayfası: Hazırlık, ders sayısı ve Tamamlama ayrı; sekmenin sayısı Hazırlık'ın kendisi", () => {
    const nodes: HomeNode[] = [
      { id: "l1", kind: "lesson", title: "Giriş Dersi", dayIndex: 1, sortOrder: 0, status: "done" },
      { id: "q1", kind: "quiz", title: "Konu testi", dayIndex: 1, sortOrder: 1, status: "done" },
      { id: "p1", kind: "podcast", title: "Podcast Dinle", dayIndex: 1, sortOrder: 2, status: "ready" },
      { id: "r1", kind: "readiness", title: "Hazırsın", dayIndex: 2, sortOrder: 3, status: "done" },
    ];
    const { container } = render(
      <ExamPrepHome
        prepId="prep-x"
        title="Mikroekonomi"
        examType="Okul"
        examDate={null}
        daysLabel=""
        progressPct={pathCompletion(nodes).pct}
        nodes={nodes}
        hasTopic
        needsIntro={false}
        startHref="/deneme-sinavlari/prep-x"
        topicLabels={["Talep", "Arz"]}
        learningTracking={{ examReadinessPct: 12 } as never}
      />,
    );
    const meta = container.querySelector(".cp-prep-hero-meta")?.textContent ?? "";
    expect(meta).toContain("Hazırlık: %12");
    // 4 bitmiş düğümden yalnız biri ders; Hazırsın ve test ders sayılmaz.
    expect(meta).toContain("1 ders tamamlandı");
    expect(meta).toContain("Tamamlama: %67");
    expect(container.querySelector(".cp-prep-tabs-pct")?.textContent).toBe("%12");
  });

  it("İlerleme'nin ders sayısı hero ile aynı işlevden; Hazırsın açılınca değişmez", () => {
    const nodes = [
      { id: "l1", kind: "lesson" as const, title: "Ders", status: "done" as const },
      { id: "r1", kind: "readiness" as const, title: "Hazırsın", status: "done" as const },
    ];
    const view = buildPrepProgressView({
      nodes,
      attempts: [],
      topicLabels: ["Talep"],
      gaps: [],
      examDate: null,
      targetScore: null,
      dailyMinutes: null,
      measuredReadinessPct: null,
    });
    expect(view.lessonsDone).toBe(lessonsCompleted(nodes));
    expect(view.lessonsDone).toBe(1);
    expect(view.completionPct).toBe(100);
  });
});

describe("konu hâkimiyeti kapsamla; ölçülmemiş konu sayı göstermez", () => {
  it("1/1 doğru '%33' değil 'Ölçülmedi'; 3 cevapla ölçülür ve yüzde x/y'nin kendisi", () => {
    const one = snap("organik kimya", 1, 1);
    expect(isMeasuredTopic(one)).toBe(false);
    expect(topicMasteryView(one, 70)).toMatchObject({ state: "unmeasured", text: "Ölçülmedi" });
    const three = snap("organik kimya", 2, 3);
    expect(isMeasuredTopic(three)).toBe(true);
    expect(topicMasteryPercent(three)).toBe(Math.round((2 / 3) * 100));
    expect(masteryPercentText(null, false)).toBe("Ölçülmedi");
  });

  it("1/22 konu ölçülmüşken etiket kapsamı söyler", () => {
    const planned = Array.from({ length: 22 }, (_, index) => `Konu ${index + 1}`);
    const summary = computeTopicMasterySummary([snap("konu 1", 7, 9)], planned);
    expect(summary.measuredCount).toBe(1);
    expect(summary.unmeasuredCount).toBe(21);
    expect(summary.pct).toBe(78);
    expect(summary.label).toContain("1/22 konu ölçüldü");
  });

  it("İlerleme satırı ölçülmemiş konuda sayı değil 'Ölçülmedi' yazar", () => {
    const source = read("src/components/parity/exam-prep-progress.tsx");
    expect(source).toContain('masteryPercentText(topic.pct, topic.state !== "unmeasured")');
  });
});

describe("doğru / kısmen / yanlış / boş tek işlevden; yüzde ve x/y aynı sayılardan", () => {
  it("test: tek ve çok cevaplı, boş; dördünün toplamı soru sayısı", () => {
    const payload = {
      type: "quiz",
      questions: [
        { text: "q1", options: ["A", "B"], correct: ["A"], multi: false },
        { text: "q2", options: ["A", "B", "C"], correct: ["A", "B"], multi: true },
        { text: "q3", options: ["A", "B"], correct: ["B"], multi: false },
        { text: "q4", options: ["A", "B"], correct: ["A"], multi: false },
      ],
    };
    const tally = activityTally(payload, { "0": "A", "1": ["A"], "2": "A" });
    expect(tally).toEqual({ total: 4, correct: 1, partial: 1, wrong: 1, blank: 1 });
    expect(tally.correct + tally.partial + tally.wrong + tally.blank).toBe(tally.total);
    expect(tallyScore(tally)).toEqual({ score: 1, total: 4 });
    expect(tallyLine(tally)).toBe("4 sorudan 1 doğru · 1 kısmen · 1 yanlış · 1 boş");
  });

  it("şıkkın sonundaki boşluk ekranda 'Doğru' iken notu yanlış yapmaz", () => {
    expect(sameOptionSet(["Kuyruk "], ["Kuyruk"])).toBe(true);
    expect(quizItemVerdict({ correct: ["Yığın"] }, " Yığın")).toBe("dogru");
  });

  it("kart: Bildim doğru, Zorlandım kısmen, Bilemedim yanlış; puan tam sayı", () => {
    const answers: Record<string, number> = {};
    for (let index = 0; index < 8; index += 1) answers[String(index)] = index < 3 ? 3 : 5;
    const cards = Array.from({ length: 8 }, (_, index) => ({ front: `ön ${index}`, back: `arka ${index}` }));
    const tally = activityTally({ type: "cards", cards }, answers);
    expect(tally).toMatchObject({ total: 8, correct: 5, partial: 3, wrong: 0 });
    const stored = scoreFlashcardsV2(8, answers);
    expect(stored).toMatchObject({ score: 5, total: 8, partialCount: 3 });
    expect(Number.isInteger(stored.score)).toBe(true);
    expect(cardItemVerdict(1)).toBe("yanlis");
    expect(cardItemVerdict(undefined)).toBe("bos");
    // Sonuç ekranı ağırlıklı krediyi (6.6) değil sayımı gösterir.
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).not.toContain("cardDeckCredit(");
    expect(session).toContain('activityTally({ type: "cards", cards }, base)');
  });

  it("doğru/yanlış ve test: rota, istemci ve sayım aynı işlev", () => {
    const tf = { type: "true_false", items: [{ correct: true }, { correct: false }, { correct: true }] };
    expect(activityVerdicts(tf, { "0": true, "1": "true" })).toEqual(["dogru", "yanlis", "bos"]);
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain('if (data.type === "true_false") return { ...tallyScore(activityTally(data, answers)), retried: 0 };');
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("return tallyScore(activityTally(payload, base));");
  });

  it("bekçi: her sayımda yüzde, ekrandaki x/y'nin iki sayısından çıkar", () => {
    const verdicts = ["dogru", "kismen", "yanlis", "bos"] as const;
    for (let seed = 1; seed <= 60; seed += 1) {
      const rows = Array.from({ length: (seed % 11) + 1 }, (_, index) => verdicts[(seed * 7 + index * 3) % 4]!);
      const tally = activityTally({ type: "mock_exam", items: rows.map((verdict) => ({ verdict })) }, {});
      const { score, total } = tallyScore(tally);
      expect(tally.correct + tally.partial + tally.wrong + tally.blank).toBe(tally.total);
      expect(tallyPercent(tally)).toBe(Math.round((score / total) * 100));
    }
    // Hazırsın satırı: "N sorudan X doğru, Y yanlış" ile konu yüzdesi aynı iki sayı.
    for (const [correct, total] of [[15, 36], [0, 3], [7, 9], [3, 3]] as const) {
      const topic = snap("veri yapıları", correct, total);
      const count = topicAnswerTally(topic);
      expect(count.correct + count.wrong).toBe(count.total);
      expect(topicMasteryPercent(topic)).toBe(Math.round((count.correct / count.total) * 100));
    }
  });
});

describe("Hazırsın ekranı", () => {
  it("sayım satırı tutarlı; açık yanılgı ayrı adla; öneri en düşük ölçülen başarılı konu", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Yevmiye", "Envanter", "Bilanço"],
      mastery: [snap("yevmiye", 6, 10), snap("envanter", 15, 36), snap("bilanço", 9, 10)],
      openMissesByTopic: [{ topic: "Yevmiye", count: 3 }],
      mockScorePct: null,
      targetScore: 70,
      nodes: [],
      links: { focused: "/odak", home: "/ev" },
    });
    const envanter = screen.topics.find((row) => row.topic === "Envanter")!;
    expect(envanter.detail).toContain("36 sorudan 15 doğru, 21 yanlış");
    expect(envanter.pct).toBe(42);
    // Plan sırasında önce "Yevmiye" (%60) var; öneri en zayıf olan (%42).
    expect(screen.actions[0]).toMatchObject({ label: "Odaklı pratik: Envanter", href: `/odak?konu=${encodeURIComponent("Envanter")}` });
    expect(screen.topics.find((row) => row.topic === "Yevmiye")!.detail).toContain("3 yanılgı henüz kapanmadı");
  });
});

describe("bilgi eksiği kayıtları anlamlı ve doğru konuda", () => {
  it("boş cevap yanılgı satırı açmaz; 'Doğru' gibi tek şık önizleme olmaz; konu sorunun konusu", () => {
    const drafts = extractMisconceptions({
      kind: "final_check",
      topicLabel: "Konu 1",
      answers: { "0": "", "1": "Doğru", "2": "Kalıtım çekiniktir" },
      payload: {
        type: "quiz",
        questions: [
          { text: "Boş bırakılan soru", options: ["X", "Y"], correct: ["X"], topic: "Genetik" },
          { text: "Önerme doğru mu?", options: ["Doğru", "Yanlış"], correct: ["Yanlış"], topic: "Hücre" },
          { text: "Çekinik özellik nasıl görünür?", options: ["Kalıtım çekiniktir", "Homozigotta"], correct: ["Homozigotta"], topic: "Genetik" },
        ],
      },
    });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ topicLabel: "Hücre", questionPreview: null });
    expect(drafts[1]).toMatchObject({ topicLabel: "Genetik", questionPreview: "Kalıtım çekiniktir" });
    expect(isBareAnswerText("(boş)")).toBe(true);
    expect(isBareAnswerText("Doğru")).toBe(true);
    expect(isBareAnswerText("12 °C")).toBe(false);
  });

  it("İlerleme'nin eski '(boş)' / 'Doğru' önizlemeleri gösterilmez", () => {
    const view = buildPrepProgressView({
      nodes: [],
      attempts: [],
      topicLabels: [],
      gaps: [
        { claim: "Ters fonksiyonun tanım kümesi", topicLabel: "Fonksiyonlar", detail: "(boş)" },
        { claim: "Doğru", topicLabel: "Fonksiyonlar", detail: "Doğru" },
      ],
      examDate: null,
      targetScore: null,
      dailyMinutes: null,
      measuredReadinessPct: null,
    });
    expect(view.gaps).toEqual([{ claim: "Ters fonksiyonun tanım kümesi", topicLabel: "Fonksiyonlar", detail: null }]);
  });
});
