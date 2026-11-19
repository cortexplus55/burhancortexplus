/**
 * Faz 2 göçleri gerçek PostgreSQL'de (PGlite): ekleyici, iki kez çalışınca bozulmaz, var olan satırı silmez.
 * Supabase'e ait parçalar (auth şeması, roller, JWT rolü) en küçük hâliyle taklit edilir.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeCanonicalEmail } from "@/lib/auth/canonical-email";

const read = (path: string) => readFileSync(path, "utf8");
const MIGRATIONS = [
  "20261119100000_faz2_session_user_context",
  "20261119100100_faz2_mistake_entries_source_ref",
  "20261119100200_faz2_canonical_email",
  "20261119100300_faz2_legal_acceptance",
  "20261119100400_faz2_document_page_range",
  "20261119100500_faz2_progressive_prep_setup",
];
const PREP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOPIC_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const TOPIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const U4 = "44444444-4444-4444-8444-444444444444";

const db = new PGlite();

/** İsteği yapan rol ve kullanıcı (PostgREST'in her istekte yazdığı JWT iddiaları). */
async function as(role: "anon" | "authenticated" | "service_role" | null, uid: string | null, sql: string, params: unknown[] = []) {
  await db.query(`SELECT set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)`, [
    role ?? "",
    uid ?? "",
  ]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`SELECT set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claim.sub', '', false)`);
  }
}

