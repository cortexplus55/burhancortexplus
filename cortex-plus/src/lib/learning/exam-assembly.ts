/**
 * Yazılı denemenin yayımlama kapısı (26 Ekim 2026).
 *
 * Her konunun söz verilen sayısı kabul edilmiş soruyla dolunca kâğıt hemen çıkar.
 * Tür karışımı tercihtir: çok cevaplı ya da açık uçlu yer dolmazsa yerin türü
 * aynı konunun geçerli sorusuna çevrilir, puan toplamı aynı kalır. Konu başı sayı
 * tercih değildir: bir konunun deliği başka konudan dolmaz (28 Ekim 2026, Paket A).
 * Eski sürüm ya da 15 dakikayı geçmiş kayıt sonsuza kadar sürdürülmez.
 */

import {
  sameTopic,
  semanticDuplicate,
  type DeliveryItem,
  type DeliverySlot,
} from "@/lib/learning/deliverable";
import { itemValidity, validityKind } from "@/lib/learning/item-validity";

/**
 * Checkpoint sürümü. Eski kayıtlar bu sürümle sürdürülmez. 3 (28 Ekim 2026, Paket A): dağılım artık
 * konu metninin uzunluğuna bakmıyor; eski planla süren kâğıt kurulumun gösterdiği dağılım değil.
 */
export const EXAM_BUILD_VERSION = 3;
/** Bu yaştan eski kayıt ya yayımlanır ya atılır. */
export const STALE_CHECKPOINT_MS = 15 * 60 * 1000;
/** Normal üretim dalgası. Sonrasında bir zorlamalı doldurma. */
export const MOCK_EXAM_WAVE_CAP = 6;
/** Deneme duvar saati. Diğer işlerin 10 dakikalık bütçesinden ayrı. */
export const MOCK_EXAM_BUDGET_MS = 3 * 60 * 1000;

export type CheckpointKind = "resume" | "publish" | "discard";

function blob(item: DeliveryItem): string {
  return [item.text, item.explanation ?? "", item.sourceLabel ?? "", ...(item.options ?? []), ...(item.correctAnswers ?? [])].join("\n");
}

function validItem(item: DeliveryItem): boolean {
  const verdict = itemValidity({
    kind: validityKind(item.type),
    text: item.text,
    options: item.options,
    correct: item.correctAnswers,
    material: item.material,
    payload: blob(item),
  });
  if (!verdict.ok) return false;
  if (item.sourceLabel !== undefined && !item.sourceLabel.trim()) return false;
  return true;
}

/** Kapıdan geçmiş, kopya olmayan sorular. Tür şartı yok. */
export function acceptedItems<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): { raw: T; view: DeliveryItem }[] {
  const pool: { raw: T; view: DeliveryItem }[] = [];
  const onExam = (view: DeliveryItem) => slots.length === 0 || slots.some((slot) => sameTopic(view, slot) || !slot.topicLabel.trim());
  for (const raw of drafts) {
    const view = read(raw);
    if (!validItem(view) || !onExam(view)) continue;
    if (pool.some((kept) => semanticDuplicate(kept.view, view))) continue;
    pool.push({ raw, view });
  }
  return pool;
}

export function countAccepted<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): number {
  return acceptedItems(slots, drafts, read).length;
}

function typeOk(itemType: string, slotType: string): boolean {
  const open = new Set(["open", "short_answer"]);
  if (open.has(slotType)) return open.has(itemType);
  if (slotType === "card" || slotType === "flashcard") return itemType === "card" || itemType === "flashcard";
  return itemType === slotType;
}

export type FittedPaper<T> = {
  ok: boolean;
  items: T[];
  /** Türü çevrilmiş yerler. Puanlar özgün planın puanıdır; toplam değişmez. */
  slots: DeliverySlot[];
};

/**
 * Söz verilen sayı doluysa kâğıdı kurar. Önce konu ve tür, sonra aynı konuda
 * herhangi bir tür (yerin türü değişir). Yer asla başka konunun sorusuyla dolmaz
 * (28 Ekim 2026, Paket A): kurulumun söylediği konu başı sayı kâğıtta aynen kalır.
 */
export function publishReady<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): FittedPaper<T> {
  const copy = slots.map((slot) => ({ ...slot }));
  if (!copy.length) return { ok: false, items: [], slots: copy };
  const pool = acceptedItems(copy, drafts, read);
  if (pool.length < copy.length) return { ok: false, items: [], slots: copy };
  const used = new Set<number>();
  const chosen: Array<number | null> = copy.map(() => null);
  const take = (match: (view: DeliveryItem, slot: DeliverySlot) => boolean) => {
    for (let slotIndex = 0; slotIndex < copy.length; slotIndex += 1) {
      if (chosen[slotIndex] != null) continue;
      const slot = copy[slotIndex]!;
      for (let index = 0; index < pool.length; index += 1) {
        if (used.has(index)) continue;
        if (!match(pool[index]!.view, slot)) continue;
        used.add(index);
        chosen[slotIndex] = index;
        break;
      }
    }
  };
  take((view, slot) => sameTopic(view, slot) && typeOk(view.type, slot.type));
  take((view, slot) => sameTopic(view, slot));
  if (chosen.some((index) => index == null)) return { ok: false, items: [], slots: copy };
  const items: T[] = [];
  const fitted = copy.map((slot, slotIndex) => {
    const pick = pool[chosen[slotIndex]!]!;
    items.push(pick.raw);
    return {
      ...slot,
      type: pick.view.type,
      topicId: pick.view.topicId ?? slot.topicId ?? null,
      topicLabel: pick.view.topicLabel || slot.topicLabel,
    };
  });
  return { ok: true, items, slots: fitted };
}

