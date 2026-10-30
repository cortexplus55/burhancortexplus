import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  PHOTO_SET_MIN_PHOTOS,
  buildPhotoSetPdf,
  photoPageSize,
  photoSetName,
  splitPhotoSet,
  type PhotoPage,
} from "@/lib/documents/photo-set-pdf";
import { isPhotoSetPdf, photoSetPages, photoSetRenderedPages } from "@/lib/documents/photo-set-read";
import {
  FAST_START_MIN_PHOTOS,
  FAST_START_PAGES,
  buildPhotoSet,
  fastStartCut,
  splitSelection,
  type PhotoSetPart,
} from "@/lib/documents/photo-set-client";
import { extractText } from "@/lib/documents/extract-text";
import { renderPdfPages } from "@/lib/documents/render-pdf-pages";
import { pendingProgress, pendingReadingLine } from "@/lib/learning/pending-materials-copy";
import { photoSetProgressLine } from "@/lib/learning/exam-wizard-copy";

/*
  Fotoğraf seti + hızlı başlatma (31 Ekim 2026, ürün sahibi: "100 fotoğraf = 100 ayrı dosya çöplüğü olmasın; öğrenci
  25-30 sn'de hazırlığa girsin, kalan sayfalar arkada işlensin; bütün dökümanlar için düşün").
  Canlı ölçüm (30 fotoğraf, 30 ayrı belge): okuma 43 sn, konu haritası ~150 sn (tek çağrı 9.500 jeton çıktı, normal
  işlem) — toplam ~3,5 dk.
*/

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function jpeg(width: number, height: number, shade = 200): PhotoPage {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";
  context.fillRect(10, 10, Math.max(4, width / 4), 6);
  return { jpeg: new Uint8Array(canvas.encodeSync("jpeg", 80)), width, height };
}

