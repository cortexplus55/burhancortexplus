import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { redisPipeline, rateLimitBackend } from "@/lib/rate-limit";
import { getActionCost } from "@/lib/credits/service";
import { spendableCredits } from "@/lib/credits/spendable-server";
import { cleanWholeDocument } from "@/lib/documents/clean-pages";
import { commitDocumentCredits, settleDocumentHold } from "@/lib/documents/document-credits";
import { ensureDocumentPart, listDocumentParts, type DocumentPart } from "@/lib/documents/document-head";
import {
  attachedThroughFrom,
  nextWindow,
  shouldPauseReading,
  usesWindows,
  WINDOW_PAGES,
  type PageWindow,
} from "@/lib/documents/document-windows";
import { PDF_STEP_DEADLINE_MS, processPdfDocumentStep } from "@/lib/documents/pdf-ingestion";
import { clearDocumentWaitMarkers, runCourseMapRound } from "@/lib/documents/pdf-learning-v2";
import { freePagesRemaining } from "@/lib/documents/free-pages";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { attachDocumentsToPrep } from "@/lib/learning/prep-attach";
import { clearPendingMaterials, listPendingMaterials } from "@/lib/learning/pending-materials";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";

/*
  Pencere işçisi (31 Ekim 2026, ürün sahibi: "ister 5, ister 500, ister 1.000 sayfa; aynı kararlılık").

  Hazırlığın bekleyen belgelerini (exam_prep_pending_materials) sırayla, pencere pencere yola ekler: pencere okunur
  okunmaz kopyası çıkar, küçük haritası çıkar, "materyal ekle" yoluyla eklenir; bu sırada bir sonraki pencere okunur.
  Bir çağrı en çok ~4 dk sürer (fonksiyon tavanı 300 sn); iş bitmediyse çağrı kendini imzalı bir istekle yeniden
  başlatır (rota, `requestPendingAdvance`) ve hazırlık sayfasındaki şerit de dürter. Aynı hazırlıkta aynı anda tek
  işçi (Redis kilidi); okuma kirası ve harita kirası ayrıca korur. Her adım tekrar edilebilir: aynı aralığın kopyası
  bir kez çıkar, eklenmiş belge yeniden eklenmez.

  Taranmış kitap öğrenci ilerledikçe okunur (`shouldPauseReading`): duraklarken sayfa ücreti ayırması bırakılır ve
  yalnız okunan sayfalar kesilir (document-credits.ts); öğrenci derslerini bitirdikçe ya da "Hepsini şimdi oku" deyince
  sonraki pencere okunur.
*/

/** Bir çağrının iş süresi: okuma adımı ve harita turu bunun içinde biter, rota 300 sn'yi aşmaz. */
export const ADVANCE_BUDGET_MS = 240_000;
/** Arka plan temizliği (after) fonksiyonun 300 sn tavanından önce biter. */
const HARD_STOP_MS = 285_000;
/** Yeni bir adım bu kadar süre kalmadan başlamaz. */
const MIN_STEP_MS = 25_000;
const BUSY_WAIT_MS = 2_000;
const LOCK_MS = 290_000;
/** Kendini yeniden başlatan zincirin tavanı (1.000 sayfalık taranmış kitap bile birkaç halkada biter). */
export const MAX_CHAIN_HOPS = 60;
export const WINDOW_CHAIN_HEADER = "x-cp-window-chain";
const TOKEN_TTL_MS = 2 * 60_000;

export type AdvanceState =
  /** Bekleyen belge kalmadı. */
  | "done"
  /** Süre doldu; iş sürüyor (zincir ya da şerit sürdürür). */
  | "deadline"
  /** Taranmış kitap öğrenci ilerledikçe okunacak. */
  | "paused"
  /** Kalan sayfalar için kullanım hakkı yetmiyor. */
  | "paused_credits"
  /** Başka bir işçi bu hazırlıkta çalışıyor. */
  | "busy"
  /** Belge başka bir istekte okunuyor/yükleniyor; birazdan yeniden. */
  | "waiting"
  | "failed";

export type AdvanceResult = {
  state: AdvanceState;
  windowsAdded: number;
  addedTopics: number;
  mergedTopics: number;
  failed?: { documentId: string; fileName: string; code: string; retryable: boolean };
};

