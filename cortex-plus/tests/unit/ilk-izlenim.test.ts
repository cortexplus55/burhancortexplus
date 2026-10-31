import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { priceForModel } from "@/lib/billing/model-price";
import { splitOfficeFigures, OFFICE_HEAD_PAGES } from "@/lib/documents/office-head-start";
import type { OfficeEmbeddedImage } from "@/lib/documents/extract-office-text";
import { pdfOpenFailure } from "@/lib/documents/extract-text";
import { processErrorLabel } from "@/lib/documents/error-labels";
import { userMessageForProcessError } from "@/lib/documents/process-user-message";
import { PENDING_DONE_VISIBLE_MS, pendingDoneLine, pendingDoneTitle } from "@/lib/learning/pending-materials-copy";
import { AUTO_CONTINUE_SECONDS, autoContinueLine } from "@/lib/learning/exam-wizard-copy";

const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

/*
  İlk izlenim (31 Ekim 2026, ürün sahibi: "1 saniye bile gereksiz bekleyen, ne yapacağını anlamayan ya da dosyası
  reddedilen kullanıcı rakibe gider"). Örnekler farklı derslerden.
*/

describe("taranmış sayfa: 40. sayfadan sonrası pahalı modele gitmez", () => {
  it("her sayfa aynı merdivenden okunur (önce luna)", () => {
    const source = read("src/lib/documents/extract-image-text.ts");
    expect(source).not.toContain("SCAN_LUNA_PAGE_CAP");
    expect(source).not.toContain("imageReadLadderForScan");
    expect(source).toContain("const ladder = imageReadLadder();");
  });
});

describe("hızlı işlem fiyatı gizli kalmaz", () => {
  const prices = new Map([
    ["gpt-4.1", { input: 0.002, output: 0.008 }],
    ["gpt-6-luna", { input: 0.0001, output: 0.0005 }],
    ["gpt-6-luna-fast", { input: 0.0002, output: 0.001 }],
  ]);

  it("satırı olan model kendi fiyatıyla, '-fast' satırı yoksa normalin iki katıyla, bilinmeyen model fiyatsız", () => {
    expect(priceForModel("gpt-6-luna-fast", prices)).toEqual({ input: 0.0002, output: 0.001 });
    expect(priceForModel("gpt-4.1-fast", prices)).toEqual({ input: 0.004, output: 0.016 });
    expect(priceForModel("gpt-9-fast", prices)).toBeNull();
    expect(read("src/app/admin/maliyetler/page.tsx")).toContain("priceForModel(event.model, priceMap)");
  });

  it("göç gpt-4.1-fast satırını yazar", () => {
    const migration = read("supabase/migrations/20261031150000_fast_tier_prices.sql");
    expect(migration).toContain("('gpt-4.1-fast', 0.004000, 0.016000, now())");
    expect(migration).toContain("ON CONFLICT (model) DO UPDATE");
  });
});

function image(pageIndex: number): OfficeEmbeddedImage {
  return { pageIndex, name: `image${pageIndex}.png`, mimeType: "image/png", bytes: new Uint8Array([1]) };
}

describe("büyük sunu/Word: ilk slaytların resimleri beklerken, kalanı arkada", () => {
  const richText = "Hücre zarı seçici geçirgendir; difüzyon, osmoz ve aktif taşıma örneklerle anlatılır. ".repeat(4);

  it("az resimli belgede hepsi beklerken okunur", () => {
    const pages = Array.from({ length: 20 }, () => richText);
    const images = Array.from({ length: 8 }, (_, i) => image(i + 12));
    expect(splitOfficeFigures(pages, images)).toEqual({ head: images, tail: [] });
  });

  it("ilk 12 slayt ve yazısız slayt beklerken; yazılı geç slaytların resimleri arkada", () => {
    const pages = Array.from({ length: 60 }, (_, i) => (i === 40 ? "Şekil 4" : richText));
    const images = Array.from({ length: 60 }, (_, i) => image(i));
    const { head, tail } = splitOfficeFigures(pages, images);
    expect(head.map((item) => item.pageIndex)).toEqual([...Array.from({ length: OFFICE_HEAD_PAGES }, (_, i) => i), 40]);
    expect(tail).toHaveLength(60 - OFFICE_HEAD_PAGES - 1);
    expect(tail.every((item) => item.pageIndex >= OFFICE_HEAD_PAGES && item.pageIndex !== 40)).toBe(true);
  });

  it("hat geç resimleri belge kaydedildikten sonra arkada okur ve yalnız okunanı ücretler", () => {
    const pipeline = read("src/lib/rag/pipeline.ts");
    expect(pipeline).toContain("const split = splitOfficeFigures(read.pages, claimedImages);");
    expect(pipeline).toContain("after(run);");
    expect(pipeline).toContain("scannedPages: claimedPages - lateClaimed");
    expect(pipeline).toContain("if (filled.readCount > 0) await options?.onLateScanPages?.(filled.readCount);");
    expect(read("src/app/api/documents/process/route.ts")).toContain("`document_scan_late_${doc.id}`");
  });
});

describe("bozuk ya da şifreli dosya anlaşılır Türkçeyle", () => {
  it("pdf.js iletisi sınıflanır", () => {
    expect(pdfOpenFailure("Invalid PDF structure.")).toBe("corrupt_pdf");
    expect(pdfOpenFailure("InvalidPDFException: bad XRef entry")).toBe("corrupt_pdf");
    expect(pdfOpenFailure("No password given")).toBe("encrypted_pdf");
    expect(pdfOpenFailure("socket hang up")).toBeNull();
  });

  it("öğrenci İngilizce ham iletiyi görmez", () => {
    expect(processErrorLabel("Invalid PDF structure.")).toBe("Belge işlenemedi — tekrar dene");
    expect(processErrorLabel("corrupt_pdf")).toContain("bozuk");
    expect(processErrorLabel("office_unreadable")).toContain("açılamadı");
    expect(userMessageForProcessError("corrupt_pdf")).toContain("yeniden indirip yükle");
    expect(read("src/app/api/documents/preflight/route.ts")).toContain('code === "encrypted_pdf" || code === "corrupt_pdf"');
  });
});

describe("kalan sayfalar eklenince", () => {
  it("bildirim sayıyı söyler ve en az 8 sn görünür", () => {
    expect(pendingDoneTitle(27)).toBe("✓ Kalan tüm sayfalar ve 27 yeni konu çalışma yoluna eklendi!");
    expect(pendingDoneTitle(0)).toBe("✓ Kalan tüm sayfalar çalışma yoluna eklendi!");
    expect(pendingDoneLine(1)).toContain("1 konuya yeni kaynak");
    expect(PENDING_DONE_VISIBLE_MS).toBeGreaterThanOrEqual(8_000);
  });
});

describe("sihirbaz: ilk sayfalar hazır olunca bekletmez", () => {
  it("kısa geri sayımla kendiliğinden ilerler, 'Bekle' durdurur, harita dil adımında arkada başlar", () => {
    expect(AUTO_CONTINUE_SECONDS).toBeLessThanOrEqual(3);
    expect(autoContinueLine(2)).toContain("2 sn içinde");
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("autoArmedRef.current = true;");
    expect(wizard).toContain("function holdAutoContinue()");
    expect(wizard).toContain('if (step !== "language" || mapRetry || !documentKey) return;');
    expect(wizard).toContain("if (intakeRef.current !== run) {");
  });
});
