import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Lansman zırhı #2b (5 Kasım 2026): soğuk bellek. Sınavı 45+ gün önce geçmiş ve 30 gündür etkinlik kaydı olmayan
  hazırlıkların belgelerinin YALNIZ gömmeleri silinir; sayfa, parça ve dersler kalır; belge başka (aktif) hazırlıkta
  da duruyorsa dokunulmaz; hazırlık açılınca yeniden indekslenir. Yetim yüklemeler zaten günlük bakımda temizleniyor.
*/

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/feature-flags", () => ({ isFeatureEnabled: vi.fn(async () => true) }));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("saf kararlar", () => {
  it("eşikler: sınav 45 gün, hareketsizlik 30 gün", async () => {
    const { coldCutoffs, COLD_EXAM_DAYS, COLD_IDLE_DAYS, prepIsCold } = await import("@/lib/documents/vector-lifecycle");
    expect([COLD_EXAM_DAYS, COLD_IDLE_DAYS]).toEqual([45, 30]);
    const cutoffs = coldCutoffs(new Date("2026-11-05T10:00:00Z"));
    expect(cutoffs.examBeforeIso).toBe("2026-09-21");
    expect(cutoffs.idleAfterIso).toBe("2026-10-06T10:00:00.000Z");
    // Sınavı 60 gün önce, hiç kayıt yok → soğuk
    expect(prepIsCold({ examDate: "2026-09-01", lastActivityIso: null }, cutoffs)).toBe(true);
    // Sınavı geçmiş ama dün çalışılmış → sıcak
    expect(prepIsCold({ examDate: "2026-09-01", lastActivityIso: "2026-11-04T09:00:00Z" }, cutoffs)).toBe(false);
    // Sınavı 20 gün önce → henüz değil; tarihsiz hazırlık → asla
    expect(prepIsCold({ examDate: "2026-10-16", lastActivityIso: null }, cutoffs)).toBe(false);
    expect(prepIsCold({ examDate: null, lastActivityIso: null }, cutoffs)).toBe(false);
  });

  it("belge ancak ona gönderme yapan bütün hazırlıklar soğuksa tahliye edilir", async () => {
    const { documentEvictable, prepDocumentIds } = await import("@/lib/documents/vector-lifecycle");
    expect(documentEvictable([{ prepId: "a", cold: true }, { prepId: "b", cold: true }])).toBe(true);
    expect(documentEvictable([{ prepId: "a", cold: true }, { prepId: "b", cold: false }])).toBe(false);
    expect(documentEvictable([])).toBe(false);
    expect(prepDocumentIds({ document_id: "d1", source_document_ids: ["d1", "d2", 3, null] })).toEqual(["d1", "d2"]);
    expect(prepDocumentIds({ document_id: null, source_document_ids: null })).toEqual([]);
  });
});

