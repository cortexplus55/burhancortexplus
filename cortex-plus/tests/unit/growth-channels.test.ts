import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  Büyüme kanalları: ikisi de ÜRÜNDE VARDI, görünmüyordu.

  Davet sistemi kurulu (çarpanlar veritabanından, üç davete kadar sayıyor) ve
  kartı da yazılmış — ama yalnızca /krediler, /profil ve /davet sayfalarında.
  Üçü de öğrencinin BİLEREK gittiği yerler. "Daha fazla hak istiyorum"
  düşüncesi oralarda değil, hakkın dolduğu anda doğuyor.

  Sınıf katılım kodu da vardı: başlığın altında düz metin, "12 üye · kod
  ABC123". Otuz kişilik sınıfı çağırmanın tek yolu kodu tek tek okutmaktı.

  Bu testler ikisinin de doğru yerde durduğunu tutuyor.
*/

const visible = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("davet, kredi duvarında görünüyor", () => {
  const sheet = readFileSync("src/components/paywall/upgrade-sheet.tsx", "utf8");

  it("kapı davet sayfasına yol veriyor", () => {
    expect(visible(sheet)).toContain('href="/davet"');
  });

  it("üç yol da duruyor: öde, davet et, bekle", () => {
    const body = visible(sheet);
    expect(body).toContain("ug-cta");
    expect(body).toContain("ug-invite");
    expect(body).toContain("resetHint");
  });

  /*
    Çarpanın kaç olduğu yazılmıyor: sayı veritabanından geliyor, değişebiliyor
    ve kabuk bağlamında taşınmıyor. Sabit bir sayı yazmak, ayarı değiştiren
    ilk kişide yalan olur.
  */
  it("kapıda sabit çarpan sayısı vaat edilmiyor", () => {
    const invite = visible(sheet).slice(visible(sheet).indexOf("ug-invite"));
    expect(invite.slice(0, 300)).not.toMatch(/\d+\s*kat[ıi]na/);
  });
});

describe("sınıf daveti bağlantıyla çalışıyor", () => {
  const card = readFileSync("src/components/parity/class-invite.tsx", "utf8");
  const page = readFileSync("src/app/siniflar/page.tsx", "utf8");
  const detail = readFileSync("src/app/siniflar/[id]/page.tsx", "utf8");
  const form = readFileSync("src/components/student/join-class-form.tsx", "utf8");

  it("hazır mesaj bağlantı ve kodu birlikte taşıyor", () => {
    expect(card).toContain("const message =");
    expect(card).toContain("${url}");
    expect(card).toContain("${code}");
  });

  it("davet bağlantısı katılım sayfasına gidiyor", () => {
    expect(detail).toContain("/siniflar?kod=");
  });

  it("bağlantıdaki kod forma kendiliğinden doluyor", () => {
    expect(page).toContain("codeFromQuery");
    expect(page).toContain("initialCode={initialCode}");
    expect(form).toContain("initialCode");
  });

  /*
    AGENTS.md: bu projede Suspense sınırı sayfayı boşaltıyor ve
    `useSearchParams()` kullanan istemci bileşeni sınır gerektiriyor. Kod
    sunucudan prop olarak geçiyor.
  */
  it("kod useSearchParams ile okunmuyor", () => {
    // Yorum, gerekçeyi anlatmak için adı anıyor; aranan şey çağrı.
    expect(visible(form)).not.toContain("useSearchParams");
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("kod sınırlanıp normalleştiriliyor", () => {
    const fn = page.slice(page.indexOf("function codeFromQuery"));
    expect(fn.slice(0, 400)).toContain("slice(0, 12)");
    expect(fn.slice(0, 400)).toContain("toUpperCase()");
  });

  /* Katılım kodu dış servise gitmemeli. */
  it("QR sunucuda üretiliyor", () => {
    expect(detail).toContain("qrDataUri");
    expect(card).not.toContain("qrserver.com");
  });

  it("davet kartı yalnızca sınıf sahibine görünüyor", () => {
    const block = detail.slice(detail.indexOf("<ClassInvite") - 200);
    expect(block.slice(0, 260)).toContain("access.isOwner");
  });

  it("bağlantı ve QR sahibi olmayan için hiç üretilmiyor", () => {
    const block = detail.slice(detail.indexOf("const inviteUrl"));
    expect(block.slice(0, 300)).toContain("access.isOwner");
  });
});
