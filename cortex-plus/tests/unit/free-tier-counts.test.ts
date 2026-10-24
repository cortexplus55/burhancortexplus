import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";
import { FREE_LIMITS, PLUS_ONLY_ACTIONS, REFERRAL_GIFT_LESSONS, freePeriodKey } from "@/lib/billing/free-meters";

/**
 * Kredi v3 ve sayıya dayalı ücretsiz katman (24 Ekim 2026, ürün sahibinin kararı): "Haftada 3 ders,
 * günde 3 mesaj, fotoğraf 1"; derse dahil olanlar sayılmaz, Araçlar dersten düşer; ses Plus'ta; davette
 * iki tarafa 3 ders hediye; yıllık planlar satıştan kalkar.
 *
 * Göçler canlıdaki yayın sırasıyla PGlite'ta çalışır (docs/delivery/KREDI-SISTEMI.md, "Canlıya geçiş"):
 *   v2 → (a) 20261024121000, koddan önce: eski kod v2 gibi, yeni kod sayaçla → (c) 20261024120000 +
 *   20261024123000 tek çalıştırmada → (d) 20261024122000 → geri alma dosyası (yalnız SQL, kod geri
 *   alınmadan önce).
 */
const read = (path: string) => readFileSync(path, "utf8");
const migration = (name: string) => read(`supabase/migrations/${name}.sql`);
const ROLLBACK = "supabase/rollback/20261024_kredi_v3_geri_al.sql";

const free = "11111111-1111-4111-8111-111111111111";
const plus = "22222222-2222-4222-8222-222222222222";
const gifted = "33333333-3333-4333-8333-333333333333";
const inviter = "44444444-4444-4444-8444-444444444444";
const invitee = "55555555-5555-4555-8555-555555555555";
const admin = "66666666-6666-4666-8666-666666666666";
const previewer = "77777777-7777-4777-8777-777777777777";
const lateInvitees = [
  "88888888-8888-4888-8888-888888888881",
  "88888888-8888-4888-8888-888888888882",
  "88888888-8888-4888-8888-888888888883",
];
// Yalnız 20261024121000 uygulanmışken (kod yayından önce ve hemen sonra) kullanılan hesaplar.
const oldFree = "99999999-9999-4999-8999-999999999991";
const early = "99999999-9999-4999-8999-999999999992";
const plusEarly = "99999999-9999-4999-8999-999999999993";
const oldPreviewer = "99999999-9999-4999-8999-999999999994";
// İnceleme bulguları (#1, #3).
const previewPlus = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const plusInviter = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const plusInvitee = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
// Yeniden inceleme (rereview 0, #5 ve #6): v3 credit_reserve'ün açtığı ücretsiz gün ve abone dönemi geri
// almaya kadar aynı cüzdanlarla izlenir; karşılıklı davet.
const v3Free = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const plusRef = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const mutualA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const mutualB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const PLUS_PLAN = "aaaaaaaa-0000-4000-8000-000000000001";
const YEARLY_PLAN = "aaaaaaaa-0000-4000-8000-000000000004";
const V3_CODES = ["STUDY_PLAN_GENERATE", "QUIZ_GENERATE", "FLASHCARD_GENERATE", "DOCUMENT_PAGE_PROCESS", "IMAGE_SOLUTION", "ORAL_EXAM_GENERATE"];

/**
 * Belgede ya da göç başlığında yazılı `schema_migrations` kayıt satırları (SQL ekranına elle yapıştırılan).
 * Yorum satırından da çıkarılır ("--   insert into …").
 */
function migrationInserts(text: string): string[] {
  const plain = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/^--\s?/, "")).join("\n");
  return [...plain.matchAll(/insert into supabase_migrations\.schema_migrations[^;]*;/gi)].map((match) => match[0]);
}

/** CREATE OR REPLACE FUNCTION public.credit_reserve( … ) bloğu, satır sonları LF. */
function creditReserveBody(sql: string): string {
  const text = sql.replace(/\r\n/g, "\n");
  const start = text.indexOf("CREATE OR REPLACE FUNCTION public.credit_reserve(\n");
  const end = text.indexOf("GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text, integer) TO service_role;", start);
  return start < 0 || end < 0 ? "" : text.slice(start, end);
}

