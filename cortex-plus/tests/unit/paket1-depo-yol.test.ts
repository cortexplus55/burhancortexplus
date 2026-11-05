import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecordingDb } from "./helpers/recording-db";
import { isOwnedDocumentPath, isOwnedDocumentStoragePath } from "@/lib/documents/storage-path";

/*
  Güvenlik paketi 1 (6 Kasım 2026): veritabanındaki `documents.storage_path` yetkili (service_role) depo çağrısına
  denetlenmeden gitmez. Yol belgenin sahibinin ve kimliğinin klasöründe olmalı; parça kopyası (`part_of`,
  document-head.ts) ana belgenin dosyasını paylaştığı için okumada ana belgenin klasörü de kabul edilir, silmede
  edilmez. Uyuşmazlıkta `storage_path_mismatch` günlüğü ve depoya hiç gidilmez.
*/

const USER = "00000000-0000-4000-8000-00000000aaaa";
const OTHER = "00000000-0000-4000-8000-00000000bbbb";
const DOC = "00000000-0000-4000-8000-0000000000d1";
const PARENT = "00000000-0000-4000-8000-0000000000d0";

const h = vi.hoisted(() => ({ service: null as unknown, userId: "" }));

vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: async () => ({ ok: true, ctx: { userId: h.userId, service: h.service } }),
}));

function storageSpy() {
  const calls: string[] = [];
  const bucket = {
    createSignedUrl: vi.fn(async (p: string) => (calls.push(`sign ${p}`), { data: { signedUrl: `https://signed/${p}` }, error: null })),
    remove: vi.fn(async (paths: string[]) => (calls.push(`remove ${paths.join(",")}`), { data: [], error: null })),
    info: vi.fn(async (p: string) => (calls.push(`info ${p}`), { data: { size: 9, contentType: "application/pdf" }, error: null })),
    download: vi.fn(async (p: string) => (calls.push(`download ${p}`), { data: null, error: { message: "x" } })),
  };
  return { calls, storage: { from: (name: string) => (calls.push(`bucket ${name}`), bucket) } };
}

function makeService(documents: Record<string, unknown>[]) {
  const timeline: string[] = [];
  const { client, tables } = makeRecordingDb({ documents, document_pages: [] }, { timeline });
  const spy = storageSpy();
  client.storage = spy.storage;
  return { client, tables, calls: spy.calls };
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.userId = USER;
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => errors.mockRestore());

const mismatchLogged = () => errors.mock.calls.some((c: unknown[]) => c[0] === "storage_path_mismatch");

describe("yol denetimi", () => {
  it("belgenin kendi klasörü kabul, başka kullanıcı ya da başka belge reddedilir", () => {
    expect(isOwnedDocumentPath(`${USER}/${DOC}/a.pdf`, USER, DOC)).toBe(true);
    expect(isOwnedDocumentPath(`${OTHER}/${DOC}/a.pdf`, USER, DOC)).toBe(false);
    expect(isOwnedDocumentPath(`${USER}/${PARENT}/a.pdf`, USER, DOC)).toBe(false);
    expect(isOwnedDocumentPath(`${USER}/${DOC}/../x/a.pdf`, USER, DOC)).toBe(false);
  });

  it("parça kopyası ana belgenin klasörünü okuyabilir; başka kullanıcının ana belgesi olmaz", () => {
    expect(isOwnedDocumentStoragePath(`${USER}/${PARENT}/a.pdf`, USER, { id: DOC, part_of: PARENT })).toBe(true);
    expect(isOwnedDocumentStoragePath(`${USER}/${DOC}/a.pdf`, USER, { id: DOC, part_of: null })).toBe(true);
    expect(isOwnedDocumentStoragePath(`${OTHER}/${PARENT}/a.pdf`, USER, { id: DOC, part_of: PARENT })).toBe(false);
    expect(isOwnedDocumentStoragePath(`${USER}/${PARENT}/a.pdf`, USER, { id: DOC, part_of: null })).toBe(false);
    expect(isOwnedDocumentStoragePath(`${USER}/${PARENT}/a.pdf`, USER, { id: DOC, part_of: "" })).toBe(false);
  });
});

describe("kaynak sayfa önizlemesi", () => {
  const call = async () => {
    const { GET } = await import("@/app/api/documents/[documentId]/page-preview/route");
    return GET(new Request(`https://x/api/documents/${DOC}/page-preview?page=1`), { params: Promise.resolve({ documentId: DOC }) });
  };
  const doc = (storage_path: string, part_of: string | null = null) => ({
    id: DOC, user_id: USER, file_name: "a.pdf", mime_type: "application/pdf", storage_path, status: "completed", deleted_at: null, part_of,
  });

  it("uyuşmayan yol imzalanmaz: 404 ve günlük", async () => {
    const s = makeService([doc(`${OTHER}/${DOC}/a.pdf`)]);
    h.service = s.client;
    const res = await call();
    expect(res.status).toBe(404);
    expect(s.calls.filter((c) => c.startsWith("sign"))).toEqual([]);
    expect(mismatchLogged()).toBe(true);
  });

  it("parça kopyası ana belgenin dosyasıyla açılır", async () => {
    const s = makeService([doc(`${USER}/${PARENT}/a.pdf`, PARENT)]);
    h.service = s.client;
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).signedUrl).toBe(`https://signed/${USER}/${PARENT}/a.pdf`);
  });
});

