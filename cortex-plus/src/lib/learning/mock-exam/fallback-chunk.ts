/**
 * Yazılı denemenin tablo-suz parçası.
 *
 * `generation_jobs` yokken deneme tek istekte yazılıyor, süre dolunca hiçbir şey
 * kalmıyor ve ekran sayacı sıfırdan başlıyordu. Parça biter bitmez kayıt
 * güncellenir; sonraki istek aynı kâğıdı sürdürür. Kısa liste yayımlanmaz.
 */
import { randomUUID } from "node:crypto";
import { JOB_BUDGET_MS } from "@/lib/learning/generation-job";

export const FALLBACK_LEASE_MS = 330_000;
export const PUBLISHED_GRACE_MS = 120_000;

export type FallbackRecord<T> = {
  id: string;
  prepKey: string;
  items: T[];
  topicsAttempted: string[];
  topicTotal: number;
  promised: number;
  reservationId: string | null;
  startedAt: number;
  leaseUntil: number;
  leaseToken: string;
  refunded: boolean;
  failed: boolean;
  building: boolean;
  examId: string | null;
  publishedAt: number | null;
  modelIndexes: Record<string, number>;
  failError: string | null;
};

export type FallbackStore<T> = {
  findActive(prepKey: string, now: number): Promise<FallbackRecord<T> | null>;
  load(id: string): Promise<FallbackRecord<T> | null>;
  create(row: FallbackRecord<T>): Promise<FallbackRecord<T> | { ok: false; status: number; error: string }>;
  save(id: string, patch: Partial<FallbackRecord<T>>): Promise<void>;
  acquire(id: string, now: number, leaseMs: number, token: string): Promise<boolean>;
};

export type ChunkProgress = { done: number; total: number; resumeId: string; label?: string | null };

export type ChunkOutcome =
  | {
      ok: true;
      resumeId: string;
      examId: string | null;
      topicsReady: number;
      topicTotal: number;
      promised: number;
      done: boolean;
      running: boolean;
    }
  | { ok: false; status: number; error: string; resumeId?: string };

export function emptyFallback<T>(prepKey: string, now: number): FallbackRecord<T> {
  return {
    id: "",
    prepKey,
    items: [],
    topicsAttempted: [],
    topicTotal: 0,
    promised: 0,
    reservationId: null,
    startedAt: now,
    leaseUntil: 0,
    leaseToken: "",
    refunded: false,
    failed: false,
    building: true,
    examId: null,
    publishedAt: null,
    modelIndexes: {},
    failError: null,
  };
}

export function topicsReadyOf(record: { topicsAttempted: string[]; topicTotal: number }): number {
  if (record.topicTotal <= 0) return record.topicsAttempted.length;
  return Math.min(record.topicTotal, new Set(record.topicsAttempted).size);
}

function isCreateError<T>(
  value: FallbackRecord<T> | { ok: false; status: number; error: string },
): value is { ok: false; status: number; error: string } {
  return "ok" in value && value.ok === false;
}

function outcomeOf<T>(record: FallbackRecord<T>, running: boolean, done: boolean): ChunkOutcome {
  const topicsReady = topicsReadyOf(record);
  return {
    ok: true,
    resumeId: record.id,
    examId: done ? record.examId : null,
    topicsReady,
    topicTotal: record.topicTotal,
    promised: record.promised,
    done,
    running,
  };
}

/**
 * Bir HTTP parçası. Kira duruyorsa üretim yok. Süre dolunca eldeki sorular kalır.
 * Bütçe bitince iade bir kez; sessiz yeniden istek yeni kâğıt açmaz.
 */
