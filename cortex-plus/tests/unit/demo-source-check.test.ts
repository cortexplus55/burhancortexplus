import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_PDF_BYTES,
  DEMO_PDF_NAME,
  DEMO_PDF_SHA256,
  looksLikePdf,
  sha256Hex,
  verdictFor,
  type DroppedFile,
} from "@/lib/demo/source-check";
import { loadDemoLesson } from "@/lib/demo/lesson";
import { chunkText } from "@/lib/rag/chunk";

const PDF_PATH = path.resolve(
  __dirname,
  "../../public/ornek/fotosentez-ders-notu.pdf",
);

function dropped(over: Partial<DroppedFile> = {}): DroppedFile {
  return {
    name: DEMO_PDF_NAME,
    type: "application/pdf",
    size: DEMO_PDF_BYTES,
    sha256: DEMO_PDF_SHA256,
    ...over,
  };
}

/*
  Bekçi: sabitler örnek PDF'in kendisinden geliyor.

  Örnek not değiştirilir de bu dosya güncellenmezse ziyaretçi doğru dosyayı
  indirip bıraktığı hâlde "bizim notumuz değil" uyarısı alır — yani akış ilk
  adımda kırılır ve bunu yalnızca canlıda deneyen fark eder. Test o yüzden
  diskteki dosyayı okuyup karşılaştırıyor.
*/
describe("örnek PDF sabitleri", () => {
  it("özet diskteki dosyayla aynı", () => {
    const hash = createHash("sha256").update(readFileSync(PDF_PATH)).digest("hex");
    expect(hash).toBe(DEMO_PDF_SHA256);
  });

  it("boyut diskteki dosyayla aynı", () => {
    expect(statSync(PDF_PATH).size).toBe(DEMO_PDF_BYTES);
  });

  it("sha256Hex üretimdekiyle aynı özeti veriyor", async () => {
    const bytes = readFileSync(PDF_PATH);
    const view = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    await expect(sha256Hex(view as ArrayBuffer)).resolves.toBe(DEMO_PDF_SHA256);
  });
});

describe("verdictFor", () => {
  it("özet tutuyorsa bizim notumuz", () => {
    expect(verdictFor(dropped())).toBe("match");
  });

  it("özet büyük harfle gelse de tanıyor", () => {
    expect(verdictFor(dropped({ sha256: DEMO_PDF_SHA256.toUpperCase() }))).toBe(
      "match",
    );
  });

  it("adı bizimkiyle aynı olan başka bir PDF'i kabul etmiyor", () => {
    expect(verdictFor(dropped({ sha256: "f".repeat(64) }))).toBe("other-pdf");
  });

  it("başka bir PDF'i PDF olarak ayırıyor", () => {
    expect(
      verdictFor({
        name: "kendi-notum.pdf",
        type: "application/pdf",
        size: 40_000,
        sha256: "a".repeat(64),
      }),
    ).toBe("other-pdf");
  });

  it("PDF olmayanı ayrı söylüyor", () => {
    expect(
      verdictFor({
        name: "ekran-goruntusu.png",
        type: "image/png",
        size: 9_000,
        sha256: "b".repeat(64),
      }),
    ).toBe("not-pdf");
  });

  describe("özet hesaplanamadığında", () => {
    it("ad ve boyut tutuyorsa kabul ediyor", () => {
      expect(verdictFor(dropped({ sha256: null }))).toBe("match");
    });

    it("boyut tutmuyorsa kabul etmiyor", () => {
      expect(verdictFor(dropped({ sha256: null, size: 5_000 }))).toBe("other-pdf");
    });

    it("ad tutmuyorsa kabul etmiyor", () => {
      expect(verdictFor(dropped({ sha256: null, name: "baska.pdf" }))).toBe(
        "other-pdf",
      );
    });
  });
});

describe("looksLikePdf", () => {
  it("tür boş gelse de uzantıya bakıyor", () => {
    // Sürükle-bırakta bazı tarayıcılar type'ı boş veriyor.
    expect(looksLikePdf({ name: "not.PDF", type: "" })).toBe(true);
  });

  it("pdf olmayanı ayırıyor", () => {
    expect(looksLikePdf({ name: "not.docx", type: "" })).toBe(false);
  });
});

/*
  Ekranda gösterilen hat sayıları uydurulmuyor: parça sayısı üretimin kendi
  `chunkText`inden, ötekiler örnek verinin kendisinden geliyor. Bu test
  bağlantının kopmadığını tutuyor — kopsa ziyaretçiye yanlış sayı gösterilir.
*/
describe("örnek hat sayıları", () => {
  it("gerçek parçalayıcıdan ve örnek verinin kendisinden geliyor", async () => {
    const lesson = await loadDemoLesson();

    expect(lesson.pipeline.characters).toBe(lesson.sourceText.length);
    expect(lesson.pipeline.chunks).toBe(chunkText(lesson.sourceText).length);
    expect(lesson.pipeline.topics).toBe(lesson.topics.length);
    expect(lesson.pipeline.pages).toBeGreaterThan(0);
  });
});

/*
  Bekçi: örnek sayfası statik üretilmemeli.

  Sayfa podcast seslerine bir saatlik imzalı URL çıkarıyor. Statik üretimde o
  imzalar derleme anında damgalanıyor ve dağıtımdan bir saat sonra oynatıcı
  susuyor — sonraki dağıtıma kadar. Derleme de testler de bunu görmüyor,
  görmek için bir saat beklemek gerekiyor. Bu yüzden yazılı duruyor.
*/
describe("/ornek üretim kipi", () => {
  it("force-dynamic bildiriyor", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/app/ornek/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
