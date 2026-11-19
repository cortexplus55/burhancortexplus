/**
 * Faz 4 / ADIM 2 — bölüm 4'ün beş zorunlu kabul senaryosu. Bütün veriler sentetik: kimlikler, konu adları ve sorular bu
 * dosyada üretilir; canlı hazırlık, gerçek kullanıcı ya da deneme kaydı yok.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const credits = vi.hoisted(() => ({ reserve: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/credits/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits/service")>();
  return { ...actual, reserveCredits: credits.reserve, commitCredits: credits.commit };
});

import {
  computeTopicPolicy,
  policyBadge,
  BADGE_LABEL,
  EVIDENCE_WEIGHT,
  LEARNED_MIN_DISTINCT_ATTEMPTS,
  LEARNED_MIN_INDEPENDENT_CORRECT,
  RECENT_MISS_PENALTY_POINTS,
  ILLUSION_OF_COMPETENCE_LINE,
  guidanceLine,
  type PolicyEvidence,
} from "@/lib/learning/mastery-policy";
import {
  masteryByPlannedTopic,
  topicMasteryGain,
  topicMasteryView,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import { buildPrepProgressView } from "@/lib/learning/prep-progress-view";
import { reopenSavedAttempt } from "@/lib/learning/node/replay";
import { reopensSavedByDefault } from "@/lib/learning/free-restudy";
import { CREDIT_PRICE_TABLE, documentUploadCredits } from "@/lib/credits/price-table";
import type { NodeContext } from "@/lib/learning/node/context";

const NOW = new Date("2030-03-10T12:00:00.000Z");
const SAME_DAY = "2030-03-10";
const ATTEMPT_LESSON = "00000000-0000-4000-8000-0000000000a1";
const ATTEMPT_QUIZ = "00000000-0000-4000-8000-0000000000a2";
const ATTEMPT_CARDS = "00000000-0000-4000-8000-0000000000a3";

function ev(
  sourceKind: string,
  correct: boolean,
  attemptId: string | null,
  minute: number,
  extra: Partial<PolicyEvidence> = {},
): PolicyEvidence {
  const at = new Date(`${SAME_DAY}T08:00:00.000Z`);
  at.setUTCMinutes(minute);
  return { sourceKind, correct, hintAssisted: false, isFirstAttempt: true, attemptId, createdAt: at.toISOString(), ...extra };
}

function snapshotWithPolicy(topicKey: string, evidence: PolicyEvidence[]): TopicMasterySnapshot {
  const policy = computeTopicPolicy(evidence, NOW);
  return {
    topicKey,
    measured: policy.measured,
    level: "unmeasured",
    confidence: policy.pct,
    evidenceCount: policy.evidenceCount,
    firstAttemptCorrect: policy.independentCorrect,
    firstAttemptTotal: policy.objectiveCount,
    independentCorrect: policy.independentCorrect,
    independentTotal: policy.objectiveCount,
    lastPracticedAt: evidence.at(-1)?.createdAt ?? null,
    policy,
  };
}

describe("Faz 4 — 1) 2 günde (aynı gün) bitiren öğrenci", () => {
  it("aynı gün ders içi sorular + konu testi, ipucusuz ≥4 doğru ve ≥%70 → takvim beklemeden Öğrendin", () => {
    const evidence = [
      ev("lesson_check", true, ATTEMPT_LESSON, 0),
      ev("lesson_check", true, ATTEMPT_LESSON, 1),
      ev("quiz", true, ATTEMPT_QUIZ, 20),
      ev("quiz", true, ATTEMPT_QUIZ, 21),
      ev("quiz", false, ATTEMPT_QUIZ, 22),
      ev("quiz", true, ATTEMPT_QUIZ, 23),
      ev("quiz", true, ATTEMPT_QUIZ, 24),
    ];
    const policy = computeTopicPolicy(evidence, NOW);
    // Bütün kanıt aynı takvim gününde.
    expect(new Set(evidence.map((row) => row.createdAt.slice(0, 10)))).toEqual(new Set([SAME_DAY]));
    expect(policy.independentCorrect).toBeGreaterThanOrEqual(LEARNED_MIN_INDEPENDENT_CORRECT);
    expect(policy.distinctAttempts).toBeGreaterThanOrEqual(LEARNED_MIN_DISTINCT_ATTEMPTS);
    // Ağırlıklı ham yüzde: (2×0,7 + 4×1) / (2×0,7 + 5×1) = 84; son 5 nesnelde 1 yanlış → −8 = 76 ≥ 70.
    const correctW = 2 * EVIDENCE_WEIGHT.lesson_check + 4 * EVIDENCE_WEIGHT.quiz;
    const totalW = 2 * EVIDENCE_WEIGHT.lesson_check + 5 * EVIDENCE_WEIGHT.quiz;
    expect(policy.rawPct).toBe(Math.round((correctW / totalW) * 100));
    expect(policy.pct).toBe(policy.rawPct - RECENT_MISS_PENALTY_POINTS);
    expect(policy.pct).toBeGreaterThanOrEqual(70);
    expect(policyBadge(policy, 70)).toBe("learned");
    expect(topicMasteryView(snapshotWithPolicy("Sentetik Konu", evidence), 70).label).toBe(BADGE_LABEL.learned);
  });

  it("tek değerlendirme adımı (yalnız konu testi) ya da yalnız kartlar Öğrendin açmaz", () => {
    const quizOnly = [0, 1, 2, 3, 4].map((minute) => ev("quiz", true, ATTEMPT_QUIZ, minute));
    expect(policyBadge(computeTopicPolicy(quizOnly, NOW), 70)).not.toBe("learned");
    const cardsOnly = [0, 1, 2, 3, 4, 5].map((minute) => ev("card_knew", true, ATTEMPT_CARDS, minute));
    expect(policyBadge(computeTopicPolicy(cardsOnly, NOW), 70)).not.toBe("learned");
  });
});

describe("Faz 4 — 2) Çapraz sinyal: Biliyorum sanma", () => {
  it("kartta Bildim + konu testinde yanlış → illusion_of_competence ve 8 puan düşüm", () => {
    const evidence = [
      ev("card_knew", true, ATTEMPT_CARDS, 0),
      ev("card_knew", true, ATTEMPT_CARDS, 1),
      ev("card_knew", true, ATTEMPT_CARDS, 2),
      ev("quiz", true, ATTEMPT_QUIZ, 10),
      ev("quiz", false, ATTEMPT_QUIZ, 11),
      ev("quiz", true, ATTEMPT_QUIZ, 12),
    ];
    const policy = computeTopicPolicy(evidence, NOW);
    expect(policy.guidance).toBe("illusion_of_competence");
    expect(policy.recentMisses).toBe(1);
    expect(policy.pct).toBe(Math.max(0, policy.rawPct - RECENT_MISS_PENALTY_POINTS));
    expect(policy.rawPct - policy.pct).toBe(RECENT_MISS_PENALTY_POINTS);
    // Öğrenciye iç kod adı değil, düz uyarı metni gider.
    const line = guidanceLine(policy.guidance);
    expect(line).toBe(ILLUSION_OF_COMPETENCE_LINE);
    expect(line).not.toMatch(/illusion|sourceKind|claimFullyReady/);
    // Hazırsın ekranında tuzak uyarısı ve ücretsiz kapatma düğmesi.
    const screen = buildReadinessScreen({
      plannedTopics: ["Sentetik Konu"],
      mastery: [snapshotWithPolicy("Sentetik Konu", evidence)],
      openMissesByTopic: [],
      mockScorePct: null,
      targetScore: 70,
      nodes: [{ kind: "quiz", status: "done" }],
      links: { home: "/h", targeted: "/h/tekrar?hedef=1", restudyMixed: "/h/yeniden?sira=karisik", newExam: "/h/deneme/kurulum" },
    });
    expect(screen.topics[0]!.trap).toBe(true);
    expect(screen.trap?.line).toContain("1 Konu");
    expect(JSON.stringify(screen)).not.toMatch(/illusion_of_competence|claimFullyReady|sourceKind/);
  });
});

/** Sorgu zincirini kaydeden sahte servis: hangi tablo ve hangi işlem çağrıldıysa listeye düşer. */
function fakeService(savedPayload: Record<string, unknown>) {
  const calls: { table: string; op: string; value?: unknown }[] = [];
  const rpc = vi.fn();
  const inserted: Record<string, unknown>[] = [];
  function builder(table: string) {
    let op = "select";
    let value: unknown;
    const chain: Record<string, unknown> = {};
    const result = () => {
      calls.push({ table, op, value });
      if (table === "exam_prep_node_attempts" && op === "select") {
        return { data: [{ payload: savedPayload }], error: null };
      }
      if (table === "exam_prep_node_attempts" && op === "insert") {
        const row = value as Record<string, unknown>;
        inserted.push(row);
        return {
          data: { ...row, answers: null, answer_meta: null, score: null, complete_request_id: null, started_at: null, expires_at: null },
          error: null,
        };
      }
      if (table === "credit_wallets") return { data: { balance: 100 }, error: null };
      return { data: null, error: null };
    };
    for (const name of ["select", "eq", "in", "order", "limit", "is", "neq", "not", "gte", "lte", "match", "filter"]) {
      chain[name] = () => chain;
    }
    chain.insert = (row: unknown) => ((op = "insert"), (value = row), chain);
    chain.upsert = (row: unknown) => ((op = "upsert"), (value = row), chain);
    chain.update = (row: unknown) => ((op = "update"), (value = row), chain);
    chain.single = async () => result();
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return chain;
  }
  const service = { from: (table: string) => builder(table), rpc };
  return { service, calls, rpc, inserted };
}

