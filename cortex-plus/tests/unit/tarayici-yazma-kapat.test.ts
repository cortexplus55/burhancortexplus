import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  Tarayıcıdan doğrudan veritabanı yazımı (6 Kasım 2026, 360° denetim P0). Canlıda doğrulandı: öğrenci rolü
  (authenticated) belge, hazırlık, yol, deneme ve profil tablolarına PostgREST ile doğrudan yazabiliyordu.
  Kod bu sütunları güvenilir sanıyordu. Bu dosya iki şeyi bekler:
  1. Göç PGlite'ta çalışır ve saldırı yolları kapanır; meşru öğrenci yazımları (ad, okul, tercih, veli
     isteği, davet eden ilk kez) çalışmaya devam eder; sunucu (service_role) her şeyi yazar.
  2. Uygulama kodu, izin listesindeki tablolar dışında öğrenci oturumuyla yazmaz (yeni bir yazım bu
     bekçiyi kırar: ya sunucu anahtarına taşı ya göçte açıkça GRANT et).
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261106120000_tarayici_yazma_kapat.sql";
const STUDENT = "11111111-1111-1111-1111-111111111111";
const VICTIM = "22222222-2222-2222-2222-222222222222";

/** Göçteki izin listesi; kodla aynı kalmalı. */
const KEEP = [
  "profiles", "conversations", "messages", "notifications", "daily_drills",
  "data_deletion_requests", "learning_goals", "mistake_entries",
  "parent_payment_requests", "parent_student_links", "study_plan_tasks",
];