type DocState = {
  documentId: string;
  fileName: string;
  isPdf: boolean;
  status: string;
  error: string | null;
  total: number | null;
  readThrough: number;
  readComplete: boolean;
  /** Bu hazırlıkta olan parçalar (baş kopyası, pencereler). */
  parts: DocumentPart[];
  attachedThrough: number;
  /** Okuma şu an başka bir istekte (kira dolu). */
  leaseBusy: boolean;
  hasReservation: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function prepSourceIds(service: SupabaseClient, userId: string, prepId: string): Promise<string[] | null> {
  const { data, error } = await service
    .from("exam_preps")
    .select("document_id, source_document_ids")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return prepSourceDocumentIds({
    documentId: (data.document_id as string | null) ?? null,
    sourceDocumentIds: Array.isArray(data.source_document_ids) ? (data.source_document_ids as string[]) : [],
  });
}

async function documentState(
  service: SupabaseClient,
  input: { userId: string; documentId: string; sources: readonly string[] },
): Promise<DocState | null> {
  const [{ data: doc }, { data: ingestion }, partsResult, { count: pageRows }] = await Promise.all([
    service
      .from("documents")
      .select("id, file_name, mime_type, status, page_count, error_message, deleted_at")
      .eq("id", input.documentId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    service
      .from("document_ingestion_state")
      .select("status, next_page, total_pages, lease_until, reservation_id")
      .eq("document_id", input.documentId)
      .maybeSingle(),
    listDocumentParts(service, { userId: input.userId, documentId: input.documentId }),
    service.from("document_pages").select("id", { count: "exact", head: true }).eq("document_id", input.documentId),
  ]);
  if (!doc || doc.deleted_at) return null;
  const isPdf = doc.mime_type === "application/pdf";
  const parts = (partsResult === "unsupported" ? [] : partsResult).filter((part) => input.sources.includes(part.documentId));
  const pageCount = typeof doc.page_count === "number" && doc.page_count > 0 ? doc.page_count : null;
  let total: number | null;
  let readThrough: number;
  let readComplete: boolean;
  if (isPdf) {
    total = typeof ingestion?.total_pages === "number" && ingestion.total_pages > 0 ? ingestion.total_pages : pageCount;
    readComplete = ingestion?.status === "ready" || (doc.status === "completed" && total != null);
    readThrough = readComplete && total != null
      ? total
      : typeof ingestion?.next_page === "number" ? Math.max(0, ingestion.next_page - 1) : 0;
  } else {
    // Word/sunu/metin tek adımda okunur: sayfaları yazıldıysa hepsi okunmuştur.
    total = pageCount;
    readComplete = Boolean(pageCount && (pageRows ?? 0) >= pageCount);
    readThrough = readComplete && pageCount ? pageCount : 0;
  }
  return {
    documentId: input.documentId,
    fileName: String(doc.file_name ?? "Belge"),
    isPdf,
    status: String(doc.status ?? "processing"),
    error: typeof doc.error_message === "string" ? doc.error_message : null,
    total,
    readThrough,
    readComplete,
    parts,
    attachedThrough: attachedThroughFrom(parts),
    leaseBusy: Boolean(ingestion?.lease_until && Date.parse(String(ingestion.lease_until)) > Date.now()),
    hasReservation: Boolean(ingestion?.reservation_id),
  };
}

/**
 * Belgenin sayfaları görüntüden mi okunuyor (taranmış kitap / fotoğraf seti): okunan sayfalardan biri görüntü
 * okumasıyla çıktıysa. Görüntü kotası satırları (document_ocr_claims) ölçü değil: kotadan muaf hesapta yazılmıyor
 * (31 Ekim 2026, canlı ölçüm: kurucunun taranmış kitabı duraklamadan sonuna kadar okundu).
 */
async function isScanned(service: SupabaseClient, documentId: string): Promise<boolean> {
  const { count } = await service
    .from("document_pages")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("extraction_method", "ocr");
  return (count ?? 0) > 0;
}

/** Yolda öğrencinin henüz bitirmediği ders sayısı (taranmış kitapta okumanın ne kadar önde gideceği). */
export async function lessonsAhead(service: SupabaseClient, prepId: string): Promise<number> {
  const { count } = await service
    .from("exam_prep_nodes")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", prepId)
    .eq("kind", "lesson")
    .not("status", "in", "(done,hidden)");
  return count ?? 0;
}

/** Kaldığı yerden süren okuma yeni ayırma açar: hak bir sayfaya bile yetmiyorsa okuma durur (belge düşmez). */
async function canAffordResume(service: SupabaseClient, userId: string): Promise<boolean> {
  if ((await freePagesRemaining(service, userId).catch(() => null)) !== null) return true;
  const [spendable, cost] = await Promise.all([
    spendableCredits(service, userId),
    getActionCost(service, "DOCUMENT_PAGE_PROCESS"),
  ]);
  return spendable >= Math.max(1, cost ?? 1);
}

/** Haritası çıkan belge: durumu "bitti", sayfaları arkada temizlenir (derse temiz metin gider; yetişmeyen sayfa ilk derste). */
async function finishMapped(service: SupabaseClient, input: { userId: string; documentId: string; hardStopAt: number }) {
  await commitDocumentCredits(service, input.userId, input.documentId);
  await service.from("documents").update({ status: "completed", error_message: null })
    .eq("id", input.documentId).eq("user_id", input.userId);
  await service.from("processing_jobs").update({ status: "completed", progress: 100 }).eq("document_id", input.documentId);
  after(() =>
    cleanWholeDocument(service, {
      userId: input.userId,
      documentId: input.documentId,
      deadlineAt: Math.min(Date.now() + 120_000, input.hardStopAt),
    })
      .catch(() => undefined),
  );
}

/** Bütün pencereleri eklenen ana belge: bekleyen listeden çıkar, ücreti kesinleşir, Belgelerim'de "bitti". */
async function finalizeDocument(service: SupabaseClient, input: { userId: string; prepId: string; documentId: string }) {
  await commitDocumentCredits(service, input.userId, input.documentId);
  await service.from("documents").update({ status: "completed", error_message: null })
    .eq("id", input.documentId).eq("user_id", input.userId).neq("status", "failed");
  await service.from("processing_jobs").update({ status: "completed", progress: 100 }).eq("document_id", input.documentId);
  await clearDocumentWaitMarkers(service, [input.documentId]).catch(() => undefined);
  await clearPendingMaterials(service, { prepId: input.prepId, userId: input.userId, documentIds: [input.documentId] });
}

// ——— Hazırlık başına tek işçi ———

const memoryLocks = new Map<string, { token: string; until: number }>();

async function takeLock(key: string): Promise<string | null> {
  const token = crypto.randomUUID();
  if (rateLimitBackend() === "memory") {
    const held = memoryLocks.get(key);
    if (held && held.until > Date.now()) return null;
    memoryLocks.set(key, { token, until: Date.now() + LOCK_MS });
    return token;
  }
  const result = await redisPipeline([["SET", key, token, "NX", "PX", String(LOCK_MS)]]);
  // Redis'e ulaşılamadı: işçi yine çalışır (okuma ve harita kiraları çift işi zaten önler).
  if (!result) return token;
  return result[0] === "OK" ? token : null;
}

async function releaseLock(key: string, token: string) {
  if (rateLimitBackend() === "memory") {
    if (memoryLocks.get(key)?.token === token) memoryLocks.delete(key);
    return;
  }
  await redisPipeline([
    ["EVAL", "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", "1", key, token],
  ]);
}

/** Sınama: bellek kilitlerini boşaltır. */
export function resetWindowLocksForTests() {
  memoryLocks.clear();
}

// ——— İşçi ———

type MapOutcome = { ok: true } | { ok: false; pending: true } | { ok: false; pending: false; error: string; retryable: boolean };

export async function advancePendingMaterials(
  service: SupabaseClient,
  input: { userId: string; prepId: string; eager?: boolean; now?: () => number; budgetMs?: number },
): Promise<AdvanceResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const deadlineAt = startedAt + (input.budgetMs ?? ADVANCE_BUDGET_MS);
  const hardStopAt = startedAt + HARD_STOP_MS;
  const timeLeft = () => deadlineAt - now();
  const result: AdvanceResult = { state: "done", windowsAdded: 0, addedTopics: 0, mergedTopics: 0 };
  const lockKey = `pending-windows:${input.prepId}`;
  const lock = await takeLock(lockKey);
  if (!lock) return { ...result, state: "busy" };
  try {
    const fast = await fastAllowedFor(service, input.userId).catch(() => false);
    const materials = await listPendingMaterials(service, { prepId: input.prepId, userId: input.userId });
    for (const material of materials) {
      if (material.status === "pending") {
        // Yüklemesi yarım belge: öbürleri onu beklemez ama sıra bozulmasın diye burada durulur.
        result.state = "waiting";
        return result;
      }
      const outcome = await advanceDocument(service, {
        userId: input.userId,
        prepId: input.prepId,
        documentId: material.documentId,
        eager: input.eager === true,
        fast,
        hardStopAt,
        timeLeft,
        result,
      });
      if (outcome !== "done") {
        result.state = outcome;
        return result;
      }
    }
    result.state = "done";
    return result;
  } finally {
    await releaseLock(lockKey, lock).catch(() => undefined);
  }
}

async function advanceDocument(
  service: SupabaseClient,
  ctx: {
    userId: string;
    prepId: string;
    documentId: string;
    eager: boolean;
    fast: boolean;
    /** Arka plan temizliğinin bitmesi gereken an (fonksiyon tavanından önce). */
    hardStopAt: number;
    timeLeft: () => number;
    result: AdvanceResult;
  },
): Promise<Exclude<AdvanceState, "busy">> {
  const { userId, prepId, documentId } = ctx;
  // Kapanıştaki atamaları TypeScript daraltmasın diye kutuda.
  const run: { reading: Promise<void> | null; readFailure: { code: string; retryable: boolean } | null } = {
    reading: null,
    readFailure: null,
  };

  const fail = (state: DocState | null, code: string, retryable: boolean): "failed" => {
    ctx.result.failed = { documentId, fileName: state?.fileName ?? "Belge", code, retryable };
    return "failed";
  };

  /** Sayfa `until`'e kadar okur (adım adım; başka istek okuyorsa bekler). Aynı anda tek okuma. */
  const readUntil = (until: number): Promise<void> => {
    if (run.reading) return run.reading;
    run.reading = (async () => {
      while (ctx.timeLeft() > MIN_STEP_MS) {
        const step = await processPdfDocumentStep(service, documentId, userId, {
          deadlineMs: Math.min(Date.now() + PDF_STEP_DEADLINE_MS, Date.now() + ctx.timeLeft() - 15_000),
          untilPage: until,
        }).catch(() => null);
        if (!step) {
          // Beklenmeyen hata: döngüye girmeden bu çağrı biter, şerit yeniden dener.
          run.readFailure = { code: "processing_failed", retryable: true };
          return;
        }
        if (step.status === "ready") return;
        if (step.status === "failed") {
          run.readFailure = { code: step.code, retryable: Boolean(step.retryable) };
          return;
        }
        if (step.busy) {
          await sleep(BUSY_WAIT_MS);
          const fresh = await documentState(service, { userId, documentId, sources: [] });
          if (!fresh || fresh.readComplete || fresh.readThrough >= until) return;
          continue;
        }
        if ((step.pagesDone ?? 0) >= until) return;
      }
    })().finally(() => {
      run.reading = null;
    });
    return run.reading;
  };

  const mapUntilDone = async (documentIds: string[]): Promise<MapOutcome> => {
    for (;;) {
      if (ctx.timeLeft() < MIN_STEP_MS) return { ok: false, pending: true };
      const mapped = await runCourseMapRound(service, {
        documentIds,
        prepId,
        deadlineAt: Date.now() + ctx.timeLeft() - 10_000,
        fromCourse: true,
        fast: ctx.fast,
        urgent: true,
      });
      if (mapped.ok && !mapped.pending) return { ok: true };
      if (mapped.pending) {
        if (mapped.leaseBusy) await sleep(BUSY_WAIT_MS);
        continue;
      }
      // Bu belge başka bir hazırlıkta kullanılıyor: haritası hazır ve değişmez — eklenebilir.
      if (mapped.error === "topic_map_in_use") return { ok: true };
      return { ok: false, pending: false, error: mapped.error ?? "topic_map_failed", retryable: mapped.retryable !== false };
    }
  };

  const attach = async (ids: string[], window: PageWindow | null): Promise<boolean> => {
    const attached = await attachDocumentsToPrep(service, { userId, prepId, documentIds: ids });
    if (!attached.ok) return false;
    ctx.result.addedTopics += attached.addedTopics;
    ctx.result.mergedTopics += attached.mergedTopics;
    if (window) ctx.result.windowsAdded += 1;
    console.info("pending_window_attached", {
      prepId, documentId, window, topics: attached.addedTopics, merged: attached.mergedTopics,
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.timeLeft() < MIN_STEP_MS) return "deadline";
      const sources = (await prepSourceIds(service, userId, prepId)) ?? [];
      const state = await documentState(service, { userId, documentId, sources });
      if (!state) {
        await clearPendingMaterials(service, { prepId, userId, documentIds: [documentId] });
        return "done";
      }
      // Eski yoldan (bütün belge) eklenmiş: yapılacak bir şey yok.
      if (sources.includes(documentId)) {
        await finalizeDocument(service, { userId, prepId, documentId });
        return "done";
      }
      if (state.status === "failed") return fail(state, state.error ?? "processing_failed", false);
      if (run.readFailure) return fail(state, run.readFailure.code, run.readFailure.retryable);

      if (state.total == null) {
        // PDF henüz hiç okunmadı (ya da Word/sunu başka istekte okunuyor).
        if (!state.isPdf) return "waiting";
        await readUntil(WINDOW_PAGES);
        continue;
      }

      if (!usesWindows({ total: state.total, hasParts: state.parts.length > 0 })) {
        // Küçük belge: kendisi haritalanıp eklenir (kopya gerekmez).
        if (!state.readComplete) {
          if (!state.isPdf) return "waiting";
          await readUntil(state.total);
          continue;
        }
        const mapped = await mapUntilDone([documentId]);
        if (!mapped.ok) return mapped.pending ? "deadline" : fail(state, mapped.error, mapped.retryable);
        await finishMapped(service, { userId, documentId, hardStopAt: ctx.hardStopAt });
        if (!(await attach([documentId], null))) return fail(state, "attach_failed", true);
        return "done";
      }

      const window = nextWindow({ attachedThrough: state.attachedThrough, total: state.total });
      if (!window) {
        await finalizeDocument(service, { userId, prepId, documentId });
        return "done";
      }

      const scannedNow = state.isPdf && !state.readComplete ? await isScanned(service, documentId) : false;
      const pausedNow = async () =>
        scannedNow && shouldPauseReading({ scanned: true, lessonsAhead: await lessonsAhead(service, prepId), eager: ctx.eager });

      if (state.readThrough >= window.to) {
        // Bu pencere okunmuş: haritalanırken bir sonrakini oku (taranmışta öğrencinin önü doluysa okuma).
        const following = nextWindow({ attachedThrough: window.to, total: state.total });
        if (following && state.isPdf && state.readThrough < following.to && !state.leaseBusy && !(await pausedNow())) {
          if (state.hasReservation || (await canAffordResume(service, userId))) void readUntil(following.to);
        }
        const part = await ensureDocumentPart(service, { userId, documentId, firstPage: window.from, lastPage: window.to });
        if (!part) return fail(state, "part_copy_failed", true);
        const mapped = await mapUntilDone([part.documentId]);
        if (!mapped.ok) return mapped.pending ? "deadline" : fail(state, mapped.error, mapped.retryable);
        await finishMapped(service, { userId, documentId: part.documentId, hardStopAt: ctx.hardStopAt });
        if (!(await attach([part.documentId], window))) return fail(state, "attach_failed", true);
        continue;
      }

      // Pencere henüz okunmadı.
      if (!state.isPdf) return "waiting";
      if (!state.leaseBusy && (await pausedNow())) {
        await settleDocumentHold(service, { userId, documentId, readThrough: state.readThrough }).catch(() => false);
        return "paused";
      }
      if (!state.hasReservation && !state.leaseBusy && !(await canAffordResume(service, userId))) return "paused_credits";
      await readUntil(window.to);
    }
  } finally {
    // Süre dolarken süren okuma adımı yarım bırakılmaz: kendi süresi içinde biter.
    if (run.reading) await run.reading.catch(() => undefined);
  }
}

// ——— İlerleme (hazırlık sayfası şeridi) ———

export type PendingWindowProgress = {
  documentId: string;
  fileName: string;
  status: string;
  error: string | null;
  /** Okunan / toplam sayfa. */
  pagesDone: number | null;
  pageCount: number | null;
  /** Yola eklenmiş son sayfa (kesintisiz). */
  attachedThrough: number;
  /** Belge pencere pencere ekleniyor (büyük belge ya da baş kopyalı belge). */
  windowed: boolean;
  /** Taranmış kitap ve öğrencinin önü dolu: okuma öğrenci ilerledikçe sürecek. */
  paused: boolean;
};

export async function pendingWindowProgress(
  service: SupabaseClient,
  input: { userId: string; prepId: string },
): Promise<{ materials: PendingWindowProgress[]; topicCount: number }> {
  const [materials, sources, ahead, { count: topicCount }] = await Promise.all([
    listPendingMaterials(service, input),
    prepSourceIds(service, input.userId, input.prepId),
    lessonsAhead(service, input.prepId),
    service.from("exam_prep_topics").select("id", { count: "exact", head: true }).eq("exam_prep_id", input.prepId),
  ]);
  const out = await Promise.all(
    materials.map(async (material) => {
      const state = await documentState(service, { userId: input.userId, documentId: material.documentId, sources: sources ?? [] });
      if (!state) return null;
      const windowed = state.total != null && usesWindows({ total: state.total, hasParts: state.parts.length > 0 });
      const next = state.total != null ? nextWindow({ attachedThrough: state.attachedThrough, total: state.total }) : null;
      const waitingForRead = Boolean(next && state.readThrough < next.to && !state.readComplete);
      const paused = windowed && waitingForRead && !state.leaseBusy && state.isPdf
        && shouldPauseReading({ scanned: await isScanned(service, material.documentId), lessonsAhead: ahead, eager: false });
      return {
        documentId: material.documentId,
        fileName: material.fileName,
        status: material.status,
        error: material.error,
        pagesDone: state.total != null ? state.readThrough : material.pagesDone,
        pageCount: state.total ?? material.pageCount,
        attachedThrough: state.attachedThrough,
        windowed,
        paused,
      } satisfies PendingWindowProgress;
    }),
  );
  return { materials: out.filter((item): item is PendingWindowProgress => item !== null), topicCount: topicCount ?? 0 };
}

// ——— Kendini sürdüren zincir ———

function chainSecret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`pending-windows:${payload}`).digest("hex");
}