function syntheticQuiz() {
  const questions = Array.from({ length: 6 }, (_, index) => {
    const options = [`Seçenek ${index}-1`, `Seçenek ${index}-2`, `Seçenek ${index}-3`, `Seçenek ${index}-4`];
    return { text: `Sentetik soru ${index + 1}`, options, correct: [options[index % 4]!], multi: false, explanation: `Açıklama ${index + 1}` };
  });
  return { type: "quiz", questions, topicGain: { label: "x", before: 0, after: 10 }, studentRating: 5 };
}

function replayContext(service: unknown, kind: "quiz" | "true_false"): NodeContext {
  return {
    userId: "00000000-0000-4000-8000-00000000000u",
    service,
    parsed: { data: { review: true } },
    prepId: "00000000-0000-4000-8000-00000000000p",
    nodeId: "00000000-0000-4000-8000-00000000000n",
    lessonFormat: 2,
    prefetch: false,
    teachingV2: true,
    prep: { learning_preferences: null },
    kind,
    difficulty: "orta",
    familiarity: null,
    mood: null,
    lessonReviewCards: [],
  } as unknown as NodeContext;
}

const correctMap = (questions: { text: string; correct: string[]; options: string[] }[]) =>
  new Map(questions.map((question) => [question.text, { correct: [...question.correct].sort(), options: [...question.options].sort() }]));