beforeAll(async () => {
  const mistakeTable = read("supabase/migrations/20260905120000_mistake_notebook.sql");
  const aliasGuard = read("supabase/migrations/20261031162000_email_alias_guard.sql");
  const normalize = aliasGuard.slice(
    aliasGuard.indexOf("CREATE OR REPLACE FUNCTION public.normalize_email"),
    aliasGuard.indexOf("CREATE OR REPLACE FUNCTION public.email_alias_taken"),
  );
  await db.exec(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $f$;
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY, full_name text, avatar_url text, primary_role text DEFAULT 'student',
      onboarding_completed_at timestamptz, deleted_at timestamptz, suspended_at timestamptz, tutor_style text,
      grade_level text, focus_subject text, school_id uuid, school_name text
    );
    CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
    CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
      SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role IN ('admin','founder') AND ur.revoked_at IS NULL)
    $f$;
    CREATE TABLE public.credit_wallets (user_id uuid PRIMARY KEY, balance integer DEFAULT 0, free_allowance_remaining integer DEFAULT 0,
      period_allowance integer DEFAULT 0, period_ends_at timestamptz, period_kind text);
    CREATE TABLE public.plans (id uuid PRIMARY KEY, is_premium boolean, tier text, name text, slug text, monthly_allowance integer);
    CREATE TABLE public.subscriptions (user_id uuid, plan_id uuid, status text, current_period_end timestamptz, cancel_at_period_end boolean);
    CREATE TABLE public.admin_free_preview (user_id uuid PRIMARY KEY, started_at timestamptz DEFAULT now(), remaining integer DEFAULT 2,
      period_ends_at timestamptz DEFAULT now() + interval '1 day');
    CREATE TABLE public.free_usage (user_id uuid, meter text, period_key text, used integer);
    CREATE TABLE public.consent_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, consent_type text NOT NULL,
      version text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(), ip_hash text, evidence jsonb);
    CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, page_count integer,
      source_page_count integer);
    CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid NOT NULL, title text);
    CREATE TABLE public.exam_prep_nodes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_prep_id uuid NOT NULL,
      sort_order integer NOT NULL, session_meta jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE public.exam_prep_topics (id uuid PRIMARY KEY, exam_prep_id uuid NOT NULL, label text,
      document_topic_node_id uuid, familiarity text, measured_level text, diagnostic_status text DEFAULT 'unmeasured',
      source_refs jsonb DEFAULT '[]'::jsonb, contradictions jsonb DEFAULT '[]'::jsonb);
    ${normalize}
    ${mistakeTable.slice(0, mistakeTable.indexOf("ALTER TABLE public.mistake_entries ENABLE ROW LEVEL SECURITY")).replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "")}
  `);

  // Canlıdakine benzer başlangıç: aynı Gmail kutusundan üç eski hesap (en eskisi U1) ve ayrı bir hesap (U3).
  await db.exec(`
    INSERT INTO auth.users (id, email, created_at) VALUES
      ('${U1}', 'ogrenci.bir@gmail.com', now() - interval '3 days'),
      ('${U2}', 'ogrencibir+iki@googlemail.com', now() - interval '2 days'),
      ('${U4}', 'OgrenciBir+dort@gmail.com', now() - interval '1 days'),
      ('${U3}', 'baska@okul.edu.tr', now() - interval '1 days');
    INSERT INTO public.profiles (id, full_name, onboarding_completed_at) VALUES
      ('${U1}', 'Bir', now()), ('${U2}', 'İki', now()), ('${U4}', 'Dört', now()), ('${U3}', 'Üç', now());
    INSERT INTO public.mistake_entries (user_id, source, source_question_id, question_text)
      VALUES ('${U1}', 'deneme', gen_random_uuid(), 'Eski deneme sorusu'), ('${U1}', 'quiz', gen_random_uuid(), 'Eski quiz sorusu');
    INSERT INTO public.consent_records (user_id, consent_type, version, accepted_at) VALUES
      ('${U1}', 'kullanim_kosullari', 'v1', now() - interval '3 days'),
      ('${U1}', 'kvkk_aydinlatma', 'v1', now() - interval '3 days'),
      ('${U1}', 'yas_beyani', 'v1', now() - interval '3 days');
    INSERT INTO public.documents (user_id, page_count, source_page_count) VALUES ('${U1}', 5, 12);
    INSERT INTO public.exam_preps (id, user_id, title) VALUES ('${PREP}', '${U1}', 'Hazırlık');
    INSERT INTO public.exam_prep_nodes (exam_prep_id, sort_order) VALUES ('${PREP}', 0), ('${PREP}', 1), ('${PREP}', 2);
    INSERT INTO public.exam_prep_topics (id, exam_prep_id, label, familiarity) VALUES
      ('${TOPIC_A}', '${PREP}', 'Konu A', 'heard'), ('${TOPIC_B}', '${PREP}', 'Konu B', 'heard');
  `);

  // İki kez: tekrar çalıştırılabilir olmalı.
  for (const run of [1, 2]) {
    for (const file of MIGRATIONS) {
      try {
        await db.exec(read(`supabase/migrations/${file}.sql`));
      } catch (error) {
        throw new Error(`${file} (çalıştırma ${run}): ${(error as Error).message}`);
      }
    }
  }
}, 60_000);

afterAll(() => db.close());

describe("madde 3: mistake_entries.source_ref", () => {
  it("eski satırlar yerinde; yol kimliği UUID'siz yazılır; yeni kaynaklar kabul edilir", async () => {
    const old = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.mistake_entries");
    expect(old.rows[0]!.n).toBe(2);
    for (const [source, ref] of [["quiz", "a1:q:0"], ["true_false", "a1:tf:1"], ["podcast", "a1:pc:0"], ["lesson_check", "a1:lc:2"]]) {
      await db.query(
        "INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, $2, $3, 'Soru')",
        [U1, source, ref],
      );
    }
    // Aynı kullanıcı + kaynak + yol kimliği ikinci kez açılamaz.
    await expect(
      db.query("INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'quiz', 'a1:q:0', 'Soru')", [U1]),
    ).rejects.toThrow(/duplicate key|unique/i);
    // Bilinmeyen kaynak ve kimliksiz satır hâlâ reddedilir.
    await expect(
      db.query("INSERT INTO public.mistake_entries (user_id, source, source_ref, question_text) VALUES ($1, 'baska', 'x', 'Soru')", [U1]),
    ).rejects.toThrow(/mistake_entries_source/);
    await expect(
      db.query("INSERT INTO public.mistake_entries (user_id, source, question_text) VALUES ($1, 'quiz', 'Soru')", [U1]),
    ).rejects.toThrow(/mistake_entries_has_identity/);
  });
});

describe("madde 4: profiles.canonical_email", () => {
  it("geri doldurma kopyaları bozmaz: kutunun en eski hesabı kanonik adresi alır, diğerleri NULL, hiçbiri silinmez", async () => {
    const rows = await db.query<{ id: string; canonical_email: string | null }>(
      "SELECT id, canonical_email FROM public.profiles ORDER BY id",
    );
    expect(rows.rows).toHaveLength(4);
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row.canonical_email]));
    expect(byId[U1]).toBe("ogrencibir@gmail.com");
    expect(byId[U2]).toBeNull();
    expect(byId[U4]).toBeNull();
    expect(byId[U3]).toBe("baska@okul.edu.tr");
  });

  it("SQL kuralı ile TS kuralı aynı sonucu verir", async () => {
    for (const email of [" Ad.Soyad+Not@GoogleMail.com ", "ad+x@okul.edu.tr", "AD@Okul.Edu.Tr", "a.b.c@gmail.com", "yalniz-metin"]) {
      const sql = await db.query<{ n: string }>("SELECT public.normalize_email($1) AS n", [email]);
      expect(sql.rows[0]!.n).toBe(normalizeCanonicalEmail(email));
    }
  });

  it("aynı kutunun yeni hesabı profil açamaz (kayıt işlemi geri alınır); farklı kutu açar", async () => {
    const dupId = "55555555-5555-4555-8555-555555555555";
    await db.exec("BEGIN");
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'o.g.r.e.n.c.i.b.i.r+yeni@gmail.com')", [dupId]);
    await expect(db.query("INSERT INTO public.profiles (id, full_name) VALUES ($1, 'Kopya')", [dupId])).rejects.toThrow(/email_alias_taken/);
    await db.exec("ROLLBACK");
    const left = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM auth.users WHERE id = $1", [dupId]);
    expect(left.rows[0]!.n).toBe(0);

    const freshId = "66666666-6666-4666-8666-666666666666";
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'Yeni.Ogrenci@okul.edu.tr')", [freshId]);
    await db.query("INSERT INTO public.profiles (id, full_name, canonical_email) VALUES ($1, 'Yeni', 'sahte@x.com')", [freshId]);
    const row = await db.query<{ canonical_email: string }>("SELECT canonical_email FROM public.profiles WHERE id = $1", [freshId]);
    // İstemcinin yolladığı değer yok sayılır, auth.users'tan hesaplanır.
    expect(row.rows[0]!.canonical_email).toBe("yeni.ogrenci@okul.edu.tr");
  });

  it("tarayıcı kanonik adresini değiştiremez; sunucu anahtarı değiştirebilir", async () => {
    await as("authenticated", U1, "UPDATE public.profiles SET canonical_email = NULL, full_name = 'Bir (yeni ad)' WHERE id = $1", [U1]);
    const after = await db.query<{ canonical_email: string | null; full_name: string }>(
      "SELECT canonical_email, full_name FROM public.profiles WHERE id = $1",
      [U1],
    );
    expect(after.rows[0]).toEqual({ canonical_email: "ogrencibir@gmail.com", full_name: "Bir (yeni ad)" });
  });
});

describe("madde 6: yasal onay anları", () => {
  it("var olan onaylar profile taşınır; yeni onay kaydı boş alanı doldurur", async () => {
    const u1 = await db.query<{ t: string | null; k: string | null; a: string | null }>(
      "SELECT terms_accepted_at AS t, kvkk_accepted_at AS k, age_confirmed_at AS a FROM public.profiles WHERE id = $1",
      [U1],
    );
    expect(u1.rows[0]!.t).not.toBeNull();
    expect(u1.rows[0]!.k).not.toBeNull();
    expect(u1.rows[0]!.a).not.toBeNull();

    const before = await db.query<{ k: string | null }>("SELECT kvkk_accepted_at AS k FROM public.profiles WHERE id = $1", [U3]);
    expect(before.rows[0]!.k).toBeNull();
    await as("service_role", null, "INSERT INTO public.consent_records (user_id, consent_type, version) VALUES ($1, 'kvkk_aydinlatma', 'v2')", [U3]);
    const after = await db.query<{ k: string | null }>("SELECT kvkk_accepted_at AS k FROM public.profiles WHERE id = $1", [U3]);
    expect(after.rows[0]!.k).not.toBeNull();
  });

  it("tarayıcı onay anını kendisi yazamaz", async () => {
    await as("authenticated", U3, "UPDATE public.profiles SET terms_accepted_at = now() WHERE id = $1", [U3]);
    const row = await db.query<{ t: string | null }>("SELECT terms_accepted_at AS t FROM public.profiles WHERE id = $1", [U3]);
    expect(row.rows[0]!.t).toBeNull();
  });
});

describe("madde 2: get_session_user_context", () => {
  it("kendi bağlamını tek çağrıda döner; başka kullanıcıyı ve oturumsuz çağrıyı NULL'la geri çevirir", async () => {
    await db.exec(`INSERT INTO public.credit_wallets (user_id, balance) VALUES ('${U3}', 7);
      INSERT INTO public.free_usage (user_id, meter, period_key, used) VALUES ('${U3}', 'chat', 'd:2026-11-19', 2), ('${U3}', 'chat', 'd:2026-11-18', 9);`);
    const own = await as("authenticated", U3, "SELECT public.get_session_user_context($1, ARRAY['d:2026-11-19']) AS ctx", [U3]);
    const ctx = (own.rows[0] as { ctx: Record<string, unknown> }).ctx;
    expect(ctx).toMatchObject({
      active: true,
      profile: { full_name: "Üç" },
      wallet: { balance: 7 },
      subscription: null,
      is_admin: false,
      free_usage: [{ meter: "chat", period_key: "d:2026-11-19", used: 2 }],
    });
    const other = await as("authenticated", U1, "SELECT public.get_session_user_context($1) AS ctx", [U3]);
    expect((other.rows[0] as { ctx: unknown }).ctx).toBeNull();
    const anon = await as("anon", null, "SELECT public.get_session_user_context($1) AS ctx", [U3]);
    expect((anon.rows[0] as { ctx: unknown }).ctx).toBeNull();
    const service = await as("service_role", null, "SELECT public.get_session_user_context($1) AS ctx", [U3]);
    expect((service.rows[0] as { ctx: { active: boolean } }).ctx.active).toBe(true);
  });

  it("askıdaki hesap etkin değil", async () => {
    await db.query("UPDATE public.profiles SET suspended_at = now() WHERE id = $1", [U2]);
    const res = await as("service_role", null, "SELECT public.get_session_user_context($1) AS ctx", [U2]);
    expect((res.rows[0] as { ctx: { active: boolean } }).ctx.active).toBe(false);
  });
});

describe("madde 5: documents sayfa aralığı", () => {
  it("var olan belge baştan sona kalır (NULL); geçerli aralık yazılır, ters aralık reddedilir", async () => {
    const old = await db.query<{ s: number | null; e: number | null; n: number }>(
      "SELECT page_range_start AS s, page_range_end AS e, page_count AS n FROM public.documents",
    );
    expect(old.rows).toEqual([{ s: null, e: null, n: 5 }]);
    await db.query("INSERT INTO public.documents (user_id, page_range_start, page_range_end) VALUES ($1, 3, 9)", [U1]);
    await expect(
      db.query("INSERT INTO public.documents (user_id, page_range_start, page_range_end) VALUES ($1, 9, 3)", [U1]),
    ).rejects.toThrow(/documents_page_range_valid/);
    await expect(
      db.query("INSERT INTO public.documents (user_id, page_range_start) VALUES ($1, 0)", [U1]),
    ).rejects.toThrow(/documents_page_range_valid/);
  });
});

describe("madde 7.4: aşamalı hazırlık kurulumu", () => {
  const nodes = JSON.stringify([
    { sort_order: 1, meta: { topicId: TOPIC_A, objective: "Hedef" } },
    { sort_order: 2, meta: { topicId: TOPIC_B } },
  ]);
  const topics = JSON.stringify([
    { id: TOPIC_A, familiarity: "new", measured_level: "unknown", source_refs: [{ documentId: "d", pages: [1] }] },
    { id: TOPIC_B, contradictions: [{ concept: "k", claims: [] }] },
  ]);

  it("var olan hazırlıkta kalan iş yok (NULL)", async () => {
    const res = await db.query<{ f: unknown }>("SELECT setup_finish AS f FROM public.exam_preps");
    expect(res.rows).toEqual([{ f: null }]);
  });

  it("yalnız sunucu çağırır; öğrenci ve anonim reddedilir", async () => {
    for (const role of ["authenticated", "anon"] as const) {
      await expect(
        as(role, U1, "SELECT public.apply_exam_prep_setup($1, $2, $3::jsonb, $4::jsonb)", [PREP, U1, nodes, topics]),
      ).rejects.toThrow(/forbidden/);
    }
  });

  it("başkasının hazırlığına yazmaz", async () => {
    await expect(
      as("service_role", null, "SELECT public.apply_exam_prep_setup($1, $2, $3::jsonb, $4::jsonb)", [PREP, U2, nodes, topics]),
    ).rejects.toThrow(/prep_not_found/);
  });

  it("tek çağrıda düğüm meta'sı ve yalnız gönderilen konu alanları yazılır; tekrar çağrı aynı sonucu verir", async () => {
    for (const run of [1, 2]) {
      const res = await as("service_role", null, "SELECT public.apply_exam_prep_setup($1, $2, $3::jsonb, $4::jsonb) AS n", [
        PREP,
        U1,
        nodes,
        topics,
      ]);
      expect((res.rows[0] as { n: number }).n, `çalıştırma ${run}`).toBe(4);
    }
    const nodeRows = await db.query<{ s: number; m: Record<string, unknown> }>(
      "SELECT sort_order AS s, session_meta AS m FROM public.exam_prep_nodes ORDER BY sort_order",
    );
    expect(nodeRows.rows).toEqual([
      { s: 0, m: {} },
      { s: 1, m: { topicId: TOPIC_A, objective: "Hedef" } },
      { s: 2, m: { topicId: TOPIC_B } },
    ]);
    const topicRows = await db.query("SELECT label, familiarity, measured_level, diagnostic_status, source_refs, contradictions FROM public.exam_prep_topics ORDER BY label");
    expect(topicRows.rows).toEqual([
      { label: "Konu A", familiarity: "new", measured_level: "unknown", diagnostic_status: "unmeasured", source_refs: [{ documentId: "d", pages: [1] }], contradictions: [] },
      { label: "Konu B", familiarity: "heard", measured_level: null, diagnostic_status: "unmeasured", source_refs: [], contradictions: [{ concept: "k", claims: [] }] },
    ]);
  });
});
