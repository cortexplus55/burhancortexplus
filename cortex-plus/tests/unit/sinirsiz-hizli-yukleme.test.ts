import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Sınırsız ve hızlı yükleme (31 Ekim 2026). Ürün sahibi telefondan 100 fotoğraf seçti: 8'i alındı, 8'i sırayla ~4 dk
  sürdü ("kullanıcı bir derse kaç tane döküman yüklemek isterse yükleyebilir, limitimizi kullanana kadar; sonradan da
  ekleyebilir"). Kök nedenler, hepsi ayrı ayrı:
  - hazırlık başına 8 belge (sihirbaz, sonradan ekle, kurulum, giriş, kurs haritası, malzeme denetimi uçları),
    öğretmen analizi yalnız ilk 6 belgeye;
  - yükleme hazırlığı dakikada 6, günde 40, aynı anda en çok 3 bekleyen yükleme;
  - kurucu hesabı paralel yüklemeye dahil değildi (tek şerit); paralel ücretlide 3 şeritti;
  - bir dosya düşünce toplu yüklemenin geri kalanı duruyordu;
  - fotoğraf 3,5 MB tam boy gidiyor, okuması normal işlemde 18-20 sn;
  - sonradan ekleme tek dosya seçtiriyor, her dosya ayrı konu haritası ve ayrı istek;
  - telefon QR kodu tek dosyadan sonra "kullanıldı" oluyordu.
*/

process.env.OPENAI_API_KEY = "test-key";

const mocks = vi.hoisted(() => ({ create: vi.fn(), moderate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
  },
}));
vi.mock("@/lib/ai/moderation", () => ({ moderate: mocks.moderate }));

const { extractImageText } = await import("@/lib/documents/extract-image-text");
const { PARALLEL_UPLOADS, createLimiter } = await import("@/lib/documents/upload-batch");
const { UPLOAD_PENDING_MAX, UPLOAD_PREPARE_PER_DAY, UPLOAD_PREPARE_PER_MINUTE } = await import("@/lib/documents/upload-limits");
const { compressedName, scaledSize } = await import("@/lib/documents/image-compress");
const { appendPhoneUpload, phoneSessionDocuments, phoneSessionOpen } = await import("@/lib/documents/phone-session");
const { planAddedMaterial } = await import("@/lib/learning/prep-add-material");
const { PREP_DOCUMENT_REQUEST_MAX } = await import("@/lib/learning/prep-topic-list");
const { batchUploadFailedLine, phoneReceivedLine, readingNow } = await import("@/lib/learning/exam-wizard-copy");

const read = (path: string) => readFileSync(path, "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.moderate.mockResolvedValue({ action: "allow", categories: [] });
});

describe("hazırlık başına belge sınırı yok", () => {
  it("8 belge sınırı kodun hiçbir yerinde kalmadı; uçlar yalnız teknik tavanı (1000) kullanır", () => {
    const all = sourceFiles("src");
    const offenders = all.filter((path) => /PREP_SOURCE_DOCUMENT_CAP|en fazla 8 dosya|fileCap|filesAcceptedFromSelection/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(PREP_DOCUMENT_REQUEST_MAX).toBeGreaterThanOrEqual(1000);
    for (const route of [
      "src/app/api/learning/exam-prep/create/route.ts",
      "src/app/api/learning/exam-prep/intake/route.ts",
      "src/app/api/documents/process/route.ts",
      "src/app/api/learning/exam-prep/material-check/route.ts",
      "src/app/api/learning/exam-prep/ground-topic/route.ts",
      "src/app/api/learning/exam-prep/add-source/route.ts",
    ]) {
      const text = read(route);
      expect(text, route).toContain("PREP_DOCUMENT_REQUEST_MAX");
      expect(text, route).not.toMatch(/uuid\(\)\)(?:\.min\(\d\))?\.max\(8\)/);
    }
  });

  it("öğretmen analizi bütün belgelere, en çok dördü aynı anda (ilk 6 sınırı yok)", () => {
    const text = read("src/lib/documents/teacher-analysis-run.ts");
    expect(text).not.toContain(".slice(0, 6)");
    expect(text).toContain("TEACHER_ANALYSIS_LANES = 4");
  });

  it("sonradan ekleme: çoklu seçim, bütün yeni dosyalar tek planda (seçim sırasıyla), tek istek", () => {
    const adder = read("src/components/parity/prep-add-material.tsx");
    expect(adder).toMatch(/type="file"\s+multiple/);
    // Harita + ekleme ortak yardımcıda (31 Ekim 2026): hızlı başlatmanın hazırlık şeridi de aynı yoldan geçer.
    expect(adder).toContain("mapAndAttach({ prepId, documentIds, onProgress: setProcessDetail })");
    expect(adder).toContain("deferMap: true");
    const attach = read("src/lib/documents/prep-attach-client.ts");
    expect(attach).toContain("JSON.stringify({ prepId, documentIds })");
    expect(attach).toContain("courseDocumentIds: documentIds, prepId, retryMap: true");
    const plan = planAddedMaterial({
      existingTopics: [],
      existingNodes: [],
      incoming: [],
      existingDocumentIds: ["a"],
      newDocumentIds: ["b", "c", "a", "d"],
      contradictionsByTitle: new Map(),
      readinessScore: 40,
    });
    expect(plan.sourceDocumentIds).toEqual(["a", "b", "c", "d"]);
    const route = read("src/app/api/learning/exam-prep/add-source/route.ts");
    expect(route).toContain("documentIds: z.array(z.string().uuid()).min(1).max(PREP_DOCUMENT_REQUEST_MAX).optional()");
    expect(route).toContain("documentId: z.string().uuid().optional()");
  });
});

