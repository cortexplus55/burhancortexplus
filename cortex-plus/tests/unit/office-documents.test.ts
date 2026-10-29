import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import {
  DOCX_CHARS_PER_PAGE,
  expandDocxPages,
  extractOfficePackage,
  extractOfficeText,
  isOfficeDocument,
  OFFICE_IMAGE_MIN_BYTES,
  OFFICE_MIME_TYPES,
  resolveOfficeTarget,
} from "@/lib/documents/extract-office-text";
import { appendFigureTranscript, figureTranscript } from "@/lib/documents/extract-image-text";

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

  /* 19 Ekim 2026: Word'de yazılmış 6 sayfalık not elle sayfa sonu içermediği için "1 sayfa"
     sayılıyordu. Word, belgeyi en son çizdiğinde her sayfanın başına bir işaret yazar. */
  it("Word'ün çizim işaretinde (lastRenderedPageBreak) bölüyor", () => {
    const result = extractOfficeText(
      docx(
        para("Birinci sayfa") +
          '<w:p><w:r><w:lastRenderedPageBreak/></w:r><w:r><w:t>İkinci sayfa</w:t></w:r></w:p>' +
          '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
          '<w:p><w:r><w:lastRenderedPageBreak/></w:r><w:r><w:t>Üçüncü sayfa</w:t></w:r></w:p>',
      ),
      DOCX,
    );
    // Elle sonu izleyen çizim işareti ikinci bir sayfa üretmez.
    expect(result.pages).toEqual(["Birinci sayfa", "İkinci sayfa", "Üçüncü sayfa"]);
  });

  it("Word'ün sayfa sayısı işaretlerden azsa app.xml ile tamamlanır", () => {
    const body = Array.from({ length: 13 }, (_, i) => para(`Sayfa ${i + 1} ` + "kelime ".repeat(80))).join(
      '<w:p><w:r><w:lastRenderedPageBreak/></w:r></w:p>',
    );
    const result = extractOfficeText(
      docx(body, { "docProps/app.xml": "<Properties><Pages>25</Pages></Properties>" }),
      DOCX,
    );
    expect(DOCX_CHARS_PER_PAGE).toBe(2_200);
    expect(result.pages.length).toBeGreaterThanOrEqual(25);
    expect(expandDocxPages(["a\nb", "c"], 4).length).toBeGreaterThanOrEqual(3);
  });

  it("stilinde ya da paragrafında 'sayfa öncesi kes' olan paragraf yeni sayfa açar", () => {
    const styles =
      '<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:pPr><w:pageBreakBefore/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:pPr/></w:style></w:styles>';
    const result = extractOfficeText(
      docx(
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bölüm 1</w:t></w:r></w:p>' +
          para("metin") +
          '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bölüm 2</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Bölüm 3</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>devam</w:t></w:r></w:p>',
        { "word/styles.xml": styles },
      ),
      DOCX,
    );
    expect(result.pages).toEqual(["Bölüm 1\nmetin", "Bölüm 2", "Bölüm 3\ndevam"]);
  });

  it("sınav setindeki 6 sayfalık Word notu 6 sayfa okunur", () => {
    const file = readFileSync("tests/fixtures/sinav-seti/Homeostazi-Son-Tekrar-Notu.docx");
    const result = extractOfficeText(file, DOCX);
    expect(result.pages).toHaveLength(6);
    expect(result.pages[1]).toContain("ANP");
    expect(result.pages[5]).toContain("25 Günlük Çalışma Planı");
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

describe("gömülü resimler", () => {
  const png = new Uint8Array(OFFICE_IMAGE_MIN_BYTES + 8);
  png.set([0x89, 0x50, 0x4e, 0x47]);

  it("pptx slayt ilişkisinden resmi sayfaya bağlar", () => {
    const result = extractOfficePackage(
      Buffer.from(
        zipSync({
          "ppt/slides/slide1.xml": strToU8(
            `<?xml version="1.0"?><p:sld><a:p><a:r><a:t>Grafik</a:t></a:r></a:p><a:blip r:embed="rId2"/></p:sld>`,
          ),
          "ppt/slides/_rels/slide1.xml.rels": strToU8(
            `<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
          ),
          "ppt/slides/slide2.xml": strToU8(`<?xml version="1.0"?><p:sld><a:blip r:embed="rId1"/></p:sld>`),
          "ppt/slides/_rels/slide2.xml.rels": strToU8(
            `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo.jpeg"/></Relationships>`,
          ),
          "ppt/media/image1.png": png,
          "ppt/media/photo.jpeg": png,
        }),
      ),
      PPTX,
    );
    expect(result.ok).toBe(true);
    expect(result.pages).toEqual(["Grafik", ""]);
    expect(result.images.map((image) => [image.pageIndex, image.name, image.mimeType])).toEqual([
      [0, "ppt/media/image1.png", "image/png"],
      [1, "ppt/media/photo.jpeg", "image/jpeg"],
    ]);
  });

  it("docx sayfa kırığından sonraki resmi ikinci sayfaya yazar", () => {
    const result = extractOfficePackage(
      Buffer.from(
        zipSync({
          "word/document.xml": strToU8(
            `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Birinci</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>İkinci</w:t></w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:p></w:body></w:document>`,
          ),
          "word/_rels/document.xml.rels": strToU8(
            `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`,
          ),
          "word/media/image1.png": png,
        }),
      ),
      DOCX,
    );
    expect(result.pages[0]).toContain("Birinci");
    expect(result.pages[1]).toContain("İkinci");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.pageIndex).toBe(1);
    expect(result.images[0]?.name).toBe("word/media/image1.png");
  });

  it("1 KB altındaki simgeyi listeye almaz", () => {
    const result = extractOfficePackage(
      Buffer.from(
        zipSync({
          "word/document.xml": strToU8(
            `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Kısa metin</w:t></w:r><a:blip r:embed="rId1"/></w:p></w:body></w:document>`,
          ),
          "word/_rels/document.xml.rels": strToU8(
            `<Relationships><Relationship Id="rId1" Target="media/icon.png"/></Relationships>`,
          ),
          "word/media/icon.png": new Uint8Array(32),
        }),
      ),
      DOCX,
    );
    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(0);
    expect(result.pages[0]).toBe("Kısa metin");
  });

  it("ilişki hedefini parçanın klasöründen çözer", () => {
    expect(resolveOfficeTarget("ppt/slides/_rels/slide1.xml.rels", "../media/image1.png")).toBe(
      "ppt/media/image1.png",
    );
    expect(resolveOfficeTarget("word/_rels/document.xml.rels", "media/image1.png")).toBe(
      "word/media/image1.png",
    );
  });

  it("boş şekil okuması sayfaya mazeret yazmaz", () => {
    expect(figureTranscript("Şekil burada görünmediği için belirlenemez.")).toBeNull();
    expect(figureTranscript("[METIN_YOK]")).toBeNull();
    expect(figureTranscript("g(4) = -2\n1 → b")).toContain("g(4) = -2");
    const appended = appendFigureTranscript("Grafik", "g(4) = -2\n1 → b");
    expect(appended).toContain("Şekilde işaretli değerler:");
    expect(appended).toContain("g(4) = -2");
    expect(appended).toContain("1 → b");
    expect(appendFigureTranscript("Grafik", null)).toBe("Grafik");
  });

  it("şekil okuması slaydın metnini tekrarlıyorsa o satırlar eke girmez (29 Ekim 2026)", () => {
    const slide = "Fonksiyon Grafikleri\nf ve g fonksiyonlarının grafiği aşağıdadır.";
    expect(figureTranscript("Fonksiyon Grafikleri\nf ve g fonksiyonlarının grafiği aşağıdadır.", { textLayer: slide })).toBeNull();
    expect(figureTranscript("FONKSİYON GRAFİKLERİ\ng(4) = -2\n1 → b", { textLayer: slide })).toBe("g(4) = -2\n1 → b");
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
    "src/components/parity/exam-create-wizard.tsx",
  ])("%s .docx ve .pptx seçtiriyor", (file) => {
    const source = readFileSync(file, "utf8");
    // Seçici türleri tek kaynaktan (20 Ekim 2026): upload-accept.ts.
    expect(source).toContain("accept={DOCUMENT_UPLOAD_ACCEPT}");
    const accept = readFileSync("src/lib/documents/upload-accept.ts", "utf8");
    expect(accept).toContain('".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"');
    expect(accept).toContain('".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"');
    expect(source).toContain("DOCUMENT_UPLOAD_HINT");
  });

  it("yükleme cümlesi Word ve PowerPoint diyor", () => {
    const labels = readFileSync("src/lib/documents/upload-labels.ts", "utf8");
    expect(labels).toContain("Word (.docx)");
    expect(labels).toContain("PowerPoint (.pptx)");
    expect(labels).toContain("TXT");
    expect(labels).toContain("görsel");
  });

  /* Metin kotasız kalır. Gömülü resim taranmış sayfa gibi tek tek hak ister. */
  it("boru hattı gömülü resmi kota ile okur", () => {
    const source = readFileSync("src/lib/rag/pipeline.ts", "utf8");
    const start = source.indexOf("} else if (isOfficeDocument(doc.mime_type)) {");
    const end = source.search(/\}\s*else\s*\{\s*let extracted;/);
    const branch = source.slice(start, end);
    expect(branch).toContain("extractOfficePackage(buffer, doc.mime_type)");
    expect(branch).toContain("attachOfficeFigures");
    expect(branch).toContain("claim(1)");
    expect(source).toContain('scannedPages: claimedPages');
  });
});
