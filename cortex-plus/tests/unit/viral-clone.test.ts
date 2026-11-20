import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";

/*
  Faz 7 (20 Kasım 2026): "📲 Sınıfla Paylaş" ve paylaşılan çalışma yolunu klonlama. Bu dosya üç şeyi bekler:
  1. Klon kayıtlardan kurulur: model, OCR, ses çağrısı ve kredi ayırması yok; konu haritası ve 1. konunun dersi gelir,
     paylaşanın belgesi, cevabı, hâkimiyeti, sonucu gelmez; aynı kişi ikinci kez klonlarsa eski kopya açılır.
  2. Ödül SQL'de, kilit altında: ayda en çok 5 arkadaş (+250), arkadaş başına tek ödül, kendini davet / aynı posta
     kutusu / aynı IP / doğrulanmamış hesap / davet hediyesi alınmış çift ödül almaz (göç PGlite'ta koşar).
  3. Göç yokken paylaşım bugünkü imzalı davete düşer, ödül atlanır.
*/

const h = vi.hoisted(() => ({
  openai: vi.fn(),
  generateJson: vi.fn(),
  reserveCredits: vi.fn(),
  commitCredits: vi.fn(),
  refundCredits: vi.fn(),
  freeLimit: { value: false },
  notify: vi.fn(async () => "created" as const),
  withUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { APP_SECRET: "test-secret-for-viral-clone", SUPABASE_SECRET_KEY: undefined } }));
vi.mock("@/lib/ai/openai-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/openai-client")>()),
  openaiClient: h.openai,
}));
vi.mock("@/lib/ai/generate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/generate")>()),
  generateJson: h.generateJson,
}));
vi.mock("@/lib/credits/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/credits/service")>()),
  reserveCredits: h.reserveCredits,
  commitCredits: h.commitCredits,
  refundCredits: h.refundCredits,
}));
vi.mock("@/lib/ai/inflight-share", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/inflight-share")>()),
  shareInFlight: (_key: string, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/billing/free-prep-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/free-prep-limit")>()),
  freePrepLimitReached: async () => h.freeLimit.value,
}));
vi.mock("@/lib/notifications/in-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/in-app")>()),
  notifyInApp: h.notify,
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: h.withUser,
}));

import { cloneSharedPrepForUser } from "@/lib/learning/viral-clone";
import { rewardCloneReferral } from "@/lib/learning/viral-clone-reward";
import { ensurePrepShareCode, loadSharedPrep } from "@/lib/learning/prep-share-code";
import { hashIp } from "@/lib/abuse/record";
import {
  CLASS_SHARE_LABEL,
  CLONE_BUTTON_LABEL,
  CLONE_REWARD_CREDITS,
  CLONE_REWARD_MONTHLY_CAP,
  CLONE_REWARD_IP_DAILY_CAP,
  CLONE_REWARD_TITLE,
  SHARE_CODE_ALPHABET,
  classShareWhatsappHref,
  cloneSignupHref,
  generateShareCode,
  inactiveShareCopy,
  isSampleShareCode,
  maskFirstName,
  normalizeShareCode,
  shareCodeUrl,
} from "@/lib/learning/class-share";
import { POST as shareCodePost } from "@/app/api/learning/exam-prep/share-code/route";
import { POST as clonePost } from "@/app/api/learning/exam-prep/clone/route";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261120140000_faz7_sinif_klonlama.sql";
const MIGRATION_IP = "supabase/migrations/20261120160000_faz8_davet_ip_gunluk.sql";

const SHARER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const SRC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CODE = "abcdefghjk";

const LESSON = {
  format: 3,
  title: "Fizik bilimine giriş",
  screens: [
    { heading: "Fizik nedir?", blocks: [{ type: "text", text: "Fizik madde ve enerjiyi inceler." }] },
    { heading: "Büyüklükler", blocks: [{ type: "text", text: "Temel ve türetilmiş büyüklükler vardır." }] },
  ],
};

type Row = Record<string, unknown>;