describe("fotoğraf seti PDF'i", () => {
  const pages = [jpeg(160, 120, 210), jpeg(90, 160, 180), jpeg(200, 200, 230)];
  const pdf = Buffer.from(buildPhotoSetPdf(pages, "Ders Notu Fotoğrafları (3 Sayfa)"));

  it("geçerli bir PDF: başlık, nesne ofsetleri, sayfa sayısı, A4 uzun kenarı", () => {
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Count 3");
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
    expect(photoPageSize(1600, 1200)).toEqual({ width: 842, height: 632 });
    expect(photoPageSize(900, 1600)).toEqual({ width: 474, height: 842 });
  });

  it("gerçek okuyucu (pdf.js) açar: metin katmanı boş, sayfa çizilir", async () => {
    const extracted = await extractText(pdf, "application/pdf", 1, 40);
    expect(extracted.total).toBe(3);
    expect(extracted.pages.every((page) => page.trim() === "")).toBe(true);
    const rendered = await renderPdfPages(pdf, 1, 2);
    expect(rendered.pages).toHaveLength(1);
    expect(rendered.pages[0]!.pageNumber).toBe(2);
  }, 30_000);

  it("sunucu gömülü JPEG'i bayt bayt aynı alır; aralık ve bozuk akış güvenli", () => {
    expect(isPhotoSetPdf(pdf)).toBe(true);
    const direct = photoSetPages(pdf);
    expect(direct.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    direct.forEach((page, index) => expect(Buffer.compare(page.jpeg, Buffer.from(pages[index]!.jpeg))).toBe(0));

    const window = photoSetRenderedPages(pdf, 2, 2);
    expect(window?.map((page) => page.pageNumber)).toEqual([2, 3]);
    expect(window?.every((page) => page.mime === "image/jpeg" && page.inkRatio === 1 && page.hasImageContent)).toBe(true);
    expect(photoSetRenderedPages(pdf, 3, 2)).toBeNull();

    // Kesik JPEG (FFD9 yok): çizime bırakılır.
    const broken = pages.map((page, index) =>
      index === 1 ? { ...page, jpeg: page.jpeg.subarray(0, page.jpeg.length - 2) } : page,
    );
    expect(photoSetRenderedPages(Buffer.from(buildPhotoSetPdf(broken, "x")), 1, 3)).toBeNull();
  });

  it("başka bir PDF fotoğraf seti sayılmaz", () => {
    const other = readFileSync(join(process.cwd(), "tests/fixtures/ccitt-scan-3page.pdf"));
    expect(isPhotoSetPdf(other)).toBe(false);
    expect(photoSetRenderedPages(other, 1, 3)).toBeNull();
  });

  it("ad ve boyut bölmesi", () => {
    expect(photoSetName({ from: 1, to: 30, total: 30 })).toBe("Ders Notu Fotoğrafları (30 Sayfa).pdf");
    expect(photoSetName({ from: 11, to: 100, total: 100 })).toBe("Ders Notu Fotoğrafları (Sayfa 11–100).pdf");
    const sized = [1, 2, 3, 4, 5].map(() => ({ jpeg: new Uint8Array(400) }));
    expect(splitPhotoSet(sized, 1_000).map((group) => group.length)).toEqual([1, 1, 1, 1, 1]);
    expect(splitPhotoSet(sized, 2_000).map((group) => group.length)).toEqual([2, 2, 1]);
  });
});

describe("tarayıcıdaki set kurucu", () => {
  const photo = (index: number) => new File([new Uint8Array([index])], `IMG_${String(index).padStart(3, "0")}.jpg`, { type: "image/jpeg" });
  const encodeOk = async () => jpeg(32, 24);

  it("seçim: tek fotoğraf sete girmez; fotoğraf ve belge ayrılır", () => {
    expect(PHOTO_SET_MIN_PHOTOS).toBe(2);
    const pdf = new File(["x"], "notlar.pdf", { type: "application/pdf" });
    expect(splitSelection([photo(1), pdf])).toEqual({ photos: [], others: [photo(1), pdf].map((file) => expect.objectContaining({ name: file.name })) });
    const picked = splitSelection([pdf, photo(1), photo(2), photo(3)]);
    expect(picked.photos.map((file) => file.name)).toEqual(["IMG_001.jpg", "IMG_002.jpg", "IMG_003.jpg"]);
    expect(picked.others.map((file) => file.name)).toEqual(["notlar.pdf"]);
  });

  it("hızlı başlatma: 30 fotoğrafta ilk 10 sayfa ayrı parça olarak ve hepsi küçültülmeden önce verilir", async () => {
    expect(fastStartCut(30, true)).toBe(FAST_START_PAGES);
    expect(fastStartCut(FAST_START_MIN_PHOTOS - 1, true)).toBeNull();
    expect(fastStartCut(100, false)).toBeNull();
    const photos = Array.from({ length: 30 }, (_, index) => photo(index + 1));
    let encoded = 0;
    const seen: { part: PhotoSetPart; encodedAt: number }[] = [];
    const result = await buildPhotoSet(photos, {
      fastStart: true,
      encode: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        encoded += 1;
        return encodeOk();
      },
      onPart: (part) => seen.push({ part, encodedAt: encoded }),
    });
    expect(result).toEqual({ leftovers: [], pages: 30 });
    expect(seen.map(({ part }) => part.file.name)).toEqual([
      "Ders Notu Fotoğrafları (Sayfa 1–10).pdf",
      "Ders Notu Fotoğrafları (Sayfa 11–30).pdf",
    ]);
    expect(seen[0]!.encodedAt).toBeLessThan(30);
    expect(seen.map(({ part }) => [part.from, part.to, part.pages])).toEqual([[1, 10, 10], [11, 30, 20]]);
    expect(seen.every(({ part }) => part.file.type === "application/pdf")).toBe(true);
    const first = Buffer.from(await seen[0]!.part.file.arrayBuffer());
    expect(isPhotoSetPdf(first)).toBe(true);
    expect(photoSetPages(first)).toHaveLength(10);
  });

  it("az fotoğrafta ya da hızlı başlatma kapalıyken tek belge \"(N Sayfa)\"", async () => {
    for (const [count, fastStart] of [[12, true], [30, false]] as const) {
      const parts: PhotoSetPart[] = [];
      await buildPhotoSet(Array.from({ length: count }, (_, index) => photo(index + 1)), {
        fastStart,
        encode: encodeOk,
        onPart: (part) => parts.push(part),
      });
      expect(parts.map((part) => part.file.name)).toEqual([`Ders Notu Fotoğrafları (${count} Sayfa).pdf`]);
    }
  });

  it("çözülemeyen fotoğraf sete girmez, tek dosya olarak döner; sayfa numaraları kesintisiz", async () => {
    const photos = Array.from({ length: 6 }, (_, index) => photo(index + 1));
    const parts: PhotoSetPart[] = [];
    const result = await buildPhotoSet(photos, {
      fastStart: true,
      encode: async (file) => (file.name === "IMG_003.jpg" ? null : encodeOk()),
      onPart: (part) => parts.push(part),
    });
    expect(result.leftovers.map((file) => file.name)).toEqual(["IMG_003.jpg"]);
    expect(parts.map((part) => part.file.name)).toEqual(["Ders Notu Fotoğrafları (5 Sayfa).pdf"]);

    // Sete en az iki sayfa giremiyorsa set kurulmaz; hepsi tek tek.
    const none: PhotoSetPart[] = [];
    const lone = await buildPhotoSet(photos.slice(0, 3), {
      fastStart: false,
      encode: async (file) => (file.name === "IMG_001.jpg" ? encodeOk() : null),
      onPart: (part) => none.push(part),
    });
    expect(none).toEqual([]);
    expect(lone.leftovers).toHaveLength(3);
  });
});

