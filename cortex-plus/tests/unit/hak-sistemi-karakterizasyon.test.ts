import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quotaView } from "@/lib/credits/period";
import { freeMeterResetsAt, FREE_LIMITS } from "@/lib/billing/free-meters";
import { getGate, snapshotFromAccount } from "@/lib/entitlements/gate";
import { PAID_PLANS } from "@/lib/entitlements/config";
import type { Action, Gate, GateContext } from "@/lib/entitlements/types";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 3A karakterizasyonu: "bu kullanıcı bu eylemi BUGÜN yapabiliyor mu, sayaç ne gösteriyor".

  Sunucunun kararı SQL'dedir (`credit_reserve_metered` → `credit_reserve`). Bu dosya o fonksiyonları canlıdaki yayın
  sırasıyla PGlite'ta kurar (ucretsiz-tek-ders.test.ts ile aynı zincir + çizimli video kuralı) ve her senaryoyu iki
  yoldan sorar: (1) SQL ayırma yapıyor mu, (2) `getGate` ne diyor. İkisi AYNI olmak zorundadır (ANA-PROMPT 3A);
  bilinen farklar ayrı bloklarda `KNOWN_DEVIATION` adıyla sabitlenir (10-entitlements.md "Tablo–sunucu farkları").

  Senaryolar test hesaplarının tohumuyla aynı değerlerde (scripts/seed-e2e-users.mjs): e2e-free-fresh, -free-used,
  -free-exhausted, -plus (%0), -plus-90, -plus-100, -week, -sigma; ayrıca %89, ek paket, hediye, Sigma %100, kurucu
  ve kurucu önizlemede.
*/

const NOW = new Date();
const file = (path: string) => readFileSync(path, "utf8");
const migration = (name: string) => file(`supabase/migrations/${name}.sql`);

type PlanKey = "free" | "plus" | "week" | "sigma" | "founder" | "preview";
type Scenario = {
  name: string;
  plan: PlanKey;
  /** Dönem hakkının kullanılan oranı (ücretli). */
  used?: number;
  /** Cüzdan bakiyesi (ek paket / hediye). */
  balance?: number;
  chat?: number;
  photo?: number;
  firstLesson?: "none" | "open" | "done";
};

const SCENARIOS: Scenario[] = [
  { name: "e2e-free-fresh", plan: "free", chat: 0, photo: 0, firstLesson: "open" },
  { name: "e2e-free-used", plan: "free", chat: 1, photo: 0, firstLesson: "done" },
  { name: "ücretsiz, 2 mesaj", plan: "free", chat: 2, photo: 0, firstLesson: "done" },
  { name: "e2e-free-exhausted", plan: "free", chat: 3, photo: 1, firstLesson: "done" },
  { name: "ücretsiz, bitmiş + 90 hediye", plan: "free", chat: 3, photo: 1, balance: 90, firstLesson: "done" },
  { name: "e2e-plus (%0)", plan: "plus", used: 0 },
  { name: "Plus %89", plan: "plus", used: 0.89 },
  { name: "e2e-plus-90", plan: "plus", used: 0.9 },
  { name: "e2e-plus-100", plan: "plus", used: 1 },
  { name: "Plus %100 + ek paket", plan: "plus", used: 1, balance: 1000 },
  { name: "e2e-week", plan: "week", used: 0 },
  { name: "Sınav Haftası %100", plan: "week", used: 1 },
  { name: "e2e-sigma", plan: "sigma", used: 0 },
  { name: "Sigma %100", plan: "sigma", used: 1 },
  { name: "kurucu", plan: "founder" },
  { name: "kurucu önizlemede (ücretsiz gibi)", plan: "preview", balance: 100000, chat: 0, photo: 0, firstLesson: "done" },
];

/** Eylemin sunucudaki ayırması: kod ve `reserveCredits`'in gönderdiği sayaç (Stüdyo/ders dışı yol). */
const SQL_ACTION: Record<Exclude<Action, "cram.export">, { code: string; meter: string | null }> = {
  "lesson.create": { code: "STUDY_PLAN_GENERATE", meter: "lesson" },
  "teacher.message": { code: "AI_CHAT_STANDARD", meter: "chat" },
  "photo.solve": { code: "IMAGE_SOLUTION", meter: "photo" },
  "podcast.create": { code: "PODCAST_GENERATE", meter: null },
  "video.create": { code: "SKETCH_VIDEO_GENERATE", meter: null },
  "oral.start": { code: "ORAL_EXAM_GENERATE", meter: null },
  "written.start": { code: "PRACTICE_EXAM_GENERATE", meter: null },
  "duel.start": { code: "QUIZ_GENERATE", meter: "lesson" },
};
const ACTIONS = Object.keys(SQL_ACTION) as (keyof typeof SQL_ACTION)[];