function seed(extra: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    exam_preps: [
      {
        id: SRC,
        user_id: SHARER,
        title: "TYT Fizik",
        exam_type: "TYT",
        exam_date: "2026-12-20",
        target_score: 80,
        learning_preferences: { examTime: "10:15", modalities: ["podcast"], examResult: { score: 90 } },
        share_code: CODE,
        is_public_cloneable: true,
        share_ip_hash: hashIp("10.0.0.1"),
        document_id: "doc-1",
        source_document_ids: ["doc-1"],
        visibility: "private",
      },
    ],
    exam_prep_topics: [
      { id: "t-src-1", exam_prep_id: SRC, label: "FİZ.9.1.1. Fizik bilimine giriş", sort_order: 0, document_topic_node_id: "dtn-1", source_refs: [{ document_id: "doc-1", pages: [1, 2] }], familiarity: "good" },
      { id: "t-src-2", exam_prep_id: SRC, label: "Madde ve özellikleri", sort_order: 1, document_topic_node_id: "dtn-2", source_refs: [{ document_id: "doc-1", pages: [3] }] },
    ],
    exam_prep_lessons: [
      { id: "l-old", exam_prep_id: SRC, topic_id: "t-src-1", title: "Eski", content_md: "eski", content_json: { ...LESSON, title: "Eski" }, created_at: "2026-11-01T08:00:00.000Z" },
      { id: "l-new", exam_prep_id: SRC, topic_id: "t-src-1", title: LESSON.title, content_md: "özet", content_json: LESSON, created_at: "2026-11-02T08:00:00.000Z" },
      { id: "l-2", exam_prep_id: SRC, topic_id: "t-src-2", title: "Madde", content_md: "x", content_json: LESSON, created_at: "2026-11-03T08:00:00.000Z" },
    ],
    exam_prep_nodes: [{ id: "n-src-1", exam_prep_id: SRC, kind: "lesson", title: "Ders", sort_order: 0, status: "done" }],
    exam_prep_node_attempts: [
      { id: "a-src-1", node_id: "n-src-1", exam_prep_id: SRC, user_id: SHARER, topic_id: "t-src-1", status: "completed", payload: { type: "lesson", lesson: LESSON }, answers: { "0": "B" }, score: 1, total: 1 },
    ],
    exam_prep_topic_mastery: [{ exam_prep_id: SRC, user_id: SHARER, topic_label: "Fizik bilimine giriş", confidence: 0.9 }],
    exam_prep_misconceptions: [{ exam_prep_id: SRC, user_id: SHARER, claim: "yanlış" }],
    documents: [{ id: "doc-1", user_id: SHARER, storage_path: `${SHARER}/notlar.pdf` }],
    profiles: [
      { id: SHARER, full_name: "Ayşe Yılmaz", referral_code: "AB12CD34" },
      { id: FRIEND, full_name: "Mehmet Kaya", school_id: null },
      { id: OTHER, full_name: "Zeynep", school_id: null },
    ],
    ...extra,
  } as Record<string, Row[]>;
  const fake = makeFakeDb(tables);
  const rpcNames: string[] = [];
  const baseRpc = fake.client.rpc;
  fake.client.rpc = async (name: string, args: Record<string, unknown>) => {
    rpcNames.push(name);
    return baseRpc(name, args);
  };
  return { ...fake, rpcNames };
}

/** `share_code` / `cloned_from_prep_id` sütunu tanınmayan veritabanı (göç uygulanmadan önceki canlı). */
function withoutMigration(client: { from: (table: string) => unknown }) {
  const missing = { code: "42703", message: "column exam_preps.share_code does not exist" };
  const original = client.from.bind(client);
  return {
    ...client,
    from(table: string) {
      const builder = original(table) as Record<string, unknown>;
      if (table !== "exam_preps") return builder;
      const select = builder.select as (columns?: string) => unknown;
      builder.select = (columns?: string, ...rest: unknown[]) => {
        if (/share_code|cloned_from_prep_id|is_public_cloneable/.test(String(columns ?? ""))) {
          const failing: Record<string, unknown> = {};
          const chain = () => failing;
          for (const key of ["eq", "is", "order", "limit", "neq", "in"]) failing[key] = chain;
          failing.maybeSingle = async () => ({ data: null, error: missing });
          failing.single = async () => ({ data: null, error: missing });
          failing.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: missing });
          return failing;
        }
        return (select as (...args: unknown[]) => unknown).call(builder, columns, ...rest);
      };
      return builder;
    },
  };
}

beforeEach(() => {
  h.openai.mockReset();
  h.generateJson.mockReset();
  h.reserveCredits.mockReset();
  h.commitCredits.mockReset();
  h.refundCredits.mockReset();
  h.notify.mockClear();
  h.withUser.mockReset();
  h.freeLimit.value = false;
});

