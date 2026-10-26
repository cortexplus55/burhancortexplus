/**
 * `generation_jobs` yokken yazılı deneme `practice_exams.blueprint` içinde sürer.
 *
 * Sorular kapıdan geçene kadar `practice_exam_questions`'a yazılmaz. İstek düşünce
 * biten konular kalır; sonraki istek aynı satırı sürdürür, sayaç sıfırdan başlamaz.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { JOB_BUDGET_MS } from "@/lib/learning/generation-job";
import type { MockExamBlueprint, MockExamQuestionDraft, MockLengthPreset } from "@/lib/learning/mock-exam";
import {
  assembleMockExamQuestions,
  insertMockExamQuestions,
  planMockExam,
  type CreateMockExamInput,
} from "@/lib/learning/mock-exam/create";
import {
  PUBLISHED_GRACE_MS,
  pumpFallbackChunk,
  type ChunkOutcome,
  type ChunkProgress,
  type FallbackRecord,
  type FallbackStore,
} from "@/lib/learning/mock-exam/fallback-chunk";

type TopicRow = { id: string; label: string; status: string | null; source_refs: unknown };

type StoredBuild = {
  v: 1;
  prepKey: string;
  specKey: string;
  items: MockExamQuestionDraft[];
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
  attempts: number;
  prepTitle: string;
  documentId: string | null;
  topics: TopicRow[];
  plan: MockExamBlueprint | null;
  blocks: Record<string, string>;
  scope: "all" | "topics" | null;
  topicIds: string[] | null;
  userId: string;
  prepId: string;
};

export type FallbackExamInput = Omit<CreateMockExamInput, "onProgress"> & {
  resumeId?: string | null;
  explicitRetry?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
};

const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export function mockExamSpecKey(input: {
  preset?: MockLengthPreset;
  scope?: "all" | "topics";
  topicIds?: string[];
  durationMinutes?: number;
  topicLabel?: string;
  questionCount?: number;
}): string {
  return JSON.stringify({
    preset: input.preset ?? null,
    scope: input.scope ?? "all",
    topicIds: [...(input.topicIds ?? [])].sort(),
    durationMinutes: input.durationMinutes ?? null,
    topicLabel: input.topicLabel ?? null,
    questionCount: input.questionCount ?? null,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readBuild(blueprint: unknown): StoredBuild | null {
  const host = asRecord(blueprint);
  const raw = asRecord(host?.cpBuild);
  if (!raw || raw.v !== 1 || typeof raw.prepKey !== "string") return null;
  const plan = asRecord(raw.plan) as MockExamBlueprint | null;
  return {
    v: 1,
    prepKey: raw.prepKey,
    specKey: typeof raw.specKey === "string" ? raw.specKey : "",
    items: Array.isArray(raw.items) ? (raw.items as MockExamQuestionDraft[]) : [],
    topicsAttempted: Array.isArray(raw.topicsAttempted) ? raw.topicsAttempted.filter((item) => typeof item === "string") : [],
    topicTotal: typeof raw.topicTotal === "number" ? raw.topicTotal : 0,
    promised: typeof raw.promised === "number" ? raw.promised : 0,
    reservationId: typeof raw.reservationId === "string" ? raw.reservationId : null,
    startedAt: typeof raw.startedAt === "number" ? raw.startedAt : 0,
    leaseUntil: typeof raw.leaseUntil === "number" ? raw.leaseUntil : 0,
    leaseToken: typeof raw.leaseToken === "string" ? raw.leaseToken : "",
    refunded: raw.refunded === true,
    failed: raw.failed === true,
    building: raw.building !== false,
    examId: typeof raw.examId === "string" ? raw.examId : null,
    publishedAt: typeof raw.publishedAt === "number" ? raw.publishedAt : null,
    modelIndexes: (() => {
      const indexes = asRecord(raw.modelIndexes);
      return indexes
        ? Object.fromEntries(Object.entries(indexes).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
        : {};
    })(),
    failError: typeof raw.failError === "string" ? raw.failError : null,
    attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
    prepTitle: typeof raw.prepTitle === "string" ? raw.prepTitle : "",
    documentId: typeof raw.documentId === "string" ? raw.documentId : raw.documentId === null ? null : null,
    topics: Array.isArray(raw.topics) ? (raw.topics as TopicRow[]) : [],
    plan,
    blocks: (() => {
      const blocks = asRecord(raw.blocks);
      return blocks
        ? Object.fromEntries(Object.entries(blocks).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
    })(),
    scope: raw.scope === "topics" ? "topics" : raw.scope === "all" ? "all" : null,
    topicIds: Array.isArray(raw.topicIds) ? raw.topicIds.filter((item): item is string => typeof item === "string") : null,
    userId: typeof raw.userId === "string" ? raw.userId : "",
    prepId: typeof raw.prepId === "string" ? raw.prepId : "",
  };
}

function pack(build: StoredBuild): Record<string, unknown> {
  const plan = build.plan ?? {
    preset: "standard" as const,
    questionCount: build.promised,
    durationMinutes: 40,
    slots: [],
    formatSummary: null,
    fromSyllabus: false,
    allocation: [],
    allowNumeric: false,
  };
  return { ...plan, cpBuild: build };
}

function toRecord(id: string, build: StoredBuild): FallbackRecord<MockExamQuestionDraft> {
  return {
    id,
    prepKey: build.prepKey,
    items: build.items,
    topicsAttempted: build.topicsAttempted,
    topicTotal: build.topicTotal,
    promised: build.promised,
    reservationId: build.reservationId,
    startedAt: build.startedAt,
    leaseUntil: build.leaseUntil,
    leaseToken: build.leaseToken,
    refunded: build.refunded,
    failed: build.failed,
    building: build.building,
    examId: build.examId,
    publishedAt: build.publishedAt,
    modelIndexes: build.modelIndexes,
    failError: build.failError,
  };
}

function unionItems(left: MockExamQuestionDraft[], right: MockExamQuestionDraft[]): MockExamQuestionDraft[] {
  const seen = new Set<string>();
  const out: MockExamQuestionDraft[] = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function applyPatch(current: StoredBuild, patch: Partial<FallbackRecord<MockExamQuestionDraft>>): StoredBuild {
  const items = patch.items ? unionItems(current.items, patch.items) : current.items;
  const topicsAttempted = patch.topicsAttempted
    ? [...new Set([...current.topicsAttempted, ...patch.topicsAttempted])]
    : current.topicsAttempted;
  return {
    ...current,
    ...patch,
    items,
    topicsAttempted,
    modelIndexes: patch.modelIndexes ? { ...current.modelIndexes, ...patch.modelIndexes } : current.modelIndexes,
    plan: current.plan,
    topics: current.topics,
    blocks: current.blocks,
    specKey: current.specKey,
    prepKey: current.prepKey,
    userId: current.userId,
    prepId: current.prepId,
    attempts: current.attempts,
    scope: current.scope,
    topicIds: current.topicIds,
    prepTitle: current.prepTitle,
    documentId: current.documentId,
  };
}

async function listRecent(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  now: number,
): Promise<Array<{ id: string; build: StoredBuild }>> {
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const { data, error } = await service
    .from("practice_exams")
    .select("id, blueprint, created_at")
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  const rows: Array<{ id: string; build: StoredBuild }> = [];
  for (const row of data) {
    const build = readBuild(row.blueprint);
    if (!build || typeof row.id !== "string") continue;
    rows.push({ id: row.id, build });
  }
  return rows;
}

async function loadStored(service: SupabaseClient, id: string, userId: string, prepId: string): Promise<StoredBuild | null> {
  const { data, error } = await service
    .from("practice_exams")
    .select("id, user_id, exam_prep_id, blueprint")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  if (data.user_id !== userId || data.exam_prep_id !== prepId) return null;
  return readBuild(data.blueprint);
}

async function writeBuild(service: SupabaseClient, id: string, build: StoredBuild): Promise<void> {
  await service.from("practice_exams").update({ blueprint: pack(build) }).eq("id", id);
}

function activeRow(row: { id: string; build: StoredBuild }, prepKey: string, now: number): boolean {
  if (row.build.prepKey !== prepKey) return false;
  if (row.build.building && !row.build.examId) return true;
  return Boolean(row.build.examId && row.build.publishedAt && now - row.build.publishedAt < PUBLISHED_GRACE_MS);
}

/** Aynı hazırlıkta süren ya da az önce yayımlanmış bir kâğıt var. İkinci ücret açılmasın. */
export async function hasInFlightMockBuild(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  now = Date.now(),
): Promise<boolean> {
  const rows = await listRecent(service, userId, prepId, now);
  return rows.some((row) => {
    if (row.build.building && !row.build.examId) return true;
    return Boolean(row.build.examId && row.build.publishedAt && now - row.build.publishedAt < PUBLISHED_GRACE_MS);
  });
}