export function pointTotal(slots: readonly { points?: number }[]): number {
  return slots.reduce((sum, slot) => sum + (slot.points ?? 0), 0);
}

export function checkpointDecision(input: {
  version: number;
  startedAt: number;
  now: number;
  accepted: number;
  promised: number;
}): CheckpointKind {
  const staleVersion = input.version < EXAM_BUILD_VERSION;
  const staleAge = input.startedAt <= 0 || input.now - input.startedAt > STALE_CHECKPOINT_MS;
  if (!staleVersion && !staleAge) return "resume";
  if (input.promised > 0 && input.accepted >= input.promised) return "publish";
  return "discard";
}

export function nextCheckpointAction<T>(input: {
  version: number;
  startedAt: number;
  now: number;
  promised: number;
  slots: readonly DeliverySlot[];
  items: readonly T[];
  read: (item: T) => DeliveryItem;
}): { action: "resume" } | { action: "discard" } | { action: "publish"; paper: FittedPaper<T> } {
  const accepted = countAccepted(input.slots, input.items, input.read);
  const decision = checkpointDecision({
    version: input.version,
    startedAt: input.startedAt,
    now: input.now,
    accepted,
    promised: input.promised,
  });
  if (decision === "resume") return { action: "resume" };
  if (decision === "publish") {
    const paper = publishReady(input.slots, input.items, input.read);
    if (paper.ok && paper.items.length === input.promised) return { action: "publish", paper };
  }
  return { action: "discard" };
}

/**
 * Planın türlerini konulara dağıtır. Çok cevaplı ve açık uçlu yerler tur tur, en çok sorusu olan
 * konudan başlayarak birer birer verilir (28 Ekim 2026, Paket A). Eskiden plan sırayla kesiliyordu:
 * bütün açık uçlu yerler son konulara düşüyor, o konunun tek sorusu açık uçlu oluyordu.
 */
export function spreadSlotTypes<P extends { type: string; points: number }>(
  counts: readonly number[],
  planned: readonly P[],
  filler: P,
): P[][] {
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  const plan = planned.slice(0, total);
  while (plan.length < total) plan.push(filler);
  const queue = [...plan.filter((slot) => slot.type !== "mcq"), ...plan.filter((slot) => slot.type === "mcq")];
  const order = counts
    .map((count, index) => ({ count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((row) => row.index);
  const out: P[][] = counts.map(() => []);
  let cursor = 0;
  for (let round = 0; cursor < total; round += 1) {
    for (const topic of order) {
      if ((counts[topic] ?? 0) > round && cursor < total) {
        out[topic]!.push(queue[cursor]!);
        cursor += 1;
      }
    }
  }
  return out;
}

/** Planın yerleri, konu başı sayı plandaki gibi. Tür karışımı burada tercihtir; yayımlama bunu kapı yapmaz. */
export function slotsFromPlan(plan: {
  questionCount: number;
  slots: readonly { type: string; points: number }[];
  allocation: readonly { topicId: string | null; topicLabel: string; count: number }[];
}): DeliverySlot[] {
  const promised = plan.questionCount;
  if (promised < 1) return [];
  const rows = plan.allocation.filter((row) => row.count > 0);
  const typed = spreadSlotTypes(
    rows.map((row) => row.count),
    plan.slots,
    { type: "mcq", points: 4 },
  );
  const slots: DeliverySlot[] = [];
  rows.forEach((row, index) => {
    for (const planned of typed[index] ?? []) {
      slots.push({ topicId: row.topicId, topicLabel: row.topicLabel, type: planned.type, points: planned.points });
    }
  });
  return slots.slice(0, promised);
}

/**
 * Kâğıdın konu başı sayısı planla birebir mi? Yayın kapısı (Paket A): toplam tutsa da bir konu
 * fazla, öbürü eksikse kâğıt yazılmaz.
 */
export function topicCountsMatch(
  allocation: readonly { topicId: string | null; topicLabel: string; count: number }[],
  questions: readonly { topicId?: string | null; topicLabel: string }[],
): boolean {
  const rows = allocation.filter((row) => row.count > 0);
  if (!rows.length) return true;
  const key = (item: { topicId?: string | null; topicLabel: string }) => item.topicId || `label:${item.topicLabel}`;
  const want = new Map<string, number>();
  for (const row of rows) want.set(key(row), (want.get(key(row)) ?? 0) + row.count);
  const have = new Map<string, number>();
  for (const question of questions) have.set(key(question), (have.get(key(question)) ?? 0) + 1);
  if (have.size !== want.size) return false;
  for (const [topic, count] of want) if (have.get(topic) !== count) return false;
  return true;
}
