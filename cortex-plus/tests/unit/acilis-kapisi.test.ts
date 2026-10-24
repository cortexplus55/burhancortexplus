import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

/*
  Açılış kapısının ölçülebilir şartlarını tek komutta sınayan betik.

  Bu projede iki kez "yazıldı ama yayında değil" hatası yaşandı: dört hukuki
  sayfa dalda kaldı, sonra göç dosyaları veritabanına uygulanmadı. İkisi de
  elle bakılsaydı görülecekti — bakılmadı. Betik o bakışı komuta çeviriyor.

  Testler betiği ÇALIŞTIRMIYOR (ağa çıkıyor); kapının şartlarıyla betiğin
  kontrol listesinin ayrışmadığını tutuyorlar.
*/

const script = readFileSync("scripts/acilis-kapisi.mjs", "utf8");

describe("kapı betiği", () => {
  /* Kapının en pahalı maddesi bu: eski üç argümanlı imza duruyorsa HER kredi
     ayırma isteği düşer — sohbet, quiz, deneme, belge işleme. */
  it("credit_reserve imzasını sınıyor", () => {
    expect(script).toContain('sb.rpc("credit_reserve"');
    expect(script).toContain("p_quantity: 1");
    expect(script).toMatch(/could not find the function\|PGRST202/i);
  });

  /* Kredi v3 (24 Ekim 2026): fonksiyon yoksa ücretsiz hesabın sayaçları sessizce çalışmaz. */
  it("credit_reserve_metered'ı da sınıyor", () => {
    expect(script).toContain('sb.rpc("credit_reserve_metered"');
    expect(script).toContain("p_meter: null");
  });

  /* 24 Ekim 2026: betik "deneme üretimi 5 kredi" diye 20260918100000'in fiyatında kalmıştı; 20261008120000
     15 yaptı ve her `--db` çalıştırması o satırda kırmızıydı. Fiyat artık kredi tablosundan okunuyor. */
  it("deneme fiyatını elle yazmıyor, kredi tablosundan okuyor", () => {
    expect(script).not.toContain("deneme üretimi 5 kredi");
    expect(script).not.toMatch(/credit_cost === \d/);
    expect(script).toContain('path.join(ROOT, "src", "lib", "credits", "price-table.ts")');
    expect(script).toContain('tablePrice("PRACTICE_EXAM_GENERATE")');
    // Betiğin kalıbı tablonun bugünkü yazımını tutuyor ve aynı sayıyı veriyor.
    const table = readFileSync("src/lib/credits/price-table.ts", "utf8");
    const pattern = script.match(/new RegExp\(`(.+?)`\)/)?.[1];
    expect(pattern).toBeTruthy();
    const source = pattern!.replace("${code}", "PRACTICE_EXAM_GENERATE").replace(/\\\\/g, "\\");
    const match = table.match(new RegExp(source));
    expect(Number(match?.[1])).toBe(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits);
    expect(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits).toBe(15);
  });

  /* Depo kökünden de çalışır (KREDI-SISTEMI.md (a): `node cortex-plus/scripts/acilis-kapisi.mjs --db`):
     .env.local ve kredi tablosu betiğin klasörüne göre bulunur. */
  it("uygulama klasörünü çalıştırılan yerden değil, betiğin yerinden buluyor", () => {
    expect(script).toContain("fileURLToPath(import.meta.url)");
    expect(script).not.toContain("const ROOT = process.cwd();");
  });

  /* Sorgu var olmayan bir kullanıcı için yapılıyor: kapı kontrolü gerçek bir
     cüzdana dokunmamalı. */
  it("gerçek bir cüzdana dokunmuyor", () => {
    expect(script).toContain("00000000-0000-0000-0000-000000000000");
  });

  /* 18 Eylül'de yaşandı: React `₺` ile sayı arasına yorum düğümü koyuyor,
     etiketleri ayıklamayan arama "göç uygulanmamış" diyor. */
  it("fiyatları ham HTML'de aramıyor", () => {
    expect(script).toContain("visibleText");
    expect(script).toMatch(/replace\(\/<\[\^>\]\+>\/g, ""\)/);
  });

  /* `NEXT_PUBLIC_*` değerleri JS paketine gömülüyor; ana sayfanın HTML'inde
     "posthog" aramak yanlış cevap verir. */
  it("PostHog anahtarını JS parçasında arıyor", () => {
    expect(script).toMatch(/_next\\\/static\\\/chunks/);
    expect(script).toContain("phc_");
  });

  /* Dört hukuki sayfa sitemap'te olmasa bile 404 vermemeli. */
  it("hukuki sayfaları sitemap'ten bağımsız sınıyor", () => {
    for (const page of ["/mesafeli-satis", "/on-bilgilendirme", "/iptal-iade", "/teslimat"]) {
      expect(script).toContain(`"${page}"`);
    }
  });

  /* Betik kapıyı AÇMIYOR: PayTR'nin canlı kipte olduğu ve gerçek kartla
     provanın yapıldığı dışarıdan ölçülemez. Sessizce geçmiş saymak, ürünü
     bedava dağıtmakla sonuçlanabilirdi. */
  it("ölçemediği maddeleri açıkça söylüyor", () => {
    expect(script).toContain("Panelden bakılması gerekenler");
    expect(script).toMatch(/canlı kipte/);
    expect(script).toMatch(/iade/);
  });

  it("ölçülemeyen madde geçmiş sayılmıyor", () => {
    // Yalnızca `failed` çıkış kodunu belirliyor; atlananlar ayrı sayılıyor.
    expect(script).toContain("if (failed) {");
    expect(script).toContain("process.exit(1)");
  });
});

describe("kontrol listesi göç dosyalarıyla güncel", () => {
  const migrations = readdirSync(
    path.join(process.cwd(), "supabase", "migrations"),
  ).filter((file) => file.endsWith(".sql"));

  /* Yeni bir göç dosyası eklenip betiğe kanıt nesnesi eklenmezse, kapı onu
     hiç sormaz ve "hepsi geçti" der. */
  it.each(
    migrations.filter((file) => file.startsWith("202609181")),
  )("%s betikte sorgulanıyor", (file) => {
    expect(script).toContain(file.slice(0, 14));
  });
});