async function reserveMockExam(
  service: SupabaseClient,
  userId: string,
  key: string,
): Promise<{ ok: true; reservationId: string } | { ok: false; status: number; error: string }> {
  const charge = await reserveCredits(service, userId, "PRACTICE_EXAM_GENERATE", key);
  if (charge.ok) return { ok: true, reservationId: charge.reservationId };
  if (charge.reason === "operation_in_progress" || charge.reason === "operation_completed") {
    const { data } = await service
      .from("credit_reservations")
      .select("id, status")
      .eq("user_id", userId)
      .eq("idempotency_key", key)
      .maybeSingle();
    const status = data?.status;
    if (typeof data?.id === "string" && (status === "pending" || status === "committed")) {
      return { ok: true, reservationId: data.id };
    }
  }
  return {
    ok: false,
    status: charge.reason === "insufficient_credits" ? 402 : 409,
    error: refusalCode(charge),
  };
}

function examStore(
  service: SupabaseClient,
  scope: { userId: string; prepId: string; prepKey: string },
): FallbackStore<MockExamQuestionDraft> {
  return {
    async findActive(prepKey, now) {
      const rows = await listRecent(service, scope.userId, scope.prepId, now);
      const hit = rows.find((row) => activeRow(row, prepKey, now));
      return hit ? toRecord(hit.id, hit.build) : null;
    },
    async load(id) {
      const build = await loadStored(service, id, scope.userId, scope.prepId);
      return build ? toRecord(id, build) : null;
    },
    async create() {
      return { ok: false, status: 500, error: "generation_failed" };
    },
    async save(id, patch) {
      const current = await loadStored(service, id, scope.userId, scope.prepId);
      if (!current) return;
      await writeBuild(service, id, applyPatch(current, patch));
    },
    async acquire(id, now, leaseMs, token) {
      const current = await loadStored(service, id, scope.userId, scope.prepId);
      if (!current) return false;
      if (current.leaseUntil > now && current.leaseToken) return false;
      await writeBuild(service, id, { ...current, leaseUntil: now + leaseMs, leaseToken: token });
      const fresh = await loadStored(service, id, scope.userId, scope.prepId);
      return fresh?.leaseToken === token;
    },
  };
}

