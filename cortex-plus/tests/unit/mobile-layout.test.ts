import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  Mobil düzenin kodda tutulabilen kısmı.

  Bu testlerin hepsi 17 Eylül 2026'da GERÇEK bir ölçümden geliyor:
  360px'lik telefonda öğrenci kabuğu 99px yatay taşıyordu ve taşma
  sayfadaki 33 öğeyi ekranın dışına çıkarıyordu. Telefonda görünen
  şey "içerik kenara yapışmış, üst üste binmiş, parçalar eksik"
  oluyordu. Sebebi tek bir satırdı.
*/

const shellCss = readFileSync("src/styles/parity-shell.css", "utf8");

function rule(css: string, selector: string): string {
  const i = css.indexOf(selector + " {");
  if (i < 0) throw new Error(`kural bulunamadı: ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

describe(".cp-page yatay taşmayı üretemez", () => {
  /*
    Grid'in `auto` kolonunun tabanı `min-content`: içerikte kırılamayan
    uzun bir dizi (uzun belge adı, bağlantı, konu başlığı) varsa kolon o
    dizinin genişliğine zorlanıyor ve sayfanın TAMAMI taşıyor. Ölçüm:
    360px ekranda kolon 438px çıkıyordu.
  */
  it("kolon minmax(0, …) ile tanımlı", () => {
    const r = rule(shellCss, ".cp-page");
    expect(r).toContain("grid-template-columns");
    expect(r).toContain("minmax(0");
  });

  it("uzun dizi satır atlayabiliyor", () => {
    // Kolon zorlanamıyorsa kelime kırılabilmeli; yoksa taşma içeriğe kayar.
    expect(shellCss).toContain("overflow-wrap: anywhere");
  });
});

describe("mobil önizleme üretimde erişilemez", () => {
  /*
    Önizleme, oturum gerektiren ekranların mobil düzenini ölçmek için var.
    Ürün yüzeyi değil: üretimde 404 döndürmesi şart. Kimlik doğrulama
    yoluna hiç dokunmuyor — bilerek, çünkü ölçüm kolaylığı için auth'a
    dev bayrağı eklemek ödeme alan bir uygulamada alınacak bir risk değil.
  */
  const page = readFileSync("src/app/(dev)/mobil-onizleme/page.tsx", "utf8");

  it("üretimde notFound() çağırıyor", () => {
    expect(page).toContain('process.env.NODE_ENV === "production"');
    expect(page).toContain("notFound()");
  });

  it("auth bypass içermiyor", () => {
    for (const forbidden of ["requireUser", "requireStudentArea", "auth.getUser", "createClient"]) {
      expect(page).not.toContain(forbidden);
    }
  });
});

/*
  iOS'ta girdi yakınlaştırması — CSS'ten tutuluyor, tarayıcıdan değil.

  Bu hata oturum gerektiren ekranların CSS'inde yaşıyordu
  (`.cs-sor-composer input` 15px, `.cp-field` 13px, `.tool-input` 15px …)
  ve o ekranlara e2e ile girilemiyor. Tarayıcı testi yalnızca `/giris`e
  bakabiliyor, orası ise zaten 16px'ti — yani hiç bozulmamış bir sayfayı
  koruyan bir bekçi. Asıl güvence CSS'i taramaktan geliyor.
*/
describe("dokunmatikte metin girdileri 16px'in altına düşmüyor", () => {
  const globals = readFileSync("src/app/globals.css", "utf8");

  it("platform kuralı yerinde", () => {
    const i = globals.indexOf("@media (pointer: coarse)");
    expect(i).toBeGreaterThan(-1);
    const block = globals.slice(i, i + 1200);
    expect(block).toContain("font-size: 16px !important");
    expect(block).toContain("textarea");
    expect(block).toContain("select");
  });

  it("dokunma hedefi asgarisi 44px", () => {
    const i = globals.indexOf("@media (pointer: coarse)");
    const block = globals.slice(i, i + 2600);
    expect(block).toContain("min-height: 44px");
    expect(block).toContain("min-width: 44px");
  });

  /*
    Kural `!important` ile yazılmış olmak zorunda: sınıf seçicileri
    eleman seçicisini yeniyor, yani `.tool-input { font-size: 0.9375rem }`
    aksi hâlde kazanır ve hata sessizce geri gelir.
  */
  it("kural sınıf seçicilerini yenebiliyor", () => {
    expect(globals).toMatch(/font-size:\s*16px\s*!important/);
  });
});

describe("iPhone güvenli alanı", () => {
  /*
    Sohbetin yazma alanı `position: fixed; bottom` ile duruyor. Çentikli
    iPhone'da alt güvenli alan ~34px; pay eklenmezse ürünün ana girdisi
    sistem gesture çubuğunun altına giriyor.
  */
  it("sohbet yazma alanı alt güvenli alanı hesaba katıyor", () => {
    const r = rule(shellCss, ".cp-sor-composer-zone");
    expect(r).toContain("env(safe-area-inset-bottom");
  });
});

describe("stüdyo giriş kolonu kenara yapışmıyor", () => {
  it(".ls-chat yatay boşluğa sahip", () => {
    const css = readFileSync("src/styles/learning-studio.css", "utf8");
    const i = css.indexOf(".ls-chat {");
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, css.indexOf("}", i))).toContain("padding-inline");
  });
});

describe("sohbet ekranı mobilde okunabiliyor", () => {
  /*
    Uzun dizi sohbette de kırılabilmeli. Ölçüm (Sor ekranı, 360px):
    mesaj balonundaki uzun kelime kutusundan 42px taşıyor, balon 331px
    kutusunda 359px içerik taşıyor ve mesaj listesi 417px'e ulaşıp yatay
    kaydırılabilir hâle geliyordu. Ekranda görünen şey kelimenin
    ortadan kesilmesiydi.

    `.cp-page` kuralı sohbeti kapsamıyor: sohbet o kapsayıcının içinde
    değil. Bu yüzden kural uygulama kabuğunun tamamına konuldu.
  */
  it("uygulama kabuğunda uzun dizi kırılabiliyor", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    const i = globals.indexOf(".cp-sor-root :where(");
    expect(i).toBeGreaterThan(-1);
    expect(globals.slice(i, globals.indexOf("}", i))).toContain("overflow-wrap: anywhere");
  });

  /*
    Yazma alanı telefonda kendi satırını alıyor. Ölçüm: dört düğme ve
    boşluklar ~250px yiyordu, metin alanına 108px kalıyordu ve yer
    tutucu 44px'lik kutuda ikinci satıra düşüp kesiliyordu. Düğmeleri
    küçültmek çözüm değil — 44px'e çıkarılmalarının sebebi parmakla
    isabet edilmemesiydi.
  */
  it("telefonda metin alanı kendi satırında", () => {
    const css = readFileSync("src/styles/parity-app.css", "utf8");
    const i = css.indexOf("@media (max-width: 480px)");
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i);
    expect(block).toContain("flex-wrap: wrap");
    expect(block).toContain("order: -1");
  });
});