export async function pumpFallbackChunk<T>(input: {
  now: number;
  prepKey: string;
  resumeId?: string | null;
  explicitRetry?: boolean;
  store: FallbackStore<T>;
  budgetMs?: number;
  leaseMs?: number;
  /** İstek düşünce sıradaki konu başlamasın; biten konu kayıtta kalır. */
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  charge: (record: FallbackRecord<T>) => Promise<{ ok: true; reservationId: string } | { ok: false; status: number; error: string }>;
  refund: (reservationId: string) => void;
  create: (seed: FallbackRecord<T>) => Promise<FallbackRecord<T> | { ok: false; status: number; error: string }>;
  runWave: (ctx: {
    record: FallbackRecord<T>;
    signal: AbortSignal;
    checkpoint: (patch: {
      items: T[];
      topicsAttempted: string[];
      modelIndexes?: Record<string, number>;
    }) => Promise<void>;
  }) => Promise<{
    items: T[];
    topicsAttempted: string[];
    done: boolean;
    promised?: number;
    topicTotal?: number;
    modelIndexes?: Record<string, number>;
  }>;
  publish: (record: FallbackRecord<T>) => Promise<{ ok: true; examId: string } | { ok: false }>;
}): Promise<ChunkOutcome> {
  const budgetMs = input.budgetMs ?? JOB_BUDGET_MS;
  const leaseMs = input.leaseMs ?? FALLBACK_LEASE_MS;
  let record = input.resumeId ? await input.store.load(input.resumeId) : null;
  if (record && record.prepKey !== input.prepKey) record = null;
  if (!record) record = await input.store.findActive(input.prepKey, input.now);
  if (!record) {
    const created = await input.create(emptyFallback(input.prepKey, input.now));
    if (isCreateError(created)) return created;
    record = created;
  }
  if (record.examId) return outcomeOf(record, false, true);

  if (record.failed && !input.explicitRetry) {
    return { ok: false, status: 500, error: record.failError || "budget_exceeded", resumeId: record.id };
  }
  if (record.failed && input.explicitRetry) {
    record = {
      ...record,
      failed: false,
      failError: null,
      refunded: false,
      startedAt: input.now,
      reservationId: null,
    };
    await input.store.save(record.id, record);
  }

  if (!record.reservationId) {
    const charge = await input.charge(record);
    if (!charge.ok) {
      // Hak yokken satır kilitlenmez. Sonraki istek aynı kâğıda yeniden ücret yazar.
      // Bütçe aşımı ayrı: o `failed` kalır, sessiz istek üretmez.
      return { ok: false, status: charge.status, error: charge.error, resumeId: record.id };
    }
    record = { ...record, reservationId: charge.reservationId, failed: false, failError: null };
    await input.store.save(record.id, { reservationId: charge.reservationId, failed: false, failError: null });
  }

  const token = randomUUID();
  const owned = await input.store.acquire(record.id, input.now, leaseMs, token);
  if (!owned) {
    const current = (await input.store.load(record.id)) ?? record;
    input.onProgress?.({ done: topicsReadyOf(current), total: current.topicTotal, resumeId: current.id });
    return outcomeOf(current, true, false);
  }
  record = (await input.store.load(record.id)) ?? { ...record, leaseToken: token, leaseUntil: input.now + leaseMs };

  const report = (current: FallbackRecord<T>) => {
    input.onProgress?.({ done: topicsReadyOf(current), total: current.topicTotal, resumeId: current.id });
  };
  report(record);

  if (record.startedAt > 0 && input.now - record.startedAt >= budgetMs) {
    await refundOnce(input.store, input.refund, record);
    return { ok: false, status: 500, error: "budget_exceeded", resumeId: record.id };
  }
  if (input.signal?.aborted) {
    await input.store.save(record.id, { leaseUntil: 0, leaseToken: "" });
    return outcomeOf(record, false, false);
  }

  const abort = new AbortController();
  const onAbort = () => abort.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  let waveItems = record.items;
  let attempted = record.topicsAttempted;
  let done = false;
  let promised = record.promised;
  let topicTotal = record.topicTotal;
  let modelIndexes = record.modelIndexes;
  try {
    const wave = await input.runWave({
      record,
      signal: abort.signal,
      checkpoint: async (patch) => {
        const fresh = await input.store.load(record!.id);
        if (fresh && fresh.leaseToken && fresh.leaseToken !== token) {
          abort.abort();
          return;
        }
        waveItems = unionItems(fresh?.items ?? waveItems, patch.items);
        attempted = [...new Set([...(fresh?.topicsAttempted ?? attempted), ...patch.topicsAttempted])];
        modelIndexes = { ...(fresh?.modelIndexes ?? modelIndexes), ...(patch.modelIndexes ?? {}) };
        await input.store.save(record!.id, {
          items: waveItems,
          topicsAttempted: attempted,
          modelIndexes,
          leaseToken: token,
        });
        report({ ...record!, items: waveItems, topicsAttempted: attempted, modelIndexes });
      },
    });
    waveItems = wave.items;
    attempted = wave.topicsAttempted;
    done = wave.done;
    if (wave.promised && wave.promised > 0) promised = wave.promised;
    if (wave.topicTotal && wave.topicTotal > 0) topicTotal = wave.topicTotal;
    if (wave.modelIndexes) modelIndexes = wave.modelIndexes;
  } catch {
    const fresh = await input.store.load(record.id);
    if (fresh) {
      waveItems = fresh.items;
      attempted = fresh.topicsAttempted;
      modelIndexes = fresh.modelIndexes;
      promised = fresh.promised || promised;
      topicTotal = fresh.topicTotal || topicTotal;
    }
    done = false;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }

  record = {
    ...record,
    items: waveItems,
    topicsAttempted: attempted,
    promised,
    topicTotal,
    modelIndexes,
    leaseUntil: 0,
    leaseToken: "",
  };
  await input.store.save(record.id, {
    items: waveItems,
    topicsAttempted: attempted,
    promised,
    topicTotal,
    modelIndexes,
    leaseUntil: 0,
    leaseToken: "",
  });
  report(record);

  if (!done) return outcomeOf(record, false, false);

  const saved = await input.publish(record);
  if (!saved.ok) return outcomeOf(record, false, false);
  record = { ...record, examId: saved.examId, building: false, publishedAt: input.now, failed: false };
  await input.store.save(record.id, {
    examId: saved.examId,
    building: false,
    publishedAt: input.now,
    failed: false,
    leaseUntil: 0,
  });
  return outcomeOf(record, false, true);
}

async function refundOnce<T>(
  store: FallbackStore<T>,
  refund: (reservationId: string) => void,
  record: FallbackRecord<T>,
): Promise<void> {
  if (!record.refunded && record.reservationId) refund(record.reservationId);
  await store.save(record.id, {
    refunded: true,
    failed: true,
    failError: "budget_exceeded",
    reservationId: null,
    leaseUntil: 0,
    leaseToken: "",
    building: true,
  });
}

function unionItems<T>(left: T[], right: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