const PLAN_ROW: Record<"plus" | "week" | "sigma", { id: string; slug: string; allowance: number; period: string; kind: string }> = {
  plus: { id: "aaaaaaaa-0000-4000-8000-000000000001", slug: PAID_PLANS.plus.slug, allowance: PAID_PLANS.plus.allowance, period: "monthly", kind: "monthly" },
  week: { id: "aaaaaaaa-0000-4000-8000-000000000002", slug: PAID_PLANS.week.slug, allowance: PAID_PLANS.week.allowance, period: "weekly", kind: "weekly" },
  sigma: { id: "aaaaaaaa-0000-4000-8000-000000000003", slug: PAID_PLANS.sigma.slug, allowance: PAID_PLANS.sigma.allowance, period: "monthly", kind: "monthly" },
};

const db = new PGlite();
let userSeq = 0;
const newUser = () => `00000000-0000-4000-8000-${String(++userSeq).padStart(12, "0")}`;

async function seed(scenario: Scenario): Promise<string> {
  const id = newUser();
  const paid = scenario.plan === "plus" || scenario.plan === "week" || scenario.plan === "sigma";
  const row = paid ? PLAN_ROW[scenario.plan as "plus" | "week" | "sigma"] : null;
  const allowance = row?.allowance ?? 0;
  const remaining = row ? Math.round(allowance * (1 - (scenario.used ?? 0))) : 0;
  const periodEnd = new Date(NOW.getTime() + (row?.kind === "weekly" ? 3 : 20) * 86_400_000).toISOString();
  await db.exec(`INSERT INTO profiles(id) VALUES ('${id}');
    INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind)
      VALUES ('${id}', ${scenario.balance ?? 0}, ${remaining}, ${paid ? allowance : 0}, '${periodEnd}', '${row?.kind ?? "daily"}');`);
  if (row) {
    await db.exec(`INSERT INTO subscriptions(user_id, plan_id, status, current_period_end)
      VALUES ('${id}', '${row.id}', 'active', '${periodEnd}');`);
  }
  if (scenario.plan === "founder" || scenario.plan === "preview") {
    await db.exec(`INSERT INTO user_roles(user_id, role) VALUES ('${id}', 'admin');`);
  }
  if (scenario.plan === "preview") {
    await db.exec(`INSERT INTO auth.users(id) VALUES ('${id}'); INSERT INTO admin_free_preview(user_id) VALUES ('${id}');`);
  }
  for (const meter of ["chat", "photo"] as const) {
    const used = scenario[meter] ?? 0;
    if (used > 0) {
      await db.query("INSERT INTO free_usage(user_id, meter, period_key, used) VALUES ($1, $2, free_period_key($2, now()), $3)", [id, meter, used]);
    }
  }
  return id;
}

