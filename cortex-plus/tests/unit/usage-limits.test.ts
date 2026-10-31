import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  18 Eylül 2026'da krediyle ölçülmeyen üç sınır geldi ve üçü de GÖRÜNMEZDİ:
  fotoğraf sayfası kotası, zor soru yükseltmesi tavanı, ücretsiz hesapta
  günlük fotoğraf.

  Görünmeyen bir limit çarptığında sürpriz olur — öğrenci ne yaptığını değil,
  ürünün bozulduğunu düşünür. Kredi kotası `/krediler` sayfasında zaten
  vardı; eksik olan bu üç sayaçtı.

  24 Ekim 2026: günlük fotoğraf tavanı Redis'ten SQL sayacına geçti; yanına haftalık ders ve günlük
  mesaj sayacı geldi (sayıya dayalı ücretsiz katman).
*/

const { loadUsageLimits } = await import("@/lib/student/usage-limits");

const NOW = new Date("2026-09-18T10:00:00Z");
const THIS_PERIOD = "2026-09-01";

/** `document_page_grants` / `model_upgrade_grants` ve ücretsiz sayaç tablosu (`free_usage`) için yeten kadarı. */
function service(rows: Record<string, unknown>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: rows[table] ?? null }),
          in: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("ücretsiz hesap", () => {
  /* 24 Ekim 2026: ücretsiz hesap sayaçla çalışıyor (haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf).
     Üç sayaç da /krediler'de görünür; geçen haftanın ya da dünün satırı sayılmaz. */
  it("fotoğraf sayfası, haftalık ders, günlük mesaj ve fotoğraf sayaçlarını görüyor", async () => {
    const limits = await loadUsageLimits(
      service({
        document_page_grants: { period_start: THIS_PERIOD, used: 1 },
        free_usage: [
          { meter: "lesson", period_key: "2026-W38", used: 2 },
          { meter: "chat", period_key: "2026-09-18", used: 3 },
          { meter: "photo", period_key: "2026-09-17", used: 1 },
        ],
      }),
      "u",
      "free",
      NOW,
    );

    expect(limits.map((l) => l.key)).toEqual(["photo-pages", "weekly-lessons", "daily-chat", "daily-photos"]);
    // 31 Ekim 2026 (Paket J1 #3): ücretsiz fotoğraf/taranmış sayfa hakkı 25.
    expect(limits[0]).toMatchObject({ used: 1, limit: 25, label: "Fotoğraf ve PDF sayfa" });
    expect(limits[0]?.hint).toContain("PDF sayfa: 25");
    expect(limits[1]).toMatchObject({ used: 2, limit: 3, label: "Bu haftaki ders" });
    expect(limits[2]).toMatchObject({ used: 3, limit: 3 });
    // Dünün fotoğrafı bugünün hakkını yemez.
    expect(limits[3]).toMatchObject({ used: 0, limit: 1 });
  });

  /* Zor soru yükseltmesi zaten yalnızca premium'da çalışıyor; ücretsiz
     hesaba hiç geçerli olmayan bir sayaç göstermek kafa karıştırırdı. */
  it("premium olmayan hesapta yükseltme sayacı sorulmuyor", async () => {
    const calls: string[] = [];
    const spy = {
      from: (table: string) => {
        calls.push(table);
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await loadUsageLimits(spy, "u", "free", NOW);
    expect(calls).not.toContain("model_upgrade_grants");
  });
});

describe("abone hesap", () => {
  // 19 Ekim 2026: "Zor soruda güçlü model" satırı kalktı — yükseltme hiç verilmiyordu.
  it("kendi kademesinin fotoğraf hakkını görüyor; güçlü model sayacı yok", async () => {
    const limits = await loadUsageLimits(
      service({
        document_page_grants: { period_start: THIS_PERIOD, used: 12 },
        model_upgrade_grants: { period_start: THIS_PERIOD, used: 7 },
      }),
      "u",
      "sigma",
      NOW,
    );

    expect(limits.map((l) => l.key)).toEqual(["photo-pages"]);
    expect(limits[0]).toMatchObject({ used: 12, limit: 1000 });
  });

  /* Ay dönmüşse sayaç sıfırlanmış sayılıyor — `claim_*` fonksiyonları da
     öyle davranıyor. Bayat sayıyı göstermek, hakkı olmadığını sanan bir
     öğrenci üretirdi. */
  it("geçen ayın sayacını göstermiyor", async () => {
    const limits = await loadUsageLimits(
      service({
        document_page_grants: { period_start: "2026-08-01", used: 280 },
        model_upgrade_grants: { period_start: "2026-08-01", used: 59 },
      }),
      "u",
      "plus",
      NOW,
    );
    expect(limits.every((l) => l.used === 0)).toBe(true);
  });
});

describe("limitler sayfası", () => {
  const page = readFileSync("src/app/krediler/page.tsx", "utf8");

  it("sayaçları ekrana basıyor", () => {
    expect(page).toContain("loadUsageLimits(service, user.id, tier)");
    expect(page).toContain("usageLimits.map((limit)");
  });

  /* Tablolar istemciye tümüyle kapalı; öğrencinin kendi sayısını görmesi için
     onları açmak, ikisini de yazılabilir hâle getirme riskini doğururdu. */
  it("kapalı tabloları service role ile okuyor", () => {
    expect(page).toContain("createServiceClient()");
  });
});

describe("yükleme kromu", () => {
  it("ücretsiz hesapta yalnızca taranmış sayfa kotasını açıkça yazar", () => {
    const modal = readFileSync("src/components/parity/upload-modal.tsx", "utf8");
    const limits = readFileSync("src/lib/student/student-shell-context.tsx", "utf8");
    expect(modal).toContain("aylık taranmış sayfa hakkı:");
    expect(modal).toContain("useDocumentLimits");
    expect(limits).toContain("PHOTO_PAGE_LIMITS.free");
    expect(limits).toContain("isAdmin");
  });
});
