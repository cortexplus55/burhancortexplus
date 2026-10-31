import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void Promise.resolve().then(fn).catch(() => undefined) }));
vi.mock("@/lib/env", () => ({ env: { APP_SECRET: "pencere-sinama" } }));
vi.mock("@/lib/documents/pdf-ingestion", () => ({ PDF_STEP_DEADLINE_MS: 250_000, processPdfDocumentStep: vi.fn() }));
vi.mock("@/lib/documents/pdf-learning-v2", () => ({
  runCourseMapRound: vi.fn(),
  clearDocumentWaitMarkers: vi.fn(async () => undefined),
}));
vi.mock("@/lib/learning/prep-attach", () => ({ attachDocumentsToPrep: vi.fn() }));
vi.mock("@/lib/documents/document-credits", () => ({
  commitDocumentCredits: vi.fn(async () => undefined),
  settleDocumentHold: vi.fn(async () => true),
}));
vi.mock("@/lib/documents/clean-pages", () => ({ cleanWholeDocument: vi.fn(async () => ({ cleaned: 0, left: 0 })) }));
vi.mock("@/lib/learning/fast-access", () => ({ fastAllowedFor: vi.fn(async () => true) }));
vi.mock("@/lib/documents/free-pages", () => ({ freePagesRemaining: vi.fn(async () => null) }));
vi.mock("@/lib/credits/spendable-server", () => ({ spendableCredits: vi.fn(async () => 1_000_000) }));
vi.mock("@/lib/credits/service", () => ({ getActionCost: vi.fn(async () => 5) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitBackend: () => "memory", redisPipeline: vi.fn(async () => null) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFakeDb } from "./helpers/fake-supabase";
import { processPdfDocumentStep } from "@/lib/documents/pdf-ingestion";
import { runCourseMapRound } from "@/lib/documents/pdf-learning-v2";
import { attachDocumentsToPrep } from "@/lib/learning/prep-attach";
import { commitDocumentCredits, settleDocumentHold } from "@/lib/documents/document-credits";
import {
  HEAD_READ_AHEAD_PAGES,
  SCANNED_LESSONS_AHEAD,
  SINGLE_WINDOW_MAX_PAGES,
  WINDOW_PAGES,
  attachedThroughFrom,
  nextWindow,
  planWindows,
  shouldPauseReading,
  usesWindows,
} from "@/lib/documents/document-windows";
import {
  ADVANCE_BUDGET_MS,
  advancePendingMaterials,
  resetWindowLocksForTests,
  verifyWindowChainToken,
  windowChainToken,
} from "@/lib/learning/pending-windows";
import { documentReservationKey, parseDocumentReservationKey } from "@/lib/documents/document-reservation-key";

/*
  Pencereli işleme (31 Ekim 2026, ürün sahibi: "ister 5, ister 500, ister 1.000 sayfa; aynı kararlılık"). Büyük
  belge ilk 12 sayfanın baş kopyasıyla başlar; kalanı 40'ar sayfalık pencerelerle okunur, her pencerenin kopyası
  küçük bir haritayla yola eklenir. Hiçbir okuma adımı ya da harita çağrısı belgenin tamamını görmez; bir çağrı süresi
  dolunca iş kaldığı yerden sürer. Örnekler farklı derslerden.
*/

describe("pencere planı", () => {
  it("baş kopyasından sonra 40'ar sayfa; son kısa parça son pencereye katılır", () => {
    expect(nextWindow({ attachedThrough: 12, total: 320 })).toEqual({ from: 13, to: 52 });
    const windows = planWindows({ attachedThrough: 12, total: 320 });
    expect(windows[0]).toEqual({ from: 13, to: 52 });
    expect(windows.at(-1)).toEqual({ from: 293, to: 320 });
    // Kesintisiz, boşluksuz, sonuna kadar.
    windows.reduce((through, window) => {
      expect(window.from).toBe(through + 1);
      return window.to;
    }, 12);
    // 30 sayfalık son parça ayrı pencere; 8 sayfalık kuyruk öncekine katılır (48 sayfa).
    expect(planWindows({ attachedThrough: 12, total: 100 }).at(-1)).toEqual({ from: 53, to: 100 });
    expect(planWindows({ attachedThrough: 0, total: 1_000 }).every((window) => window.to - window.from + 1 <= WINDOW_PAGES + 10)).toBe(true);
  });

  it("kesintisiz eklenmiş son sayfa; araya boşluk düşerse sonrası sayılmaz", () => {
    expect(attachedThroughFrom([{ firstPage: 1, lastPage: 12 }, { firstPage: 13, lastPage: 52 }])).toBe(52);
    expect(attachedThroughFrom([{ firstPage: 1, lastPage: 12 }, { firstPage: 53, lastPage: 92 }])).toBe(12);
    expect(attachedThroughFrom([])).toBe(0);
  });

  it("küçük belge pencereye bölünmez; baş kopyalı belge her zaman bölünür", () => {
    expect(usesWindows({ total: SINGLE_WINDOW_MAX_PAGES, hasParts: false })).toBe(false);
    expect(usesWindows({ total: SINGLE_WINDOW_MAX_PAGES + 1, hasParts: false })).toBe(true);
    expect(usesWindows({ total: 30, hasParts: true })).toBe(true);
    expect(HEAD_READ_AHEAD_PAGES).toBe(12 + 2 * WINDOW_PAGES);
  });

  it("taranmış kitap öğrencinin önü doluyken duraklar; metinli belge ve 'hepsini oku' duraklamaz", () => {
    expect(shouldPauseReading({ scanned: true, lessonsAhead: SCANNED_LESSONS_AHEAD, eager: false })).toBe(true);
    expect(shouldPauseReading({ scanned: true, lessonsAhead: SCANNED_LESSONS_AHEAD - 1, eager: false })).toBe(false);
    expect(shouldPauseReading({ scanned: false, lessonsAhead: 99, eager: false })).toBe(false);
    expect(shouldPauseReading({ scanned: true, lessonsAhead: 99, eager: true })).toBe(false);
  });
});

describe("sayfa ücreti ayırmasının anahtarı", () => {
  const doc = "11111111-1111-4111-8111-111111111111";
  it("kaldığı yerden süren okuma kendi anahtarıyla; ayrıştırıcı belgeyi ve ilk sayfayı bulur", () => {
    expect(documentReservationKey(doc)).toBe(`document_process_${doc}`);
    expect(documentReservationKey(doc, 93)).toBe(`document_process_${doc}_p93`);
    expect(parseDocumentReservationKey(`document_process_${doc}`)).toEqual({ documentId: doc, firstPage: 1 });
    expect(parseDocumentReservationKey(`document_process_${doc}_p93`)).toEqual({ documentId: doc, firstPage: 93 });
    expect(parseDocumentReservationKey(`document_process_${doc}_x`)).toBeNull();
    expect(parseDocumentReservationKey("document_scan_x")).toBeNull();
  });
});

describe("kendini sürdüren zincirin imzası", () => {
  it("yalnız sunucu üretir; bozuk ya da süresi geçmiş imza reddedilir", () => {
    const token = windowChainToken("u1", "p1", 1_000)!;
    expect(verifyWindowChainToken(token, 2_000)).toEqual({ userId: "u1", prepId: "p1" });
    expect(verifyWindowChainToken(token, 1_000 + 3 * 60_000)).toBeNull();
    expect(verifyWindowChainToken(`${token.slice(0, -2)}00`, 2_000)).toBeNull();
    expect(verifyWindowChainToken("u1.p2.999999999999.abc", 2_000)).toBeNull();
  });
});

// ——— İşçi benzetimi: gerçek parça kopyası ve bekleyen listesi, sahte okuma/harita/ekleme ———

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PREP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HEAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
/** Okuma: 40 sayfa ~16 sn (metin + gömme). Harita: ~13 sn. Ekleme: ~2 sn. */
const READ_MS_PER_PAGE = 400;
const MAP_MS = 13_000;
const ATTACH_MS = 2_000;

type Row = Record<string, unknown>;

function seed(input: { total: number; readThrough: number; head: boolean; scanned?: boolean; lessons?: number }) {
  const pages: Row[] = [];
  const chunks: Row[] = [];
  const embeddings: Row[] = [];
  const addPage = (documentId: string, page: number) => {
    const id = `${documentId}-p${page}`;
    const extraction_method = input.scanned ? "ocr" : "text_layer";
    pages.push({ id, document_id: documentId, page_number: page, text_content: `Sayfa ${page}`, page_kind: "content", extraction_method });
    chunks.push({ id: `${id}-c`, document_id: documentId, page_id: id, chunk_index: page * 10, content: `Sayfa ${page}` });
    embeddings.push({ chunk_id: `${id}-c`, embedding: [page] });
  };
  for (let page = 1; page <= input.readThrough; page += 1) addPage(BOOK, page);
  if (input.head) for (let page = 1; page <= 12; page += 1) addPage(HEAD, page);
  const fake = makeFakeDb({
    documents: [
      { id: BOOK, user_id: USER, file_name: "Tarih Kitabı.pdf", mime_type: "application/pdf", status: "processing", page_count: input.total, storage_path: "u/b/kitap.pdf", size_bytes: 9, part_of: null, deleted_at: null, error_message: null },
      ...(input.head
        ? [{ id: HEAD, user_id: USER, file_name: "Tarih Kitabı.pdf", mime_type: "application/pdf", status: "completed", page_count: 12, storage_path: "u/b/kitap.pdf", size_bytes: 9, part_of: BOOK, deleted_at: null, created_at: "2026-10-31T10:00:00Z" }]
        : []),
    ],
    document_pages: pages,
    document_chunks: chunks,
    document_embeddings: embeddings,
    document_ingestion_state: [
      { document_id: BOOK, status: input.readThrough >= input.total ? "ready" : "extracting", next_page: input.readThrough + 1, total_pages: input.total, lease_until: null, reservation_id: "res-kitap" },
    ],
    exam_preps: [{ id: PREP, user_id: USER, document_id: input.head ? HEAD : null, source_document_ids: input.head ? [HEAD] : [] }],
    exam_prep_pending_materials: [{ prep_id: PREP, document_id: BOOK, user_id: USER, created_at: "2026-10-31T10:00:00Z" }],
    exam_prep_nodes: Array.from({ length: input.lessons ?? 0 }, (_, index) => ({ id: `n${index}`, exam_prep_id: PREP, kind: "lesson", status: "ready" })),
    exam_prep_topics: [],
  });
  return { db: fake.db, service: fake.client as SupabaseClient, addPage, pages };
}

function wire(world: ReturnType<typeof seed>, clock: { t: number }) {
  const reads: { from: number; to: number; until: number | null }[] = [];
  const maps: { documentIds: string[]; pages: number[] }[] = [];
  const state = () => (world.db.tables.document_ingestion_state as Row[]).find((row) => row.document_id === BOOK)!;
  vi.mocked(processPdfDocumentStep).mockImplementation(async (_service, documentId, _user, options) => {
    expect(documentId).toBe(BOOK);
    const row = state();
    const total = Number(row.total_pages);
    const first = Number(row.next_page);
    const until = options?.untilPage ?? null;
    if (until != null && first > until) return { status: "processing", pageCount: total, nextPage: first, pagesDone: first - 1 };
    const budget = Math.min(WINDOW_PAGES, total - first + 1, until != null ? until - first + 1 : WINDOW_PAGES);
    for (let page = first; page < first + budget; page += 1) world.addPage(BOOK, page);
    reads.push({ from: first, to: first + budget - 1, until });
    clock.t += budget * READ_MS_PER_PAGE;
    row.next_page = first + budget;
    if (Number(row.next_page) > total) {
      row.status = "ready";
      return { status: "ready", pageCount: total };
    }
    return { status: "processing", pageCount: total, nextPage: first + budget, pagesDone: first + budget - 1 };
  });
  vi.mocked(runCourseMapRound).mockImplementation(async (_service, input) => {
    const pages = (world.db.tables.document_pages as Row[])
      .filter((page) => input.documentIds.includes(String(page.document_id)))
      .map((page) => Number(page.page_number));
    maps.push({ documentIds: input.documentIds, pages });
    expect(input).toMatchObject({ prepId: PREP, fromCourse: true, urgent: true });
    clock.t += MAP_MS;
    return { ok: true, topics: 6 };
  });
  vi.mocked(attachDocumentsToPrep).mockImplementation(async (_service, input) => {
    const prep = (world.db.tables.exam_preps as Row[])[0]!;
    prep.source_document_ids = [...(prep.source_document_ids as string[]), ...input.documentIds];
    clock.t += ATTACH_MS;
    return { ok: true, addedDocuments: input.documentIds.length, addedTopics: 6, mergedTopics: 0, warnings: [] };
  });
  return { reads, maps };
}

async function runChain(world: ReturnType<typeof seed>, clock: { t: number }, options: { eager?: boolean } = {}) {
  const hops: { ms: number; state: string; windows: number }[] = [];
  for (let hop = 0; hop < 80; hop += 1) {
    const started = clock.t;
    const result = await advancePendingMaterials(world.service, { userId: USER, prepId: PREP, now: () => clock.t, eager: options.eager });
    hops.push({ ms: clock.t - started, state: result.state, windows: result.windowsAdded });
    if (result.state !== "deadline") break;
  }
  return hops;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWindowLocksForTests();
});

describe("pencere işçisi", () => {
  it("320 sayfalık kitap: her pencere ayrı okunur, ayrı haritalanır, sırayla yola eklenir; hiçbir çağrı süreyi aşmaz", async () => {
    // Kurulum: baş kopyası (1-12) hazırlıkta, arka plan okuması iki pencere kadar okumuş (92. sayfa).
    const world = seed({ total: 320, readThrough: HEAD_READ_AHEAD_PAGES, head: true });
    const clock = { t: 0 };
    const { reads, maps } = wire(world, clock);
    const hops = await runChain(world, clock);

    // Bütün pencereler, kesintisiz ve sırayla; her harita yalnız kendi penceresini görür (40-50 sayfa).
    const expected = planWindows({ attachedThrough: 12, total: 320 });
    expect(maps.map((map) => [Math.min(...map.pages), Math.max(...map.pages)])).toEqual(expected.map((w) => [w.from, w.to]));
    expect(maps.every((map) => map.pages.length <= SINGLE_WINDOW_MAX_PAGES && map.documentIds.length === 1)).toBe(true);
    expect(maps.some((map) => map.documentIds.includes(BOOK))).toBe(false);
    // Okuma adımları 40 sayfayı geçmez ve istenen pencerenin ötesine okumaz.
    expect(reads.every((read) => read.to - read.from + 1 <= WINDOW_PAGES && (read.until == null || read.to <= read.until))).toBe(true);
    expect(reads[0]!.from).toBe(93);

    // Ekleme sırası kitabın sırası; parçalar sayfa numaralarını korur.
    const prep = (world.db.tables.exam_preps as Row[])[0]!;
    const parts = (prep.source_document_ids as string[]).slice(1);
    expect(parts).toHaveLength(expected.length);
    const firstPages = parts.map((id) =>
      Math.min(...(world.db.tables.document_pages as Row[]).filter((page) => page.document_id === id).map((page) => Number(page.page_number))));
    expect(firstPages).toEqual(expected.map((w) => w.from));
    // Parçalar metni (sayfa, parça) kopyalar ama gömme kopyalamaz: arama ana belgenin gömmelerini parçanın
    // aralığında kullanır (göç 20261031160000). Gömme tablosu yalnız ana belgenin ve tohumdaki baş kopyasının.
    const partChunks = new Set((world.db.tables.document_chunks as Row[])
      .filter((chunk) => parts.includes(String(chunk.document_id)))
      .map((chunk) => String(chunk.id)));
    expect(partChunks.size).toBeGreaterThan(0);
    expect((world.db.tables.document_embeddings as Row[]).some((row) => partChunks.has(String(row.chunk_id)))).toBe(false);

    // Bir çağrı ~4 dk'yı geçmez (fonksiyon tavanı 300 sn).
    expect(hops.every((hop) => hop.ms < 300_000)).toBe(true);
    expect(hops.at(-1)!.state).toBe("done");
    // Bitince ana belge bekleyen listeden çıkar, ücreti kesinleşir.
    expect(world.db.tables.exam_prep_pending_materials).toHaveLength(0);
    expect(vi.mocked(commitDocumentCredits)).toHaveBeenCalledWith(expect.anything(), USER, BOOK);
  });

  it("1.000 sayfalık kitap da aynı: 25 pencere, en büyüğü 50 sayfa, her çağrı süre içinde", async () => {
    const world = seed({ total: 1_000, readThrough: HEAD_READ_AHEAD_PAGES, head: true });
    const clock = { t: 0 };
    const { maps } = wire(world, clock);
    const hops = await runChain(world, clock);
    expect(hops.at(-1)!.state).toBe("done");
    // İş tek çağrıya sığmaz: süre dolunca kaldığı yerden süren halkalar, her biri ~4 dk.
    expect(hops.length).toBeGreaterThan(1);
    expect(hops.slice(0, -1).every((hop) => hop.state === "deadline" && hop.ms <= ADVANCE_BUDGET_MS + 5_000)).toBe(true);
    expect(maps).toHaveLength(planWindows({ attachedThrough: 12, total: 1_000 }).length);
    expect(Math.max(...maps.map((map) => map.pages.length))).toBeLessThanOrEqual(SINGLE_WINDOW_MAX_PAGES);
    expect(hops.every((hop) => hop.ms < 300_000)).toBe(true);
    const covered = maps.flatMap((map) => map.pages).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: 1_000 - 12 }, (_, i) => i + 13));
  });

  it("okuma ile harita üst üste biner: bir pencere haritalanırken sonraki okunur", async () => {
    const world = seed({ total: 220, readThrough: 52, head: true });
    const clock = { t: 0 };
    const order: string[] = [];
    const { reads } = wire(world, clock);
    const step = vi.mocked(processPdfDocumentStep).getMockImplementation()!;
    vi.mocked(processPdfDocumentStep).mockImplementation(async (...args) => {
      order.push(`read:${args[3]?.untilPage}`);
      return step(...args);
    });
    const map = vi.mocked(runCourseMapRound).getMockImplementation()!;
    vi.mocked(runCourseMapRound).mockImplementation(async (...args) => {
      order.push("map");
      return map(...args);
    });
    await runChain(world, clock);
    // 13-52 okunmuş: haritası başlarken 53-92 okunmaya başlar (harita onu beklemez).
    expect(order.slice(0, 2)).toEqual(["read:92", "map"]);
    expect(reads.length).toBeGreaterThan(3);
  });

  it("aynı hazırlıkta aynı anda tek işçi", async () => {
    const world = seed({ total: 120, readThrough: 120, head: true });
    const clock = { t: 0 };
    wire(world, clock);
    const [first, second] = await Promise.all([
      advancePendingMaterials(world.service, { userId: USER, prepId: PREP, now: () => clock.t }),
      advancePendingMaterials(world.service, { userId: USER, prepId: PREP, now: () => clock.t }),
    ]);
    expect([first.state, second.state].sort()).toEqual(["busy", "done"]);
  });

  it("küçük belge kopyalanmadan kendisiyle haritalanıp eklenir", async () => {
    const world = seed({ total: 30, readThrough: 30, head: false });
    const clock = { t: 0 };
    const { maps } = wire(world, clock);
    const hops = await runChain(world, clock);
    expect(hops.at(-1)!.state).toBe("done");
    expect(maps).toEqual([{ documentIds: [BOOK], pages: Array.from({ length: 30 }, (_, i) => i + 1) }]);
    expect(vi.mocked(attachDocumentsToPrep)).toHaveBeenCalledWith(expect.anything(), { userId: USER, prepId: PREP, documentIds: [BOOK] });
  });

  it("taranmış kitap: okunmuş pencereler eklenir, öğrencinin önü doluyken sonraki pencere okunmaz ve ücret ayırması bırakılır", async () => {
    const world = seed({ total: 400, readThrough: HEAD_READ_AHEAD_PAGES, head: true, scanned: true, lessons: SCANNED_LESSONS_AHEAD });
    const clock = { t: 0 };
    const { reads, maps } = wire(world, clock);
    const hops = await runChain(world, clock);
    expect(hops.at(-1)!.state).toBe("paused");
    // Arka planda okunmuş iki pencere (13-52, 53-92) yolda; ötesi okunmadı.
    expect(maps).toHaveLength(2);
    expect(reads).toHaveLength(0);
    expect(vi.mocked(settleDocumentHold)).toHaveBeenCalledWith(expect.anything(), { userId: USER, documentId: BOOK, readThrough: 92 });
    expect(world.db.tables.exam_prep_pending_materials).toHaveLength(1);

    // "Hepsini şimdi oku": duraklamadan sonuna kadar.
    const eager = await runChain(world, clock, { eager: true });
    expect(eager.at(-1)!.state).toBe("done");
    expect(Math.max(...reads.map((read) => read.to))).toBe(400);
  });
});