async function abandonOtherSpecs(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  specKey: string,
  now: number,
): Promise<void> {
  const rows = await listRecent(service, userId, prepId, now);
  for (const row of rows) {
    if (!row.build.building || row.build.examId) continue;
    if (row.build.specKey === specKey) continue;
    if (row.build.reservationId && !row.build.refunded) {
      await refundCredits(service, row.build.reservationId).catch(() => undefined);
    }
    await writeBuild(service, row.id, {
      ...row.build,
      building: false,
      failed: true,
      failError: "abandoned",
      refunded: true,
      reservationId: null,
      leaseUntil: 0,
      leaseToken: "abandoned",
    });
  }
}

async function createExam(
  input: FallbackExamInput,
  prepKey: string,
  specKey: string,
  now: number,
): Promise<FallbackRecord<MockExamQuestionDraft> | { ok: false; status: number; error: string }> {
  const planned = await planMockExam({
    service: input.service,
    userId: input.userId,
    isPremium: input.isPremium,
    prepId: input.prepId,
    preset: input.preset,
    scope: input.scope,
    topicIds: input.topicIds,
    durationMinutes: input.durationMinutes,
    topicLabel: input.topicLabel,
    questionCount: input.questionCount,
  });
  if (!planned.ok) return planned;
  const allocation = planned.plan.blueprint.allocation.filter((row) => row.count > 0);
  const build: StoredBuild = {
    v: 1,
    prepKey,
    specKey,
    items: [],
    topicsAttempted: [],
    topicTotal: allocation.length,
    promised: planned.plan.blueprint.questionCount,
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
    attempts: 0,
    prepTitle: planned.plan.prepTitle,
    documentId: planned.plan.documentId,
    topics: planned.plan.topics,
    plan: planned.plan.blueprint,
    blocks: Object.fromEntries(planned.plan.blocks),
    scope: input.scope ?? "all",
    topicIds: input.topicIds ?? null,
    userId: input.userId,
    prepId: input.prepId,
  };
  const { data, error } = await input.service
    .from("practice_exams")
    .insert({
      user_id: input.userId,
      title: `${planned.plan.prepTitle} · yazılı deneme`,
      duration_minutes: planned.plan.blueprint.durationMinutes,
      exam_prep_id: input.prepId,
      blueprint: pack(build),
      scope: input.scope ?? "all",
      topic_ids: input.topicIds ?? null,
    })
    .select("id")
    .single();
  if (error || !data || typeof data.id !== "string") return { ok: false, status: 500, error: "generation_failed" };
  return toRecord(data.id, build);
}

