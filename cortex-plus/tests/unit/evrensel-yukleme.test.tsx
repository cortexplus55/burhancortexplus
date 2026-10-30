// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createCanvas } from "@napi-rs/canvas";

vi.mock("@/lib/documents/extract-image-text", () => ({
  appendFigureTranscript: (text: string, figure: string) => `${text}\n[şekil] ${figure}`,
  mergeUsage: (a: unknown[], b: unknown[]) => [...a, ...b],
  extractImageText: vi.fn(),
}));

import { UploadError } from "@/lib/documents/upload-client";
import { runUploadPipeline, uploadWithRetry } from "@/lib/documents/upload-engine";
import { useScreenAwake } from "@/lib/documents/use-universal-upload";
import { topicPastHead } from "@/lib/documents/document-head";
import { attachOfficeFigures, OFFICE_FIGURE_CONCURRENCY } from "@/lib/documents/office-figures";
import { extractImageText } from "@/lib/documents/extract-image-text";
import {
  OUTLINE_BREVITY_RULE,
  OUTLINE_LIKELY_ASKED_ITEMS,
  oneShotJsonSchema,
  oneShotOutlineSchema,
} from "@/lib/documents/outline-oneshot";
import type { PhotoPage } from "@/lib/documents/photo-set-pdf";

/*
  Evrensel yükleme ve büyük belge (31 Ekim 2026, ürün sahibi: "bütün yükleme kapıları, bütün dosya türleri, bütün uç
  senaryolar tek mimaride"). Ortak motor, yeniden deneme, ekranı uyanık tutma, büyük belgenin baş kopyası, kısa konu
  haritası, Office resimlerinin paralel okunması, okunamayan sayfanın ücreti.
*/

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noSleep = async () => {};
const file = (name: string, type = "image/jpeg") => new File([new Uint8Array([1, 2, 3])], name, { type });
const encodeOk = async (): Promise<PhotoPage> => {
  const canvas = createCanvas(32, 24);
  return { jpeg: new Uint8Array(canvas.encodeSync("jpeg", 80)), width: 32, height: 24 };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dosya başına yeniden deneme", () => {
  it("ağ kopması ve 5xx 3 kez denenir; doğrulama reddi bir kez", async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw new UploadError("koptu", calls === 1 ? 0 : 503);
      return { documentId: "d1" };
    };
    await expect(uploadWithRetry(file("a.pdf"), { upload: flaky, sleep: noSleep })).resolves.toEqual({ documentId: "d1" });
    expect(calls).toBe(3);

    let rejected = 0;
    const invalid = async () => {
      rejected += 1;
      throw new UploadError("Geçersiz dosya", 400);
    };
    await expect(uploadWithRetry(file("a.pdf"), { upload: invalid, sleep: noSleep })).rejects.toThrow("Geçersiz dosya");
    expect(rejected).toBe(1);

    let always = 0;
    await expect(
      uploadWithRetry(file("a.pdf"), {
        upload: async () => {
          always += 1;
          throw new UploadError("koptu", 0);
        },
        sleep: noSleep,
      }),
    ).rejects.toThrow("koptu");
    expect(always).toBe(3);
  });

  it("kapanan hedef (telefon kodu) durur, yeniden denenmez", () => {
    expect(new UploadError("süre doldu", 410, true).retryable).toBe(false);
    expect(new UploadError("yoğun", 429).retryable).toBe(true);
    expect(new UploadError("doğrulanamadı", 422).retryable).toBe(false);
  });
});

