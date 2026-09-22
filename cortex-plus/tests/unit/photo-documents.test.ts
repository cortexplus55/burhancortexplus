import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/*
  Öğrenci belgesini fotoğraf olarak da yüklüyor — `document-upload`, telefon
  yüklemesi, sohbet ve deneme sihirbazı `image/*` kabul ediyor. Okuma tarafı
  ise yalnızca PDF ve TXT biliyordu: yüklenen her fotoğraf işleme adımında
  "Bu dosyadan metin çıkarılamadı" ile düşüyordu. Yükleme çalışıyor, okuma
  hiç çalışmıyordu.

  Bu dosya, düzeltmenin dört kırılgan yerini tutuyor:

  1. ÖNCE UCUZ MODEL. Pahalıya ancak ucuzu okuyamadığında çıkılmalı.
  2. OKUNAMAYAN FOTOĞRAF KOTA YAKMAMALI — hak geri verilmeli.
  3. Kotası dolmuş bir PLUS ABONESİNE kredi satılmamalı; kredi bu sorunu
     çözmüyor.
  4. Model metni ÇÖZMEMELİ, aktarmalı. Çözerse öğrencinin not defterine
     sorunun cevabını yazmış oluruz.
*/

process.env.OPENAI_API_KEY = "test-key";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  moderate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock("@/lib/ai/moderation", () => ({ moderate: mocks.moderate }));

const { extractImageText, isImageDocument } = await import(
  "@/lib/documents/extract-image-text"
);
const { PHOTO_PAGE_LIMITS, photoPageLimit, planTier } = await import(
  "@/lib/documents/photo-quota"
);
const { isPhotoQuotaError, PHOTO_QUOTA_CODE } = await import(
  "@/lib/documents/process-errors"
);

const LONG = "Bir üçgenin iç açıları toplamı 180 derecedir. Kanıtı şöyledir:";
const reply = (content: string, tokensIn = 900, tokensOut = 40) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
});

const photo = () => Buffer.from("fake-jpeg-bytes");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.moderate.mockResolvedValue({ action: "allow", categories: [] });
});

describe("hangi belge fotoğraf", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("%s fotoğraf", (mime) => {
    expect(isImageDocument(mime)).toBe(true);
  });

  it.each(["application/pdf", "text/plain", "", null, undefined])(
    "%s fotoğraf değil",
    (mime) => {
      expect(isImageDocument(mime as string | null)).toBe(false);
    },
  );
});

describe("kademeli okuma", () => {
  /* Düzgün çekilmiş bir ders notunu ucuz model de okuyor; gpt-4o 1.000 jeton
     başına ~17 kat pahalı. Pahalıya her fotoğrafta çıkmak, kademeyi anlamsız
     kılardı. */
  it("ucuz model okuduysa pahalıya hiç çıkmıyor", async () => {
    mocks.create.mockResolvedValueOnce(reply(LONG));
    const result = await extractImageText(photo(), "image/jpeg");

    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([LONG]);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("ucuz model okuyamazsa pahalıya çıkıyor", async () => {
    mocks.create
      .mockResolvedValueOnce(reply("[METIN_YOK]"))
      .mockResolvedValueOnce(reply(LONG));

    const result = await extractImageText(photo(), "image/jpeg");
    expect(result.ok).toBe(true);
    expect(result.model).toBe("gpt-4o");
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0][0].model).toBe("gpt-4o-mini");
    expect(mocks.create.mock.calls[1][0].model).toBe("gpt-4o");
  });

  /* Tek kelimelik bir cevap ya da modelin özrü, gömülüp aranabilir hâle
     geldiğinde öğrenciye "belge" diye dönerdi. */
  it("çok kısa çıktıyı okuma saymıyor", async () => {
    mocks.create
      .mockResolvedValueOnce(reply("Matematik"))
      .mockResolvedValueOnce(reply("Matematik"));

    const result = await extractImageText(photo(), "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unreadable");
  });

  /* Kademenin gerçek bedeli iki çağrının toplamı; yalnızca başarılı olanı
     kaydetmek kademeyi savunan kararı yanlış sayıya dayandırırdı. */
  it("başarısız denemenin jetonları da sayılıyor", async () => {
    mocks.create
      .mockResolvedValueOnce(reply("[METIN_YOK]", 900, 10))
      .mockResolvedValueOnce(reply(LONG, 900, 60));

    const result = await extractImageText(photo(), "image/jpeg");
    expect(result.tokensIn).toBe(1800);
    expect(result.tokensOut).toBe(70);
  });

  it("sağlayıcı hatası okuma sayılmıyor", async () => {
    mocks.create.mockRejectedValue(new Error("boom"));
    const result = await extractImageText(photo(), "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.tokensIn).toBe(0);
  });

  it("çok büyük fotoğrafta hiç çağrı yapmıyor", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    const result = await extractImageText(huge, "image/jpeg");
    expect(result.reason).toBe("too_large");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.moderate).not.toHaveBeenCalled();
  });

  /* Buraya yüklenen şeyin ders notu olduğunu varsayamayız; kamera açılan her
     yerden her şey gelebilir. */
  it("denetimden geçmeyen görsel modele hiç gitmiyor", async () => {
    mocks.moderate.mockResolvedValue({ action: "block", categories: ["x"] });
    const result = await extractImageText(photo(), "image/jpeg");
    expect(result.reason).toBe("blocked");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  /* Çözersek öğrencinin not defterine sorunun cevabını yazmış oluruz ve
     öğrenci hiç düşünmez. */
  it("istem çözmeyi değil aktarmayı istiyor", async () => {
    mocks.create.mockResolvedValueOnce(reply(LONG));
    await extractImageText(photo(), "image/jpeg");

    const prompt = mocks.create.mock.calls[0][0].messages[0].content[0].text;
    expect(prompt).toContain("Soruyu ÇÖZME");
    expect(prompt).toContain("olduğu gibi yaz");
  });
});

describe("fotoğraf sayfası kotası", () => {
  it("kademelere göre aylık haklar", () => {
    expect(PHOTO_PAGE_LIMITS).toEqual({ free: 2, plus: 300, sigma: 1000 });
    expect(photoPageLimit("free")).toBe(2);
  });

  const subscription = (row: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }),
          }),
        }),
      }),
    }) as any;

  it("aboneliği olmayan ücretsiz", async () => {
    expect(await planTier(subscription(null), "u")).toBe("free");
  });

  it("sigma kendi kotasını alıyor", async () => {
    const tier = await planTier(
      subscription({
        status: "active",
        plans: { is_premium: true, tier: "sigma" },
      }),
      "u",
    );
    expect(tier).toBe("sigma");
  });

  /* Abone olduğu kesin olan bir öğrenciyi ücretsiz kotaya düşürmek, ödediği
     şeyi geri almak olurdu. */
  it("tanınmayan kademe Plus sayılıyor", async () => {
    const tier = await planTier(
      subscription({
        status: "active",
        plans: { is_premium: true, tier: "yeni-paket" },
      }),
      "u",
    );
    expect(tier).toBe("plus");
  });

  it("süresi geçmiş abonelik ücretsiz", async () => {
    const tier = await planTier(
      subscription({
        status: "active",
        current_period_end: "2020-01-01T00:00:00Z",
        plans: { is_premium: true, tier: "plus" },
      }),
      "u",
    );
    expect(tier).toBe("free");
  });
});