describe("göç: tarayıcı yazımı kapanır (PGlite)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      -- Supabase'in varsayılanı: yeni tablolarda anon ve authenticated her şeyi alır.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY, full_name text, school_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz, suspended_at timestamptz, suspended_reason text,
        teacher_application_status text DEFAULT 'none', primary_role text NOT NULL DEFAULT 'student',
        learning_role text NOT NULL DEFAULT 'student', invite_code text, referral_code text, referred_by uuid,
        stars_hidden boolean NOT NULL DEFAULT false
      );
      CREATE TABLE public.documents (id uuid PRIMARY KEY, user_id uuid, page_count int, sha256 text, storage_path text);
      CREATE TABLE public.exam_prep_node_attempts (id serial PRIMARY KEY, user_id uuid, node_id uuid);
      CREATE TABLE public.parent_student_links (
        id serial PRIMARY KEY, parent_id uuid NOT NULL, student_id uuid, invite_email text,
        status text NOT NULL DEFAULT 'pending', accepted_at timestamptz
      );
      CREATE TABLE public.conversations (id serial PRIMARY KEY, user_id uuid, title text);
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.exam_prep_node_attempts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
      -- Canlıdaki politikalar (sütun sınırı yok).
      CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (id = auth.uid());
      CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
      CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING (id = auth.uid());
      CREATE POLICY docs_own ON public.documents FOR ALL USING (user_id = auth.uid());
      CREATE POLICY attempts_own ON public.exam_prep_node_attempts FOR ALL USING (user_id = auth.uid());
      CREATE POLICY psl_parent_manage ON public.parent_student_links FOR ALL USING (parent_id = auth.uid());
      CREATE POLICY psl_student_read ON public.parent_student_links FOR SELECT USING (student_id = auth.uid());
      CREATE POLICY psl_student_respond ON public.parent_student_links FOR UPDATE USING (student_id = auth.uid());
      CREATE POLICY conv_own ON public.conversations FOR ALL USING (user_id = auth.uid());

      -- Sıralama fonksiyonunun bağımlılıkları (yalnız göç derlensin diye).
      CREATE TABLE public.star_events (user_id uuid, amount int, day date);
      CREATE TABLE public.schools (id uuid PRIMARY KEY, name text);
      CREATE FUNCTION public.stars_today() RETURNS date LANGUAGE sql AS $$ SELECT current_date $$;
      CREATE FUNCTION public.stars_week_start(d date) RETURNS date LANGUAGE sql AS $$ SELECT d $$;
      CREATE FUNCTION public.star_display_name(n text) RETURNS text LANGUAGE sql AS $$ SELECT n $$;

      INSERT INTO auth.users VALUES ('${STUDENT}', now()), ('${VICTIM}', '2026-01-01');
      INSERT INTO public.profiles (id, full_name, created_at) VALUES
        ('${STUDENT}', 'Öğrenci', now()), ('${VICTIM}', 'Kurban', '2026-01-01');
      INSERT INTO public.documents VALUES ('33333333-3333-3333-3333-333333333333', '${STUDENT}', 40, 'abc', '${STUDENT}/d/x.pdf');
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  async function asStudent<T>(fn: () => Promise<T>, uid = STUDENT): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${uid}'`);
    try {
      return await fn();
    } finally {
      await db.exec("RESET ROLE; RESET request.jwt.claim.sub");
    }
  }

  async function fails(sql: string, uid = STUDENT): Promise<boolean> {
    return asStudent(async () => {
      try {
        await db.exec(sql);
        return false;
      } catch {
        return true;
      }
    }, uid);
  }

  it("göçten önce saldırı yolları açıktı", async () => {
    expect(await fails(`UPDATE public.documents SET page_count = 0`)).toBe(false);
    expect(await fails(`INSERT INTO public.exam_prep_node_attempts (user_id, node_id) VALUES ('${STUDENT}', gen_random_uuid())`)).toBe(false);
    await db.exec(`DELETE FROM public.exam_prep_node_attempts; UPDATE public.documents SET page_count = 40`);
  });

  it("göç uygulanır; belge ve yol tablolarına tarayıcı yazımı kapanır, sunucu yazar", async () => {
    await db.exec(read(MIGRATION));
    expect(await fails(`UPDATE public.documents SET page_count = 0`)).toBe(true);
    expect(await fails(`UPDATE public.documents SET sha256 = 'zehir', storage_path = '${VICTIM}/x/y.pdf'`)).toBe(true);
    expect(await fails(`INSERT INTO public.exam_prep_node_attempts (user_id, node_id) VALUES ('${STUDENT}', gen_random_uuid())`)).toBe(true);
    expect(await fails(`DELETE FROM public.documents`)).toBe(true);
    await db.exec("SET ROLE service_role");
    await db.exec(`UPDATE public.documents SET page_count = 41`);
    await db.exec("RESET ROLE");
    const { rows } = await db.query<{ page_count: number }>(`SELECT page_count FROM public.documents`);
    expect(rows[0]!.page_count).toBe(41);
  });

  it("izin listesindeki tablo (sohbet) öğrenciye açık kalır", async () => {
    expect(await fails(`INSERT INTO public.conversations (user_id, title) VALUES ('${STUDENT}', 'Yeni')`)).toBe(false);
  });

  it("göçten sonra açılan tablo yazmaya kapalı doğar", async () => {
    await db.exec(`CREATE TABLE public.yeni_tablo (id int, user_id uuid); ALTER TABLE public.yeni_tablo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY yeni_own ON public.yeni_tablo FOR ALL USING (user_id = auth.uid());`);
    expect(await fails(`INSERT INTO public.yeni_tablo VALUES (1, '${STUDENT}')`)).toBe(true);
  });

  it("profil: ad ve okul değişir; oluşturma tarihi, hesap durumu ve roller değişmez", async () => {
    const createdBefore = new Date(
      (await db.query<{ c: Date }>(`SELECT created_at AS c FROM public.profiles WHERE id = '${STUDENT}'`)).rows[0]!.c,
    ).toISOString();
    await asStudent(() =>
      db.exec(`UPDATE public.profiles SET full_name = 'Yeni Ad', created_at = '2026-01-01', suspended_at = NULL,
        primary_role = 'admin', learning_role = 'teacher', invite_code = 'HACK', school_id = '44444444-4444-4444-4444-444444444444'
        WHERE id = '${STUDENT}'`),
    );
    const { rows } = await db.query<{ full_name: string; created_at: Date; primary_role: string; learning_role: string; invite_code: string | null; school_id: string }>(
      `SELECT full_name, created_at, primary_role, learning_role, invite_code, school_id FROM public.profiles WHERE id = '${STUDENT}'`,
    );
    expect(rows[0]!.full_name).toBe("Yeni Ad");
    expect(rows[0]!.school_id).toBe("44444444-4444-4444-4444-444444444444");
    expect(new Date(rows[0]!.created_at).toISOString()).toBe(createdBefore);
    expect(rows[0]!.primary_role).toBe("student");
    expect(rows[0]!.learning_role).toBe("student");
    expect(rows[0]!.invite_code).toBeNull();
  });

  it("profil: davet eden ve davet kodu yalnız boştan bir kez; kendini davet edemez", async () => {
    await asStudent(() => db.exec(`UPDATE public.profiles SET referred_by = '${STUDENT}' WHERE id = '${STUDENT}'`));
    let row = (await db.query<{ referred_by: string | null }>(`SELECT referred_by FROM public.profiles WHERE id = '${STUDENT}'`)).rows[0]!;
    expect(row.referred_by).toBeNull();
    await asStudent(() => db.exec(`UPDATE public.profiles SET referred_by = '${VICTIM}', referral_code = 'ILK1' WHERE id = '${STUDENT}'`));
    await asStudent(() => db.exec(`UPDATE public.profiles SET referred_by = '55555555-5555-5555-5555-555555555555', referral_code = 'IKINCI' WHERE id = '${STUDENT}'`));
    row = (await db.query<{ referred_by: string; referral_code: string }>(`SELECT referred_by, referral_code FROM public.profiles WHERE id = '${STUDENT}'`)).rows[0]! as never;
    expect(row).toMatchObject({ referred_by: VICTIM, referral_code: "ILK1" });
  });

  it("eski hesap kararı auth.users'tan; profil tarihi geri çekilse de değişmez", async () => {
    const { rows } = await db.query<{ a: boolean; b: boolean }>(
      `SELECT public.account_grandfathered('${STUDENT}') AS a, public.account_grandfathered('${VICTIM}') AS b`,
    );
    expect(rows[0]).toEqual({ a: false, b: true });
    expect(await fails(`SELECT public.account_grandfathered('${STUDENT}')`)).toBe(true);
  });

  it("veli bağı: istek bekleyen açılır, veli etkinleştiremez, taraflar değişmez, yalnız öğrenci kabul eder", async () => {
    // Saldırgan (STUDENT) kendini kurbanın velisi diye bağlamaya çalışır, durumu 'active' yazar.
    await asStudent(() =>
      db.exec(`INSERT INTO public.parent_student_links (parent_id, student_id, status, accepted_at)
        VALUES ('${STUDENT}', '${VICTIM}', 'active', now())`),
    );
    let link = (await db.query<{ id: number; status: string; accepted_at: Date | null }>(`SELECT id, status, accepted_at FROM public.parent_student_links`)).rows[0]!;
    expect(link.status).toBe("pending");
    expect(link.accepted_at).toBeNull();
    // Başkası adına istek açamaz.
    expect(await fails(`INSERT INTO public.parent_student_links (parent_id, student_id) VALUES ('${VICTIM}', '${STUDENT}')`)).toBe(true);
    // Veli kendi isteğini etkinleştiremez.
    await asStudent(() => db.exec(`UPDATE public.parent_student_links SET status = 'active' WHERE id = ${link.id}`));
    link = (await db.query<{ id: number; status: string; accepted_at: Date | null }>(`SELECT id, status, accepted_at FROM public.parent_student_links`)).rows[0]!;
    expect(link.status).toBe("pending");
    // Bekleyen bağ profili açmaz.
    let seen = (await db.query<{ v: boolean }>(`SELECT public.profile_link_exists('${STUDENT}', '${VICTIM}') AS v`)).rows[0]!;
    expect(seen.v).toBe(false);
    // Öğrenci (kurban) tarafları değiştiremez ama kabul edebilir.
    await asStudent(() => db.exec(`UPDATE public.parent_student_links SET parent_id = '${VICTIM}', status = 'active' WHERE id = ${link.id}`), VICTIM);
    const after = (await db.query<{ parent_id: string; status: string }>(`SELECT parent_id, status FROM public.parent_student_links`)).rows[0]!;
    expect(after).toEqual({ parent_id: STUDENT, status: "active" });
    seen = (await db.query<{ v: boolean }>(`SELECT public.profile_link_exists('${STUDENT}', '${VICTIM}') AS v`)).rows[0]!;
    expect(seen.v).toBe(true);
  });

  it("sıralama fonksiyonu derlenir ve çağrılabilir", async () => {
    const result = await asStudent(() => db.query(`SELECT * FROM public.star_leaderboard('country', 'week', 100000)`));
    expect(result.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function statementEnd(src: string, from: number): number {
  let depth = 0;
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth < 0) return j;
    } else if (c === ";" && depth <= 0) return j;
  }
  return src.length;
}

