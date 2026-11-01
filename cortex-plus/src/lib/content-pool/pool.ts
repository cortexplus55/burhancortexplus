import "server-only";
import { displayUnitTitles } from "@/lib/curriculum/unit-title";
import { CONTENT_VERSION, poolUnit, type PoolUnit } from "@/lib/content-pool/keys";
import { generateUnitContent, type LlmCall, type UsageEntry } from "@/lib/content-pool/generate";
import type { LessonBody, PoolItem } from "@/lib/content-pool/schema";

export type StoredItem = PoolItem & { id: string; outcome_id: string };
export type StoredContent = { id: string; unitSha256: string; body: LessonBody; items: StoredItem[] };

/** Havuz deposu (Supabase; testte bellek). Yazma yalnız servis rolüyle. */
export interface PoolStore {
  readVerified(unitId: string, version: number): Promise<StoredContent | null>;
  /** Canlı draft satırı açar (kilit). Başka biri üretiyorsa false ve o satırın yaşı. */
  claim(unit: PoolUnit, version: number): Promise<{ claimed: true; id: string } | { claimed: false; ageMs: number; id: string }>;
  /** Satırı geçmişe alır (silmez): bayat doğrulanmış içerik → stale, terk edilmiş/başarısız draft → rejected. */
  retire(id: string, status: "stale" | "rejected", qa?: Record<string, unknown>): Promise<void>;
  writeVerified(
    id: string,
    unit: PoolUnit,
    version: number,
    content: { lesson: LessonBody; items: PoolItem[]; qa: Record<string, unknown>; model: string },
  ): Promise<StoredContent>;
  recordUsage(userId: string, usage: UsageEntry[]): Promise<void>;
}

/** Terk edilmiş üretim kilidi bu süreden sonra devralınır. */
export const DRAFT_TTL_MS = 10 * 60_000;

export type PublicItem = { id: string; outcome_id: string; outcome_code: string; difficulty: string; stem: string; choices: string[] };
export type UnitContent = {
  appUnitId: string;
  unitId: string;
  programId: string;
  title: string;
  origin: "cortex_original";
  lesson: LessonBody;
  /** Cevap anahtarı istemciye gitmez; kontrol sunucuda (PR 3). */
  items: PublicItem[];
  outcomes: { id: string; code: string; text: string }[];
  sourceLinks: PoolUnit["sourceLinks"];
};

export type PoolResult =
  | { status: "hit" | "generated"; content: UnitContent; llmCalls: number; ms: number }
  | { status: "pending"; ms: number }
  | { status: "failed"; reason: string; llmCalls: number; ms: number }
  | { status: "not_found"; ms: number };

function shownTitle(unit: PoolUnit): string {
  const index = unit.program.units.indexOf(unit.unit);
  return displayUnitTitles(unit.program.units.map((u) => u.title))[index] ?? unit.unit.title;
}

function toContent(unit: PoolUnit, stored: StoredContent): UnitContent {
  return {
    appUnitId: unit.appUnitId,
    unitId: unit.unitId,
    programId: unit.program.id,
    title: shownTitle(unit),
    origin: "cortex_original",
    lesson: stored.body,
    items: stored.items.map(({ id, outcome_id, outcome_code, difficulty, stem, choices }) => ({
      id,
      outcome_id,
      outcome_code,
      difficulty,
      stem,
      choices,
    })),
    outcomes: unit.outcomes.map((o) => ({ id: o.outcomeId, code: o.code, text: o.text })),
    sourceLinks: unit.sourceLinks,
  };
}

/**
 * Read-through ortak önbellek (R3). Doğrulanmış ve kayıtla aynı özetli (sha256) içerik varsa model çağrısı
 * olmadan döner. Yoksa ilk öğrenci için üretilir, doğrulanır ve hemen havuza yazılır; aynı anda gelen diğer
 * öğrenciler "pending" alır (çift üretim yok). Doğrulanmayan içerik havuza yazılmaz.
 */
/** `unitId` = curriculum_units.id (1 tabanlı, kanonik). */
export async function getUnitContent(
  unitId: string,
  deps: { store: PoolStore; llm: LlmCall | null; userId: string; now?: () => number; version?: number },
): Promise<PoolResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const ms = () => now() - started;
  const version = deps.version ?? CONTENT_VERSION;
  const unit = poolUnit(unitId);
  if (!unit) return { status: "not_found", ms: ms() };

  const cached = await deps.store.readVerified(unit.unitId, version);
  if (cached && cached.unitSha256 === unit.sha256) return { status: "hit", content: toContent(unit, cached), llmCalls: 0, ms: ms() };
  if (cached) await deps.store.retire(cached.id, "stale", { reason: "registry_sha_changed", expected: unit.sha256 });

  if (!deps.llm) return { status: "failed", reason: "ai_not_configured", llmCalls: 0, ms: ms() };
  let claim = await deps.store.claim(unit, version);
  if (!claim.claimed && claim.ageMs > DRAFT_TTL_MS) {
    await deps.store.retire(claim.id, "rejected", { reason: "draft_timeout" });
    claim = await deps.store.claim(unit, version);
  }
  if (!claim.claimed) return { status: "pending", ms: ms() };

  let result: Awaited<ReturnType<typeof generateUnitContent>>;
  try {
    result = await generateUnitContent(unit, deps.llm);
  } catch (error) {
    await deps.store.retire(claim.id, "rejected", { reason: "generation_error", message: String(error).slice(0, 400) });
    return { status: "failed", reason: "generation_error", llmCalls: 0, ms: ms() };
  }
  await deps.store.recordUsage(deps.userId, result.usage).catch(() => undefined);
  if (!result.ok) {
    await deps.store.retire(claim.id, "rejected", { reason: result.reason, ...result.qa });
    return { status: "failed", reason: result.reason, llmCalls: result.usage.length, ms: ms() };
  }
  const stored = await deps.store.writeVerified(claim.id, unit, version, result);
  return { status: "generated", content: toContent(unit, stored), llmCalls: result.usage.length, ms: ms() };
}