describe("migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20260918120000_photo_pages.sql",
    "utf8",
  );

  it("sayaç tablosu istemciye kapalı", () => {
    expect(sql).toContain(
      "ALTER TABLE public.document_page_grants ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*document_page_grants/);
  });

  /* Kilitsiz "oku sonra yaz", yan yana gelen iki yüklemede kotayı aşardı. */
  it("satırı kilitleyerek sayıyor", () => {
    expect(sql).toMatch(
      /SELECT \* INTO v_row FROM public\.document_page_grants\s*\n\s*WHERE user_id = p_user_id FOR UPDATE/,
    );
  });

  /* 2 hakkı kalan öğrenci 3 sayfa isteyip reddedilirse, kalan 2 hakkı da
     yanmamalı. */
  it("reddedilen istek sayacı artırmıyor", () => {
    expect(sql).toMatch(/IF v_used \+ p_pages > p_limit THEN[\s\S]*SET used = v_used,/);
  });

  /* Ay dönmüşse geçen ayın başarısız denemesi bu ayın hakkını şişirmemeli. */
  it("iade yalnızca aynı dönemde", () => {
    expect(sql).toMatch(
      /release_document_pages[\s\S]*SET used = GREATEST\(used - p_pages, 0\)[\s\S]*AND period_start = v_period/,
    );
  });

  it("SECURITY DEFINER fonksiyonların arama yolu ve yetkileri sabit", () => {
    for (const signature of [
      "public.claim_document_pages(uuid, integer, integer)",
      "public.release_document_pages(uuid, integer)",
    ]) {
      expect(sql).toContain(
        `ALTER FUNCTION ${signature} SET search_path = public, pg_temp;`,
      );
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`,
      );
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`,
      );
    }
  });
});