export function windowChainToken(userId: string, prepId: string, at = Date.now()): string | null {
  const secret = chainSecret();
  if (!secret) return null;
  const payload = `${userId}.${prepId}.${at + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Geçerli imza → işçinin sahibi ve hazırlığı. Süresi geçmiş ya da bozuk imza → null. */
export function verifyWindowChainToken(token: string | null, at = Date.now()): { userId: string; prepId: string } | null {
  const secret = chainSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, prepId, exp, mac] = parts;
  const expected = sign(`${userId}.${prepId}.${exp}`, secret);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (!(Number(exp) > at)) return null;
  return { userId, prepId };
}

/**
 * İşçiyi arka planda başlatır (öğrencinin çerezi taşınmaz; imzalı kısa ömürlü başlık). Yanıtı beklemez: istek
 * 8 sn sonra bırakılır, öteki fonksiyon işini bitirir (lesson-prefetch ile aynı yol).
 */
export async function requestPendingAdvance(input: {
  origin: string;
  userId: string;
  prepId: string;
  hop?: number;
  eager?: boolean;
}) {
  const hop = input.hop ?? 0;
  if (hop > MAX_CHAIN_HOPS) return;
  const token = windowChainToken(input.userId, input.prepId);
  if (!token) return;
  await fetch(`${input.origin}/api/learning/exam-prep/pending-materials/advance`, {
    method: "POST",
    headers: { "content-type": "application/json", [WINDOW_CHAIN_HEADER]: token },
    body: JSON.stringify({ prepId: input.prepId, hop, ...(input.eager ? { eager: true } : {}) }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}
