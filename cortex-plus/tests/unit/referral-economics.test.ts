import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/*
  Davet ödülü, getirdiği gelirle finanse edilebilmeli.

  Çarpan Astra'nın ilan ettiği mekanikten alınmıştı (400 kat) ve ilk
  migration bunu bilerek tabloya koymuştu — "kısmak için tek bir UPDATE
  yeterli". Oradaki maliyet uyarısı yalnızca ücretsiz katmanı anlatıyordu;
  gözden kaçan şey çarpanın `credit_reserve` içinde PREMIUM planın aylık
  kotasının da üstüne binmesiydi. Sigma'da 1.600 × 400 = 640.000, tavanla
  100.000 kredi — 599 TL'lik bir abonelikte pratikte sınırsız kullanım.

  Bu dosya iki şeyi tutuyor: çarpanın gelirin finanse edebileceği bir bantta
  kalması, ve emniyet tavanının yerinde durması.
*/

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

const allSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n");

/** Tablonun SON hâli: tohum satırı + sonraki her UPDATE. */
function effectiveMultiplier(status: string): number {
  const seed = allSql.match(
    new RegExp(`\\('${status}',\\s*(\\d+),`),
  );
  let value = seed ? Number(seed[1]) : NaN;

  // `UPDATE ... SET multiplier = N ... WHERE status = '<status>'`
  const updates = [
    ...allSql.matchAll(
      /UPDATE public\.referral_tiers\s+SET multiplier = (\d+)[\s\S]*?WHERE status = '([a-z_]+)'/g,
    ),
  ];
  for (const update of updates) {
    if (update[2] === status) value = Number(update[1]);
  }
  return value;
}

describe("davet çarpanı", () => {
  const subscribed = effectiveMultiplier("subscribed");

  /* 400, ücretsiz hesabın günlük 6 kredisini 2.400'e; Sigma'nın aylık
     1.600'ünü tavan olan 100.000'e çıkarıyordu. */
  it("abone getiren davet artık 400 değil", () => {
    expect(subscribed).toBeLessThan(400);
  });

  /* Ödül, getirilen abonenin ayda 599 TL'lik geliriyle finanse edilebilmeli.
     Ölçülen karma maliyet ~0,12 TL/kredi; Sigma'nın 1.600 kredisi bile
     çarpanla birlikte bu gelirin altında kalmalı. */
  it("gelirin finanse edebileceği bantta", () => {
    const SIGMA_MONTHLY = 1600;
    const TL_PER_CREDIT = 0.12;
    const REFERRED_REVENUE_TL = 599;
    const worstTier = SIGMA_MONTHLY * subscribed * TL_PER_CREDIT;
    expect(worstTier).toBeLessThan(REFERRED_REVENUE_TL * 4);
  });

  /* Ödül anlamsızlaşmamalı: davet eden ücretsiz öğrenci bir Plus ayından
     (400 kredi) fazlasına çıkabilmeli, yoksa davet etmenin karşılığı yok. */
  it("ödül anlamlı kalıyor", () => {
    const FREE_DAILY = 6;
    expect(FREE_DAILY * subscribed * 30).toBeGreaterThan(400);
  });

  /* Kaydolan ama abone olmayan davet zaten zararsızdı ve büyümenin asıl
     kancası orası. */
  it("kaydolan davet 3'te duruyor", () => {
    expect(effectiveMultiplier("signed_up")).toBe(3);
    expect(effectiveMultiplier("invitee")).toBe(3);
  });
});

describe("emniyet tavanı", () => {
  /* Çarpan tabloda, tavan fonksiyonda. İkisinden biri gidince diğeri tek
     başına kalmamalı: tavan, tablo yanlış güncellenirse son savunma. */
  it("credit_reserve hakkı bir tavanda kesiyor", () => {
    expect(allSql).toMatch(/v_allowance \* GREATEST\(COALESCE\(v_mult, 1\), 1\),\s*\n\s*100000/);
  });

  /* Tablo kısıtı da duruyor: elle 1000 üstü bir değer yazılamaz. */
  it("tablo çarpanı 1000 ile sınırlı", () => {
    expect(allSql).toContain("CHECK (multiplier BETWEEN 1 AND 1000)");
  });
});

describe("arayüz sayıyı veritabanından okuyor", () => {
  /* Tabloyu kısıp metni güncellemeyi unutma riski buradan kalkıyor — ilk
     migration'ın `referral_summary` gerekçesi de buydu. */
  it("çarpan metni sabit yazılmamış", () => {
    const card = readFileSync(
      "src/components/parity/referral-reward-card.tsx",
      "utf8",
    );
    expect(card).toContain("{summary.subscribedMultiplier} katına");
    expect(card).not.toMatch(/\b400 katına\b/);
  });
});