describe("işleme ucu", () => {
  const source = readFileSync("src/app/api/documents/process/route.ts", "utf8");

  /* Kota 18 Eylül akşamı boru hattına taşındı: bir belgenin kaç fotoğraf
     sayfası yakacağını ancak orada biliyoruz. Taranmış bir PDF'in metin
     katmanı olmadığı açılmadan belli olmuyor; uçta tahmin etmek ya taranmış
     PDF'i bedavaya geçirirdi ya da metin katmanlı bir PDF'ten haksız yere
     kota keserdi. */
  it("kota mantığını kendisi taşımıyor", () => {
    expect(source).not.toContain("claimPhotoPages(");
    expect(source).not.toContain("releasePhotoPages(");
  });

  /* Kredi satın almak kota sorununu çözmüyor; istemci bunu `code` alanından
     ayırıp kredi kapısını açmıyor. */
  it("kota dolduğunda krediyi iade edip ayrı kod dönüyor", () => {
    const block = source.slice(
      source.indexOf("if (!result.ok) {"),
      source.indexOf("return NextResponse.json({\n    documentId"),
    );
    expect(block).toContain("refundCredits(");
    expect(block).toContain('result.error === "photo_quota_exhausted"');
    expect(block).toContain("code: PHOTO_QUOTA_CODE");
  });

  /* "Metin katmanı olan bir PDF deneyin" öğüdü, telefonundan ders notu çeken
     ya da taranmış bir kitap yükleyen öğrenciye ne yaptığımızı yanlış
     anladığımızı söylerdi. */
  it("fotoğrafın ve taramanın kendi hata cümleleri var", () => {
    expect(source).toContain("image_unreadable");
    expect(source).toContain("image_too_large");
    expect(source).toContain("image_blocked");
    expect(source).toContain("scan_unreadable");
    expect(source).toMatch(/Fotoğraftaki yazı okunamadı/);
    expect(source).toMatch(/Taranmış sayfalardaki yazı okunamadı/);
  });

  /* Uzun bir tarama kesildiyse öğrenci belgenin tamamının okunduğunu sanıp
     eksik kaynakla çalışmamalı. */
  it("kesilen belgeyi istemciye bildiriyor", () => {
    expect(source).toContain("notice: result.notice ?? null");
  });
});

describe("kotası dolan aboneye kredi satılmıyor", () => {
  it("kod gövdede taşınıyor", () => {
    expect(PHOTO_QUOTA_CODE).toBe("photo_quota_exhausted");
    expect(isPhotoQuotaError({ code: PHOTO_QUOTA_CODE })).toBe(true);
    expect(isPhotoQuotaError({ code: "insufficient_credits" })).toBe(false);
    expect(isPhotoQuotaError(null)).toBe(false);
  });

  it.each([
    "src/components/documents/document-upload.tsx",
    "src/components/parity/exam-create-wizard.tsx",
  ])("%s kredi kapısını açmadan önce koda bakıyor", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("isPhotoQuotaError(processed)");
    expect(source.indexOf("isPhotoQuotaError(processed)")).toBeLessThan(
      source.indexOf("setPaywall(true)"),
    );
  });
});

describe("boru hattı", () => {
  const source = readFileSync("src/lib/rag/pipeline.ts", "utf8");

  it("fotoğrafta extractText'e hiç gitmiyor", () => {
    expect(source).toMatch(/if \(isImageDocument\(doc\.mime_type\)\) \{/);
  });

  /* Sesin maliyeti yıllarca hiçbir yere yazılmamıştı; aynı hatayı burada
     tekrarlamayalım. Okunamayan denemenin faturası da bize geliyor. */
  it("okuma maliyetini kaydediyor", () => {
    expect(source).toContain('actionCode: "DOCUMENT_PAGE_PROCESS"');
    expect(source).toMatch(/recordVision\(read\.tokensIn, read\.tokensOut/);
  });

  /* Kota okumadan ÖNCE alınmalı: sonra alınsaydı kotası dolmuş bir hesap
     önce okunur, sonra reddedilirdi — bedava iş. */
  it("fotoğrafta okumadan önce kota alıyor", () => {
    expect(source.indexOf("await claim(1)")).toBeLessThan(
      source.indexOf("await extractImageText(buffer"),
    );
  });

  /* Çizim bize hiçbir şeye mal olmuyor (model çağrısı yok), o yüzden kota
     çizimden SONRA isteniyor — kaç sayfa okunacağını ancak o zaman biliyoruz
     ve öğrenci gerçekten okunacak sayfa kadar ödüyor. */
  it("taramada çizimden sonra, okumadan önce kota alıyor", () => {
    const render = source.indexOf("await renderPdfPages(buffer)");
    const claim = source.indexOf("await claim(rendered.pages.length)");
    const read = source.indexOf("await extractImagePages(rendered.pages)");
    expect(render).toBeLessThan(claim);
    expect(claim).toBeLessThan(read);
  });

  /* Okunamayan sayfa kota yakmamalı — taranmış bir kitabın boş arka yüzü
     için öğrenciden hak kesmek yanlış olurdu. */
  it("okunamayan tarama sayfalarının hakkını geri veriyor", () => {
    expect(source).toContain("const unread = rendered.pages.length - read.readCount");
    expect(source).toContain("await releasePhotoPages(service, userId, unread)");
  });

  /* Kota alındıktan sonraki HER düşüş iade etmeli; düz `fail()` çağrısı
     öğrencinin hakkını yakar. */
  it("kota alındıktan sonraki düşüşler iade ediyor", () => {
    for (const code of [
      "image_blocked",
      "image_unreadable",
      "scan_unreadable",
      "empty_content",
      "page_insert_failed",
      "chunk_insert_failed",
    ]) {
      expect(source).toContain(`failAndRelease("${code}")`);
    }
  });

  /* Boş sayfa gömülürse alakasız sorularda bağlam diye geri gelirdi. */
  it("boş tarama sayfalarını kaydetmiyor", () => {
    expect(source).toContain("read.pages.filter((page) => page.trim().length > 0)");
  });
});