/** `getStudentAccountContext`'in bu senaryoda döndüreceği hesap (aynı hesaplama: `quotaView`, sayaç görünümü). */
function accountFor(scenario: Scenario): StudentAccountContext {
  const paid = scenario.plan === "plus" || scenario.plan === "week" || scenario.plan === "sigma";
  const row = paid ? PLAN_ROW[scenario.plan as "plus" | "week" | "sigma"] : null;
  const periodEnd = new Date(NOW.getTime() + (row?.kind === "weekly" ? 3 : 20) * 86_400_000).toISOString();
  const meters = (["chat", "photo", "included"] as const).map((meter) => ({
    meter,
    used: meter === "included" ? 0 : (scenario[meter] ?? 0),
    limit: FREE_LIMITS[meter],
    resetsAtIso: freeMeterResetsAt(meter, NOW).toISOString(),
  }));
  if (!row) {
    const founder = scenario.plan === "founder";
    return {
      audience: "free",
      balance: scenario.plan === "preview" ? 0 : (scenario.balance ?? 0),
      freeAllowanceRemaining: 0,
      isPremium: false,
      showsUpgradeChrome: !founder,
      subscriptionBadge: null,
      subscriptionAllowance: null,
      subscriptionPeriodEnd: null,
      canSpend: true,
      isAdmin: founder,
      freePreview: scenario.plan === "preview",
      resetsAtLabel: "",
      periodKind: "daily",
      usedPercent: 0,
      extraPercent: null,
      ...(founder ? {} : { freeMeters: meters as StudentAccountContext["freeMeters"] }),
    };
  }
  const remaining = Math.round(row.allowance * (1 - (scenario.used ?? 0)));
  const quota = quotaView(
    { free_allowance_remaining: remaining, period_allowance: row.allowance, period_ends_at: periodEnd, period_kind: row.kind },
    true,
    NOW,
    row.allowance,
  );
  return {
    audience: scenario.plan === "sigma" ? "sigma" : "plus",
    balance: scenario.balance ?? 0,
    freeAllowanceRemaining: remaining,
    isPremium: true,
    showsUpgradeChrome: false,
    subscriptionBadge: scenario.plan === "sigma" ? "Sigma" : "Plus",
    subscriptionAllowance: row.allowance,
    subscriptionPeriodEnd: periodEnd,
    planSlug: row.slug,
    canSpend: true,
    isAdmin: false,
    resetsAtLabel: "",
    resetsAtIso: quota.resetsAt.toISOString(),
    periodKind: quota.kind,
    usedPercent: quota.usedPercent,
    extraPercent: null,
    quotaRemaining: quota.remaining,
    quotaAllowance: quota.allowance,
  };
}

type SqlOutcome = { ok: true } | { ok: false; error: string };
async function sqlReserve(user: string, action: keyof typeof SQL_ACTION, meter?: string | null): Promise<SqlOutcome> {
  const { code, meter: defaultMeter } = SQL_ACTION[action];
  try {
    await db.query("SELECT credit_reserve_metered($1, $2, $3, 1, $4) AS id", [user, code, `${action}-${user}-${Math.random()}`, meter === undefined ? defaultMeter : meter]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error).message) };
  }
}

/** SQL retinin kapıdaki adı (sunucu kodu → GateReason). */
function expectedReason(action: Action, scenario: Scenario, error: string): string[] {
  if (error.includes("plus_required")) return ["feature_requires_plus"];
  if (error.includes("free_limit:chat")) return ["daily_messages_used"];
  if (error.includes("free_limit:photo")) return ["daily_photo_used"];
  if (error.includes("free_limit:lesson")) return action === "duel.start" ? ["feature_requires_plus"] : ["free_first_lesson_used"];
  if (error.includes("insufficient_credits")) return scenario.plan === "plus" ? ["plus_quota_100"] : ["quota_reset_wait"];
  return [`(beklenmeyen SQL hatası: ${error})`];
}

const used = async (user: string, meter: string) =>
  (await db.query<{ n: number }>("SELECT COALESCE(sum(used), 0)::int AS n FROM free_usage WHERE user_id = $1 AND meter = $2", [user, meter])).rows[0]?.n ?? 0;

