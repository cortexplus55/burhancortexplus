/**
 * Faz 13 PR-3 (PROMPT-V2 §4): belge haritası. Modelsiz: bölümler ve sayfa aralıkları, ağırlık (toplam 100), notun
 * kuralları (SOURCE_NUMBER_PRIORITY), formüller, uzlaşımlar, çıkmış soru sayısı. Bir kez hesaplanır, kayda yazılır
 * (göç uygulanınca); sütun yokken bellekte. Sohbet turu hesap beklemez. Örnekler fizik ve tarih.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildDocumentMap, heaviestSection, readDocumentMap, DOCUMENT_MAP_VERSION } from "@/lib/documents/document-map";
import { clearDocumentMapMemory, ensureDocumentMap, knownDocumentMap } from "@/lib/documents/document-map-load";
import { buildDossier } from "@/lib/teacher/dossier";

const read = (path: string) => readFileSync(path, "utf8");
const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";

const PHYSICS = [
  { pageNumber: 1, text: "FİZİK DERS NOTU\n\n1. Kinematik\nKonum, yer değiştirme ve hız tanımları. Hız, birim zamandaki yer değiştirmedir. Bu bölümde yukarı yön pozitif kabul edilir." },
  { pageNumber: 2, text: "2. Dinamik\nNewton'un ikinci yasası: F = m · a. Bu notta yer çekimi ivmesi g = 10 m/s² alınız. Sürtünme kuvveti hareketin tersine etki eder." },
  { pageNumber: 3, text: "Dinamik örnekleri: eğik düzlemde kuvvet bileşenleri, ip gerilmesi, makaralı sistemler ve sürtünmeli yüzeyde hareket ayrıntılı çözülür. Her örnekte serbest cisim diyagramı çizilir ve kuvvetler eksenlere ayrılır." },
  { pageNumber: 4, text: "4. Momentum\nMomentum kütle ile hızın çarpımıdır. p = m · v. Çarpışmalarda toplam momentum korunur ve bu bölümde sık sorulur." },
  // Çıkmış sorular kendi sayfasında. Aynı sayfada bölüm başlığı + numaralı sorular: soru-sayfasinda-bolum-basligi.test.ts.
  { pageNumber: 5, text: "1. Kütlesi 2 kg olan cisme 10 N kuvvet uygulanıyor. İvmesi kaçtır?\nA) 1 B) 2 C) 5 D) 10 E) 20\n2. 3 kg kütleli cisim 4 m/s hızla gidiyor. Momentumu kaçtır?\nA) 3 B) 4 C) 7 D) 12 E) 16" },
];

describe("harita kurucusu (saf, modelsiz)", () => {
  it("bölümler belgenin sırasıyla, sayfa aralıklı, ağırlık toplamı 100; notun kuralı ve uzlaşımı birebir", () => {
    const map = buildDocumentMap(PHYSICS, new Date("2026-11-15T00:00:00Z"));
    expect(map.version).toBe(DOCUMENT_MAP_VERSION);
    expect(map.pageCount).toBe(5);
    expect(map.sections.map((section) => [section.title, section.from, section.to])).toEqual([
      ["Kinematik", 1, 1],
      ["Dinamik", 2, 3],
      ["Momentum", 4, 5],
    ]);
    expect(map.sections.reduce((sum, section) => sum + section.weight, 0)).toBe(100);
    expect(map.sections.every((section) => section.weight >= 0)).toBe(true);
    expect(map.rules.some((rule) => rule.includes("g = 10 m/s² alınız"))).toBe(true);
    expect(map.conventions).toEqual(["Bu bölümde yukarı yön pozitif kabul edilir."]);
    expect(map.pastQuestionCount).toBe(2);
    expect(map.sections.find((section) => section.title === "Momentum")!.pastQuestions).toBe(2);
    // Çıkmış soruların hepsi Momentum sayfalarında: ağırlık oraya kayar.
    expect(heaviestSection(map)!.title).toBe("Momentum");
  });

  it("başlıksız belge tek bölüm; kural yoksa liste boş (uydurma yok)", () => {
    const map = buildDocumentMap([
      { pageNumber: 1, text: "Tanzimat Fermanı 1839'da okundu. Can, mal ve namus güvencesi getirdi." },
      { pageNumber: 2, text: "Islahat Fermanı 1856'da ilan edildi; gayrimüslimlere yeni haklar tanıdı." },
    ]);
    expect(map.sections).toEqual([{ title: "Belgenin tamamı", from: 1, to: 2, weight: 100, pastQuestions: 0 }]);
    expect(map.rules).toEqual([]);
    expect(map.conventions).toEqual([]);
  });

  it("kayıttaki harita sürümle okunur; bozuk ya da eski sürüm yeniden hesaplanır", () => {
    const map = buildDocumentMap(PHYSICS);
    expect(readDocumentMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
    expect(readDocumentMap({ ...map, version: 0 })).toBeNull();
    expect(readDocumentMap("x")).toBeNull();
  });
});

function fakeService(options: { stored?: unknown; columnMissing?: boolean; owner?: boolean; pages?: unknown[] }) {
  const calls: { table: string; ops: string[] }[] = [];
  const updates: unknown[] = [];
  return {
    calls,
    updates,
    from(table: string) {
      const entry = { table, ops: [] as string[] };
      calls.push(entry);
      let mode: "select" | "update" = "select";
      let selected = "";
      const builder: Record<string, unknown> = {};
      for (const op of ["eq", "is", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          entry.ops.push(`${op}:${JSON.stringify(args[0])}`);
          return builder;
        };
      }
      builder.select = (columns: string) => {
        selected = columns;
        entry.ops.push(`select:${columns}`);
        return builder;
      };
      builder.update = (value: unknown) => {
        mode = "update";
        updates.push(value);
        entry.ops.push("update");
        return builder;
      };
      const result = () => {
        if (mode === "update") return { error: options.columnMissing ? { code: "PGRST204" } : null };
        if (table === "documents" && selected === "study_map") {
          return options.columnMissing ? { data: null, error: { code: "42703" } } : { data: { study_map: options.stored ?? null }, error: null };
        }
        if (table === "documents") return { data: options.owner === false ? null : { id: DOC }, error: null };
        if (table === "document_pages") return { data: options.pages ?? [], error: null };
        return { data: null, error: null };
      };
      builder.maybeSingle = () => Promise.resolve(result());
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return builder;
    },
  };
}

const PAGE_ROWS = PHYSICS.map((page) => ({ page_number: page.pageNumber, text_content: page.text, clean_text: null }));

describe("harita yükleyicisi", () => {
  afterEach(() => clearDocumentMapMemory());

  it("kayıttaki harita varsa sayfa okunmaz", async () => {
    const stored = buildDocumentMap(PHYSICS);
    const service = fakeService({ stored });
    expect(await ensureDocumentMap(service as never, USER, DOC)).toEqual(stored);
    expect(service.calls.some((call) => call.table === "document_pages")).toBe(false);
  });

  it("göç uygulanmadıysa (sütun yok) hesaplar, yazma hatasını yutar, bellekte tutar; ikinci okuma bellekten", async () => {
    const service = fakeService({ columnMissing: true, pages: PAGE_ROWS });
    const map = await ensureDocumentMap(service as never, USER, DOC);
    expect(map?.sections.length).toBe(3);
    expect(service.updates).toHaveLength(1);
    const pageCall = service.calls.find((call) => call.table === "document_pages")!;
    expect(pageCall.ops).toEqual(expect.arrayContaining(['eq:"document_id"', 'limit:1500']));
    const again = fakeService({ columnMissing: true });
    expect(await knownDocumentMap(again as never, USER, DOC)).toEqual(map);
    expect(again.calls).toHaveLength(0);
  });

  it("belge öğrencinin değilse hesap yok", async () => {
    const service = fakeService({ owner: false, pages: PAGE_ROWS });
    expect(await ensureDocumentMap(service as never, USER, DOC)).toBeNull();
    expect(service.calls.some((call) => call.table === "document_pages")).toBe(false);
  });

  it("sohbet turu hesap beklemez: dosya yalnız hazır haritayı okur, eksikse arka plana bırakır", () => {
    const loader = read("src/lib/teacher/dossier-load.ts");
    expect(loader).toContain("knownDocumentMap(service, userId, String(latestDocument.id))");
    expect(loader).not.toContain("ensureDocumentMap");
    const chat = read("src/app/api/ai/chat/route.ts");
    expect(chat).toContain("if (pendingMap) after(() => ensureDocumentMap(service, userId, pendingMap).then(() => undefined));");
    expect(read("src/lib/documents/document-map-load.ts")).not.toMatch(/match_document_chunks|\.rpc\(/);
  });
});

describe("dosyaya bağlantı", () => {
  const base = {
    today: "2026-11-15",
    mistakes: [],
    openMisconceptions: [],
    preps: [],
    dueReviews: { prep: 0, general: 0, prepId: null },
    documents: [{ id: DOC, fileName: "Fizik Notu.pdf", pageCount: 5 }],
    streak: null,
  };

  it("harita varsa belge satırı en ağırlıklı bölümü, istem notun kuralını taşır", () => {
    const dossier = buildDossier({ ...base, documentMap: buildDocumentMap(PHYSICS) });
    expect(dossier.lines.find((line) => line.key === "documents")!.text).toBe(
      "Son yüklediğin: Fizik Notu.pdf (5 sayfa); en ağırlıklı bölüm: Momentum",
    );
    expect(dossier.promptBlock).toContain("Notun kuralı:");
    expect(dossier.promptBlock).toContain("g = 10 m/s² alınız");
    expect(dossier.pendingMapDocumentId).toBeNull();
  });

  it("harita yoksa satır haritasız, hesap arka plana istenir", () => {
    const dossier = buildDossier({ ...base, documentMap: null });
    expect(dossier.lines.find((line) => line.key === "documents")!.text).toBe("Son yüklediğin: Fizik Notu.pdf (5 sayfa)");
    expect(dossier.pendingMapDocumentId).toBe(DOC);
  });
});

describe("göç: yalnız ekleme, uygulanmadı", () => {
  it("tek yeni sütun, var olan satırlara dokunmaz", () => {
    const raw = read("supabase/migrations/20261115170000_document_study_map.sql");
    expect(raw.split("\n")[0]).toContain("UYGULANMADI");
    const sql = raw.replace(/^--.*$/gm, "");
    expect(sql).toContain("ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS study_map jsonb;");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/);
  });
});