describe("yarım yüklemenin iptali", () => {
  it("uyuşmayan yol silinmez (parça izni silmede yok)", async () => {
    const s = makeService([
      { id: DOC, user_id: USER, status: "pending", deleted_at: null, storage_path: `${USER}/${PARENT}/a.pdf`, part_of: PARENT },
    ]);
    h.service = s.client;
    const { POST } = await import("@/app/api/documents/upload/abort/route");
    const res = await POST(new Request("https://x/api/documents/upload/abort", { method: "POST", body: JSON.stringify({ documentId: DOC }) }));
    expect(res.status).toBe(404);
    expect(s.calls.filter((c) => c.startsWith("remove"))).toEqual([]);
    expect(mismatchLogged()).toBe(true);
  });

  it("kendi yolu silinir", async () => {
    const s = makeService([{ id: DOC, user_id: USER, status: "pending", deleted_at: null, storage_path: `${USER}/${DOC}/a.pdf` }]);
    h.service = s.client;
    const { POST } = await import("@/app/api/documents/upload/abort/route");
    const res = await POST(new Request("https://x/api/documents/upload/abort", { method: "POST", body: JSON.stringify({ documentId: DOC }) }));
    expect(res.status).toBe(200);
    expect(s.calls).toContain(`remove ${USER}/${DOC}/a.pdf`);
  });
});

describe("imzalı yüklemenin son adımı", () => {
  it("uyuşmayan yolda depoya sorulmaz", async () => {
    const s = makeService([
      { id: DOC, user_id: USER, status: "pending", deleted_at: null, storage_path: `${OTHER}/${DOC}/a.pdf`, mime_type: "application/pdf", size_bytes: 9, file_name: "a.pdf" },
    ]);
    const { completeDocumentUpload } = await import("@/lib/documents/complete-upload");
    const result = await completeDocumentUpload(s.client, USER, DOC);
    expect(result).toEqual({ ok: false, status: 404, error: "not_found" });
    expect(s.calls.filter((c) => c.startsWith("info"))).toEqual([]);
    expect(mismatchLogged()).toBe(true);
  });

  it("kendi yolunda boy doğrulanır ve belge işlenmeye geçer", async () => {
    const s = makeService([
      { id: DOC, user_id: USER, status: "pending", deleted_at: null, storage_path: `${USER}/${DOC}/a.pdf`, mime_type: "application/pdf", size_bytes: 9, file_name: "a.pdf" },
    ]);
    const { completeDocumentUpload } = await import("@/lib/documents/complete-upload");
    const result = await completeDocumentUpload(s.client, USER, DOC);
    expect(result).toMatchObject({ ok: true, status: "processing" });
    expect(s.calls).toContain(`info ${USER}/${DOC}/a.pdf`);
  });
});

describe("süresi dolan yüklemelerin temizliği", () => {
  it("uyuşmayan yol atlanır, kendi yolu silinir", async () => {
    const old = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const bad = "00000000-0000-4000-8000-0000000000e1";
    const s = makeService([
      { id: bad, user_id: USER, status: "pending", created_at: old, storage_path: `${OTHER}/${bad}/x.pdf` },
      { id: DOC, user_id: USER, status: "pending", created_at: old, storage_path: `${USER}/${DOC}/a.pdf` },
    ]);
    const { cleanupExpiredUploads } = await import("@/lib/documents/upload-cleanup");
    const removed = await cleanupExpiredUploads(s.client);
    expect(removed).toBe(1);
    expect(s.calls.filter((c) => c.startsWith("remove"))).toEqual([`remove ${USER}/${DOC}/a.pdf`]);
    expect(s.tables.documents.map((d) => d.id)).toEqual([bad]);
    expect(mismatchLogged()).toBe(true);
  });
});

describe("öbür depo çağrıları da denetimden geçer", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, "../../", file), "utf8");
  it.each([
    ["src/lib/documents/pdf-ingestion.ts", "isOwnedDocumentStoragePath(doc.storage_path, userId", ".download(doc.storage_path)"],
    ["src/lib/rag/pipeline.ts", "isOwnedDocumentStoragePath(doc.storage_path, String(doc.user_id)", ".download(doc.storage_path)"],
    ["src/app/api/documents/preflight/route.ts", "isOwnedDocumentStoragePath(doc.storage_path, userId, doc)", ".download(doc.storage_path)"],
    ["src/app/dokumanlar/[documentId]/page.tsx", "isOwnedDocumentStoragePath(doc.storage_path, user.id, doc)", ".createSignedUrl(doc.storage_path"],
    ["src/lib/privacy/account-deletion.ts", "isOwnedDocumentStoragePath(d.storage_path, userId, d)", '.storage.from("documents").remove(paths)'],
  ])("%s", (file, guard, storageCall) => {
    const source = read(file);
    expect(source).toContain(guard);
    expect(source).toContain(storageCall);
    // Denetim depo çağrısından önce gelir.
    expect(source.indexOf(guard)).toBeLessThan(source.indexOf(storageCall));
  });

  it("hesap silme parça kopyasının (ana belgenin) dosyasını ayrıca silmez", () => {
    expect(read("src/lib/privacy/account-deletion.ts")).toContain("docs.filter((d) => !d.part_of)");
  });
});