describe("saf yardımcılar", () => {
  it("kod: 10 karakter, karışan harf yok; adres mutlak; kayıt bağlantısı dönüşü ve davet kodunu taşır", () => {
    let i = 0;
    const code = generateShareCode((size) => i++ % size);
    expect(code).toHaveLength(10);
    expect([...code].every((char) => SHARE_CODE_ALPHABET.includes(char))).toBe(true);
    expect(SHARE_CODE_ALPHABET).not.toMatch(/[ilo01]/);
    expect(normalizeShareCode(" ABCDEFGHJK ")).toBe("abcdefghjk");
    expect(normalizeShareCode("abcdefghj1")).toBeNull();
    expect(normalizeShareCode("../../etc")).toBeNull();
    expect(shareCodeUrl(CODE, "https://cortexplus.app/")).toBe("https://cortexplus.app/davet/abcdefghjk");
    const signup = new URL(cloneSignupHref(CODE, "ab12cd34"), "https://cortexplus.app");
    expect(signup.pathname).toBe("/kayit");
    expect(signup.searchParams.get("ref")).toBe("AB12CD34");
    expect(signup.searchParams.get("next")).toBe("/davet/abcdefghjk?otomatik=1");
    expect(new URL(cloneSignupHref(CODE, "<x>"), "https://x.y").searchParams.get("ref")).toBeNull();
    const wa = classShareWhatsappHref("TYT Fizik", shareCodeUrl(CODE, "https://cortexplus.app"));
    expect(decodeURIComponent(wa.slice("https://wa.me/?text=".length))).toContain("https://cortexplus.app/davet/abcdefghjk");
  });

  it("maskeli ad: yalnız ilk adın ilk iki harfi; ad yoksa null", () => {
    expect(maskFirstName("ayşe yılmaz")).toBe("Ay***");
    expect(maskFirstName("İlker")).toBe("İl***");
    expect(maskFirstName("Al")).toBe("A***");
    expect(maskFirstName("  ")).toBeNull();
    expect(maskFirstName(null)).toBeNull();
  });

  it("ana sayfanın örnek QR kodu (ORNEK) tanınır; geçerli bir paylaşım kodu değildir", () => {
    expect(isSampleShareCode("ORNEK")).toBe(true);
    expect(isSampleShareCode(" ornek ")).toBe(true);
    expect(isSampleShareCode("ÖRNEK")).toBe(true);
    expect(isSampleShareCode(CODE)).toBe(false);
    expect(normalizeShareCode("ORNEK")).toBeNull();
    expect(inactiveShareCopy("sample").title).toBe("Bu bir örnek bağlantı");
    expect(inactiveShareCopy("inactive").title).toBe("Bu bağlantı artık etkin değil");
  });

  it("ekran metinleri ürün sahibinin metni; ödül sayıları SQL sabitleriyle aynı", () => {
    expect(CLASS_SHARE_LABEL).toBe("📲 Sınıfla Paylaş");
    expect(CLONE_BUTTON_LABEL).toBe("Bu Çalışma Yolunu Hesabıma Klonla (1. Ünite Ücretsiz)");
    expect(CLONE_REWARD_TITLE).toContain("+50 Bonus Kredi");
    const sql = read(MIGRATION);
    expect(sql).toContain(`v_amount constant integer := ${CLONE_REWARD_CREDITS};`);
    expect(sql).toContain(`v_cap constant integer := ${CLONE_REWARD_MONTHLY_CAP};`);
    const ipSql = read(MIGRATION_IP);
    expect(ipSql).toContain(`v_ip_daily_cap constant integer := ${CLONE_REWARD_IP_DAILY_CAP};`);
    expect(ipSql).toContain(`v_amount constant integer := ${CLONE_REWARD_CREDITS};`);
    expect(ipSql).toContain(`v_cap constant integer := ${CLONE_REWARD_MONTHLY_CAP};`);
    expect(ipSql).not.toMatch(/'same_ip'/);
    expect(ipSql.replace(/^--.*$/gm, "")).not.toMatch(/(DROP|DELETE FROM|TRUNCATE)|^s*UPDATE/im);
  });
});