describe("hız: şerit, istek sınırları, küçültme, hızlı işlem", () => {
  it("altı şerit; kurucu da paralel; yükleme uçları toplu yüklemeyi kaldırır", () => {
    expect(PARALLEL_UPLOADS).toBe(6);
    expect(UPLOAD_PENDING_MAX).toBeGreaterThanOrEqual(PARALLEL_UPLOADS);
    // Altı şeritle ~10 sn'lik fotoğraf → dakikada ~36 hazırlık.
    expect(UPLOAD_PREPARE_PER_MINUTE).toBeGreaterThanOrEqual(36);
    expect(UPLOAD_PREPARE_PER_DAY).toBeGreaterThanOrEqual(1000);
    const prepare = read("src/app/api/documents/upload/prepare/route.ts");
    expect(prepare).not.toContain("limit: 6, dailyLimit: 40");
    expect(prepare).not.toContain(">= 3)");
    expect(read("src/components/parity/exam-create-wizard.tsx")).toContain(
      'const paidUploads = account?.audience === "plus" || account?.audience === "sigma" || isAdmin;',
    );
    expect(read("src/lib/documents/upload-client.ts")).toContain("compressImageForUpload(original)");
  });

  it("küçültme: uzun kenar 2048, oran korunur; küçük görüntüye dokunulmaz; ad .jpg", () => {
    expect(scaledSize(4080, 3060)).toEqual({ width: 2048, height: 1536 });
    expect(scaledSize(3060, 4080)).toEqual({ width: 1536, height: 2048 });
    expect(scaledSize(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(compressedName("20261030_211533.jpg")).toBe("20261030_211533.jpg");
    expect(compressedName("Ekran görüntüsü.PNG")).toBe("Ekran görüntüsü.jpg");
    expect(compressedName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
  });

  it("hızlı işlem: istek service_tier fast taşır, kullanım <model>-fast adıyla; istenmezse normal", async () => {
    const reply = {
      choices: [{ message: { content: "Bir üçgenin iç açıları toplamı 180 derecedir. Kanıtı şöyledir: paralel çiz." } }],
      usage: { prompt_tokens: 3353, completion_tokens: 1400 },
      service_tier: "fast",
    };
    mocks.create.mockResolvedValueOnce(reply);
    const fast = await extractImageText(Buffer.from("jpeg"), "image/jpeg", { fast: true });
    expect(mocks.create.mock.calls[0]![0].service_tier).toBe("fast");
    expect(fast.ok).toBe(true);
    expect(fast.usage[0]!.model).toMatch(/-fast$/);

    mocks.create.mockResolvedValueOnce({ ...reply, service_tier: "default" });
    const normal = await extractImageText(Buffer.from("jpeg"), "image/jpeg");
    expect(mocks.create.mock.calls[1]![0].service_tier).toBeUndefined();
    expect(normal.usage[0]!.model).not.toMatch(/-fast$/);
  });

  it("denetim okumadan önce biter: reddedilen görsel modele gitmez (paralel çalıştırılmadı)", async () => {
    mocks.moderate.mockResolvedValueOnce({ action: "block", categories: ["x"] });
    const blocked = await extractImageText(Buffer.from("jpeg"), "image/jpeg", { fast: true });
    expect(blocked.reason).toBe("blocked");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("fotoğraf ve taranmış sayfa okuması hızlı işlem kararını fastAllowedFor'dan alır", () => {
    expect(read("src/lib/rag/pipeline.ts")).toContain("{ fast: await fastAllowedFor(service, userId) }");
    expect(read("src/lib/rag/pipeline.ts")).toContain("fast: await fastAllowedFor(service, userId) });");
    expect(read("src/lib/documents/pdf-ingestion.ts")).toContain("const fast = await fastAllowedFor(service, userId);");
  });

  it("art arda gelen işler en çok N aynı anda; hepsi biter", async () => {
    const run = createLimiter(2);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running -= 1;
          return n * 2;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("öğrenciye giden satırlar: aynı anda okunanlar sayılır, düşenler tek bildirimde", () => {
    expect(readingNow([])).toBeNull();
    expect(readingNow(["a.jpg", "b.jpg"])).toBe("a.jpg, b.jpg");
    expect(readingNow(["a", "b", "c", "d", "e", "f"])).toBe("6 dosya");
    expect(batchUploadFailedLine(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"])).toBe(
      "5 dosya yüklenemedi: a.jpg, b.jpg, c.jpg ve 2 dosya daha. Bu dosyaları yeniden seçebilirsin; öbürleri eklendi.",
    );
    expect(phoneReceivedLine(12)).toContain("12 dosya geldi");
  });
});

describe("telefon QR: tek koddan çok dosya", () => {
  const future = new Date(Date.now() + 600_000).toISOString();
  const past = new Date(Date.now() - 1_000).toISOString();

  it("göçlü oturum süre dolana kadar açık; eski oturum ilk dosyadan sonra kapanır", () => {
    expect(phoneSessionOpen({ expires_at: future, document_ids: ["a", "b"], document_id: "a" })).toEqual({ open: true });
    expect(phoneSessionOpen({ expires_at: past, document_ids: [] })).toEqual({ open: false, reason: "expired" });
    expect(phoneSessionOpen({ expires_at: future, document_id: "a" })).toEqual({ open: false, reason: "used" });
    expect(phoneSessionOpen({ expires_at: future, document_id: null })).toEqual({ open: true });
  });

  it("gelen dosyalar geliş sırasıyla; eski satırda yalnız ilk dosya", () => {
    expect(
      phoneSessionDocuments({ expires_at: future, document_ids: ["a", "b"], file_names: ["1.jpg", "2.jpg"] }),
    ).toEqual([
      { documentId: "a", fileName: "1.jpg" },
      { documentId: "b", fileName: "2.jpg" },
    ]);
    expect(phoneSessionDocuments({ expires_at: future, document_id: "a", file_name: "1.jpg" })).toEqual([
      { documentId: "a", fileName: "1.jpg" },
    ]);
  });

  it("ekleme tek adımlı SQL ile; göç yoksa ilk dosya eski alana yazılır", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const ok = await appendPhoneUpload({ rpc } as never, { id: "s", expires_at: future, document_ids: ["a", "b"] }, "c", "3.jpg");
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("append_phone_upload", expect.objectContaining({ p_session_id: "s", p_document_id: "c" }));

    const select = vi.fn().mockResolvedValue({ data: [{ id: "s" }], error: null });
    const is = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ is }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const legacy = await appendPhoneUpload({ from } as never, { id: "s", expires_at: future, document_id: null }, "a", "1.jpg");
    expect(legacy).toBe(true);
    expect(update).toHaveBeenCalledWith({ document_id: "a", file_name: "1.jpg" });
  });

  it("göç yalnız ekler; fonksiyon yalnız sunucu rolüne açık", () => {
    const sql = read("supabase/migrations/20261031120000_phone_upload_many.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS document_ids uuid[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain("array_append(document_ids, p_document_id)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.append_phone_upload(uuid, uuid, text, integer) TO service_role;");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("telefon sayfası çoklu seçer ve göndermeden küçültür; masaüstü paneli her yeni dosyayı bildirir", async () => {
    const phone = read("src/components/parity/phone-upload-client.tsx");
    expect(phone).toContain("multiple={many}");
    expect(phone).toContain("compressImageForUpload(original)");
    const { newPhoneDocuments } = await import("@/components/parity/phone-upload-panel");
    const seen = new Set(["a"]);
    expect(
      newPhoneDocuments({ documents: [{ documentId: "a", fileName: "1" }, { documentId: "b", fileName: "2" }] }, seen),
    ).toEqual([{ documentId: "b", fileName: "2" }]);
    expect(newPhoneDocuments({ ready: true, documentId: "c", fileName: "3" }, new Set())).toEqual([
      { documentId: "c", fileName: "3" },
    ]);
  });
});