/** Öğrenci oturumlu istemci: `createClient()` (sunucu ya da tarayıcı) ya da withUser/requireUser'ın `supabase`'i. */
function usesUserClient(text: string): boolean {
  return /@\/lib\/supabase\/(server|client)"/.test(text) || /requireUser|requireStudentArea|withUser|guard\.ctx/.test(text);
}

describe("kod: öğrenci oturumuyla yalnız izin listesindeki tablolara yazılır", () => {
  it("`supabase` istemcisiyle yazılan her tablo göçün izin listesinde", () => {
    const migration = read(MIGRATION);
    for (const table of KEEP) expect(migration).toContain(`'${table}'`);
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = read(file);
      if (!usesUserClient(text)) continue;
      // Dosyada `supabase` adı servis istemcisine bağlanıyorsa (const supabase = createServiceClient()) atlanır.
      if (/const\s+supabase\s*=\s*createServiceClient\(\)/.test(text)) continue;
      const re = /\b(?:ctx\.)?supabase\s*\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const span = text.slice(m.index, statementEnd(text, m.index + m[0].length));
        if (!/\.(insert|update|upsert|delete)\(/.test(span)) continue;
        if (!KEEP.includes(m[1]!)) offenders.push(`${file}:${text.slice(0, m.index).split("\n").length} ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("yol ve konu yazan yardımcılar öğrenci istemcisiyle çağrılmaz", () => {
    const offenders = walk("src").filter((file) =>
      /\b(ensurePrepNodes|ensurePathSkeletonNodes)\(\s*supabase\b/.test(read(file)),
    );
    expect(offenders).toEqual([]);
    const topics = read("src/lib/learning/exam-prep-topics.ts");
    expect(topics).toMatch(/createServiceClient\(\)\.from\("exam_prep_topics"\)\.insert/);
  });
});
