/**
 * Faz 2 (madde 5): büyük PDF sessizce kırpılmaz. Kapsam rozeti, varsayılan aralık ve aralık doğrulaması.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE_SPAN,
  clampPageRange,
  coverageBadgeText,
  defaultPageRange,
  processedCoverage,
  shouldAskPageRange,
} from "@/lib/documents/page-coverage";

describe("processedCoverage", () => {
  it("dosyanın tamamı işlendiyse rozet yok", () => {
    expect(processedCoverage({ pageCount: 40, sourcePageCount: 40 })).toBeNull();
    expect(processedCoverage({ pageCount: null, sourcePageCount: 40 })).toBeNull();
    expect(processedCoverage({ pageCount: 40, sourcePageCount: null })).toBeNull();
  });

  it("ilk N sayfa işlendiyse kapsam 1..N / toplam", () => {
    expect(processedCoverage({ pageCount: 100, sourcePageCount: 320 })).toEqual({
      start: 1,
      end: 100,
      total: 320,
      processed: 100,
    });
  });

  it("aralık 1'den başlamıyorsa başlangıç sayfası korunur (son sayfa dahil olsa da rozet çıkar)", () => {
    expect(processedCoverage({ pageCount: 20, sourcePageCount: 320, rangeStart: 301 })).toEqual({
      start: 301,
      end: 320,
      total: 320,
      processed: 20,
    });
  });

  it("işlenen sayfa sayısı dosyayı aşamaz", () => {
    expect(processedCoverage({ pageCount: 50, sourcePageCount: 60, rangeStart: 31 })).toEqual({
      start: 31,
      end: 60,
      total: 60,
      processed: 30,
    });
  });
});

describe("coverageBadgeText", () => {
  it("madde 5 metni birebir", () => {
    const coverage = processedCoverage({ pageCount: 100, sourcePageCount: 320 })!;
    expect(coverageBadgeText(coverage)).toBe(
      "İşlenen kapsam: Sayfa 1–100 / Toplam 320 sayfa. Kalan bölümler için yeni sayfa aralığı ekleyebilirsin.",
    );
  });
});

describe("aralık penceresi", () => {
  it("hak sınırı yoksa varsayılan aralık dosyanın tamamı (eski davranış korunur)", () => {
    expect(defaultPageRange(320)).toEqual({ start: 1, end: 320 });
    expect(defaultPageRange(320, null)).toEqual({ start: 1, end: 320 });
  });

  it("hak yetmiyorsa varsayılan aralık hakkın yettiği yere kadar", () => {
    expect(defaultPageRange(320, 100)).toEqual({ start: 1, end: 100 });
    expect(defaultPageRange(12, 30)).toEqual({ start: 1, end: 12 });
  });

  it("dosya hakka sığmıyorsa ya da büyükse pencere açılır; küçük ve sığan dosyada açılmaz", () => {
    expect(shouldAskPageRange(DEFAULT_RANGE_SPAN + 1, null)).toBe(true);
    expect(shouldAskPageRange(DEFAULT_RANGE_SPAN, null)).toBe(false);
    expect(shouldAskPageRange(30, 10)).toBe(true);
    expect(shouldAskPageRange(30, 30)).toBe(false);
    expect(shouldAskPageRange(1, 0)).toBe(false);
    expect(shouldAskPageRange(null, 10)).toBe(false);
  });

  it("girilen aralık dosyanın sınırlarına çekilir; bitiş başlangıçtan küçük olamaz", () => {
    expect(clampPageRange("0", "500", 320)).toEqual({ start: 1, end: 320 });
    expect(clampPageRange(50, 10, 320)).toEqual({ start: 50, end: 50 });
    expect(clampPageRange("", "", 320)).toEqual({ start: 1, end: 320 });
    expect(clampPageRange(400, 500, 320)).toEqual({ start: 320, end: 320 });
  });
});

describe("documentPageRange (işleme adımı)", () => {
  it("aralık yoksa ya da geçersizse belge baştan sona okunur; geçerli aralık korunur", async () => {
    const { documentPageRange } = await import("@/lib/documents/pdf-ingestion");
    expect(documentPageRange(null)).toEqual({ start: 1, end: null });
    expect(documentPageRange({ page_range_start: null, page_range_end: null })).toEqual({ start: 1, end: null });
    expect(documentPageRange({ page_range_start: 101, page_range_end: 200 })).toEqual({ start: 101, end: 200 });
    expect(documentPageRange({ page_range_start: 0, page_range_end: -4 })).toEqual({ start: 1, end: null });
    expect(documentPageRange({ page_range_start: 50, page_range_end: 10 })).toEqual({ start: 50, end: null });
  });
});