describe("ortak yükleme motoru", () => {
  it("fotoğraflar tek belgede, belge ayrı; biri düşse öbürleri sürer; sıra seçimdir", async () => {
    const uploaded: string[] = [];
    let uploadCalls = 0;
    const result = await runUploadPipeline(
      [file("notlar.pdf", "application/pdf"), file("a.jpg"), file("b.jpg"), file("c.jpg"), file("bozuk.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")],
      { lanes: 2, photoSet: true, fastStart: false, encode: encodeOk },
      {
        upload: async (f) => {
          uploadCalls += 1;
          if (f.name === "bozuk.docx") throw new UploadError("Geçersiz dosya", 400);
          uploaded.push(f.name);
          return { documentId: `id-${f.name}` };
        },
        process: async () => true,
      },
    );
    expect(uploaded.sort()).toEqual(["Ders Notu Fotoğrafları (3 Sayfa).pdf", "notlar.pdf"]);
    expect(result.order).toEqual(["notlar.pdf", "bozuk.docx", "Ders Notu Fotoğrafları (3 Sayfa).pdf"]);
    expect(result.failed).toEqual(["bozuk.docx"]);
    expect(result.firstError).toBe("Geçersiz dosya");
    expect(result.succeeded).toBe(2);
    expect(uploadCalls).toBe(3);
  });

  it("hak dolunca (stop) yeni dosya başlamaz", async () => {
    const started: string[] = [];
    const result = await runUploadPipeline(
      ["1.pdf", "2.pdf", "3.pdf", "4.pdf"].map((name) => file(name, "application/pdf")),
      { lanes: 1, photoSet: true, fastStart: false },
      {
        upload: async (f) => {
          started.push(f.name);
          return { documentId: f.name };
        },
        process: async ({ documentId }) => (documentId === "2.pdf" ? "stop" : true),
      },
    );
    expect(started).toEqual(["1.pdf", "2.pdf"]);
    expect(result.stopped).toBe(true);
  });

  it("telefon kodu kapanınca gönderim durur, düşen sayılmaz", async () => {
    const result = await runUploadPipeline(
      ["1.pdf", "2.pdf", "3.pdf"].map((name) => file(name, "application/pdf")),
      { lanes: 1, photoSet: false, fastStart: false },
      {
        upload: async (f) => {
          if (f.name === "2.pdf") throw new UploadError("süre doldu", 410, true);
          return { documentId: f.name };
        },
        process: async () => true,
      },
    );
    expect(result.stopped).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toBe(1);
  });

  it("tek belge alan yüzey (stüdyo): fotoğraflar tek belge, değilse yalnız ilk dosya", async () => {
    const names: string[] = [];
    const handlers = {
      upload: async (f: File) => {
        names.push(f.name);
        return { documentId: f.name };
      },
      process: async () => true as const,
    };
    await runUploadPipeline([file("a.jpg"), file("b.jpg")], { lanes: 1, photoSet: true, fastStart: true, single: true, encode: encodeOk }, handlers);
    expect(names).toEqual(["Ders Notu Fotoğrafları (2 Sayfa).pdf"]);
    names.length = 0;
    await runUploadPipeline([file("x.pdf", "application/pdf"), file("y.pdf", "application/pdf")], { lanes: 1, photoSet: true, fastStart: false, single: true }, handlers);
    expect(names).toEqual(["x.pdf"]);
  });

  it("hızlı başlatma: 20 fotoğrafta ilk parça önce yüklenir", async () => {
    const order: string[] = [];
    await runUploadPipeline(
      Array.from({ length: 20 }, (_, index) => file(`IMG_${index + 1}.jpg`)),
      { lanes: 2, photoSet: true, fastStart: true, encode: encodeOk },
      {
        upload: async (f) => {
          order.push(f.name);
          return { documentId: f.name };
        },
        process: async () => true,
      },
    );
    expect(order).toEqual(["Ders Notu Fotoğrafları (Sayfa 1–10).pdf", "Ders Notu Fotoğrafları (Sayfa 11–20).pdf"]);
  });
});

describe("ekranı uyanık tutma", () => {
  function Probe({ active }: { active: boolean }) {
    useScreenAwake(active);
    return null;
  }

  it("yükleme sürerken kilit istenir, bitince bırakılır; tarayıcı desteklemiyorsa sessiz", async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ released: false, release }));
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const view = render(<Probe active />);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    view.rerender(<Probe active={false} />);
    await vi.waitFor(() => expect(release).toHaveBeenCalled());

    vi.stubGlobal("navigator", { ...navigator, wakeLock: undefined });
    expect(() => render(<Probe active />)).not.toThrow();
  });
});