/** Sorgu zincirini taklit eden sahte: her `.from()` sıradaki cevabı döndürür, çağrıları kaydeder. */
function fakeService(responses: { data?: unknown; error?: unknown; count?: number | null }[]) {
  const calls: { table: string; ops: string[] }[] = [];
  const service = {
    from(table: string) {
      const response = responses.shift() ?? { data: null, error: null };
      const call = { table, ops: [] as string[] };
      calls.push(call);
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (value: unknown) => void) => resolve({ data: response.data ?? null, error: response.error ?? null, count: response.count ?? null });
            }
            return (...args: unknown[]) => {
              call.ops.push(`${String(prop)}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")})`);
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { service: service as never, calls };
}

describe("tahliye ve yeniden indeksleme", () => {
  it("soğuk hazırlığın belgesi: gömmeler silinir, belge işaretlenir; aktif hazırlıkta da duran belge atlanır", async () => {
    const { evictColdEmbeddings } = await import("@/lib/documents/vector-lifecycle");
    const now = new Date("2026-11-05T10:00:00Z");
    const fake = fakeService([
      // soğuk aday hazırlıklar
      { data: [{ id: "p-cold", exam_date: "2026-08-01", document_id: "doc-1", source_document_ids: ["doc-2"] }] },
      // p-cold düğümleri → kayıt yok
      { data: [{ id: "n1" }] },
      { data: [] },
      // doc-1: belge satırı, gönderme yapanlar (yalnız p-cold) → tahliye
      { data: { id: "doc-1", status: "completed", part_of: null, deleted_at: null, embeddings_evicted_at: null } },
      { data: [{ id: "p-cold" }] },
      { data: [{ id: "c1" }, { id: "c2" }] },
      { count: 2 },
      { data: null },
      // doc-2: aktif başka hazırlık da gönderme yapıyor → atlanır
      { data: { id: "doc-2", status: "completed", part_of: null, deleted_at: null, embeddings_evicted_at: null } },
      { data: [{ id: "p-cold" }, { id: "p-active" }] },
    ]);
    const report = await evictColdEmbeddings(fake.service, { now, limit: 10 });
    expect(report).toEqual({ scannedPreps: 1, coldPreps: 1, evictedDocuments: 1, evictedRows: 2, skipped: null });
    const deleteCall = fake.calls.find((call) => call.table === "document_embeddings");
    expect(deleteCall?.ops[0]).toBe('delete({"count":"exact"})');
    expect(deleteCall?.ops[1]).toBe('in(chunk_id,["c1","c2"])');
    const mark = fake.calls.filter((call) => call.table === "documents").find((call) => call.ops.some((op) => op.startsWith("update(")));
    expect(mark?.ops[0]).toContain("embeddings_evicted_at");
    // Sayfa ve parça tablolarına silme gitmez.
    expect(fake.calls.some((call) => call.table === "document_pages")).toBe(false);
    expect(fake.calls.some((call) => call.table === "document_chunks" && call.ops.some((op) => op.startsWith("delete")))).toBe(false);
  });

  it("anahtar kapalıysa hiçbir şey yapılmaz; şema yoksa 'schema' diye atlanır", async () => {
    const flags = await import("@/lib/admin/feature-flags");
    const { evictColdEmbeddings } = await import("@/lib/documents/vector-lifecycle");
    (flags.isFeatureEnabled as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    expect((await evictColdEmbeddings(fakeService([]).service)).skipped).toBe("flag_off");
    const noColumn = fakeService([{ error: { code: "42703", message: "column exam_preps.source_document_ids does not exist" } }]);
    expect((await evictColdEmbeddings(noColumn.service)).skipped).toBe("schema");
  });

  it("yeniden indeksleme: eksik gömmeler yazılır, işaret kalkar; hazırlık açılışı tahliyeli belgeleri bulur", async () => {
    const { reindexDocumentEmbeddings, reindexEvictedForPrep } = await import("@/lib/documents/vector-lifecycle");
    const fake = fakeService([
      { data: [{ id: "c1", content: "Osmanlı kuruluş dönemi" }] },
      { data: [] },
      { data: null },
      { data: null },
    ]);
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1]));
    expect(await reindexDocumentEmbeddings(fake.service, "doc-1", embed)).toBe(1);
    expect(fake.calls.at(-1)?.ops[0]).toContain('"embeddings_evicted_at":null');

    const prep = fakeService([
      { data: { document_id: "doc-1", source_document_ids: [] } },
      { data: [{ id: "doc-1" }] },
      { data: [] },
      { data: null },
    ]);
    expect(await reindexEvictedForPrep(prep.service, "p1", embed)).toBe(0);
    expect(prep.calls[1]!.ops).toContain("not(embeddings_evicted_at,is,null)");
  });

  it("bağlantılar: günlük bakım adımı, hazırlık sayfası kancası, yetim yükleme temizliği", () => {
    const cron = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(cron).toContain("evictColdEmbeddings(service, { now, limit: 20, budgetMs: 60_000 })");
    expect(cron).toContain("vectorLifecycle,");
    expect(cron).toContain("cleanupExpiredUploads(service)");
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("after(() => reindexEvictedForPrep(service, prepId, embedTexts)");
    // Üçüncü cron yok (Hobby: en çok 2).
    const vercel = JSON.parse(read("vercel.json")) as { crons?: unknown[] };
    expect((vercel.crons ?? []).length).toBeLessThanOrEqual(2);
  });
});
