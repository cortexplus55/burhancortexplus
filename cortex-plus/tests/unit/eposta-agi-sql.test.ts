import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  E-posta ağı (7 Kasım 2026), gerçek SQL ile: hedef kitle kuralları, gönderim kuyruğu (sahiplenme, izin geri alma,
  askı), tek seferlik e-postalar ve davet hediyesinin günlük tavanı + kapatma anahtarı. Göç `20261107150000`,
  davet hediyesinin önceki hâli (`20261031162000`) üstüne yüklenir.
*/

const read = (path: string) => readFileSync(path, "utf8");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const FREE = id(1);
const PAID = id(2);
const UNVERIFIED = id(3);
const SUSPENDED = id(4);
const DELETED = id(5);
const OPTED = id(6);
const NOEMAIL = id(7);

describe("e-posta ağı: hedef kitle ve gönderim kuyruğu", () => {
  const db = new PGlite();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const scalar = async (sql: string, params: unknown[] = []) => Object.values((await q(sql, params))[0] ?? {})[0];

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY, full_name text, referred_by uuid, referral_code text,
        deleted_at timestamptz, suspended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_premium boolean NOT NULL);
      CREATE TABLE public.subscriptions (user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE public.exam_preps (user_id uuid, exam_date date);
      CREATE TABLE public.feature_flags (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text, metadata jsonb, updated_at timestamptz DEFAULT now());
      CREATE TABLE public.credit_wallets (user_id uuid PRIMARY KEY);
      CREATE TABLE public.credit_ledger (user_id uuid NOT NULL, idempotency_key text NOT NULL, amount integer, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.notifications (user_id uuid, title text, body text);
      CREATE TABLE public.email_events (user_id uuid, template_key text NOT NULL, status text NOT NULL, created_at timestamptz DEFAULT now());
      CREATE TABLE public.unverified (id uuid PRIMARY KEY);
      CREATE FUNCTION public.account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.unverified WHERE id = $1) $$;
      CREATE FUNCTION public.credit_gift(p_user_id uuid, p_amount integer, p_key text, p_meta jsonb) RETURNS void
        LANGUAGE sql AS $$ INSERT INTO public.credit_ledger(user_id, idempotency_key, amount) VALUES (p_user_id, p_key, p_amount) $$;`);
    await db.exec(read("supabase/migrations/20261031162000_email_alias_guard.sql"));
    await db.exec(read("supabase/migrations/20261107150000_eposta_agi.sql"));

    const people: [string, string | null, string, Partial<{ suspended: boolean; deleted: boolean; signup: string }>][] = [
      [FREE, "ayse@ornek.com", "Ayşe Yılmaz", { signup: "now() - interval '10 days'" }],
      [PAID, "mehmet@ornek.com", "Mehmet Kaya", {}],
      [UNVERIFIED, "baskasi@ornek.com", "Başkası", {}],
      [SUSPENDED, "askida@ornek.com", "Askıda", { suspended: true }],
      [DELETED, "silinmis@ornek.com", "Silinmiş", { deleted: true }],
      [OPTED, "izinli@ornek.com", "Zeynep Demir", {}],
      [NOEMAIL, null, "Adressiz", {}],
    ];
    for (const [uid, email, name, flags] of people) {
      await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [uid, email]);
      await db.query(
        `INSERT INTO public.profiles (id, full_name, suspended_at, deleted_at, created_at)
         VALUES ($1, $2, ${flags.suspended ? "now()" : "NULL"}, ${flags.deleted ? "now()" : "NULL"}, ${flags.signup ?? "now()"})`,
        [uid, name],
      );
      await db.query("INSERT INTO public.credit_wallets (user_id) VALUES ($1)", [uid]);
    }
    await db.query("INSERT INTO public.unverified (id) VALUES ($1)", [UNVERIFIED]);
    const [{ id: premiumPlan }] = await q<{ id: string }>("INSERT INTO public.plans (is_premium) VALUES (true) RETURNING id");
    await db.query("INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end) VALUES ($1, $2, 'active', now() + interval '10 days')", [PAID, premiumPlan]);
    const today = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
    await db.exec(`INSERT INTO public.exam_preps (user_id, exam_date) VALUES
      ('${FREE}', ${today} + 20), ('${FREE}', ${today} + 60), ('${OPTED}', ${today} + 5), ('${PAID}', ${today} - 3)`);
    await db.query("INSERT INTO public.email_preferences (user_id, marketing) VALUES ($1, true), ($2, true), ($3, true)", [OPTED, UNVERIFIED, SUSPENDED]);
  });

  afterAll(async () => {
    await db.close();
  });

  it("hizmet duyurusu: doğrulanmış, askıda ve silinmiş olmayan, adresi olan herkes", async () => {
    const rows = await q<{ user_id: string }>("SELECT user_id FROM public.email_audience('service') ORDER BY user_id");
    expect(rows.map((row) => row.user_id)).toEqual([FREE, PAID, OPTED]);
    expect(await scalar("SELECT public.email_audience_count('service')")).toBe(3);
  });

  it("kampanya: yalnız izin verenler; doğrulanmamış ve askıdaki izinli hesap gitmez", async () => {
    const rows = await q<{ user_id: string }>("SELECT user_id FROM public.email_audience('marketing')");
    expect(rows.map((row) => row.user_id)).toEqual([OPTED]);
  });

  it("paket süzgeci: Plus abonesi ve ücretsiz ayrılır", async () => {
    expect((await q("SELECT user_id FROM public.email_audience('service', 'paid')")).map((row) => row.user_id)).toEqual([PAID]);
    const free = (await q<{ user_id: string }>("SELECT user_id FROM public.email_audience('service', 'free') ORDER BY user_id")).map((row) => row.user_id);
    expect(free).toEqual([FREE, OPTED]);
  });

  it("kayıt tarihi ve sınav süzgeci; sınava kalan gün en yakın gelecek sınavdan", async () => {
    expect((await q("SELECT user_id FROM public.email_audience('service', 'all', 5)")).map((row) => row.user_id).sort()).toEqual([PAID, OPTED].sort());
    const withExam = await q<{ user_id: string; days_to_exam: number; first_name: string }>(
      "SELECT user_id, days_to_exam, first_name FROM public.email_audience('service', 'all', NULL, 30) ORDER BY days_to_exam",
    );
    expect(withExam).toEqual([
      { user_id: OPTED, days_to_exam: 5, first_name: "Zeynep" },
      { user_id: FREE, days_to_exam: 20, first_name: "Ayşe" },
    ]);
    // Geçmiş sınav sayılmaz.
    expect((await q("SELECT days_to_exam FROM public.email_audience('service') WHERE user_id = $1", [PAID]))[0]).toMatchObject({ days_to_exam: null });
  });

  it("örnek en çok 20 kişi, sıralı; adresle hesap bulma büyük küçük harfe bakmaz", async () => {
    expect((await q("SELECT * FROM public.email_audience_sample('service', 'all', NULL, NULL, 500)")).length).toBe(3);
    expect((await q("SELECT user_id, first_name FROM public.email_find_user(' AYSE@ornek.com ')"))[0]).toMatchObject({ user_id: FREE, first_name: "Ayşe" });
    expect(await q("SELECT * FROM public.email_find_user('yok@ornek.com')")).toEqual([]);
    expect(await q("SELECT * FROM public.email_find_user('silinmis@ornek.com')")).toEqual([]);
  });

  it("kuyruk: açılır, sahiplenilir, aynı alıcı ikinci kez gelmez, gönderilince biter", async () => {
    const [{ id: campaign }] = await q<{ id: string }>(
      "INSERT INTO public.email_campaigns (kind, subject, body) VALUES ('service', 'Konu', 'Mesaj metni burada') RETURNING id",
    );
    expect(await scalar("SELECT public.email_campaign_open($1, 'service', 'all', NULL, NULL)", [campaign])).toBe(3);

    const first = await q<{ recipient_id: number; user_id: string; email: string; first_name: string | null }>(
      "SELECT * FROM public.email_campaign_claim($1, 2)", [campaign]);
    expect(first).toHaveLength(2);
    const second = await q<{ recipient_id: number }>("SELECT * FROM public.email_campaign_claim($1, 10)", [campaign]);
    expect(second).toHaveLength(1);
    expect(first.map((row) => row.recipient_id)).not.toContain(second[0]!.recipient_id);
    expect(await q("SELECT * FROM public.email_campaign_claim($1, 10)", [campaign])).toEqual([]);

    const ids = [...first, ...second].map((row) => row.recipient_id);
    await db.query("SELECT public.email_campaign_mark_sent($1::bigint[], $2::text[])", [ids.slice(0, 2), ["re_1", "re_2"]]);
    let state = (await q<{ campaign_status: string; remaining_count: number; sent_count: number }>("SELECT * FROM public.email_campaign_refresh($1)", [campaign]))[0]!;
    expect(state).toMatchObject({ campaign_status: "sending", sent_count: 2, remaining_count: 1 });
    expect(await scalar("SELECT provider_id FROM public.email_campaign_recipients WHERE id = $1", [ids[1]])).toBe("re_2");

    // Kota dolunca alıcı kuyruğa geri döner (başarısız yazılmaz) ve yeniden sahiplenilebilir.
    await db.query("SELECT public.email_campaign_mark($1::bigint[], 'pending', 'kota')", [[ids[2]]]);
    expect(await q("SELECT * FROM public.email_campaign_claim($1, 10)", [campaign])).toHaveLength(1);
    await db.query("SELECT public.email_campaign_mark_sent($1::bigint[], $2::text[])", [[ids[2]], ["re_3"]]);
    state = (await q<{ campaign_status: string; remaining_count: number; sent_count: number }>("SELECT * FROM public.email_campaign_refresh($1)", [campaign]))[0]!;
    expect(state).toMatchObject({ campaign_status: "sent", sent_count: 3, remaining_count: 0 });
    expect(await scalar("SELECT finished_at IS NOT NULL FROM public.email_campaigns WHERE id = $1", [campaign])).toBe(true);
  });

  it("kampanya: açıldıktan sonra izni geri alan ya da hesabı askıya alınan alıcı gönderim anında atlanır", async () => {
    await db.query("INSERT INTO public.email_preferences (user_id, marketing) VALUES ($1, true) ON CONFLICT (user_id) DO UPDATE SET marketing = true", [FREE]);
    const [{ id: campaign }] = await q<{ id: string }>(
      "INSERT INTO public.email_campaigns (kind, subject, body) VALUES ('marketing', 'Kampanya', 'Kampanya metni burada') RETURNING id",
    );
    expect(await scalar("SELECT public.email_campaign_open($1, 'marketing', 'all', NULL, NULL)", [campaign])).toBe(2);
    await db.query("UPDATE public.email_preferences SET marketing = false WHERE user_id = $1", [FREE]);

    const claimed = await q<{ user_id: string }>("SELECT * FROM public.email_campaign_claim($1, 10)", [campaign]);
    expect(claimed.map((row) => row.user_id)).toEqual([OPTED]);
    expect(await scalar("SELECT error FROM public.email_campaign_recipients WHERE campaign_id = $1 AND user_id = $2", [campaign, FREE])).toBe("izin_yok");
    expect(await scalar("SELECT status FROM public.email_campaign_recipients WHERE campaign_id = $1 AND user_id = $2", [campaign, FREE])).toBe("skipped");

    // Askıya alınan hesap hizmet duyurusunda da atlanır.
    const [{ id: announce }] = await q<{ id: string }>("INSERT INTO public.email_campaigns (kind, subject, body) VALUES ('service', 'Duyuru', 'Duyuru metni burada') RETURNING id");
    await db.query("SELECT public.email_campaign_open($1, 'service', 'all', NULL, NULL)", [announce]);
    await db.query("UPDATE public.profiles SET suspended_at = now() WHERE id = $1", [PAID]);
    const rows = await q<{ user_id: string }>("SELECT * FROM public.email_campaign_claim($1, 10)", [announce]);
    expect(rows.map((row) => row.user_id).sort()).toEqual([FREE, OPTED].sort());
    await db.query("UPDATE public.profiles SET suspended_at = NULL WHERE id = $1", [PAID]);
  });

  it("tek alıcı hesabı olmayan adrese: adres satırda saklanır, claim onu verir; yarıda kalan sahiplenme 15 dk sonra kuyruğa döner", async () => {
    const [{ id: campaign }] = await q<{ id: string }>("INSERT INTO public.email_campaigns (kind, subject, body, total) VALUES ('single', 'Tek', 'Tek kişilik mesaj', 1) RETURNING id");
    await db.query("INSERT INTO public.email_campaign_recipients (campaign_id, email) VALUES ($1, 'dis@adres.com')", [campaign]);
    const claimed = await q<{ email: string; user_id: string | null }>("SELECT * FROM public.email_campaign_claim($1, 5)", [campaign]);
    expect(claimed).toEqual([expect.objectContaining({ email: "dis@adres.com", user_id: null })]);
    expect(await q("SELECT * FROM public.email_campaign_claim($1, 5)", [campaign])).toEqual([]);
    await db.query("UPDATE public.email_campaign_recipients SET claimed_at = now() - interval '20 minutes' WHERE campaign_id = $1", [campaign]);
    expect(await q("SELECT * FROM public.email_campaign_claim($1, 5)", [campaign])).toHaveLength(1);
  });

  it("durmuş gönderimden alıcı alınmaz", async () => {
    const [{ id: campaign }] = await q<{ id: string }>("INSERT INTO public.email_campaigns (kind, subject, body, status) VALUES ('service', 'Durdu', 'Durmuş mesaj metni', 'cancelled') RETURNING id");
    await db.query("INSERT INTO public.email_campaign_recipients (campaign_id, user_id) VALUES ($1, $2)", [campaign, FREE]);
    expect(await q("SELECT * FROM public.email_campaign_claim($1, 5)", [campaign])).toEqual([]);
  });

  it("doğrulanmış kimlikler: yalnız doğrulanmışlar döner (hatırlatma e-postası doğrulanmamış adrese gitmez)", async () => {
    const rows = await q<{ user_id: string }>("SELECT * FROM public.email_verified_ids($1::uuid[])", [[FREE, UNVERIFIED, PAID]]);
    expect(rows.map((row) => row.user_id).sort()).toEqual([FREE, PAID].sort());
  });

  it("davet e-postası: kampanya izni olan, kayıttan 6 saat geçmiş, bir kez; izni olmayan ve doğrulanmamış almaz", async () => {
    await db.query("UPDATE public.profiles SET created_at = now() - interval '1 day' WHERE id IN ($1, $2, $3)", [OPTED, FREE, UNVERIFIED]);
    await db.query("UPDATE public.email_preferences SET marketing = true WHERE user_id = $1", [OPTED]);
    let due = await q<{ user_id: string }>("SELECT user_id FROM public.email_due_referral_invites(50)");
    expect(due.map((row) => row.user_id)).toEqual([OPTED]);

    await db.query("INSERT INTO public.email_events (user_id, template_key, status) VALUES ($1, 'once:referral_invite', 'sent')", [OPTED]);
    due = await q("SELECT user_id FROM public.email_due_referral_invites(50)");
    expect(due).toEqual([]);
    // Aynı öğrenciye aynı tek seferlik anahtar iki kez yazılamaz (cron iki kez çalışsa bile).
    await expect(
      db.query("INSERT INTO public.email_events (user_id, template_key, status) VALUES ($1, 'once:referral_invite', 'claimed')", [OPTED]),
    ).rejects.toThrow();

    await db.query("UPDATE public.profiles SET created_at = now() - interval '1 hour' WHERE id = $1", [FREE]);
    await db.query("INSERT INTO public.email_preferences (user_id, marketing) VALUES ($1, true) ON CONFLICT (user_id) DO UPDATE SET marketing = true", [FREE]);
    expect(await q("SELECT user_id FROM public.email_due_referral_invites(50) WHERE user_id = $1", [FREE])).toEqual([]);
  });

  it("anahtar tablosu tarayıcıya kapalı; yeni işlevler yalnız servis anahtarına açık", async () => {
    expect(await scalar("SELECT has_table_privilege('authenticated', 'public.email_preferences', 'SELECT')")).toBe(false);
    expect(await scalar("SELECT has_table_privilege('anon', 'public.email_campaigns', 'INSERT')")).toBe(false);
    expect(await scalar("SELECT has_function_privilege('authenticated', 'public.email_audience(text,text,integer,integer)', 'EXECUTE')")).toBe(false);
    expect(await scalar("SELECT has_function_privilege('service_role', 'public.email_campaign_claim(uuid,integer)', 'EXECUTE')")).toBe(true);
    expect(await scalar("SELECT enabled FROM public.feature_flags WHERE key = 'marketing_email'")).toBe(false);
    expect(await scalar("SELECT enabled FROM public.feature_flags WHERE key = 'referral_gifts'")).toBe(true);
  });
});

describe("davet hediyesi: günlük tavan, kapatma anahtarı, bildirim", () => {
  const db = new PGlite();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const scalar = async (sql: string, params: unknown[] = []) => Object.values((await q(sql, params))[0] ?? {})[0];

  const INVITER = id(101);
  const invitee = (n: number) => id(200 + n);

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY, full_name text, referred_by uuid, referral_code text,
        deleted_at timestamptz, suspended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_premium boolean NOT NULL);
      CREATE TABLE public.subscriptions (user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE public.exam_preps (user_id uuid, exam_date date);
      CREATE TABLE public.feature_flags (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text, metadata jsonb, updated_at timestamptz DEFAULT now());
      CREATE TABLE public.credit_wallets (user_id uuid PRIMARY KEY);
      CREATE TABLE public.credit_ledger (user_id uuid NOT NULL, idempotency_key text NOT NULL, amount integer, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.notifications (user_id uuid, title text, body text);
      CREATE TABLE public.email_events (user_id uuid, template_key text NOT NULL, status text NOT NULL, created_at timestamptz DEFAULT now());
      CREATE FUNCTION public.account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION public.credit_gift(p_user_id uuid, p_amount integer, p_key text, p_meta jsonb) RETURNS void
        LANGUAGE sql AS $$ INSERT INTO public.credit_ledger(user_id, idempotency_key, amount) VALUES (p_user_id, p_key, p_amount) $$;`);
    await db.exec(read("supabase/migrations/20261031162000_email_alias_guard.sql"));
    await db.exec(read("supabase/migrations/20261107150000_eposta_agi.sql"));

    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'davet.eden@ornek.com')", [INVITER]);
    await db.query("INSERT INTO public.profiles (id, full_name) VALUES ($1, 'Davet Eden')", [INVITER]);
    await db.query("INSERT INTO public.credit_wallets (user_id) VALUES ($1)", [INVITER]);
    for (let n = 1; n <= 6; n += 1) {
      await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [invitee(n), `davetli${n}@ornek.com`]);
      await db.query("INSERT INTO public.profiles (id, full_name, referred_by) VALUES ($1, $2, $3)", [invitee(n), `Davetli ${n}`, INVITER]);
      await db.query("INSERT INTO public.credit_wallets (user_id) VALUES ($1)", [invitee(n)]);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  const gifts = async () => Number(await scalar("SELECT count(*) FROM public.credit_ledger WHERE idempotency_key LIKE 'referral-gift:%'"));

  it("hediye yazılır: iki tarafa 90 kredi, iki bildirim; ikinci çağrı yeni hediye üretmez", async () => {
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(1)]);
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(1)]);
    expect(await gifts()).toBe(1);
    expect(await scalar("SELECT count(*) FROM public.credit_ledger WHERE idempotency_key = 'referral-gift-inviter:' || $1", [invitee(1)])).toBe(1);
    const notices = await q<{ user_id: string; title: string }>("SELECT user_id, title FROM public.notifications ORDER BY title");
    expect(notices.map((row) => row.user_id).sort()).toEqual([INVITER, invitee(1)].sort());
    expect(await scalar("SELECT gifts FROM public.referral_gift_days")).toBe(1);
  });

  it("kapatma anahtarı: kapalıyken hediye yazılmaz ve sayaç artmaz; açılınca bekleyen yazılır", async () => {
    await db.query("UPDATE public.feature_flags SET enabled = false WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(2)]);
    expect(await gifts()).toBe(1);
    expect(await scalar("SELECT gifts FROM public.referral_gift_days")).toBe(1);

    await db.query("UPDATE public.feature_flags SET enabled = true WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(2)]);
    expect(await gifts()).toBe(2);
  });

  it("günlük tavan: dolunca yeni hediye yazılmaz (kimse hakkını kaybetmez); tavan yükselince yazılır", async () => {
    await db.query("UPDATE public.feature_flags SET metadata = jsonb_build_object('daily_cap', 2) WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(3)]);
    expect(await gifts()).toBe(2);
    expect(await scalar("SELECT gifts FROM public.referral_gift_days")).toBe(2);

    await db.query("UPDATE public.feature_flags SET metadata = jsonb_build_object('daily_cap', 3) WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(3)]);
    expect(await gifts()).toBe(3);
  });

  it("davet eden en çok 3 hediye alır; dördüncü davetli yine kendi hediyesini alır, davet edene yazılmaz", async () => {
    await db.query("UPDATE public.feature_flags SET metadata = jsonb_build_object('daily_cap', 50) WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(4)]);
    expect(await scalar("SELECT count(*) FROM public.credit_ledger WHERE idempotency_key LIKE 'referral-gift-inviter:%'")).toBe(3);
    expect(await scalar("SELECT count(*) FROM public.credit_ledger WHERE idempotency_key = 'referral-gift:' || $1", [invitee(4)])).toBe(1);
    // Davet edene dördüncü bildirim yazılmaz (hediyesi yazılmadı).
    expect(await scalar("SELECT count(*) FROM public.notifications WHERE user_id = $1", [INVITER])).toBe(3);
  });

  it("tavan satırı yoksa varsayılan 150 çalışır; anahtar satırı da yoksa hediye açık kalır", async () => {
    await db.query("DELETE FROM public.feature_flags WHERE key = 'referral_gifts'");
    await db.query("SELECT public.grant_referral_gift($1)", [invitee(5)]);
    expect(await scalar("SELECT count(*) FROM public.credit_ledger WHERE idempotency_key = 'referral-gift:' || $1", [invitee(5)])).toBe(1);
    const stats = (await q<{ invited: number; gifted: number; gifts_today: number; daily_cap: number; enabled: boolean }>("SELECT * FROM public.referral_admin_stats()"))[0]!;
    expect(stats).toMatchObject({ invited: 6, daily_cap: 150, enabled: true });
    expect(Number(stats.gifted)).toBe(5);
  });

  it("en çok davet edenler ve hediye e-postası kuyruğu (davet edenin hediyesi, 3 gün içinde, bir kez)", async () => {
    const top = await q<{ inviter_id: string; invited: number; gifted: number }>("SELECT * FROM public.referral_top_inviters(5)");
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ inviter_id: INVITER });
    expect(Number(top[0]!.invited)).toBe(6);

    const mails = await q<{ user_id: string; mail_key: string }>("SELECT user_id, mail_key FROM public.email_due_referral_gift_mails(10) ORDER BY mail_key");
    expect(mails).toHaveLength(3);
    expect(mails.every((row) => row.user_id === INVITER && row.mail_key.startsWith("once:rg:"))).toBe(true);

    await db.query("INSERT INTO public.email_events (user_id, template_key, status) VALUES ($1, $2, 'sent')", [INVITER, mails[0]!.mail_key]);
    expect(await q("SELECT * FROM public.email_due_referral_gift_mails(10)")).toHaveLength(2);

    await db.query("UPDATE public.credit_ledger SET created_at = now() - interval '5 days' WHERE idempotency_key LIKE 'referral-gift-inviter:%'");
    expect(await q("SELECT * FROM public.email_due_referral_gift_mails(10)")).toEqual([]);
  });
});
