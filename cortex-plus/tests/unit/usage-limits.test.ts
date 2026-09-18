import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/*
  18 Eylül 2026'da krediyle ölçülmeyen üç sınır geldi ve üçü de GÖRÜNMEZDİ:
  fotoğraf sayfası kotası, zor soru yükseltmesi tavanı, ücretsiz hesapta
  günlük fotoğraf.

  Görünmeyen bir limit çarptığında sürpriz olur — öğrenci ne yaptığını değil,
  ürünün bozulduğunu düşünür. Kredi kotası `/krediler` sayfasında zaten
  vardı; eksik olan bu üç sayaçtı.
*/

const mocks = vi.hoisted(() => ({ peekCount: vi.fn() }));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, peekCount: mocks.peekCount };
});

const { loadUsageLimits } = await import("@/lib/student/usage-limits");

const NOW = new Date("2026-09-18T10:00:00Z");
const THIS_PERIOD = "2026-09-01";

/** `document_page_grants` / `model_upgrade_grants` için yeten kadarı. */
function service(rows: Record<string, unknown>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: rows[table] ?? null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("ücretsiz hesap", () => {
  it("fotoğraf sayfası ve günlük fotoğrafı görüyor, yükseltmeyi görmüyor", async () => {
    mocks.peekCount.mockResolvedValue(2);
    const limits = await loadUsageLimits(
      service({ document_page_grants: { period_start: THIS_PERIOD, used: 1 } }),
      "u",
      "free",
      NOW,
    );

    expect(limits.map((l) => l.key)).toEqual(["photo-pages", "daily-photos"]);
    expect(limits[0]).toMatchObject({ used: 1, limit: 2 });
    expect(limits[1]).toMatchObject({ used: 2, limit: 3 });
  });

  /* Zor soru yükseltmesi zaten yalnızca premium'da çalışıyor; ücretsiz
     hesaba hiç geçerli olmayan bir sayaç göstermek kafa karıştırırdı. */
  it("premium olmayan hesapta yükseltme sayacı sorulmuyor", async () => {
    mocks.peekCount.mockResolvedValue(0);
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
  it("kendi kademesinin fotoğraf hakkını ve yükseltme tavanını görüyor", async () => {
    const limits = await loadUsageLimits(
      service({
        document_page_grants: { period_start: THIS_PERIOD, used: 12 },
        model_upgrade_grants: { period_start: THIS_PERIOD, used: 7 },
      }),
      "u",
      "sigma",
      NOW,
    );

    expect(limits.map((l) => l.key)).toEqual(["photo-pages", "hard-upgrade"]);
    expect(limits[0]).toMatchObject({ used: 12, limit: 1000 });
    expect(limits[1]).toMatchObject({ used: 7, limit: 60 });
  });

  /* Yükseltme sayacı tavanın BİR ÜSTÜNDE doyuyor (`claim_model_upgrade`);
     ekrana "61 / 60" çıkarsa öğrenciye bir şey anlatmaz. */
  it("doymuş sayacı tavanda kırpıyor", async () => {
    const limits = await loadUsageLimits(
      service({ model_upgrade_grants: { period_start: THIS_PERIOD, used: 61 } }),
      "u",
      "plus",
      NOW,
    );
    expect(limits.find((l) => l.key === "hard-upgrade")).toMatchObject({
      used: 60,
      limit: 60,
    });
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