async function publishExam(
  input: FallbackExamInput,
  record: FallbackRecord<MockExamQuestionDraft>,
): Promise<{ ok: true; examId: string } | { ok: false }> {
  const stored = await loadStored(input.service, record.id, input.userId, input.prepId);
  if (!stored || !stored.building || stored.failed) return { ok: false };
  if (stored.examId) return { ok: true, examId: stored.examId };
  if (record.promised < 1 || record.items.length !== record.promised) return { ok: false };
  const { count, error } = await input.service
    .from("practice_exam_questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", record.id);
  if (error) return { ok: false };
  if ((count ?? 0) > 0 && (count ?? 0) < record.promised) {
    const { error: deleteError } = await input.service.from("practice_exam_questions").delete().eq("exam_id", record.id);
    if (deleteError) return { ok: false };
  }
  if ((count ?? 0) < record.promised) {
    const inserted = await insertMockExamQuestions(input.service, record.id, record.items);
    if (!inserted) return { ok: false };
  }
  const published: StoredBuild = {
    ...stored,
    items: [],
    topics: [],
    blocks: {},
    building: false,
    failed: false,
    examId: record.id,
    publishedAt: Date.now(),
    leaseUntil: 0,
    leaseToken: "",
    failError: null,
    reservationId: stored.reservationId,
  };
  const { error: updateError } = await input.service.from("practice_exams").update({ blueprint: pack(published) }).eq("id", record.id);
  if (updateError) return { ok: false };
  if (stored.reservationId) await commitCredits(input.service, stored.reservationId).catch(() => undefined);
  return { ok: true, examId: record.id };
}