beforeAll(async () => {
  const initial = file("supabase/migrations/20250825120000_init.sql");
  const base = initial
    .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
    .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${base}
    CREATE TABLE profiles(id uuid PRIMARY KEY, referred_by uuid, created_at timestamptz DEFAULT now());
    ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
      ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
    CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
      monthly_allowance integer, billing_period text, is_premium boolean, active boolean DEFAULT true,
      updated_at timestamptz);
    CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, beneficiary_user_id uuid, plan_id uuid);
    CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
  for (const name of ["20260923120001_uat_credit_atomicity", "20260925180000_admin_credit_bypass", "20261003120000_free_tier_one_lesson", "20261008100000_admin_free_preview"]) {
    await db.exec(migration(name));
  }
  await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
      ('AI_CHAT_STANDARD', 1), ('AI_CHAT_ADVANCED', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2),
      ('FLASHCARD_GENERATE', 1), ('DOCUMENT_PAGE_PROCESS', 2), ('IMAGE_SOLUTION', 5),
      -- Canlıda init göçünden beri var (20260918100000 bedeli koyar); kredi v2/v3 bedeli günceller.
      ('PRACTICE_EXAM_GENERATE', 2);`);
  for (const row of Object.values(PLAN_ROW)) {
    await db.query("INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium) VALUES ($1, $2, $2, $3, $4, true)", [row.id, row.slug, row.allowance, row.period]);
  }
  await db.exec(migration("20261008120000_credit_system_v2"));
  await db.exec(migration("20261024121000_free_tier_counts"));
  await db.exec(`${migration("20261024120000_credit_prices_v3")}\n${migration("20261024123000_free_daily_zero")}`);
  await db.exec(migration("20261027193000_sketch_video_credits"));
  await db.exec(migration("20261111180000_free_lesson_trial"));
}, 90_000);
afterAll(() => db.close());

describe("SQL kuralları kapının fiyat tablosuyla aynı (kapı sayı uydurmuyor)", () => {
  it("her eylemin bedeli credit_rules'taki değer", async () => {
    const { actionCost } = await import("@/lib/entitlements/config");
    for (const action of ACTIONS) {
      const rows = await db.query<{ credit_cost: number }>("SELECT credit_cost FROM credit_rules WHERE action_code = $1 AND active", [SQL_ACTION[action].code]);
      expect(rows.rows[0]?.credit_cost, action).toBe(actionCost(action));
    }
  });
});

describe("karakterizasyon: getGate = bugünkü sunucu (plan × eylem)", () => {
  for (const scenario of SCENARIOS) {
    for (const action of ACTIONS) {
      // Bilinen fark: ücretsizde ilk ders henüz bitmemişken düğümsüz "yeni ders" (Stüdyo, Farklı anlat) sunucuda 402;
      // kapı açık der (OTONOM §9 karar 3). Aşağıda KNOWN_DEVIATION olarak ayrı sabitlenir.
      const knownDeviation = action === "lesson.create" && scenario.firstLesson === "open";
      it(`${scenario.name} · ${action}`, async () => {
        const user = await seed(scenario);
        const gate = getGate(snapshotFromAccount(accountFor(scenario), { firstLesson: scenario.firstLesson ?? null }, NOW), action, {}, NOW);
        const meter = SQL_ACTION[action].meter;
        const before = meter === "chat" || meter === "photo" ? await used(user, meter) : 0;
        const sql = await sqlReserve(user, action);
        if (knownDeviation) {
          expect(sql.ok).toBe(false);
          expect(gate.state).not.toBe("locked");
          return;
        }
        expect(gate.state === "locked", `${scenario.name} ${action}: SQL ${sql.ok ? "izin verdi" : (sql as { error: string }).error}, kapı ${gate.state}/${gate.reason}`).toBe(!sql.ok);
        if (!sql.ok) {
          expect(expectedReason(action, scenario, sql.error)).toContain(gate.reason);
          // Sigma'ya ve kurucuya teklif yok; Sınav Haftası'na kota sheet'i açılmaz (karar 2).
          if (scenario.plan === "sigma" || scenario.plan === "week") expect(gate.requiredPlan).toBeUndefined();
        } else if (meter === "chat" || meter === "photo") {
          // Sayaç: kapının kalan hakkı = sınır − kullanılan; başarılı ayırma sayacı bir artırır (bakiyeden ödenmediyse).
          if (gate.reason === "daily_messages_available" || gate.reason === "daily_photo_available") {
            expect(gate.remaining).toBe(gate.limit! - before);
            expect(await used(user, meter)).toBe(before + 1);
          }
        }
      });
    }
  }

  it("Plus kotası: %89 sınırlı/olağan, %90 uyarı, %100 kilit + Sigma; ek paket %100'de açık tutar (karar 1)", () => {
    const reason = (name: string) => getGate(snapshotFromAccount(accountFor(SCENARIOS.find((s) => s.name === name)!), {}, NOW), "lesson.create", {}, NOW);
    expect(reason("Plus %89")).toMatchObject({ state: "limited", reason: "quota_ok", period: "month" });
    expect(reason("e2e-plus-90")).toMatchObject({ state: "limited", reason: "plus_quota_90", period: "month" });
    expect(reason("e2e-plus-100")).toMatchObject({ state: "locked", reason: "plus_quota_100", requiredPlan: "sigma" });
    expect(reason("Plus %100 + ek paket")).toMatchObject({ state: "limited", reason: "plus_quota_90" });
    expect(reason("Sigma %100")).toMatchObject({ state: "locked", reason: "quota_reset_wait" });
    expect(reason("Sigma %100").requiredPlan).toBeUndefined();
    expect(reason("kurucu")).toEqual({ state: "open", reason: "open" });
  });

  it("ilk dersin döngüsü (düğüm bağlamı): ücretsizde açık, sayaç 'derse dahil'; başka konu kilitli", async () => {
    const scenario = SCENARIOS[0]!;
    const user = await seed(scenario);
    const snapshot = snapshotFromAccount(accountFor(scenario), { firstLesson: "open" }, NOW);
    const cycle: GateContext = { firstLessonCycle: true };
    expect(getGate(snapshot, "lesson.create", cycle, NOW)).toEqual({ state: "open", reason: "free_first_lesson_available" });
    expect((await sqlReserve(user, "lesson.create", "included")).ok).toBe(true);
    expect(await used(user, "included")).toBe(1);
    expect(getGate(snapshot, "lesson.create", { otherTopic: true }, NOW)).toMatchObject({ state: "locked", reason: "free_topic_limit", requiredPlan: "plus" });
  });
});

describe("KNOWN_DEVIATION: tablo ile sunucu ayrışıyor, kapı sunucuyu izler (10-entitlements.md)", () => {
  it("KNOWN_DEVIATION ilk ders: ücretsizde ilk ders bitmeden düğümsüz yeni ders sunucuda 402, kapı açık (karar 3)", async () => {
    const scenario = SCENARIOS[0]!;
    const user = await seed(scenario);
    const gate: Gate = getGate(snapshotFromAccount(accountFor(scenario), { firstLesson: "open" }, NOW), "lesson.create", {}, NOW);
    expect(gate).toEqual({ state: "open", reason: "free_first_lesson_available" });
    const sql = await sqlReserve(user, "lesson.create");
    expect(sql).toMatchObject({ ok: false, error: expect.stringContaining("free_limit:lesson") });
  });

  it("KNOWN_DEVIATION Sınav Haftası resetAt: tabloda paket bitişi, sunucuda cüzdan dönemi (UTC gün başı + 7)", async () => {
    // Ödeme 10:00 UTC: abonelik +7 gün 10:00'da biter, cüzdan +7 gün 00:00 UTC'de yenilenir (paytr_subscription_tier_only.sql).
    const paidAt = new Date("2026-11-10T10:00:00Z");
    const subscriptionEnd = new Date(paidAt.getTime() + 7 * 86_400_000);
    const walletEnd = new Date("2026-11-17T00:00:00Z");
    const now = new Date("2026-11-17T05:00:00Z"); // aradaki saatler
    const quota = quotaView({ free_allowance_remaining: 0, period_allowance: 2700, period_ends_at: walletEnd.toISOString(), period_kind: "weekly" }, true, now, 2700);
    expect(quota.pendingRefill).toBe(true);
    const account = { ...accountFor({ name: "week", plan: "week", used: 1 }), subscriptionPeriodEnd: subscriptionEnd.toISOString(), quotaRemaining: quota.remaining, quotaAllowance: quota.allowance, usedPercent: quota.usedPercent, resetsAtIso: quota.resetsAt.toISOString() };
    const gate = getGate(snapshotFromAccount(account, {}, now), "lesson.create", {}, now);
    // Sunucu bu saatlerde yeni 2.700 hak yazar: kapı açık der (tablodaki "paket bitişinde kilit" değil).
    expect(gate.state).toBe("limited");
    expect(gate.resetAt).not.toBe(subscriptionEnd.toISOString());
  });

  it("KNOWN_DEVIATION fotoğraf iki yoldan: sohbetteki fotoğraf AI_CHAT_STANDARD + fotoğraf sayacı (3 kredi), çözücü IMAGE_SOLUTION (4)", async () => {
    const { actionCost } = await import("@/lib/entitlements/config");
    expect(actionCost("photo.solve")).toBe(4);
    const chat = await db.query<{ credit_cost: number }>("SELECT credit_cost FROM credit_rules WHERE action_code = 'AI_CHAT_STANDARD'");
    expect(chat.rows[0]?.credit_cost).toBe(3);
  });

  it("KNOWN_DEVIATION ders ve mesaj tek havuz: ücretli hesapta kalan 'ders' ve 'mesaj' aynı kredilerden türetilir", () => {
    const scenario = SCENARIOS.find((s) => s.name === "e2e-plus-90")!;
    const snapshot = snapshotFromAccount(accountFor(scenario), {}, NOW);
    const lesson = getGate(snapshot, "lesson.create", {}, NOW);
    const message = getGate(snapshot, "teacher.message", {}, NOW);
    expect(lesson.remaining).toBe(message.remaining);
    expect(lesson.limit).toBe(message.limit);
  });
});