describe("kredi v3 + ücretsiz sayaçlar: göçler canlıdaki sırayla", () => {
  const db = new PGlite();
  let v2Rules: Record<string, number> = {};

  beforeAll(async () => {
    const initial = read("supabase/migrations/20250825120000_init.sql");
    const tables = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
      CREATE TABLE profiles(id uuid PRIMARY KEY, referred_by uuid, created_at timestamptz DEFAULT now());
      -- 20260903150000 ile aynı varsayılan (dönem hakkı 6); 20261024123000 0 yapar, geri alma 6'ya döndürür.
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
        monthly_allowance integer, billing_period text, is_premium boolean, active boolean DEFAULT true,
        updated_at timestamptz);
      CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, beneficiary_user_id uuid, plan_id uuid);
      CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      -- v2 çarpanı (20260904000000): yalnız bir Plus abonesinde 3, ötekilerde 1.
      CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$
        SELECT CASE WHEN $1 = '${plusRef}'::uuid THEN 3 ELSE 1 END $$;
      CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
    for (const file of [
      "20260923120001_uat_credit_atomicity",
      "20260925180000_admin_credit_bypass",
      "20261003120000_free_tier_one_lesson",
      "20261008100000_admin_free_preview",
    ]) {
      await db.exec(migration(file));
    }
    await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
        ('AI_CHAT_STANDARD', 1), ('AI_CHAT_ADVANCED', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2),
        ('FLASHCARD_GENERATE', 1), ('DOCUMENT_PAGE_PROCESS', 2), ('IMAGE_SOLUTION', 5);
      INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium) VALUES
        ('${PLUS_PLAN}', 'plus-aylik', 'Plus', 400, 'monthly', true),
        ('aaaaaaaa-0000-4000-8000-000000000002', 'plus-haftalik', 'Plus', 150, 'weekly', true),
        ('${YEARLY_PLAN}', 'plus-yillik', 'Plus', 400, 'yearly', true),
        ('aaaaaaaa-0000-4000-8000-000000000005', 'sigma-yillik', 'Sigma', 3000, 'yearly', true);
      INSERT INTO user_roles(user_id, role) VALUES
        ('${admin}', 'admin'), ('${previewer}', 'admin'), ('${oldPreviewer}', 'admin'), ('${previewPlus}', 'admin');`);
    await db.exec(migration("20261008120000_credit_system_v2"));
    // (a) Koddan önce yalnız ekleme yapan göç, başlığındaki kayıt satırıyla aynı çalıştırmada.
    const counts = migration("20261024121000_free_tier_counts");
    await db.exec(`${counts}\n${migrationInserts(counts).join("\n")}`);

    const users = [
      free, plus, gifted, inviter, invitee, admin, previewer, ...lateInvitees,
      oldFree, early, plusEarly, oldPreviewer, previewPlus, plusInviter, plusInvitee,
      v3Free, plusRef, mutualA, mutualB,
    ];
    const referrals: Record<string, string> = {
      [invitee]: inviter,
      ...Object.fromEntries(lateInvitees.map((user) => [user, inviter])),
      [plusInvitee]: plusInviter,
      // Karşılıklı davet: kayıt yalnız kendini davet etmeyi engelliyor.
      [mutualA]: mutualB,
      [mutualB]: mutualA,
    };
    for (const user of users) {
      const referredBy = referrals[user] ? `'${referrals[user]}'` : "NULL";
      await db.exec(`INSERT INTO profiles(id, referred_by) VALUES ('${user}', ${referredBy});
        INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${user}', 0, 0);`);
    }
    await db.exec(`UPDATE credit_wallets SET balance = 90 WHERE user_id = '${gifted}';
      UPDATE credit_wallets SET balance = 100000 WHERE user_id IN ('${previewer}', '${previewPlus}');
      INSERT INTO subscriptions(user_id, plan_id, status) VALUES
        ('${plus}', '${PLUS_PLAN}', 'active'), ('${plusEarly}', '${PLUS_PLAN}', 'active'),
        ('${previewPlus}', '${PLUS_PLAN}', 'active'), ('${plusInvitee}', '${PLUS_PLAN}', 'active'),
        ('${plusRef}', '${PLUS_PLAN}', 'active');
      -- Dönemi biten cüzdan ilk işte planın (ya da günün) hakkıyla açılır (credit_reserve tembel yenileme).
      UPDATE credit_wallets SET period_ends_at = now() - interval '1 second'
        WHERE user_id IN ('${plus}', '${plusEarly}', '${oldFree}', '${plusInvitee}', '${v3Free}', '${plusRef}');
      INSERT INTO auth.users(id) VALUES ('${previewer}'), ('${oldPreviewer}'), ('${previewPlus}');
      INSERT INTO admin_free_preview(user_id) VALUES ('${previewer}'), ('${oldPreviewer}');`);
    const rules = await db.query<{ action_code: string; credit_cost: number }>("SELECT action_code, credit_cost FROM credit_rules");
    v2Rules = Object.fromEntries(rules.rows.map((row) => [row.action_code, row.credit_cost]));
  }, 60_000);
  afterAll(() => db.close());

  const metered = (user: string, code: string, key: string, meter: string | null = null, quantity = 1) =>
    db.query<{ id: string }>("SELECT credit_reserve_metered($1, $2, $3, $4, $5) AS id", [user, code, key, quantity, meter]);
  const reserve = (user: string, code: string, key: string) =>
    db.query<{ id: string }>("SELECT credit_reserve($1, $2, $3) AS id", [user, code, key]);
  const refund = (id: string) => db.query("SELECT credit_refund($1)", [id]);
  const used = async (user: string, meter: string) =>
    (await db.query<{ used: number }>("SELECT used FROM free_usage WHERE user_id = $1 AND meter = $2", [user, meter])).rows[0]?.used ?? 0;
  const balance = async (user: string) =>
    (await db.query<{ balance: number }>("SELECT balance FROM credit_wallets WHERE user_id = $1", [user])).rows[0]?.balance;
  const wallet = async (user: string) =>
    (await db.query<{ free_allowance_remaining: number; period_allowance: number }>(
      "SELECT free_allowance_remaining, period_allowance FROM credit_wallets WHERE user_id = $1", [user])).rows[0];
  const columnDefault = async (table: string, column: string) =>
    (await db.query<{ column_default: string | null }>(
      "SELECT column_default FROM information_schema.columns WHERE table_name = $1 AND column_name = $2", [table, column])).rows[0]
      ?.column_default;
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0] ?? {})[0];
  /** (c): iki göç ve 20261024123000'in başındaki kayıt satırları, tek çalıştırmada. */
  const applyC = () => {
    const zero = migration("20261024123000_free_daily_zero");
    return [migration("20261024120000_credit_prices_v3"), zero, ...migrationInserts(zero)].join("\n");
  };
  const giftKeys = async () =>
    (await db.query<{ user_id: string; idempotency_key: string }>(
      "SELECT user_id, idempotency_key FROM credit_ledger WHERE idempotency_key LIKE 'referral-gift%'")).rows;

  describe("(a) yalnız 20261024121000: koddan önce güvenli", () => {
    it("göç yalnız ekleme: credit_reserve'e, günlük hakka ve varsayılanlara dokunmuyor", () => {
      const sql = migration("20261024121000_free_tier_counts");
      expect(sql).not.toContain("FUNCTION public.credit_reserve(");
      expect(sql).not.toContain("unverified_allowance");
      expect(sql).not.toMatch(/SET DEFAULT|v_allowance :=/);
      // Fonksiyon gövdeleri dışında satır güncelleyen komut yok.
      expect(sql).not.toMatch(/^(UPDATE|INSERT|DELETE)\b/m);
    });

    it("eski kod (credit_reserve'ü doğrudan çağırır) v2 gibi: ders 6, ücretsiz günde 6, önizleme 6", async () => {
      expect(v2Rules).toMatchObject({
        STUDY_PLAN_GENERATE: 6, QUIZ_GENERATE: 4, FLASHCARD_GENERATE: 3, DOCUMENT_PAGE_PROCESS: 2,
        IMAGE_SOLUTION: 10, ORAL_EXAM_GENERATE: 8, AI_CHAT_STANDARD: 3,
      });
      await reserve(oldFree, "STUDY_PLAN_GENERATE", "old-l1");
      expect(await wallet(oldFree)).toEqual({ free_allowance_remaining: 0, period_allowance: 6 });
      await expect(reserve(oldFree, "STUDY_PLAN_GENERATE", "old-l2")).rejects.toThrow("insufficient_credits");
      // Eski kod sayaca hiç dokunmaz.
      expect(await used(oldFree, "lesson")).toBe(0);
      expect(await scalar("SELECT unverified_allowance()")).toBe(6);
      // Önizlemedeki yönetici eski kodda v2'deki gibi günde 6 (satır v2 varsayılanıyla açıldı).
      await reserve(oldPreviewer, "STUDY_PLAN_GENERATE", "old-pv1");
      await expect(reserve(oldPreviewer, "STUDY_PLAN_GENERATE", "old-pv2")).rejects.toThrow("insufficient_credits");
      expect(await columnDefault("admin_free_preview", "remaining")).toBe("6");
      expect(await columnDefault("credit_wallets", "free_allowance_remaining")).toBe("50");
      expect(await columnDefault("credit_wallets", "period_allowance")).toBe("6");
    });

    it("yeni kod, yalnız bu göçle: ücretsiz fotoğraf, ders ve mesaj sayaçla açılıyor (v2 fiyatlarının üstünde)", async () => {
      await metered(early, "IMAGE_SOLUTION", "e-p1", "photo");
      await expect(metered(early, "IMAGE_SOLUTION", "e-p2", "photo")).rejects.toThrow("free_limit:photo");
      for (let i = 1; i <= FREE_LIMITS.lesson; i += 1) await metered(early, "STUDY_PLAN_GENERATE", `e-l${i}`, "lesson");
      await expect(metered(early, "STUDY_PLAN_GENERATE", "e-l4", "lesson")).rejects.toThrow("free_limit:lesson");
      for (let i = 1; i <= FREE_LIMITS.chat; i += 1) await metered(early, "AI_CHAT_STANDARD", `e-c${i}`, "chat");
      expect([await used(early, "photo"), await used(early, "lesson"), await used(early, "chat")]).toEqual([1, 3, 3]);
      const amounts = await db.query<{ amount: number }>("SELECT amount FROM credit_reservations WHERE user_id = $1", [early]);
      expect(amounts.rows.every((row) => row.amount === 0)).toBe(true);
      expect(await balance(early)).toBe(0);
      // Abone bu arada v2 fiyatından öder; kapı aynı.
      await metered(plusEarly, "STUDY_PLAN_GENERATE", "pe-l1", "lesson");
      expect(await wallet(plusEarly)).toEqual({ free_allowance_remaining: 7200 - 6, period_allowance: 7200 });
      await expect(metered(early, "PODCAST_GENERATE", "e-pod")).rejects.toThrow("plus_required");
    });
  });

  describe("(c) 20261024120000 + 20261024123000 tek çalıştırmada, (d) 20261024122000", () => {
    beforeAll(async () => {
      await db.exec(applyC());
      await db.exec(migration("20261024122000_retire_yearly_plans"));
    }, 30_000);

    it("kayıt satırları göçlerle aynı çalıştırmada yazıldı", async () => {
      const rows = await db.query<{ version: string }>("SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1");
      expect(rows.rows.map((row) => row.version)).toEqual(["20261024120000", "20261024121000", "20261024123000"]);
    });

    it("fiyatlar kredi tablosuyla aynı (ders 30, test 10, kart 4, sayfa 5, fotoğraf 4, mesaj 3)", async () => {
      const rules = await db.query<{ action_code: string; credit_cost: number }>(
        "SELECT action_code, credit_cost FROM credit_rules ORDER BY 1");
      for (const { action_code, credit_cost } of rules.rows) {
        const price = CREDIT_PRICE_TABLE[action_code as keyof typeof CREDIT_PRICE_TABLE];
        if (price) expect(credit_cost, action_code).toBe(price.credits);
      }
      const byCode = Object.fromEntries(rules.rows.map((row) => [row.action_code, row.credit_cost]));
      expect(byCode).toMatchObject({ STUDY_PLAN_GENERATE: 30, QUIZ_GENERATE: 10, FLASHCARD_GENERATE: 4, AI_CHAT_STANDARD: 3 });
    });

    it("günlük kredi 0: doğrulanmamış hak, önizleme ve yeni cüzdanın varsayılanı 0", async () => {
      expect(await scalar("SELECT unverified_allowance()")).toBe(0);
      expect(await columnDefault("admin_free_preview", "remaining")).toBe("0");
      // #4: yeni cüzdan 50 ile açılıyordu (ilk göçten kalma); kayıt günü sayaçların üstüne pay veriyordu.
      // Dönem hakkının varsayılanı da 0 (önce 6): yalnız görünüş, yeni cüzdan "günde 6" göstermesin.
      const fresh = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
      await db.exec(`INSERT INTO profiles(id) VALUES ('${fresh}'); INSERT INTO credit_wallets(user_id) VALUES ('${fresh}');`);
      expect(await wallet(fresh)).toEqual({ free_allowance_remaining: 0, period_allowance: 0 });
      expect(await columnDefault("credit_wallets", "period_allowance")).toBe("0");
      // Var olan cüzdanlar değişmedi (göç cüzdan satırı güncellemiyor).
      expect(await wallet(plusEarly)).toEqual({ free_allowance_remaining: 7200 - 6, period_allowance: 7200 });
    });

    /* Yeniden inceleme #6: (c)'den sonra eski kodun neden geri alma dosyası istediği, v3 credit_reserve'ün
       kendisiyle. v2'de bu cüzdan günde 6 ile açılır, mesaj (3) sığardı. */
    it("doğrulanmış ücretsiz cüzdan v3 credit_reserve'de 0 hakla açılıyor; eski kod (doğrudan credit_reserve) mesaj da ders de açamıyor", async () => {
      await expect(reserve(v3Free, "AI_CHAT_STANDARD", "v3f-c1")).rejects.toThrow("insufficient_credits");
      await expect(reserve(v3Free, "STUDY_PLAN_GENERATE", "v3f-l1")).rejects.toThrow("insufficient_credits");
      // Reddedilen istek dönemi açmaz (işlem geri alınır). Bakiyeyle ödenen bir iş (artakalan paket) açar:
      // hak 0, iş bakiyeden düşer.
      await db.exec(`UPDATE credit_wallets SET balance = 3 WHERE user_id = '${v3Free}';`);
      await reserve(v3Free, "AI_CHAT_STANDARD", "v3f-c2");
      expect(await wallet(v3Free)).toEqual({ free_allowance_remaining: 0, period_allowance: 0 });
      expect(await balance(v3Free)).toBe(0);
      expect(await scalar(`SELECT period_kind FROM credit_wallets WHERE user_id = '${v3Free}'`)).toBe("daily");
      expect(await scalar(`SELECT period_ends_at > now() FROM credit_wallets WHERE user_id = '${v3Free}'`)).toBe(true);
      await expect(reserve(v3Free, "AI_CHAT_STANDARD", "v3f-c3")).rejects.toThrow("insufficient_credits");
      await expect(reserve(v3Free, "STUDY_PLAN_GENERATE", "v3f-l2")).rejects.toThrow("insufficient_credits");
      // Yeni kod aynı cüzdanda sayaçla açar.
      await metered(v3Free, "AI_CHAT_STANDARD", "v3f-m1", "chat");
      expect(await used(v3Free, "chat")).toBe(1);
    });

    it("v3 credit_reserve davet çarpanını uygulamıyor: çarpanı 3 olan Plus abonesi 7.200 ile açılıyor", async () => {
      expect(await scalar(`SELECT referral_multiplier('${plusRef}')`)).toBe(3);
      await metered(plusRef, "STUDY_PLAN_GENERATE", "pr-l1", "lesson");
      expect(await wallet(plusRef)).toEqual({ free_allowance_remaining: 7200 - 30, period_allowance: 7200 });
    });

    it("dönem anahtarı uygulamayla aynı: İstanbul günü, Pazartesi başlayan ISO hafta", async () => {
      for (const at of [
        "2026-10-25T20:59:00Z", // Pazar 23:59 İstanbul
        "2026-10-25T21:00:00Z", // Pazartesi 00:00 İstanbul
        "2026-12-31T21:30:00Z", // 1 Ocak 2027 Cuma: hâlâ 2026'nın 53. haftası
        "2027-01-03T22:00:00Z", // 4 Ocak 2027 Pazartesi: 2027-W01
      ]) {
        const date = new Date(at);
        for (const meter of ["lesson", "chat"] as const) {
          const sql = await db.query<{ key: string }>("SELECT free_period_key($1, $2::timestamptz) AS key", [meter, at]);
          expect(sql.rows[0]?.key, `${meter} ${at}`).toBe(freePeriodKey(meter, date));
        }
      }
      expect(freePeriodKey("lesson", new Date("2026-12-31T21:30:00Z"))).toBe("2026-W53");
      expect(freePeriodKey("chat", new Date("2026-10-25T21:00:00Z"))).toBe("2026-10-26");
    });

    it("ücretsiz: haftada 3 ders, tutar 0; dördüncüsü free_limit:lesson; cüzdan değişmez", async () => {
      for (let i = 1; i <= FREE_LIMITS.lesson; i += 1) {
        await metered(free, "STUDY_PLAN_GENERATE", `l${i}`, "lesson");
      }
      await expect(metered(free, "STUDY_PLAN_GENERATE", "l4", "lesson")).rejects.toThrow("free_limit:lesson");
      expect(await used(free, "lesson")).toBe(3);
      const rows = await db.query<{ amount: number; free_meter: string }>(
        "SELECT amount, free_meter FROM credit_reservations WHERE user_id = $1 AND idempotency_key LIKE 'l%'", [free]);
      expect(rows.rows.every((row) => row.amount === 0 && row.free_meter === "lesson")).toBe(true);
      expect(await balance(free)).toBe(0);
      // Araçlar'daki test de dersten düşer: aynı sayaç dolu.
      await expect(metered(free, "QUIZ_GENERATE", "tool-quiz", "lesson")).rejects.toThrow("free_limit:lesson");
    });

    it("aynı istek ikinci kez sayılmaz; aynı haftadaki iade hakkı geri verir", async () => {
      const first = await db.query<{ id: string }>(
        "SELECT id FROM credit_reservations WHERE user_id = $1 AND idempotency_key = 'l1'", [free]);
      const replay = await metered(free, "STUDY_PLAN_GENERATE", "l1", "lesson");
      expect(replay.rows[0]?.id).toBe(first.rows[0]?.id);
      expect(await used(free, "lesson")).toBe(3);
      await refund(first.rows[0]!.id);
      expect(await used(free, "lesson")).toBe(2);
      // İade edilen istek yeniden denenebilir (yeni deneme, yeni kayıt).
      await metered(free, "STUDY_PLAN_GENERATE", "l1", "lesson");
      expect(await used(free, "lesson")).toBe(3);
      // İki kez iade sayacı iki kez düşürmez.
      const again = await db.query<{ id: string }>(
        "SELECT id FROM credit_reservations WHERE user_id = $1 AND idempotency_key = 'l2'", [free]);
      await refund(again.rows[0]!.id);
      await refund(again.rows[0]!.id);
      expect(await used(free, "lesson")).toBe(2);
    });

    it("derse dahil işler sayılmaz (tutar 0, ders sayacına dokunmaz); günde en çok 40", async () => {
      const before = await used(free, "lesson");
      for (let i = 1; i <= FREE_LIMITS.included; i += 1) {
        await metered(free, "QUIZ_GENERATE", `inc${i}`, "included");
      }
      await expect(metered(free, "QUIZ_GENERATE", "inc41", "included")).rejects.toThrow("free_limit:included");
      expect(await used(free, "lesson")).toBe(before);
    });

    it("günde 3 mesaj ve 1 fotoğraf; sayaçlar birbirini yemez", async () => {
      for (let i = 1; i <= FREE_LIMITS.chat; i += 1) await metered(free, "AI_CHAT_STANDARD", `c${i}`, "chat");
      await expect(metered(free, "AI_CHAT_STANDARD", "c4", "chat")).rejects.toThrow("free_limit:chat");
      await metered(free, "IMAGE_SOLUTION", "p1", "photo");
      await expect(metered(free, "IMAGE_SOLUTION", "p2", "photo")).rejects.toThrow("free_limit:photo");
      expect(await used(free, "chat")).toBe(3);
      expect(await used(free, "photo")).toBe(1);
    });

    it("Plus işleri ücretsizde plus_required; Plus abonede aylık haktan düşer", async () => {
      for (const code of PLUS_ONLY_ACTIONS) {
        const exists = await db.query("SELECT 1 FROM credit_rules WHERE action_code = $1", [code]);
        if (!exists.rows.length) continue;
        await expect(metered(free, code, `plus-only-${code}`)).rejects.toThrow("plus_required");
      }
      await metered(plus, "PODCAST_GENERATE", "pod1");
      await metered(plus, "STUDY_PLAN_GENERATE", "plus-l1", "lesson");
      expect(await wallet(plus)).toEqual({ free_allowance_remaining: 7200 - 12 - 30, period_allowance: 7200 });
      // Abonenin sayacı tutulmaz.
      expect(await used(plus, "lesson")).toBe(0);
    });

    it("sayaç dolunca hediye bakiyesi yetiyorsa onunla; yetmiyorsa free_limit", async () => {
      for (let i = 1; i <= 3; i += 1) await metered(gifted, "STUDY_PLAN_GENERATE", `g${i}`, "lesson");
      expect(await balance(gifted)).toBe(90);
      const paid = await metered(gifted, "STUDY_PLAN_GENERATE", "g4", "lesson");
      expect(await balance(gifted)).toBe(60);
      const row = await db.query<{ amount: number }>("SELECT amount FROM credit_reservations WHERE id = $1", [paid.rows[0]!.id]);
      expect(row.rows[0]?.amount).toBe(30);
      // İade bakiyeyi geri verir, sayaca dokunmaz.
      await refund(paid.rows[0]!.id);
      expect(await balance(gifted)).toBe(90);
      expect(await used(gifted, "lesson")).toBe(3);
    });

    it("davet: iki tarafa bir kez 3 ders kadar hediye; davet eden en çok 3 davetten alır", async () => {
      const gift = REFERRAL_GIFT_LESSONS * CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits;
      expect(gift).toBe(90);
      await metered(invitee, "AI_CHAT_STANDARD", "inv-c1", "chat");
      await metered(invitee, "AI_CHAT_STANDARD", "inv-c2", "chat");
      expect(await balance(invitee)).toBe(gift);
      expect(await balance(inviter)).toBe(gift);
      for (const [index, user] of lateInvitees.entries()) {
        await metered(user, "AI_CHAT_STANDARD", `late-${index}`, "chat");
        expect(await balance(user)).toBe(gift);
      }
      // invitee + 3 geç davetli: davet eden yalnız ilk üçünden alır.
      expect(await balance(inviter)).toBe(3 * gift);
    });

    it("davet: Plus abonesi olarak gelen davetli de iki tarafa hediye açar (#3)", async () => {
      await metered(plusInvitee, "STUDY_PLAN_GENERATE", "pi-l1", "lesson");
      const keys = (await giftKeys())
        .filter((row) => [plusInvitee, plusInviter].includes(row.user_id))
        .map((row) => `${row.user_id} ${row.idempotency_key}`)
        .sort();
      expect(keys).toEqual([
        `${plusInviter} referral-gift-inviter:${plusInvitee}`,
        `${plusInvitee} referral-gift:${plusInvitee}`,
      ].sort());
      expect(await balance(plusInviter)).toBe(90);
      // Abone önce aylık haktan harcar; hediye bakiyede durur.
      expect(await balance(plusInvitee)).toBe(90);
      expect(await wallet(plusInvitee)).toEqual({ free_allowance_remaining: 7200 - 30, period_allowance: 7200 });
      // İkinci iş hediyeyi yeniden vermez.
      await metered(plusInvitee, "PODCAST_GENERATE", "pi-pod");
      expect(await balance(plusInviter)).toBe(90);
    });

    it("iki cüzdan ilk hediyeden önce kimlik sırasıyla kilitleniyor; davet edenin sayımı kilidin altında (#2, #5)", () => {
      const sql = migration("20261024121000_free_tier_counts");
      const body = sql.slice(sql.indexOf("FUNCTION public.grant_referral_gift"), sql.indexOf("FUNCTION public.credit_reserve_metered"));
      // Karşılıklı davette iki işlem aynı sırada kilitler: biri öbürünü bekler, kilitlenme (40P01) olmaz.
      const lock = body.indexOf(
        "PERFORM 1 FROM public.credit_wallets WHERE user_id IN (p_user_id, v_inviter) ORDER BY user_id FOR UPDATE;");
      expect(lock).toBeGreaterThan(0);
      expect(lock).toBeLessThan(body.indexOf("PERFORM public.credit_gift("));
      expect(lock).toBeLessThan(body.indexOf("LIKE 'referral-gift-inviter:%'"));
      // Tek tek kilit (önce davetli, sonra davet eden) kalmadı.
      expect(body).not.toContain("WHERE user_id = v_inviter FOR UPDATE");
      // Hediye her koldan (abone, sayaçsız iş) önce.
      const reserveBody = sql.slice(sql.indexOf("FUNCTION public.credit_reserve_metered"));
      expect(reserveBody.indexOf("PERFORM public.grant_referral_gift(p_user_id)")).toBeGreaterThan(0);
      expect(reserveBody.indexOf("PERFORM public.grant_referral_gift(p_user_id)")).toBeLessThan(
        reserveBody.indexOf("RETURN public.credit_reserve("));
    });

    it("karşılıklı davet: iki taraf da hem davetli hem davet eden olarak bir kez alıyor (#5)", async () => {
      await metered(mutualA, "AI_CHAT_STANDARD", "mu-a1", "chat");
      expect([await balance(mutualA), await balance(mutualB)]).toEqual([90, 90]);
      await metered(mutualB, "AI_CHAT_STANDARD", "mu-b1", "chat");
      expect([await balance(mutualA), await balance(mutualB)]).toEqual([180, 180]);
      await metered(mutualA, "AI_CHAT_STANDARD", "mu-a2", "chat");
      expect([await balance(mutualA), await balance(mutualB)]).toEqual([180, 180]);
    });

    it("yönetici sayaca girmez; önizlemedeki yönetici ücretsiz hesap gibi, kendi cüzdanına düşmez", async () => {
      for (let i = 1; i <= 5; i += 1) await metered(admin, "STUDY_PLAN_GENERATE", `a${i}`, "lesson");
      expect(await used(admin, "lesson")).toBe(0);
      for (let i = 1; i <= 3; i += 1) await metered(previewer, "STUDY_PLAN_GENERATE", `pv${i}`, "lesson");
      await expect(metered(previewer, "STUDY_PLAN_GENERATE", "pv4", "lesson")).rejects.toThrow("free_limit:lesson");
      await expect(metered(previewer, "PODCAST_GENERATE", "pv-pod")).rejects.toThrow("plus_required");
      expect(await balance(previewer)).toBe(100000);
    });

    it("aboneliği olan yönetici de önizlemede sayaca girer (#1)", async () => {
      await db.exec(`INSERT INTO admin_free_preview(user_id) VALUES ('${previewPlus}');`);
      for (let i = 1; i <= FREE_LIMITS.lesson; i += 1) await metered(previewPlus, "STUDY_PLAN_GENERATE", `pp${i}`, "lesson");
      await expect(metered(previewPlus, "STUDY_PLAN_GENERATE", "pp4", "lesson")).rejects.toThrow("free_limit:lesson");
      await metered(previewPlus, "AI_CHAT_STANDARD", "pp-c1", "chat");
      await expect(metered(previewPlus, "PODCAST_GENERATE", "pp-pod")).rejects.toThrow("plus_required");
      expect([await used(previewPlus, "lesson"), await used(previewPlus, "chat")]).toEqual([3, 1]);
      expect(await balance(previewPlus)).toBe(100000);
      // Önizleme kapanınca abonelik ve yönetici muafiyeti geri gelir.
      await db.exec(`DELETE FROM admin_free_preview WHERE user_id = '${previewPlus}';`);
      await expect(metered(previewPlus, "PODCAST_GENERATE", "pp-pod2")).resolves.toBeTruthy();
      await db.exec(`INSERT INTO admin_free_preview(user_id) VALUES ('${previewPlus}');`);
    });

    it("yıllık planlar satıştan kalktı; satırlar ve aylık/haftalık yerinde, sahibi okuyabilir", async () => {
      const plans = await db.query<{ slug: string; active: boolean }>("SELECT slug, active FROM plans ORDER BY slug");
      expect(plans.rows).toEqual([
        { slug: "plus-aylik", active: true },
        { slug: "plus-haftalik", active: true },
        { slug: "plus-yillik", active: false },
        { slug: "sigma-yillik", active: false },
      ]);
      const policy = await db.query("SELECT 1 FROM pg_policies WHERE tablename = 'plans' AND policyname = 'plans_held_by_user'");
      expect(policy.rows).toHaveLength(1);
    });

    it("yetkiler: sayaç, hediye ve ayırma fonksiyonları yalnız sunucu rolünde; hiçbir şey düşürülmüyor", () => {
      const counts = migration("20261024121000_free_tier_counts");
      const zero = migration("20261024123000_free_daily_zero");
      for (const [sql, fn] of [
        [counts, "credit_reserve_metered(uuid, text, text, integer, text)"],
        [counts, "credit_gift(uuid, integer, text, jsonb)"],
        [counts, "grant_referral_gift(uuid)"],
        [counts, "credit_refund(uuid)"],
        [zero, "credit_reserve(uuid, text, text, integer)"],
      ] as const) {
        expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
        expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
      }
      for (const sql of [counts, zero]) expect(sql).not.toMatch(/DROP POLICY|DROP TABLE|DROP FUNCTION/);
      // #4: varsayılan değişir, var olan cüzdan satırları güncellenmez.
      expect(zero).toContain("ALTER TABLE public.credit_wallets ALTER COLUMN free_allowance_remaining SET DEFAULT 0;");
      expect(zero).toContain("ALTER TABLE public.credit_wallets ALTER COLUMN period_allowance SET DEFAULT 0;");
      expect(zero).not.toMatch(/^(UPDATE|INSERT|DELETE)\b/m);
    });

    /* Yeniden inceleme #2: geri almadan sonra v3'e dönerken (c) yeniden çalışır ve kayıt satırları zaten
       vardır; düz insert duplicate key ile düşer ve tek işlem olduğu için iki göç de uygulanmazdı. */
    it("elle yazılan bütün kayıt satırları on conflict (version) do nothing ile", () => {
      const sources: Record<string, string> = {
        "20261024121000": migration("20261024121000_free_tier_counts"),
        "20261024123000": migration("20261024123000_free_daily_zero"),
        "geri alma": read(ROLLBACK),
        "KREDI-SISTEMI.md": read("../docs/delivery/KREDI-SISTEMI.md"),
        "yayin-geri-alma.md": read("../docs/ops/yayin-geri-alma.md"),
      };
      expect(migrationInserts(sources["20261024121000"]!)).toHaveLength(1);
      expect(migrationInserts(sources["20261024123000"]!)).toHaveLength(1);
      const documented = migrationInserts(sources["KREDI-SISTEMI.md"]!).join("\n");
      for (const version of ["20261024120000", "20261024121000", "20261024122000", "20261024123000"]) {
        expect(documented, version).toContain(`'${version}'`);
      }
      for (const [name, text] of Object.entries(sources)) {
        for (const insert of migrationInserts(text)) {
          if (!insert.includes("'20261024")) continue;
          expect(insert, name).toMatch(/on conflict \(version\) do nothing;$/i);
        }
      }
    });
  });

  describe("geri alma: kod v3 öncesine dönecekse önce bu SQL", () => {
    beforeAll(async () => {
      // v3Free'nin günü ve plusRef'in dönemi (c) bloğunda v3 credit_reserve'le açıldı; elle kurulmadı.
      expect(await wallet(v3Free)).toEqual({ free_allowance_remaining: 0, period_allowance: 0 });
      expect((await wallet(plusRef))?.period_allowance).toBe(7200);
      await db.exec(read(ROLLBACK));
    }, 30_000);

    it("v2 fiyatları geri geliyor (fiyat göçünden önceki değerlerle birebir)", async () => {
      const rules = await db.query<{ action_code: string; credit_cost: number }>("SELECT action_code, credit_cost FROM credit_rules");
      const now = Object.fromEntries(rules.rows.map((row) => [row.action_code, row.credit_cost]));
      expect(now).toEqual(v2Rules);
      for (const code of V3_CODES) expect(now[code], code).not.toBe(CREDIT_PRICE_TABLE[code as keyof typeof CREDIT_PRICE_TABLE]?.credits);
    });

    it("eski kod yine çalışıyor: credit_reserve'de ücretsiz günde 6, önizleme günde 6", async () => {
      // v3'te 0 hakla açılan gün biter; aynı cüzdan v2 hakkıyla yeniden açılır (mesaj ve ders sığar).
      await reserve(v3Free, "AI_CHAT_STANDARD", "rb-c1");
      expect(await wallet(v3Free)).toEqual({ free_allowance_remaining: 3, period_allowance: 6 });
      await reserve(v3Free, "AI_CHAT_STANDARD", "rb-c2");
      await expect(reserve(v3Free, "STUDY_PLAN_GENERATE", "rb-l1")).rejects.toThrow("insufficient_credits");
      expect(await balance(v3Free)).toBe(0);
      // v2'de açılmış ve boşalmış gün de biter (eski kod, (a) bloğu).
      await reserve(oldFree, "STUDY_PLAN_GENERATE", "rb-old-l1");
      expect(await wallet(oldFree)).toEqual({ free_allowance_remaining: 0, period_allowance: 6 });
      await expect(reserve(oldFree, "STUDY_PLAN_GENERATE", "rb-old-l2")).rejects.toThrow("insufficient_credits");
      expect(await scalar("SELECT unverified_allowance()")).toBe(6);
      // Önizleme satırı v3'te 0 ile açılmıştı; günü biter, v2 hakkıyla yeniden açılır.
      await reserve(previewPlus, "STUDY_PLAN_GENERATE", "rb-pv1");
      await expect(reserve(previewPlus, "STUDY_PLAN_GENERATE", "rb-pv2")).rejects.toThrow("insufficient_credits");
      expect(await columnDefault("admin_free_preview", "remaining")).toBe("6");
      expect(await columnDefault("credit_wallets", "free_allowance_remaining")).toBe("50");
      expect(await columnDefault("credit_wallets", "period_allowance")).toBe("6");
      // Abone dönemine dokunulmadı.
      expect(await wallet(plusEarly)).toEqual({ free_allowance_remaining: 7200 - 6, period_allowance: 7200 });
    });

    /* Kabul edilen boşluk (dosyanın başı, KREDI-SISTEMI.md): v3'te yenilenen abone dönemi çarpansız kalır,
       dosya tamamlamaz; v2 çarpanı bir sonraki yenilemede geri gelir. 24 Ekim 2026'da etkin ücretli abonelik
       yoktu. */
    it("davet çarpanı: v3'te açılan abone dönemi 7.200'de kalıyor, sonraki yenileme 21.600", async () => {
      expect(await wallet(plusRef)).toEqual({ free_allowance_remaining: 7200 - 30, period_allowance: 7200 });
      // Dönem biter (30 gün sonra): v2 credit_reserve çarpanla açar (eski kod, doğrudan çağrı).
      await db.exec(`UPDATE credit_wallets SET period_ends_at = now() - interval '1 second' WHERE user_id = '${plusRef}';`);
      await reserve(plusRef, "STUDY_PLAN_GENERATE", "rb-pr-l1");
      expect(await wallet(plusRef)).toEqual({ free_allowance_remaining: 21600 - 6, period_allowance: 21600 });
      const sql = read(ROLLBACK);
      expect(sql).toContain("Kabul edilen boşluk, davet çarpanı");
      expect(sql).toContain("21.600 yerine 7.200");
    });

    it("credit_reserve gövdesi 20261008120000'deki ile harfi harfine aynı", () => {
      const v2 = creditReserveBody(migration("20261008120000_credit_system_v2"));
      expect(v2.length).toBeGreaterThan(1000);
      expect(creditReserveBody(read(ROLLBACK))).toBe(v2);
    });

    it("hiçbir şey silinmiyor: sayaçlar ve sayaçlı ayırma yerinde, yeni kod da çalışıyor; yıllıklar kapalı kalıyor", async () => {
      const sql = read(ROLLBACK);
      expect(sql).not.toMatch(/DROP |DELETE FROM|TRUNCATE/);
      // Yıllık planları açmak yalnız yorum satırı.
      expect(sql).toMatch(/^-- UPDATE public\.plans SET active = true/m);
      expect(sql).not.toMatch(/^UPDATE public\.plans/m);
      expect(await scalar("SELECT count(*)::int FROM free_usage")).toBeGreaterThan(0);
      const fresh = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
      await db.exec(`INSERT INTO profiles(id) VALUES ('${fresh}'); INSERT INTO credit_wallets(user_id) VALUES ('${fresh}');`);
      expect(await wallet(fresh)).toEqual({ free_allowance_remaining: 50, period_allowance: 6 });
      await metered(fresh, "STUDY_PLAN_GENERATE", "rb-new-l1", "lesson");
      expect(await used(fresh, "lesson")).toBe(1);
      const plans = await db.query<{ slug: string; active: boolean }>("SELECT slug, active FROM plans WHERE slug LIKE '%yillik' ORDER BY slug");
      expect(plans.rows.every((row) => !row.active)).toBe(true);
    });

    /* Son test: durum v3'e döner. Kayıt satırları geri almadan sonra yerinde (dosya onlara dokunmaz). */
    it("v3'e dönüş: (c) kayıt satırlarıyla aynı çalıştırmada yeniden uygulanıyor; düz insert her şeyi geri alırdı", async () => {
      expect(await scalar("SELECT count(*)::int FROM supabase_migrations.schema_migrations")).toBe(3);
      const zero = migration("20261024123000_free_daily_zero");
      const plainInsert = migrationInserts(zero)[0]!.replace(/\s*on conflict \(version\) do nothing;$/i, ";");
      expect(plainInsert).not.toMatch(/on conflict/i);
      await expect(
        db.exec([migration("20261024120000_credit_prices_v3"), zero, plainInsert].join("\n")),
      ).rejects.toThrow(/duplicate key/);
      // Tek çalıştırma tek işlem: fiyatlar da günlük kredi de v2'de kaldı.
      expect(await scalar("SELECT credit_cost FROM credit_rules WHERE action_code = 'STUDY_PLAN_GENERATE'")).toBe(6);
      expect(await scalar("SELECT unverified_allowance()")).toBe(6);
      // Belgedeki satırla geçer.
      await db.exec(applyC());
      expect(await scalar("SELECT credit_cost FROM credit_rules WHERE action_code = 'STUDY_PLAN_GENERATE'")).toBe(30);
      expect(await scalar("SELECT unverified_allowance()")).toBe(0);
      expect(await columnDefault("credit_wallets", "period_allowance")).toBe("0");
      expect(await scalar("SELECT count(*)::int FROM supabase_migrations.schema_migrations")).toBe(3);
    });
  });
});
