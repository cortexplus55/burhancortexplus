import { describe, expect, it } from "vitest";
import { decodeGlyphIdText, looksGlyphIdText } from "@/lib/documents/glyph-id-text";
import { cleanOcrPageText } from "@/lib/documents/outline-clean";
import { buildGroundingFile, groundTopic } from "@/lib/documents/outline-grounding";

/**
 * 19 Ekim 2026: 30 sayfalık KPSS Anayasa notunun metin katmanı Calibri glif
 * numaralarıyla çıktı; konu haritası 2 konuya düştü. Satırlar o belgenin ham
 * metninden (pdf.js çıktısı) alındı.
 */
const SP = "\u0003"; // glif 3 = boşluk
const A = "\u0004"; // glif 4 = A
const D = "\u0018"; // glif 24 = D
const E = "\u001c"; // glif 28 = E

const toc = [
  "www. YakinEgitim .com ",
  "ANAYASA HUKUKU ",
  "I.   Devlet ",
  `IV. ${SP} ${A}ŶĂǇĂƐĂĐŦůŦŬ${SP}dĂƌŝŚŝ `,
  `V. ${SP} ${D}ĞǀůĞƟŶ${SP}dĞŵĞů${SP}EŝƚĞůŝŬůĞƌŝ `,
  `VI. ${SP} dĞŵĞů${SP},ĂŬ${SP}ǀĞ${SP},ƺƌƌŝǇĞƚůĞƌ `,
  `VII. ${SP} ^ŝǇĂƐŝ${SP}WĂƌƟůĞƌ `,
  "DEVLET ",
  `ϭ͘ ${SP} můŬĞ ${SP} ͬ ${SP} dŽƉƌĂŬ${SP}ƉĂƌĕĂƐŦ`,
  `Ϯ͘ ${SP} 7ŶƐĂŶ ${SP} ƚŽƉůƵůƵŒƵ`,
  `ϯ͘ ${SP} ${E}ŐĞŵĞŶ ${SP} ǀĞ${SP}ďĂŒŦŵƐŦǌ${SP}ďŝƌ${SP}ƐŝǇĂƐŝ${SP}ŽƚŽƌŝƚĞ `,
  `zĂƉŦƐŦŶĂ${SP}'ƂƌĞ${SP}${D}ĞǀůĞƚ${SP}bĞŬŝůůĞƌŝ`,
  `;dƺƌŬŝǇĞ͕ ${SP} &ƌĂŶƐĂ͕ ${SP} 7ƐǀĞĕͿ `,
].join("\n");

describe("decodeGlyphIdText", () => {
  it("recognises a glyph-id page and decodes only its garbled tokens", () => {
    expect(looksGlyphIdText(toc)).toBe(true);
    const out = decodeGlyphIdText(toc);
    expect(out).toContain("IV.   Anayasacılık Tarihi");
    expect(out).toContain("V.   Devletin Temel Nitelikleri");
    expect(out).toContain("VI.   Temel Hak ve Hürriyetler");
    expect(out).toContain("VII.   Siyasi Partiler");
    expect(out).toContain("1.   Ülke   /   Toprak parçası");
    expect(out).toContain("2.   İnsan   topluluğu");
    expect(out).toContain("3.   Egemen   ve bağımsız bir siyasi otorite");
    expect(out).toContain("Yapısına Göre Devlet Şekilleri");
    expect(out).toContain("(Türkiye,   Fransa,   İsveç)");
    // düzgün yazı tipiyle basılmış satırlar olduğu gibi
    expect(out).toContain("ANAYASA HUKUKU");
    expect(out).toContain("I.   Devlet");
    expect(out).toContain("DEVLET");
    expect(out).toContain("www. YakinEgitim .com");
  });

  it("is idempotent", () => {
    const once = decodeGlyphIdText(toc);
    expect(decodeGlyphIdText(once)).toBe(once);
  });

  it("leaves ordinary Turkish, English and Central European text alone", () => {
    const tr = "Anayasa Mahkemesi 15 üyeden oluşur. DEĞİŞİKLİĞİ, ÇOKLUĞU gibi büyük harfli Ğ meşrudur.";
    const en = "The quick brown fox jumps over the lazy dog. Chapter 4: Functions and recursion.";
    const cs = "Může být dům na kopci? Žlutý kůň úpěl ďábelské ódy. Příliš žluťoučký kůň.".repeat(5);
    const pl = "Zażółć gęślą jaźń. Pchnąć w tę łódź jeża lub ośm skrzyń fig. Mąka i śmietana.".repeat(5);
    for (const text of [tr, en, cs, pl]) {
      expect(looksGlyphIdText(text)).toBe(false);
      expect(decodeGlyphIdText(text)).toBe(text);
    }
  });

  it("does not touch a page with only a few Latin-extended letters", () => {
    const text = "Ă Ş Ğ İ gibi birkaç harf ve uzun düz bir Türkçe paragraf. ".repeat(10);
    expect(decodeGlyphIdText(text)).toBe(text);
  });

  it("runs inside cleanOcrPageText so stored pages read clean", () => {
    expect(cleanOcrPageText(toc)).toContain("Anayasacılık Tarihi");
  });

  it("lets a garbled page ground its own topic titles", () => {
    const pages = new Map<number, string>();
    for (let p = 1; p <= 6; p += 1) pages.set(p, `Sayfa ${p} dolgu metni hukuk kuralları ve yaptırım`);
    pages.set(3, cleanOcrPageText(toc));
    const file = buildGroundingFile(pages, "tr");
    expect(groundTopic(file, { title: "Devlet şekilleri ve Anayasacılık tarihi", pageStart: 3, pageEnd: 3 }).grounded).toBe(true);
  });
});
