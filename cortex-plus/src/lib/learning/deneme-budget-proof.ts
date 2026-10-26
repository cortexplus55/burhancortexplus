/**
 * Söz verilen sayı ile yayımlanan sayı aynı mı, duvar saati içinde mi?
 * Betik ve bekçi aynı üç şekli oynatır: türü uymayan 59 soru, boş dalga tavanı, eski kayıt.
 */

import type { DeliveryItem, DeliverySlot } from "@/lib/learning/deliverable";
import { selectDeliverable } from "@/lib/learning/deliverable";
import {
  MOCK_EXAM_BUDGET_MS,
  MOCK_EXAM_WAVE_CAP,
  STALE_CHECKPOINT_MS,
  EXAM_BUILD_VERSION,
  nextCheckpointAction,
  pointTotal,
} from "@/lib/learning/exam-assembly";
import { fillUntilDelivered, type FillClock, type FillRequest } from "@/lib/learning/fill-until-delivered";
import { allocateQuestions, slotFromTopicRow } from "@/lib/learning/mock-exam/allocate";
import { defaultSlots } from "@/lib/learning/mock-exam/blueprint";

const LABELS = ["Alfa", "Beta", "Gama", "Delta", "Epsilon", "Zeta", "Kappa", "Teta", "Iota"] as const;

export function promisedPaper(): DeliverySlot[] {
  const topics = LABELS.map((label, index) => slotFromTopicRow({ id: `k${index + 1}`, label, passageChars: 400 }));
  const allocation = allocateQuestions(topics, 20);
  const plans = defaultSlots(20, false);
  const queue = [...plans];
  const slots: DeliverySlot[] = [];
  for (const row of allocation) {
    const planned = queue.splice(0, row.count);
    for (const plan of planned) {
      slots.push({
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        type: plan.type,
        points: plan.points,
      });
    }
  }
  return slots;
}

export function distinctMcq(label: string, topicId: string | null, n: number): DeliveryItem {
  const token = `k${String(n).padStart(4, "0")}oz`;
  const correct = `Secenek ${token}`;
  return {
    topicId,
    topicLabel: label,
    type: "mcq",
    text: `${label} ${token} ayri sorusu mudur`,
    options: [correct, `Yanlis ${token} bir`, `Yanlis ${token} iki`, `Yanlis ${token} uc`],
    correctAnswers: [correct],
    explanation: token,
    sourceLabel: "kaynak",
  };
}

function hosts(): Array<{ id: string; label: string }> {
  return LABELS.map((label, index) => ({ id: `k${index + 1}`, label }));
}

export function mismatchedBag(count: number): DeliveryItem[] {
  const rows = hosts();
  return Array.from({ length: count }, (_, index) => {
    const host = rows[index % rows.length]!;
    return distinctMcq(host.label, host.id, index + 1);
  });
}