/** Tablo olsun olmasın: bir HTTP parçası, kayıt `practice_exams` satırında. */
export async function runFallbackMockExam(input: FallbackExamInput): Promise<ChunkOutcome> {
  const now = Date.now();
  const specKey = mockExamSpecKey(input);
  const prepKey = `${input.userId}:${input.prepId}:${specKey}`;
  if (input.explicitRetry && input.resumeId) {
    const stored = await loadStored(input.service, input.resumeId, input.userId, input.prepId);
    if (stored?.failed) {
      await writeBuild(input.service, input.resumeId, {
        ...stored,
        attempts: stored.attempts + 1,
        reservationId: null,
        refunded: false,
        failError: null,
      });
    }
  } else if (!input.resumeId) {
    await abandonOtherSpecs(input.service, input.userId, input.prepId, specKey, now);
  }
  const store = examStore(input.service, { userId: input.userId, prepId: input.prepId, prepKey });
  return pumpFallbackChunk({
    now,
    prepKey,
    resumeId: input.resumeId,
    explicitRetry: input.explicitRetry,
    signal: input.signal,
    store,
    onProgress: input.onProgress,
    charge: async (record) => {
      const stored = await loadStored(input.service, record.id, input.userId, input.prepId);
      const attempts = stored?.attempts ?? 0;
      const key =
        attempts > 0
          ? `practice-exam:${input.prepId}:${input.userId}:${record.id}:r${attempts}`
          : `practice-exam:${input.prepId}:${input.userId}:${record.id}`;
      return reserveMockExam(input.service, input.userId, key);
    },
    refund: (reservationId) => {
      void refundCredits(input.service, reservationId).catch(() => undefined);
    },
    create: () => createExam(input, prepKey, specKey, now),
    runWave: async (ctx) => {
      const stored = await loadStored(input.service, ctx.record.id, input.userId, input.prepId);
      if (!stored?.plan || !stored.prepTitle) throw new Error("missing_plan");
      const assembled = await assembleMockExamQuestions({
        service: input.service,
        userId: input.userId,
        isPremium: input.isPremium,
        prepTitle: stored.prepTitle,
        documentId: stored.documentId,
        topics: stored.topics,
        blueprint: stored.plan,
        reservationId: ctx.record.reservationId ?? stored.reservationId ?? "",
        chargeKey: `practice-exam:${input.prepId}:${input.userId}:${ctx.record.id}`,
        prior: ctx.record.items,
        maxWaves: 1,
        blocks: new Map(Object.entries(stored.blocks)),
        initialTopics: ctx.record.topicsAttempted,
        modelIndexes: ctx.record.modelIndexes,
        signal: ctx.signal,
        onCheckpoint: async (snapshot) => {
          await ctx.checkpoint({ items: snapshot.items, topicsAttempted: snapshot.topicsAttempted });
        },
        onProgress: (progress) =>
          input.onProgress?.({
            done: progress.done,
            total: progress.total,
            resumeId: ctx.record.id,
            label: progress.label,
          }),
      });
      return {
        items: assembled.questions,
        topicsAttempted: assembled.topicsAttempted,
        done: assembled.ok,
        promised: assembled.planned,
        topicTotal: assembled.topicTotal,
        modelIndexes: assembled.modelIndexes,
      };
    },
    publish: (record) => publishExam(input, record),
  });
}

/**
 * Kirası düşmüş ve bütçesi bitmiş taslaklar. Model çağırmaz.
 * Süre içindeyse istemci aynı satırı sürdürür; bütçe bitince iade bir kez, sorular durur.
 */
export async function sweepAbandonedMockBuilds(service: SupabaseClient, now = Date.now()): Promise<number> {
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const { data, error } = await service
    .from("practice_exams")
    .select("id, blueprint, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !Array.isArray(data)) return 0;
  let swept = 0;
  for (const row of data) {
    if (swept >= 20) break;
    if (typeof row.id !== "string") continue;
    const build = readBuild(row.blueprint);
    if (!build?.building || build.examId || build.publishedAt) continue;
    if (build.leaseUntil > now) continue;
    if (build.startedAt > 0 && now - build.startedAt < JOB_BUDGET_MS) continue;
    if (build.failed && build.refunded && !build.reservationId) continue;
    if (build.reservationId && !build.refunded) {
      await refundCredits(service, build.reservationId).catch(() => undefined);
    }
    await writeBuild(service, row.id, {
      ...build,
      refunded: true,
      failed: true,
      failError: "budget_exceeded",
      reservationId: null,
      leaseUntil: 0,
      leaseToken: "",
      building: true,
    });
    swept += 1;
  }
  return swept;
}
