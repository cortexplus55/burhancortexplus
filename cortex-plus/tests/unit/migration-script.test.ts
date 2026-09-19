import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/*
  `apply-migrations.ps1` 19 Eylül 2026'da iki yerden bayatlamıştı ve ikisi de
  sessizce yanlış cevap veriyordu:

  1. SABİT bir dosya listesi tutuyordu. Liste 14-15 Eylül'ün dört dosyasında
     kalmış, sonraki beş dosyayı hiç bilmiyor ve artık var olmayan bir dal
     adına yönlendiriyordu. Kendini güncel tutmayan bir kontrol, kontrol
     değildir.
  2. Doğrulama adımı fiyat sayfasında "Ek Kredi" arıyordu. O kontrol 18
     Eylül'den beri HER ZAMAN başarısız: kredi paketleri artık vitrinde
     yalnızca aboneye görünüyor. Yanlış alarm veren bir doğrulama da
     doğrulama değildir.
*/

const script = readFileSync(
  path.join(process.cwd(), "..", "scripts", "apply-migrations.ps1"),
  "utf8",
);

describe("göç betiği kendini güncel tutuyor", () => {
  const migrations = readdirSync(
    path.join(process.cwd(), "supabase", "migrations"),
  ).filter((file) => file.endsWith(".sql"));

  /* Tek kaynak klasörün kendisi olmalı; betiğin içine yazılan her liste
     bir sonraki göç dosyasında bayatlar. */
  it("dosya adlarını sabit yazmıyor", () => {
    for (const file of migrations) {
      expect(script).not.toContain(file);
    }
  });

  it("dosyaları diskten sayıyor", () => {
    expect(script).toContain("Get-ChildItem $MigrationDir -Filter *.sql");
  });

  /* Eski hâli `claude/son-durum-ozeti-866xme` diye artık var olmayan bir
     dala yönlendiriyordu. */
  it("var olmayan bir dala yönlendirmiyor", () => {
    expect(script).not.toMatch(/claude\/[a-z-]+-[a-z0-9]{6}/);
  });
});

describe("doğrulama gerçek bir şey ölçüyor", () => {
  /* Kredi paketleri herkese açık sayfada görünmüyor — orada aramak yanlış
     alarm üretirdi. Metin yorumda duruyor (neden kaldırıldığını anlatıyor);
     aranan şey o kontrolün KENDİSİNİN gitmiş olması. */
  it("fiyat sayfasını çekip içinde metin aramıyor", () => {
    expect(script).not.toContain("Invoke-WebRequest");
    expect(script).not.toContain("fiyatlandirma");
  });

  it("kanıt nesnesi soran betiği çağırıyor", () => {
    expect(script).toContain("node scripts/acilis-kapisi.mjs --db");
  });
});

describe("db push çelişkisi belgelenmiş", () => {
  /* Betik `db push` kullanıyor, dört doküman "kullanmayın" diyor. Çelişkiyi
     görmezden gelmek, betiği okuyan kişiyi hangisinin doğru olduğunu tahmin
     etmeye bırakırdı. */
  it("betik gerekçeyi ve güvenli sırayı anlatıyor", () => {
    expect(script).toMatch(/db push/);
    expect(script).toMatch(/TARIHSEL|tarihsel/);
    expect(script).toMatch(/migration list/);
    expect(script).toMatch(/SQL editorunden elle/);
  });

  it("onaydan önce listeye bakmayı dayatıyor", () => {
    expect(script.indexOf("migration list")).toBeLessThan(
      script.indexOf("Read-Host"),
    );
    expect(script).toMatch(/DURUN VE BAKIN/);
  });
});