describe("büyük belgenin baş kopyası", () => {
  it("ana belge eklenirken yalnız baş kopyasından sonraki sayfaların konuları eklenir", () => {
    const coverage = new Map([["D", 12]]);
    expect(topicPastHead({ sourceRefs: [{ documentId: "D", pages: [3, 4, 5] }] }, coverage)).toBe(false);
    expect(topicPastHead({ sourceRefs: [{ documentId: "D", pages: [40, 41] }] }, coverage)).toBe(true);
    // Sınırı aşan konu çoğunluğa göre.
    expect(topicPastHead({ sourceRefs: [{ documentId: "D", pages: [11, 12, 13, 14, 15] }] }, coverage)).toBe(true);
    expect(topicPastHead({ sourceRefs: [{ documentId: "D", pages: [10, 11, 12, 13] }] }, coverage)).toBe(false);
    // Başka belgeden ya da sayfasız konu hep kalır.
    expect(topicPastHead({ sourceRefs: [{ documentId: "E", pages: [1] }] }, coverage)).toBe(true);
    expect(topicPastHead({ sourceRefs: [] }, coverage)).toBe(true);
  });

  it("işleme ucu ilk adımı kısa tutar, baş kopyasını döndürür, kalanı arkada okutur", () => {
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toContain("firstStepPages: fastStart ? HEAD_PAGES : undefined");
    expect(route).toContain("ensureDocumentHead(service, { userId, documentId: doc.id, lastPage: indexed.pagesDone ?? 0 })");
    expect(route).toContain("continueExtractionAfterResponse(service, { userId, documentId: doc.id, startedAt: routeStarted })");
    // Kira doluysa zincir boşa dönmez.
    expect(route).toContain("!indexed.busy &&");
    expect(read("src/lib/documents/pdf-ingestion.ts")).toContain("busy: true,");
  });

  it("baş kopyası listelerde görünmez, silmede paylaşılan dosyaya dokunulmaz, hazırlıkta bir kez görünür", () => {
    for (const path of ["src/app/api/documents/route.ts", "src/app/dokumanlar/page.tsx", "src/lib/documents/document-options.ts"]) {
      expect(read(path)).toContain('.is("part_of", null)');
    }
    expect(read("src/lib/privacy/document-deletion.ts")).toContain("if (!doc.part_of) {");
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("if (parent && sourceById.has(parent)) return [];");
    expect(read("src/app/api/learning/exam-prep/add-source/route.ts")).toContain("topicPastHead(topic, headCoverage)");
    const migration = read("supabase/migrations/20261031140000_document_head.sql");
    expect(migration).toContain("REFERENCES public.documents(id) ON DELETE CASCADE");
    expect(migration).not.toMatch(/DROP |CREATE POLICY/i);
  });

  it("sihirbaz baş kopyasıyla ilerler; harita kurulduysa ana belge bekleyen olur, baş kopyası değil", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("takeHead(progress.head, input.documentId, Number(progress.pageCount) || null);");
    expect(wizard).toContain("fastStart: paidUploads && !item.part && isPdfFile(item.file),");
    expect(wizard).toContain("!headOfRef.current.has(id)");
    expect(wizard).toContain("if (head && !mappedIdsRef.current?.includes(head)");
  });
});

