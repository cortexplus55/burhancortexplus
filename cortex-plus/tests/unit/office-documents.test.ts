import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import {
  extractOfficeText,
  isOfficeDocument,
  OFFICE_MIME_TYPES,
} from "@/lib/documents/extract-office-text";

/*
  Astra vitrininde "slaytlar ve ders kitapları" diyor; bizde `.pptx` ve
  `.docx` yüklenemiyordu bile. Öğrenciye "slaytı PDF'e çevir" dedirtmek,
  ürünün işini öğrenciye yaptırmak.

  İkisi de içinde XML taşıyan zip dosyaları: metin zaten orada, model
  çağrısına gerek yok. Fotoğraf ve taranmış PDF'ten farkı bu.
*/

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const docx = (bodyXml: string, extra: Record<string, string> = {}) =>
  Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document><w:body>${bodyXml}</w:body></w:document>`,
      ),
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, strToU8(v)]),
      ),
    }),
  );

const pptx = (slides: Record<string, string>) =>
  Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      ...Object.fromEntries(
        Object.entries(slides).map(([name, text]) => [
          `ppt/slides/${name}`,
          strToU8(`<?xml version="1.0"?><p:sld><p:cSld>${text}</p:cSld></p:sld>`),
        ]),
      ),
    }),
  );

const para = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const slideText = (text: string) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;

describe("hangi belge Office", () => {
  it.each(OFFICE_MIME_TYPES)("%s tanınıyor", (mime) => {
    expect(isOfficeDocument(mime)).toBe(true);
  });

  it.each(["application/pdf", "image/png", "text/plain", null])(
    "%s tanınmıyor",
    (mime) => {
      expect(isOfficeDocument(mime as string | null)).toBe(false);
    },
  );
});

describe("Word", () => {
  it("paragrafları okuyor", () => {
    const result = extractOfficeText(
      docx(para("Hücre bölünmesi") + para("Mitoz ve mayoz")),
      DOCX,
    );
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toContain("Hücre bölünmesi");
    expect(result.pages[0]).toContain("Mitoz ve mayoz");
  });

  /* `.docx` içinde SAYFA diye bir şey yok — sayfalama yazıcıya göre
     hesaplanıyor. Elle konmuş sayfa sonu tek gerçek işaret. */
  it("elle konmuş sayfa sonunda bölüyor", () => {
    const result = extractOfficeText(
      docx(
        para("Birinci sayfa") +
          '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
          para("İkinci sayfa"),
      ),
      DOCX,
    );
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toContain("Birinci");
    expect(result.pages[1]).toContain("İkinci");
  });

  /* Uydurma sayfa bölmek, "3. sayfada yazıyor" diyen bir alıntıyı yanlış
     yere göndermek olurdu. */
  it("sayfa sonu yoksa tek sayfa sayıyor", () => {
    const result = extractOfficeText(
      docx(Array.from({ length: 40 }, (_, i) => para(`Paragraf ${i}`)).join("")),
      DOCX,
    );
    expect(result.pages).toHaveLength(1);
  });

  /* Çıkarılan metin ekrana ve gömmeye gidiyor; ham XML varlığı kalmamalı. */
  it("XML varlıklarını çözüyor", () => {
    const result = extractOfficeText(
      docx(para("a &amp; b &lt; c &quot;alıntı&quot;")),
      DOCX,
    );
    expect(result.pages[0]).toBe('a & b < c "alıntı"');
  });

  it("&amp;lt; iki kez çözülmüyor", () => {
    const result = extractOfficeText(docx(para("&amp;lt;")), DOCX);
    expect(result.pages[0]).toBe("&lt;");
  });
});

describe("PowerPoint", () => {
  it("bir slayt bir sayfa", () => {
    const result = extractOfficeText(
      pptx({
        "slide1.xml": slideText("Giriş"),
        "slide2.xml": slideText("Gelişme"),
      }),
      PPTX,
    );
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toContain("Giriş");
  });

  /* Zip girdileri sözlük sırasında geliyor ve orada `slide10`, `slide2`'den
     ÖNCE çıkıyor. Sırayı bozmak slaytları karışık bir kaynağa çevirirdi. */
  it("slaytları sayı sırasına diziyor", () => {
    const slides: Record<string, string> = {};
    for (const n of [1, 2, 10, 11, 3]) {
      slides[`slide${n}.xml`] = slideText(`Slayt ${n}`);
    }
    const result = extractOfficeText(pptx(slides), PPTX);
    expect(result.pages.map((p) => p.match(/\d+/)![0])).toEqual([
      "1", "2", "3", "10", "11",
    ]);
  });

  /* Metin çalıştırmaları arasına boşluk konmazsa kelimeler yapışıyor. */
  it("ayrı çalıştırmaları boşlukla ayırıyor", () => {
    const result = extractOfficeText(
      pptx({
        "slide1.xml": "<a:p><a:r><a:t>Hücre</a:t></a:r><a:r><a:t>zarı</a:t></a:r></a:p>",
      }),
      PPTX,
    );
    expect(result.pages[0]).toBe("Hücre zarı");
  });

  it("boş sunumu okuma saymıyor", () => {
    const result = extractOfficeText(pptx({ "slide1.xml": "" }), PPTX);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("empty");
  });
});

describe("kötü dosyalar", () => {
  it("zip olmayan dosyayı reddediyor", () => {
    const result = extractOfficeText(Buffer.from("bu bir zip değil"), DOCX);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("corrupt");
  });

  it("desteklenmeyen türü reddediyor", () => {
    expect(extractOfficeText(docx(para("x")), "application/pdf").reason).toBe(
      "unsupported",
    );
  });

  /* `unzipSync` her girdiyi belleğe açıyor; sınır olmadan sıkıştırma oranı
     yüksek tek bir belge süreci düşürürdü. */
  it("açıldığında çok büyüyen dosyayı reddediyor", () => {
    const huge = "<w:p><w:r><w:t>" + "a".repeat(90 * 1024 * 1024) + "</w:t></w:r></w:p>";
    const result = extractOfficeText(docx(huge), DOCX);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_large");
  });

  /* Atlanan bir girdinin bildirdiği boyut belleğe hiç gelmiyor; onu saymak
     resimli ama zararsız bir sunumu haksız yere reddederdi. */
  it("okumadığı parçaların boyutunu saymıyor", () => {
    const result = extractOfficeText(
      docx(para("Kısa metin"), {
        "word/media/image1.png": "x".repeat(90 * 1024 * 1024),
      }),
      DOCX,
    );
    expect(result.ok).toBe(true);
    expect(result.pages[0]).toBe("Kısa metin");
  });
});

describe("yükleme yolu", () => {
  it("sunucu izin listesi ikisini de kabul ediyor", () => {
    const source = readFileSync("src/lib/documents/store-upload.ts", "utf8");
    expect(source).toContain("wordprocessingml.document");
    expect(source).toContain("presentationml.presentation");
  });

  it.each([
    "src/components/documents/document-upload.tsx",
    "src/components/parity/exam-create-wizard.tsx",
  ])("%s .docx ve .pptx seçtiriyor", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain(".docx,.pptx");
    expect(source).toContain("wordprocessingml.document");
  });

  /* Model çağrısı yok, kota yok: metin dosyanın içinde zaten duruyor. */
  it("boru hattı kota istemiyor", () => {
    const source = readFileSync("src/lib/rag/pipeline.ts", "utf8");
    const branch = source.slice(
      source.indexOf("} else if (isOfficeDocument(doc.mime_type)) {"),
      source.indexOf("  } else {\n    const extracted = await extractText("),
    );
    expect(branch).toContain("extractOfficeText(buffer, doc.mime_type)");
    expect(branch).not.toContain("claim(");
  });
});
