import { describe, expect, it } from "vitest";
import {
  isNoTextOcrResponse,
  isUsableOcrText,
} from "@/lib/documents/extract-image-text";

const LONG =
  "Bir üçgenin iç açıları toplamı 180 derecedir. Kanıtı şöyledir: paralel doğrular.";

describe("OCR no-text ayırıcıları", () => {
  it.each([
    "[METIN_YOK]",
    "metin yok",
    "no text",
    "empty page",
    "Bu görselde okunacak yazı bulunmuyor.",
    "Görselde herhangi bir metin görünmüyor.",
    "Okunacak yazı yok.",
    "boş sayfa",
    "Boş sayfa — içerik yok.",
  ])("no-text: %s", (raw) => {
    expect(isNoTextOcrResponse(raw)).toBe(true);
    expect(isUsableOcrText(raw)).toBe(false);
  });

  it("40+ karakterlik gerçek metin kullanılabilir", () => {
    expect(isNoTextOcrResponse(LONG)).toBe(false);
    expect(isUsableOcrText(LONG)).toBe(true);
  });

  it("çok kısa metin kullanılabilir sayılmaz", () => {
    expect(isUsableOcrText("Kısa başlık")).toBe(false);
  });
});
