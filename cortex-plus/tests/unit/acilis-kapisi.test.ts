import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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