describe("sayaçlar", () => {
  it("fotoğraf seti satırı ve şeridin sayfa sayacı", () => {
    expect(photoSetProgressLine({ encoded: 42, total: 100, pagesRead: 0, reading: false })).toBe(
      "📸 Fotoğraflar sıkıştırılıyor ve yükleniyor: 42 / 100",
    );
    expect(photoSetProgressLine({ encoded: 100, total: 100, pagesRead: 34, reading: true })).toBe(
      "📸 100 fotoğraf tek belgede • Sayfalar okunuyor: 34 / 100",
    );
    expect(pendingProgress([{ pagesDone: 24, pageCount: 90 }, { pagesDone: null, pageCount: null }])).toEqual({ done: 24, total: 90 });
    expect(pendingReadingLine(34, 90)).toBe("Kalan sayfalar arka planda işleniyor (34/90)…");
    expect(pendingReadingLine(0, 0)).toBe("Kalan sayfalar arka planda işleniyor…");
  });
});

describe("bekleyen materyal göçü (gerçek PostgreSQL)", () => {
  const db = new PGlite();
  const prep = "22222222-2222-4222-8222-222222222222";
  const doc = "33333333-3333-4333-8333-333333333333";
  const user = "11111111-1111-4111-8111-111111111111";
  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.exam_preps(id uuid PRIMARY KEY);
      CREATE TABLE public.documents(id uuid PRIMARY KEY);
      INSERT INTO public.exam_preps VALUES ('${prep}');
      INSERT INTO public.documents VALUES ('${doc}');`);
    await db.exec(read("supabase/migrations/20261031130000_prep_pending_materials.sql"));
    // Yeniden uygulanabilir (IF NOT EXISTS).
    await db.exec(read("supabase/migrations/20261031130000_prep_pending_materials.sql"));
  }, 30_000);
  afterAll(() => db.close());

  it("satır tekil; hazırlık silinince gider; satır güvenliği açık, politika yok", async () => {
    await db.query(`INSERT INTO public.exam_prep_pending_materials (prep_id, document_id, user_id) VALUES ($1, $2, $3)`, [prep, doc, user]);
    await expect(
      db.query(`INSERT INTO public.exam_prep_pending_materials (prep_id, document_id, user_id) VALUES ($1, $2, $3)`, [prep, doc, user]),
    ).rejects.toThrow();
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'exam_prep_pending_materials'`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(true);
    const policies = await db.query(`SELECT 1 FROM pg_policies WHERE tablename = 'exam_prep_pending_materials'`);
    expect(policies.rows).toHaveLength(0);
    await db.query(`DELETE FROM public.exam_preps WHERE id = $1`, [prep]);
    const left = await db.query(`SELECT 1 FROM public.exam_prep_pending_materials`);
    expect(left.rows).toHaveLength(0);
  });
});