describe("Faz 4 — 3) 5 kez baştan çözme (0 kredi)", () => {
  beforeEach(() => {
    credits.reserve.mockReset();
    credits.commit.mockReset();
  });

  it("2. ve 5. çözüm: reserveCredits çağrılmaz, ai_usage_events yazılmaz, sıra karışır, anahtar korunur", async () => {
    const saved = syntheticQuiz();
    const original = correctMap(saved.questions);
    const orders: string[][] = [];
    for (let round = 2; round <= 5; round += 1) {
      const fake = fakeService(saved);
      const response = await reopenSavedAttempt(replayContext(fake.service, "quiz"), {
        topic: null,
        topicLabel: "Sentetik Konu",
        title: "Konu testi",
        clientRequestId: undefined,
        voiceSession: false,
      } as never);
      expect(response?.status ?? 200).toBe(200);
      expect(credits.reserve).not.toHaveBeenCalled();
      expect(credits.commit).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
      expect(fake.calls.some((call) => call.table === "ai_usage_events")).toBe(false);
      expect(fake.calls.some((call) => call.table === "credit_ledger" || call.table === "credit_reservations")).toBe(false);
      const row = fake.inserted[0]!;
      const payload = row.payload as { questions: { text: string; options: string[]; correct: string[] }[]; topicGain?: unknown };
      // Kayıtlı sonuç kartı yeni denemeye taşınmaz.
      expect(payload.topicGain).toBeUndefined();
      // Doğru şık anahtarı (metin) korunur; şık kümesi aynı.
      expect(correctMap(payload.questions)).toEqual(original);
      for (const question of payload.questions) expect(question.options).toEqual(expect.arrayContaining(question.correct));
      orders.push(payload.questions.map((question) => `${question.text}|${question.options.join("/")}`));
    }
    // 2. ve 5. tur (dört bağımsız deneme kimliği): en az bir tur kayıtlı sıradan farklı; turlar birbirinin aynısı değil.
    const savedOrder = saved.questions.map((question) => `${question.text}|${question.options.join("/")}`);
    expect(orders.some((order) => order.join("\n") !== savedOrder.join("\n"))).toBe(true);
    expect(new Set(orders.map((order) => order.join("\n"))).size).toBeGreaterThan(1);
  });

  it("bitmiş test/D-Y/kart/ders/podcast/yazılı deneme varsayılan olarak kayıttan açılır; yeni üretim yalnız açık seçimle", () => {
    for (const kind of ["lesson", "quiz", "true_false", "flashcards", "podcast", "written_exam"]) {
      expect(reopensSavedByDefault({ kind, nodeStatus: "done" })).toBe(true);
      expect(reopensSavedByDefault({ kind, nodeStatus: "done", regenerate: true })).toBe(false);
      expect(reopensSavedByDefault({ kind, nodeStatus: "ready" })).toBe(false);
    }
  });
});