describe("kısa konu haritası", () => {
  it("şema açıklama istemez, en çok iki kısa madde; istem kısalık kuralını taşır", () => {
    const topicSchema = (oneShotJsonSchema as {
      properties: { units: { items: { properties: { topics: { items: { required: string[]; properties: Record<string, { maxItems?: number }> } } } } } };
    }).properties.units.items.properties.topics.items;
    expect(topicSchema.required).not.toContain("description");
    expect(topicSchema.properties.description).toBeUndefined();
    expect(topicSchema.properties.likelyAsked?.maxItems).toBe(OUTLINE_LIKELY_ASKED_ITEMS);
    expect(OUTLINE_LIKELY_ASKED_ITEMS).toBe(2);
    expect(OUTLINE_BREVITY_RULE).toContain("KISA YAZ");
    const source = read("src/lib/documents/outline-oneshot.ts");
    expect(source).toContain("${OUTLINE_BREVITY_RULE}");
    expect(source).not.toMatch(/"whyLearn":string,"description":string/);
  });

  it("kayıtlı eski taslak (açıklama, dört madde) yine okunur", () => {
    const parsed = oneShotOutlineSchema.safeParse({
      units: [{ title: "Ünite", examWeight: "high", topics: [{
        id: "t1", title: "Konu", whyLearn: "neden", description: "uzun açıklama", fileIndex: 0,
        pageStart: 1, pageEnd: 2, examWeight: "medium", likelyAsked: ["a", "b", "c", "d"], prerequisiteIds: [],
      }] }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("Office resimleri paralel", () => {
  it("resimler aynı anda okunur, ekler sayfaya belgedeki sırayla girer, hızlı işlem geçer", async () => {
    let live = 0;
    let peak = 0;
    vi.mocked(extractImageText).mockImplementation(async (_buffer, _mime, options) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 5));
      live -= 1;
      return { ok: true, pages: [`resim ${(options as { scanOrdinal?: number }).scanOrdinal}`], usage: [], fast: (options as { fast?: boolean }).fast } as never;
    });
    const images = Array.from({ length: 20 }, (_, index) => ({ bytes: new Uint8Array([index]), mimeType: "image/png", pageIndex: index % 2 }));
    const result = await attachOfficeFigures(["slayt 1", "slayt 2"], images as never, { fast: true });
    expect(peak).toBe(Math.min(OFFICE_FIGURE_CONCURRENCY, 20));
    expect(result.readCount).toBe(20);
    expect(result.pages[0]!.indexOf("resim 1")).toBeLessThan(result.pages[0]!.indexOf("resim 3"));
    expect(vi.mocked(extractImageText).mock.calls.every((call) => (call[2] as { fast?: boolean }).fast === true)).toBe(true);
  });
});

describe("okunamayan sayfanın ücreti", () => {
  it("okunamayan sayfa varsa ayrılan ücret iade edilir, yalnız okunan sayfa kadar kesilir", () => {
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toContain('.eq("page_kind", "unreadable")');
    expect(route).toContain("await refundCredits(service, id);");
    expect(route).toContain('chargeNow(service, userId, "DOCUMENT_PAGE_PROCESS", `document_pages_read_${documentId}`, Math.max(0, total - unreadable))');
  });
});

describe("bütün yükleme kapıları aynı motorda", () => {
  it("sihirbaz, materyal ekle, stüdyo, telefon motoru; sohbet yeniden denemeyi ve ekran kilidini kullanır", () => {
    expect(read("src/components/parity/exam-create-wizard.tsx")).toContain("useUniversalDocumentUpload(");
    expect(read("src/components/parity/prep-add-material.tsx")).toContain("useUniversalDocumentUpload(");
    expect(read("src/components/learning/studio/studio-setup.tsx")).toContain("{ lanes: 1, photoSet: true, fastStart: false, single: true }");
    expect(read("src/components/parity/phone-upload-client.tsx")).toContain("useUniversalDocumentUpload(");
    const chat = read("src/components/chat/chat-panel.tsx");
    expect(chat).toContain("uploaded = await uploadWithRetry(file);");
    expect(chat).toContain("useScreenAwake(attaching > 0);");
    expect(read("src/components/parity/pending-materials-banner.tsx")).toContain('useScreenAwake(phase === "reading" || phase === "mapping");');
    // Hiçbir yüzey motoru atlayıp yükleme ucunu doğrudan çağırmaz.
    for (const path of [
      "src/components/parity/exam-create-wizard.tsx",
      "src/components/parity/prep-add-material.tsx",
      "src/components/learning/studio/studio-setup.tsx",
      "src/components/chat/chat-panel.tsx",
    ]) {
      expect(read(path)).not.toContain("uploadDocumentFile(");
    }
  });
});