describe("bağlantılar (kaynak bekçisi)", () => {
  it("okuma hattı fotoğraf setini çizmeden okur, havuz tavandan başlar", () => {
    const ingestion = read("src/lib/documents/pdf-ingestion.ts");
    expect(ingestion).toContain("photoSetRenderedPages(buffer, firstPage, pages.length)");
    expect(ingestion).toContain("photoPages ? OCR_PAGE_CONCURRENCY : OCR_START_CONCURRENCY");
  });

  it("konu haritası yalnız kurulumda (prepId yok) ve hızlı işlem açıkken hızlı", () => {
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toContain("fast: Boolean(course) && !parsed.data.prepId && await fastAllowedFor(service, userId)");
    const generate = read("src/lib/ai/generate.ts");
    expect(generate.match(/\.\.\.tier,/g)).toHaveLength(2);
    expect(generate).toContain("model: billedModel(model, servedTier)");
    expect(read("src/lib/documents/outline-oneshot.ts")).toContain("fast: input.fast === true,");
  });

  it("kurulum haritanın belgeleriyle; yolda olanlar bekleyen olarak bağlanır, eklenince silinir", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("mappedIdsRef.current = ids;");
    expect(wizard).toContain("...(pendingDocumentIds.length ? { pendingDocumentIds } : {}),");
    expect(wizard).toContain("disabled={!documentIds.length || checkingMaterials}");
    expect(wizard).toContain("fastStart: paidUploads,");
    expect(read("src/app/api/learning/exam-prep/create/route.ts")).toContain("recordPendingMaterials(service, { prepId: result.prepId, userId, documentIds: pendingIds })");
    const addSource = read("src/app/api/learning/exam-prep/add-source/route.ts");
    expect(addSource.match(/clearPendingMaterials\(service, \{ prepId, userId, documentIds: requested \}\)/g)).toHaveLength(2);
    expect(read("src/lib/privacy/account-deletion.ts")).toContain(`"exam_prep_pending_materials"`);
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain("{pendingMaterials > 0 ? <PendingMaterialsBanner prepId={prepId} /> : null}");
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("pendingMaterials={await countPendingMaterials(service, { prepId, userId: user.id })}");
  });

  it("telefon büyük seti imzalı yüklemeyle gönderir; ödevde fotoğraflar tek tek", () => {
    const phone = read("src/components/parity/phone-upload-client.tsx");
    expect(phone).toContain("/api/uploads/phone/${token}/prepare");
    expect(phone).toContain("/api/uploads/phone/${token}/complete");
    expect(phone).toContain(`purpose === "hazirlik" ? splitSelection(files)`);
    expect(read("src/app/api/uploads/phone/[token]/complete/route.ts")).toContain("completeDocumentUpload(service, row.user_id");
    expect(read("src/app/api/documents/upload/complete/route.ts")).toContain("completeDocumentUpload(service, userId");
  });

  it("göç yalnız ekleme: DROP ya da politika yok", () => {
    const migration = read("supabase/migrations/20261031130000_prep_pending_materials.sql");
    expect(migration).not.toMatch(/DROP |CREATE POLICY/i);
  });
});
