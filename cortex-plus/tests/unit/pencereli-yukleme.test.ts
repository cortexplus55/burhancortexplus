import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  PDF_SPLIT_THRESHOLD_BYTES,
  isPdfSplitTail,
  needsPdfSplit,
  pdfPartName,
  planPdfSplit,
  splitLargePdf,
} from "@/lib/documents/pdf-split-client";
import { runUploadPipeline } from "@/lib/documents/upload-engine";
import { uploadSizeProblem } from "@/lib/documents/upload-accept";
import { maxDocumentBytes } from "@/lib/documents/store-upload";
import { extractText } from "@/lib/documents/extract-text";

const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

/*
  Pencereli işleme (31 Ekim 2026): kod tabanındaki sayfa ve boyut tavanları. Ürün sınırı yok; öğrencinin hakkı ve
  depolamanın tek dosya tavanı (Supabase ücretsiz plan, sabit 50 MB) sınırlar. 50 MB'tan büyük PDF tarayıcıda
  sayfa sınırından bölünür, metin katmanı korunur.
*/

async function textPdf(pages: number, label: string): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= pages; page += 1) {
    doc.addPage([400, 400]).drawText(`${label} Sayfa ${page}`, { x: 40, y: 200, size: 18, font });
  }
  const bytes = await doc.save();
  return new File([new Uint8Array(bytes)], `${label}.pdf`, { type: "application/pdf" });
}