function clockAt(start = 0): FillClock {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

export async function replayMismatchedPublish(): Promise<{
  ok: boolean;
  delivered: number;
  promised: number;
  elapsedMs: number;
  generateCalls: number;
  pointTotal: number;
  originalPointTotal: number;
  openPointsKept: boolean;
  originalCanPublish: boolean;
}> {
  const slots = promisedPaper();
  const prior = mismatchedBag(59);
  let generateCalls = 0;
  const result = await fillUntilDelivered({
    slots,
    prior,
    maxWaves: 0,
    followUpWaves: 0,
    generate: async () => {
      generateCalls += 1;
      return [];
    },
    read: (item) => item,
  });
  const openPointsKept = result.slots.every((slot, index) => slot.points === slots[index]?.points);
  return {
    ok: result.ok && result.items.length === slots.length && openPointsKept,
    delivered: result.items.length,
    promised: slots.length,
    elapsedMs: result.elapsedMs,
    generateCalls,
    pointTotal: pointTotal(result.slots),
    originalPointTotal: pointTotal(slots),
    openPointsKept,
    originalCanPublish: selectDeliverable(slots, prior, (item) => item).canPublish,
  };
}

export async function replayWaveCap(): Promise<{
  ok: boolean;
  delivered: number;
  promised: number;
  elapsedMs: number;
  completedWave: number;
  forced: boolean;
  relaxedCalls: number;
  emptyCalls: number;
  relaxedCount: number;
}> {
  const slots = promisedPaper();
  let serial = 100;
  let relaxedCalls = 0;
  let emptyCalls = 0;
  let relaxedCount = 0;
  const clock = clockAt(0);
  const result = await fillUntilDelivered({
    slots,
    maxWaves: 1,
    followUpWaves: MOCK_EXAM_WAVE_CAP,
    waveCap: MOCK_EXAM_WAVE_CAP,
    budgetMs: MOCK_EXAM_BUDGET_MS,
    startedAt: 0,
    waveMs: 20_000,
    clock,
    generate: async (request: FillRequest) => {
      if (!request.relaxed) {
        emptyCalls += 1;
        return [];
      }
      relaxedCalls += 1;
      relaxedCount = request.slots.length;
      return request.slots.map((slot) => {
        serial += 1;
        return distinctMcq(slot.topicLabel, slot.topicId ?? null, serial);
      });
    },
    read: (item) => item,
  });
  return {
    ok: result.ok && result.items.length === slots.length && result.forced && result.completedWave === MOCK_EXAM_WAVE_CAP,
    delivered: result.items.length,
    promised: slots.length,
    elapsedMs: result.elapsedMs,
    completedWave: result.completedWave,
    forced: result.forced,
    relaxedCalls,
    emptyCalls,
    relaxedCount,
  };
}

export function replayStaleCheckpoint(): {
  full: "publish" | "discard" | "resume";
  fullDelivered: number;
  short: "publish" | "discard" | "resume";
  fresh: "publish" | "discard" | "resume";
  agedFull: "publish" | "discard" | "resume";
  agedShort: "publish" | "discard" | "resume";
} {
  const slots = promisedPaper();
  const now = 1_700_000_000_000;
  const full = nextCheckpointAction({
    version: 1,
    startedAt: now,
    now,
    promised: slots.length,
    slots,
    items: mismatchedBag(59),
    read: (item) => item,
  });
  const short = nextCheckpointAction({
    version: 1,
    startedAt: now,
    now,
    promised: slots.length,
    slots,
    items: mismatchedBag(8),
    read: (item) => item,
  });
  const fresh = nextCheckpointAction({
    version: EXAM_BUILD_VERSION,
    startedAt: now,
    now,
    promised: slots.length,
    slots,
    items: mismatchedBag(8),
    read: (item) => item,
  });
  const agedFull = nextCheckpointAction({
    version: EXAM_BUILD_VERSION,
    startedAt: now - STALE_CHECKPOINT_MS - 1,
    now,
    promised: slots.length,
    slots,
    items: mismatchedBag(59),
    read: (item) => item,
  });
  const agedShort = nextCheckpointAction({
    version: EXAM_BUILD_VERSION,
    startedAt: now - STALE_CHECKPOINT_MS - 1,
    now,
    promised: slots.length,
    slots,
    items: mismatchedBag(8),
    read: (item) => item,
  });
  return {
    full: full.action,
    fullDelivered: full.action === "publish" ? full.paper.items.length : 0,
    short: short.action,
    fresh: fresh.action,
    agedFull: agedFull.action,
    agedShort: agedShort.action,
  };
}

/** Betiğin baktığı tek sonuç: yayımlanan sayı söz verilen sayı, süre bütçenin içinde. */
export async function replayPublishCap(): Promise<{
  ok: boolean;
  delivered: number;
  promised: number;
  elapsedMs: number;
  budgetMs: number;
}> {
  const mismatched = await replayMismatchedPublish();
  const capped = await replayWaveCap();
  const stale = replayStaleCheckpoint();
  const ok =
    mismatched.ok &&
    mismatched.delivered === mismatched.promised &&
    mismatched.generateCalls === 0 &&
    mismatched.pointTotal === mismatched.originalPointTotal &&
    mismatched.originalCanPublish === false &&
    capped.ok &&
    capped.delivered === capped.promised &&
    capped.forced &&
    capped.relaxedCalls === 1 &&
    capped.relaxedCount === capped.promised &&
    capped.completedWave === MOCK_EXAM_WAVE_CAP &&
    capped.elapsedMs <= MOCK_EXAM_BUDGET_MS &&
    stale.full === "publish" &&
    stale.fullDelivered === 20 &&
    stale.short === "discard" &&
    stale.fresh === "resume" &&
    stale.agedFull === "publish" &&
    stale.agedShort === "discard";
  return {
    ok,
    delivered: ok ? 20 : 0,
    promised: 20,
    elapsedMs: Math.max(mismatched.elapsedMs, capped.elapsedMs),
    budgetMs: MOCK_EXAM_BUDGET_MS,
  };
}