describe("cloneSharedPrepForUser: kayıtlardan kopya, model ve kredi yok", () => {
  it("konu haritası ve 1. konunun son dersi gelir; paylaşanın belgesi, cevabı, hâkimiyeti gelmez", async () => {
    const fake = seed();
    const result = await cloneSharedPrepForUser(fake.client, { shareCode: "ABCDEFGHJK", userId: FRIEND, ip: "10.0.0.9" });
    expect(result).toMatchObject({ ok: true, status: "created", lessonCopied: true });
    if (!result.ok) throw new Error("clone failed");

    // Sıfır model, OCR, ses çağrısı; kredi ayırması yok. RPC olarak yalnız "hazırlığında yeni öğrenci" yıldızı.
    expect(h.openai).not.toHaveBeenCalled();
    expect(h.generateJson).not.toHaveBeenCalled();
    expect(h.reserveCredits).not.toHaveBeenCalled();
    expect(h.commitCredits).not.toHaveBeenCalled();
    expect(fake.rpcNames.filter((name) => name !== "award_stars")).toEqual([]);

    const copy = fake.db.tables.exam_preps.find((row) => row.id === result.id)!;
    expect(copy).toMatchObject({ user_id: FRIEND, cloned_from_prep_id: SRC, forked_from: SRC, title: "TYT Fizik", exam_type: "TYT", visibility: "private" });
    expect(copy.share_ip_hash).toBe(hashIp("10.0.0.9"));
    expect(copy).not.toHaveProperty("document_id");
    expect(copy).not.toHaveProperty("source_document_ids");
    expect(copy).not.toHaveProperty("share_code");
    // Kişisel tercih ve sınav sonucu gelmez; yalnız sınav saati.
    expect(copy.learning_preferences).toEqual({ examTime: "10:15" });

    const topics = fake.db.tables.exam_prep_topics.filter((row) => row.exam_prep_id === result.id);
    expect(topics.map((row) => [row.label, row.sort_order])).toEqual([
      ["FİZ.9.1.1. Fizik bilimine giriş", 0],
      ["Madde ve özellikleri", 1],
    ]);
    for (const topic of topics) {
      expect(topic).not.toHaveProperty("source_refs");
      expect(topic).not.toHaveProperty("document_topic_node_id");
      expect(topic).not.toHaveProperty("familiarity");
    }
    const firstTopic = topics.find((row) => row.sort_order === 0)!;

    // 1. konunun EN SON dersi, hem konunun kayıtlı dersi hem ilk ders düğümünün açık kaydı olarak.
    const lessons = fake.db.tables.exam_prep_lessons.filter((row) => row.exam_prep_id === result.id);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ topic_id: firstTopic.id, title: LESSON.title, content_json: LESSON });
    const nodes = fake.db.tables.exam_prep_nodes.filter((row) => row.exam_prep_id === result.id);
    expect(nodes.length).toBeGreaterThan(3);
    const lessonNode = nodes.filter((row) => row.kind === "lesson").sort((a, b) => Number(a.sort_order) - Number(b.sort_order))[0]!;
    const attempts = fake.db.tables.exam_prep_node_attempts.filter((row) => row.exam_prep_id === result.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ node_id: lessonNode.id, user_id: FRIEND, topic_id: firstTopic.id, status: "active", total: 1 });
    expect((attempts[0].payload as Row).lesson).toEqual(LESSON);
    expect(attempts[0]).not.toHaveProperty("answers");
    expect(attempts[0]).not.toHaveProperty("score");

    // Paylaşanın sonuçları ve belgesi arkadaşa açılmaz.
    expect(fake.db.tables.exam_prep_topic_mastery.filter((row) => row.user_id === FRIEND)).toEqual([]);
    expect(fake.db.tables.exam_prep_misconceptions.filter((row) => row.user_id === FRIEND)).toEqual([]);
    expect(fake.db.tables.documents.filter((row) => row.user_id === FRIEND)).toEqual([]);
  });

  it("aynı arkadaş ikinci kez: eski kopya, yeni satır yok; sahibi kendi hazırlığına", async () => {
    const fake = seed();
    const first = await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: FRIEND, ip: null });
    const counts = () => ["exam_preps", "exam_prep_topics", "exam_prep_lessons", "exam_prep_nodes", "exam_prep_node_attempts"].map((t) => fake.db.tables[t].length);
    const before = counts();
    const again = await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: FRIEND, ip: null });
    expect(again).toEqual({ ok: true, id: first.ok ? first.id : "", status: "existing", lessonCopied: false });
    expect(counts()).toEqual(before);
    expect(await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: SHARER, ip: null })).toEqual({ ok: true, id: SRC, status: "owner", lessonCopied: false });
  });

  it("ücretsiz hesapta tek hazırlık doluysa kopya yok; kod geçersiz ya da paylaşım kapalıysa bulunmaz", async () => {
    const fake = seed();
    h.freeLimit.value = true;
    expect(await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: OTHER, ip: null })).toEqual({ ok: false, reason: "free_prep_limit" });
    expect(fake.db.tables.exam_preps.filter((row) => row.user_id === OTHER)).toEqual([]);
    h.freeLimit.value = false;
    expect(await cloneSharedPrepForUser(fake.client, { shareCode: "kisa", userId: OTHER, ip: null })).toEqual({ ok: false, reason: "invalid" });
    fake.db.tables.exam_preps[0].is_public_cloneable = false;
    expect(await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: OTHER, ip: null })).toEqual({ ok: false, reason: "not_found" });
  });

  it("1. konunun dersi yoksa kopya derssiz kurulur (arkadaş dersi bugünkü gibi açar)", async () => {
    const fake = seed({ exam_prep_lessons: [] });
    const result = await cloneSharedPrepForUser(fake.client, { shareCode: CODE, userId: FRIEND, ip: null });
    expect(result).toMatchObject({ ok: true, status: "created", lessonCopied: false });
    expect(fake.db.tables.exam_prep_node_attempts.filter((row) => row.user_id === FRIEND)).toEqual([]);
  });

  it("göç yokken paylaşılan yol açılmaz (sayfa bilgi verir), kopya kurulmaz", async () => {
    const fake = seed();
    const client = withoutMigration(fake.client) as typeof fake.client;
    expect(await loadSharedPrep(client, CODE)).toEqual({ ok: false, reason: "unavailable" });
    expect(await cloneSharedPrepForUser(client, { shareCode: CODE, userId: FRIEND, ip: null })).toEqual({ ok: false, reason: "unavailable" });
    expect(await ensurePrepShareCode(client, { prepId: SRC, userId: SHARER })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("paylaşım ve klon uçları", () => {
  const request = (url: string, body: unknown) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
      body: JSON.stringify(body),
    });
  const guard = (client: unknown, userId = SHARER) => h.withUser.mockResolvedValue({ ok: true, ctx: { userId, service: client } });

  it("paylaşım kodu: hız sınırı, sahiplik, mutlak /davet adresi; ikinci istek aynı kod", async () => {
    const fake = seed({ exam_preps: [{ id: SRC, user_id: SHARER, title: "TYT Fizik", exam_type: "TYT", share_code: null, is_public_cloneable: false }] });
    h.withUser.mockResolvedValue({ ok: false, response: new Response(null, { status: 429 }) });
    expect((await shareCodePost(request("/api/learning/exam-prep/share-code", { prepId: SRC }))).status).toBe(429);
    expect(h.withUser.mock.calls[0][1]).toEqual({ scope: "prep-share-code", limit: 10, dailyLimit: 60 });

    guard(fake.client, FRIEND);
    expect((await shareCodePost(request("/api/learning/exam-prep/share-code", { prepId: SRC }))).status).toBe(404);
    expect(fake.db.tables.exam_preps[0].share_code).toBeNull();

    guard(fake.client);
    const res = await shareCodePost(request("/api/learning/exam-prep/share-code", { prepId: SRC }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; code: string; url: string; whatsappHref: string };
    expect(body.mode).toBe("clone");
    expect(body.url).toMatch(/^https?:\/\/[^/]+\/davet\/[a-z2-9]{10}$/);
    expect(body.url.endsWith(`/davet/${body.code}`)).toBe(true);
    expect(decodeURIComponent(body.whatsappHref)).toContain(body.url);
    expect(fake.db.tables.exam_preps[0]).toMatchObject({ share_code: body.code, is_public_cloneable: true, share_ip_hash: hashIp("10.0.0.1") });
    const again = (await (await shareCodePost(request("/api/learning/exam-prep/share-code", { prepId: SRC }))).json()) as { code: string };
    expect(again.code).toBe(body.code);
  });

  it("göç yokken paylaşım bugünkü imzalı sınıf davetine düşer (ödülsüz)", async () => {
    const fake = seed();
    guard(withoutMigration(fake.client));
    const res = await shareCodePost(request("/api/learning/exam-prep/share-code", { prepId: SRC }));
    const body = (await res.json()) as { mode: string; url: string; whatsappHref: string };
    expect(res.status).toBe(200);
    expect(body.mode).toBe("invite");
    expect(body.url).toMatch(new RegExp(`^https?://[^/]+/hazirlik-davet/sinif\\.${SRC}\\.\\d+\\.`));
  });

  it("klon ucu: hız sınırlı; ücretsiz sınırda 402 ve yükseltme kapısı; başarıda kopyanın kimliği", async () => {
    const fake = seed();
    guard(fake.client, FRIEND);
    h.freeLimit.value = true;
    const paywall = await clonePost(request("/api/learning/exam-prep/clone", { shareCode: CODE }));
    expect(paywall.status).toBe(402);
    expect(((await paywall.json()) as { gate?: { reason?: string } }).gate?.reason).toBe("free_prep_limit");
    expect(h.withUser.mock.calls[0][1]).toEqual({ scope: "prep-clone", limit: 10, dailyLimit: 40 });
    h.freeLimit.value = false;
    const ok = await clonePost(request("/api/learning/exam-prep/clone", { shareCode: CODE }));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { id: string; status: string };
    expect(body.status).toBe("created");
    expect(fake.db.tables.exam_preps.find((row) => row.id === body.id)?.share_ip_hash).toBe(hashIp("10.0.0.1"));
  });
});

describe("ödül tetiği (tamamlama sonrası)", () => {
  function rewardDb(rpcResult: { data: unknown; error: unknown }) {
    const fake = makeFakeDb({
      exam_preps: [{ id: "clone-1", user_id: FRIEND, cloned_from_prep_id: SRC }, { id: "plain", user_id: FRIEND, cloned_from_prep_id: null }],
      exam_prep_topics: [
        { id: "ct-2", exam_prep_id: "clone-1", sort_order: 1 },
        { id: "ct-1", exam_prep_id: "clone-1", sort_order: 0 },
      ],
    });
    const calls: unknown[] = [];
    fake.client.rpc = async (name: string, args: unknown) => {
      calls.push([name, args]);
      return rpcResult;
    };
    return { client: fake.client, calls };
  }

  it("yalnız klonun 1. konusunun konu testi; ödül verilince paylaşana bildirim", async () => {
    const granted = rewardDb({ data: { status: "granted", referrer: SHARER, credits: 50 }, error: null });
    expect(await rewardCloneReferral(granted.client, { userId: FRIEND, prepId: "clone-1", kind: "lesson", topicId: "ct-1" })).toBe("skipped_kind");
    expect(await rewardCloneReferral(granted.client, { userId: FRIEND, prepId: "plain", kind: "quiz", topicId: "ct-1" })).toBe("not_clone");
    expect(await rewardCloneReferral(granted.client, { userId: FRIEND, prepId: "clone-1", kind: "quiz", topicId: "ct-2" })).toBe("not_first_topic");
    expect(granted.calls).toEqual([]);
    expect(await rewardCloneReferral(granted.client, { userId: FRIEND, prepId: "clone-1", kind: "quiz", topicId: "ct-1" })).toBe("granted");
    expect(granted.calls).toEqual([["claim_clone_referral_reward", { p_clone_prep: "clone-1" }]]);
    expect(h.notify).toHaveBeenCalledWith(granted.client, expect.objectContaining({
      userId: SHARER,
      kind: "referral_reward",
      title: "Arkadaşın 1. üniteyi bitirdi · +50 Bonus Kredi",
      actionUrl: "/krediler",
    }));
  });

  it("işlev yoksa (göç öncesi) atlanır; hata tamamlamayı düşürmez, bildirim yok", async () => {
    const missing = rewardDb({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await rewardCloneReferral(missing.client, { userId: FRIEND, prepId: "clone-1", kind: "quiz", topicId: "ct-1" })).toBe("unavailable");
    const capped = rewardDb({ data: { status: "monthly_cap" }, error: null });
    expect(await rewardCloneReferral(capped.client, { userId: FRIEND, prepId: "clone-1", kind: "quiz", topicId: "ct-1" })).toBe("monthly_cap");
    const thrown = rewardDb({ data: null, error: null });
    thrown.client.rpc = async () => {
      throw new Error("ağ koptu");
    };
    expect(await rewardCloneReferral(thrown.client, { userId: FRIEND, prepId: "clone-1", kind: "quiz", topicId: "ct-1" })).toBe("failed");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("tamamlama akışı ödülü yanıttan sonra ve yalnız konu testinde planlar", () => {
    const complete = read("src/lib/learning/node/complete.ts");
    const block = complete.slice(complete.indexOf("Sınıfla paylaşım ödülü"));
    expect(block).toMatch(/if \(kind === "quiz" && attempt\.status !== "completed"\)/);
    expect(block).toMatch(/deferTask\(\(\) => rewardCloneReferral\(service, \{ userId, prepId, kind, topicId: rewardTopicId \}\), background\)/);
  });
});

describe("ödül işlevi (göç PGlite'ta)", () => {
  const db = new PGlite();
  let seq = 0;
  const uuid = () => {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  };

  beforeAll(async () => {
    const gift = read("supabase/migrations/20261024121000_free_tier_counts.sql");
    const giftStart = gift.indexOf("CREATE OR REPLACE FUNCTION public.credit_gift(");
    const giftFn = gift.slice(giftStart, gift.indexOf("$BODY$ LANGUAGE plpgsql SECURITY DEFINER;", giftStart) + "$BODY$ LANGUAGE plpgsql SECURITY DEFINER;".length);
    const alias = read("supabase/migrations/20261031162000_email_alias_guard.sql");
    const aliasStart = alias.indexOf("CREATE OR REPLACE FUNCTION public.normalize_email(");
    const normalizeFn = alias.slice(aliasStart, alias.indexOf("$BODY$ LANGUAGE sql IMMUTABLE;", aliasStart) + "$BODY$ LANGUAGE sql IMMUTABLE;".length);
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz DEFAULT now(), raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, referred_by uuid);
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text);
      CREATE TABLE public.credit_wallets (user_id uuid PRIMARY KEY, balance integer NOT NULL DEFAULT 0, updated_at timestamptz DEFAULT now());
      CREATE TABLE public.credit_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, delta integer, balance_before integer,
        balance_after integer, entry_type text, action_code text, idempotency_key text, metadata jsonb, created_at timestamptz DEFAULT now(),
        UNIQUE (user_id, idempotency_key));
      CREATE FUNCTION public.account_verified(p_user_id uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT u.email_confirmed_at IS NOT NULL AND NOT COALESCE((u.raw_app_meta_data ->> 'email_unverified')::boolean, false)
          FROM auth.users u WHERE u.id = p_user_id $$;
      ${normalizeFn}
      ${giftFn}
    `);
    await db.exec(read(MIGRATION));
    await db.exec(read(MIGRATION_IP));
  }, 60_000);
  afterAll(() => db.close());

  async function user(email: string, options: { verified?: boolean; referredBy?: string } = {}) {
    const id = uuid();
    await db.query("INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, $3)", [id, email, options.verified === false ? null : new Date().toISOString()]);
    await db.query("INSERT INTO profiles (id, referred_by) VALUES ($1, $2)", [id, options.referredBy ?? null]);
    await db.query("INSERT INTO credit_wallets (user_id, balance) VALUES ($1, 0)", [id]);
    return id;
  }
  async function sharedPrep(owner: string, ip: string | null = "ip-sharer") {
    const id = uuid();
    await db.query("INSERT INTO exam_preps (id, user_id, share_code, is_public_cloneable, share_ip_hash) VALUES ($1, $2, $3, true, $4)", [id, owner, `kod${seq}`, ip]);
    return id;
  }
  // Her klon varsayılan olarak ayrı bir IP'den (Faz 8: aynı IP'den günde en çok 3 ödül); aynı IP gereken testler verir.
  async function clonePrep(friend: string, source: string, ip: string | null = `ip-friend-${uuid()}`) {
    const id = uuid();
    await db.query("INSERT INTO exam_preps (id, user_id, cloned_from_prep_id, share_ip_hash) VALUES ($1, $2, $3, $4)", [id, friend, source, ip]);
    return id;
  }
  const claim = async (prep: string) =>
    (await db.query<{ r: { status: string; referrer?: string; credits?: number } }>("SELECT claim_clone_referral_reward($1) AS r", [prep])).rows[0].r;
  const balance = async (id: string) => (await db.query<{ balance: number }>("SELECT balance FROM credit_wallets WHERE user_id = $1", [id])).rows[0].balance;

  it("ödül: +50 hediye kredisi (credit_gift yolu), defter ve kayıt satırı; ikinci çağrı ödemez", async () => {
    const sharer = await user("ayse@example.com");
    const friend = await user("mehmet@example.com");
    const clone = await clonePrep(friend, await sharedPrep(sharer));
    expect(await claim(clone)).toEqual({ status: "granted", referrer: sharer, credits: 50 });
    expect(await balance(sharer)).toBe(50);
    expect(await balance(friend)).toBe(0);
    const ledger = await db.query<{ idempotency_key: string; entry_type: string; delta: number }>("SELECT idempotency_key, entry_type, delta FROM credit_ledger WHERE user_id = $1", [sharer]);
    expect(ledger.rows).toEqual([{ idempotency_key: `clone-referral:${friend}`, entry_type: "grant", delta: 50 }]);
    expect((await claim(clone)).status).toBe("already_rewarded");
    expect(await balance(sharer)).toBe(50);
  });

  it("ayda en çok 5 arkadaş (+250); geçen ayın kayıtları bu ayı doldurmaz", async () => {
    const sharer = await user("sharer-cap@example.com");
    const source = await sharedPrep(sharer);
    for (let index = 0; index < 5; index += 1) {
      const friend = await user(`cap-friend-${index}@example.com`);
      expect((await claim(await clonePrep(friend, source))).status).toBe("granted");
    }
    expect(await balance(sharer)).toBe(250);
    const sixth = await clonePrep(await user("cap-friend-6@example.com"), source);
    expect((await claim(sixth)).status).toBe("monthly_cap");
    expect(await balance(sharer)).toBe(250);
    // Test verisi: beş ödülü geçen aya taşı; yeni ayın ilk ödülü yine yazılır.
    await db.query("UPDATE referral_credit_rewards SET created_at = now() - interval '40 days' WHERE referrer_user_id = $1", [sharer]);
    expect((await claim(sixth)).status).toBe("granted");
    expect(await balance(sharer)).toBe(300);
  });

  it("arkadaş başına tek ödül: başka bir paylaşanın yolunu klonlasa da ikinci ödül yok", async () => {
    const sharerA = await user("a-pair@example.com");
    const sharerB = await user("b-pair@example.com");
    const friend = await user("friend-pair@example.com");
    expect((await claim(await clonePrep(friend, await sharedPrep(sharerA)))).status).toBe("granted");
    expect((await claim(await clonePrep(friend, await sharedPrep(sharerB)))).status).toBe("already_rewarded");
    expect(await balance(sharerB)).toBe(0);
  });

  it("kendini davet, aynı posta kutusu (Gmail noktası/+etiket), doğrulanmamış hesap ödül almaz; aynı IP tek başına engel değil (Faz 8)", async () => {
    const self = await user("self@example.com");
    expect((await claim(await clonePrep(self, await sharedPrep(self)))).status).toBe("self");

    const gmail = await user("ali.veli@gmail.com");
    const alias = await user("aliveli+ikinci@googlemail.com");
    expect((await claim(await clonePrep(alias, await sharedPrep(gmail)))).status).toBe("same_email");

    const home = await user("home@example.com");
    const sibling = await user("sibling@example.com");
    // Aynı yurt/okul Wi-Fi'ı: paylaşanla aynı IP'den klonlayan gerçek sınıf arkadaşı artık ödül getirir.
    expect((await claim(await clonePrep(sibling, await sharedPrep(home, "ayni-ip"), "ayni-ip"))).status).toBe("granted");

    const sharer = await user("verify-sharer@example.com");
    const unverified = await user("unverified@example.com", { verified: false });
    expect((await claim(await clonePrep(unverified, await sharedPrep(sharer)))).status).toBe("unverified");
    expect(await balance(sharer)).toBe(0);
    expect(await balance(gmail)).toBe(0);
    expect(await balance(home)).toBe(50);
  });

  it("aynı IP'den İstanbul gününde en çok 3 ödül (farklı paylaşanlara da); ertesi gün yeniden", async () => {
    const ip = `yurt-wifi-${uuid()}`;
    const statuses: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const sharer = await user(`ip-sharer-${index}-${uuid()}@example.com`);
      const friend = await user(`ip-friend-${index}-${uuid()}@example.com`);
      statuses.push((await claim(await clonePrep(friend, await sharedPrep(sharer), ip))).status);
    }
    expect(statuses).toEqual(["granted", "granted", "granted", "ip_daily_cap"]);
    // Ödül satırı klonlayan isteğin IP özetini taşır; gün değişince sayaç sıfırlanır.
    const rows = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM referral_credit_rewards WHERE referred_ip_hash = $1", [ip]);
    expect(rows.rows[0].n).toBe(3);
    await db.query("UPDATE referral_credit_rewards SET created_at = now() - interval '2 days' WHERE referred_ip_hash = $1", [ip]);
    const lateSharer = await user(`ip-sharer-late-${uuid()}@example.com`);
    const lateFriend = await user(`ip-friend-late-${uuid()}@example.com`);
    expect((await claim(await clonePrep(lateFriend, await sharedPrep(lateSharer), ip))).status).toBe("granted");
    // IP özeti olmayan (eski) klon günlük sayıma girmez.
    const oldSharer = await user(`old-sharer-${uuid()}@example.com`);
    const oldFriend = await user(`old-friend-${uuid()}@example.com`);
    expect((await claim(await clonePrep(oldFriend, await sharedPrep(oldSharer), null))).status).toBe("granted");
  });

  it("davet hediyesiyle çift başına tek ödül: 90'lık hediye yazıldıysa ya da davet programı çifti kapsıyorsa +50 yok", async () => {
    // 90'lık hediye bu arkadaş için paylaşana yazılmış.
    const inviter = await user("inviter-90@example.com");
    const invited = await user("invited-90@example.com", { referredBy: inviter });
    await db.query("INSERT INTO credit_ledger (user_id, delta, idempotency_key, entry_type) VALUES ($1, 90, $2, 'grant')", [inviter, `referral-gift-inviter:${invited}`]);
    expect((await claim(await clonePrep(invited, await sharedPrep(inviter)))).status).toBe("referral_gift");

    // Davet koduyla gelmiş, hediye henüz yazılmamış (paylaşanın davet hakkı dolmamış): 90'lık hediye sonra yazılacak.
    const pending = await user("pending-90@example.com", { referredBy: inviter });
    expect((await claim(await clonePrep(pending, await sharedPrep(inviter)))).status).toBe("referral_gift");

    // Paylaşanın 3 davet hakkı dolmuşsa davet programı bu çifte ödemez: +50 verilir.
    const full = await user("full-inviter@example.com");
    for (let index = 0; index < 3; index += 1) {
      await db.query("INSERT INTO credit_ledger (user_id, delta, idempotency_key, entry_type) VALUES ($1, 90, $2, 'grant')", [full, `referral-gift-inviter:${uuid()}`]);
    }
    const late = await user("late-friend@example.com", { referredBy: full });
    expect((await claim(await clonePrep(late, await sharedPrep(full)))).status).toBe("granted");
    expect(await balance(full)).toBe(50);
  });

  it("klon değilse ya da kaynak yoksa işlem yok", async () => {
    const owner = await user("plain@example.com");
    const plain = uuid();
    await db.query("INSERT INTO exam_preps (id, user_id) VALUES ($1, $2)", [plain, owner]);
    expect((await claim(plain)).status).toBe("not_clone");
    expect((await claim(uuid())).status).toBe("not_clone");
  });

  it("tablo ve işlev yalnız service_role; tarayıcı rolleri okuyamaz, yazamaz, çağıramaz", async () => {
    const privilege = async (sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0].ok;
    for (const role of ["anon", "authenticated"]) {
      expect(await privilege(`SELECT has_function_privilege('${role}', 'public.claim_clone_referral_reward(uuid)', 'EXECUTE') AS ok`)).toBe(false);
      expect(await privilege(`SELECT has_table_privilege('${role}', 'public.referral_credit_rewards', 'SELECT') AS ok`)).toBe(false);
      expect(await privilege(`SELECT has_table_privilege('${role}', 'public.referral_credit_rewards', 'INSERT') AS ok`)).toBe(false);
    }
    expect(await privilege(`SELECT has_function_privilege('service_role', 'public.claim_clone_referral_reward(uuid)', 'EXECUTE') AS ok`)).toBe(true);
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'referral_credit_rewards'");
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });

  it("aynı öğrenci aynı kaynaktan ikinci klonu açamaz (dizin)", async () => {
    const owner = await user("index-owner@example.com");
    const friend = await user("index-friend@example.com");
    const source = await sharedPrep(owner);
    await clonePrep(friend, source);
    await expect(clonePrep(friend, source)).rejects.toThrow(/exam_preps_clone_once|duplicate/);
  });

  it("göç yalnız ekler: DROP, DELETE ve var olan verinin UPDATE'i yok; başlık 'UYGULANDI' (20 Kasım 2026, #712 sonrası)", () => {
    const sql = read(MIGRATION);
    expect(sql.split("\n")[0]).toMatch(/^-- UYGULANDI: 20 Kasım 2026/);
    const code = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS share_code text UNIQUE/);
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.referral_credit_rewards/);
    expect(code).toMatch(/REVOKE ALL ON public\.referral_credit_rewards FROM anon, authenticated;/);
    expect(code).toMatch(/public\.credit_gift\(/);
  });
});
