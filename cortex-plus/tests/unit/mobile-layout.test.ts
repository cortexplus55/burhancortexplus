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