describe("Faz 4 — 4) Hacim bazlı kaynak ve atomik deneme kredisi", () => {
  it("25 sayfalık metin PDF 5 kredi, fotoğraf / OCR sayfası 5 kredi, örnek karma yükleme 120 kredi", () => {
    expect(documentUploadCredits({ textPages: 25, photoPages: 0 })).toBe(5);
    expect(documentUploadCredits({ textPages: 0, photoPages: 1 })).toBe(5);
    expect(documentUploadCredits({ textPages: 300 + 50, photoPages: 10 })).toBe(120);
  });

  it("deneme başlatma + notlandırma tek atomik 17 kredi; notlandırma 0", () => {
    expect(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits).toBe(17);
    expect(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GRADE.credits).toBe(0);
  });
});

describe("Faz 4 — 5) Ekran tutarlılığı", () => {
  it("Yol, İlerleme, Kazanç Kartı ve Hazırsın aynı konu için aynı yüzde ve rozet", () => {
    const label = "Sentetik Konu";
    const evidence = [
      ev("lesson_check", true, ATTEMPT_LESSON, 0),
      ev("lesson_check", false, ATTEMPT_LESSON, 1),
      ev("quiz", true, ATTEMPT_QUIZ, 20),
      ev("quiz", true, ATTEMPT_QUIZ, 21),
      ev("quiz", false, ATTEMPT_QUIZ, 22),
    ];
    const snapshot = snapshotWithPolicy(label, evidence);
    const target = 70;

    // Yol (hazırlık sayfası): masteryByPlannedTopic + topicMasteryView.
    const path = topicMasteryView(masteryByPlannedTopic([label], [snapshot]).get(label)!, target);

    // İlerleme: sayfanın verdiği konu hâkimiyetinden.
    const progress = buildPrepProgressView({
      nodes: [{ id: "n1", kind: "quiz", title: label, status: "done", sessionMeta: { topicTitle: label } }],
      attempts: [],
      topicLabels: [label],
      gaps: [],
      examDate: null,
      targetScore: target,
      dailyMinutes: null,
      measuredReadinessPct: null,
      topicMastery: [{ label, confidence: path.percent, state: path.state, solved: path.solved, badge: path.badge }],
      now: NOW,
    });
    const progressRow = progress.topics.find((row) => row.label === label)!;

    // Kazanç kartı: önce kanıtsız, sonra aynı konu.
    const gain = topicMasteryGain({ prior: [], folded: [snapshot], evidenceKeys: [label], topicLabel: label, targetScore: target })!;

    // Hazırsın.
    const ready = buildReadinessScreen({
      plannedTopics: [label],
      mastery: [snapshot],
      openMissesByTopic: [],
      mockScorePct: null,
      targetScore: target,
      nodes: [{ kind: "quiz", status: "done" }],
      links: { home: "/h" },
    }).topics[0]!;

    expect(progressRow.pct).toBe(path.percent);
    expect(gain.after).toBe(path.percent);
    expect(ready.pct).toBe(path.percent);
    expect(progressRow.badge).toBe(path.badge);
    expect(gain.badge).toBe(path.badge);
    expect(ready.badge).toBe(path.badge);
    expect(gain.badgeLabel).toBe(path.label);
    expect(ready.badgeLabel).toBe(path.label);
    expect(ready.tone).toBe(path.tone);
  });
});