describe("büyük PDF tarayıcıda bölünür", () => {
  it("eşit parçalar, sayfa sınırından; ad sayfa aralığını söyler", () => {
    expect(planPdfSplit(600, 150 * 1024 * 1024)).toEqual([
      { from: 1, to: 150 },
      { from: 151, to: 300 },
      { from: 301, to: 450 },
      { from: 451, to: 600 },
    ]);
    expect(planPdfSplit(10, 1024)).toEqual([{ from: 1, to: 10 }]);
    expect(pdfPartName("Anatomi Atlası.pdf", { from: 151, to: 300 })).toBe("Anatomi Atlası (s. 151–300).pdf");
    expect(needsPdfSplit(new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" }))).toBe(false);
    expect(PDF_SPLIT_THRESHOLD_BYTES).toBe(50 * 1024 * 1024);
  });

  it("parçalar metin katmanını korur; ilk parçadan sonrakiler 'kuyruk' (baş kopyası almaz)", async () => {
    const book = await textPdf(30, "Iktisat");
    const parts = await splitLargePdf(book, { partBytes: Math.ceil(book.size / 3) });
    expect(parts.map((part) => part.name)).toEqual([
      "Iktisat (s. 1–10).pdf",
      "Iktisat (s. 11–20).pdf",
      "Iktisat (s. 21–30).pdf",
    ]);
    expect(parts.map((part) => isPdfSplitTail(part))).toEqual([false, true, true]);
    const second = await extractText(Buffer.from(await parts[1]!.arrayBuffer()), "application/pdf");
    expect(second.total).toBe(10);
    expect(second.pages[4]).toContain("Iktisat Sayfa 15");
  });

  it("açılamayan dosya bölünmez: kendisi döner (boyutu yüzünden reddedilir ve öğrenciye söylenir)", async () => {
    const broken = new File([new Uint8Array([1, 2, 3])], "bozuk.pdf", { type: "application/pdf" });
    expect(await splitLargePdf(broken)).toEqual([broken]);
    const huge = { name: "bozuk.pdf", type: "application/pdf", size: 60 * 1024 * 1024 } as File;
    expect(uploadSizeProblem(huge)).toContain("bölünemedi");
  });

  it("yükleme motoru büyük PDF'i parçalarına açar; her parça ayrı belge, sıra kitabın", async () => {
    const big = { name: "Kitap.pdf", type: "application/pdf", size: 120 * 1024 * 1024 } as File;
    const small = new File(["not"], "not.txt", { type: "text/plain" });
    const parts = [1, 2, 3].map((index) => new File(["x"], `Kitap (s. ${index}).pdf`, { type: "application/pdf" }));
    const uploaded: string[] = [];
    const result = await runUploadPipeline(
      [big, small],
      { lanes: 1, photoSet: false, fastStart: true, expandPdf: async (files) => files.flatMap((file) => (file === big ? parts : [file])) },
      {
        upload: async (file) => {
          uploaded.push(file.name);
          return { documentId: file.name };
        },
        process: async () => true,
      },
    );
    expect(uploaded).toEqual(["Kitap (s. 1).pdf", "Kitap (s. 2).pdf", "Kitap (s. 3).pdf", "not.txt"]);
    expect(result.order).toEqual(uploaded);
    expect(result.succeeded).toBe(4);
  });
});

describe("sayfa ve boyut tavanları", () => {
  it("belgenin sayfa sayısında ürün tavanı yok (eski 1.000 sayfa kalktı); hak sınırlar", () => {
    const ingestion = read("src/lib/documents/pdf-ingestion.ts");
    expect(ingestion).not.toMatch(/: 1000, 1000\)/);
    expect(ingestion).toContain("const affordable = Math.min(toRead, Number.isFinite(spendable) ? Math.floor(spendable / pageCost) : toRead);");
  });

  it("Word ve sunu 50 MB'a kadar (depolamanın tavanı); fotoğraf ve metin 15 MB", () => {
    expect(maxDocumentBytes("application/pdf")).toBe(50 * 1024 * 1024);
    expect(maxDocumentBytes("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(50 * 1024 * 1024);
    expect(maxDocumentBytes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(50 * 1024 * 1024);
    expect(maxDocumentBytes("image/jpeg")).toBe(15 * 1024 * 1024);
    const pptx = { name: "Sunum.pptx", type: "", size: 40 * 1024 * 1024 } as File;
    expect(uploadSizeProblem(pptx)).toBeNull();
    expect(uploadSizeProblem({ name: "Sunum.pptx", type: "", size: 60 * 1024 * 1024 } as File)).toContain("50 MB");
    expect(uploadSizeProblem({ name: "foto.jpg", type: "image/jpeg", size: 20 * 1024 * 1024 } as File)).toContain("15 MB");
  });

  it("depolama kotası belgenin parçalarını (paylaşılan dosya) bir kez sayar", () => {
    expect(read("src/lib/documents/storage-quota.ts")).toContain('.is("part_of", null)');
  });
});

describe("bağlantılar (kaynak bekçisi)", () => {
  it("okuma adımı istenen sayfada durur; kurulumun arka plan okuması baş kopyası + iki pencerede", () => {
    const ingestion = read("src/lib/documents/pdf-ingestion.ts");
    expect(ingestion).toContain("if (options?.untilPage && (lease.nextPage ?? 1) > options.untilPage) {");
    expect(ingestion).toContain("Math.max(1, Math.min(firstStep, options.untilPage - firstPage + 1))");
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toContain("untilPage: HEAD_READ_AHEAD_PAGES,");
    expect(route).toContain("windowed: Boolean(head) && reachedUntil(indexed),");
    expect(route).toContain("!reachedUntil(indexed) &&");
  });

  it("kurulum ve materyal ekle pencere işçisini başlatır; sihirbaz devredilen belgeyi beklemez", () => {
    expect(read("src/app/api/learning/exam-prep/create/route.ts")).toContain("after(() => requestPendingAdvance({ origin, userId, prepId: result.prepId }));");
    const pending = read("src/app/api/learning/exam-prep/pending-materials/route.ts");
    expect(pending).toContain("after(() => requestPendingAdvance({ origin, userId, prepId: parsed.data.prepId }));");
    const adder = read("src/components/parity/prep-add-material.tsx");
    expect(adder).toContain("const big = (body: Record<string, unknown>) => Number(body.pageCount) > SINGLE_WINDOW_MAX_PAGES;");
    expect(adder).toContain("window.dispatchEvent(new Event(PENDING_MATERIALS_EVENT));");
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("stopWhen: (progress) => progress.windowed === true,");
    expect(wizard).toContain("...windowedRef.current,");
  });

  it("işçi zinciri imzalı iç istekle sürer; hazırlıkta parçalar tek kaynak olarak görünür", () => {
    const advance = read("src/app/api/learning/exam-prep/pending-materials/advance/route.ts");
    expect(advance).toContain("export const maxDuration = 300;");
    expect(advance).toContain("verifyWindowChainToken(chainHeader)");
    expect(advance).toContain('if (result.state === "deadline" && hop + 1 <= MAX_CHAIN_HOPS) {');
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("if (parent && shownParents.has(parent)) return [];");
    expect(read("src/lib/credits/service.ts")).toContain('parseDocumentReservationKey(String(row.idempotency_key ?? ""))?.documentId ?? null');
  });
});
