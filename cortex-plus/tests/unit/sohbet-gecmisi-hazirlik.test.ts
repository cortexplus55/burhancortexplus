/**
 * Faz 11 (teacher.v2, 21 Kasım 2026): sohbet geçmişi hazırlığa göre. Gruplama (saf), yükleyici (kullanıcı süzgeci,
 * 150'lik dilim, tablo yok), bağ yazımı (asla fırlatmaz), sohbet ucunun bağı yalnız sahiplenilen hazırlıkta ve yanıttan
 * sonra yazması, geçmiş ucu (oturum, bayrak 404, model/kredi yok) ve /sohbetler'in bayrak kapalıyken bugünkü listesi.
 * Örnekler biyoloji, fizik ve tarih; kodda konu sabiti yok.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const guard = vi.hoisted(() => ({ withUser: vi.fn() }));
const flags = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }));
const session = vi.hoisted(() => ({ requireStudentArea: vi.fn() }));
const serviceHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/api/guards", () => ({ withUser: guard.withUser }));
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/feature-flags")>()),
  isFeatureEnabled: flags.isFeatureEnabled,
}));
vi.mock("@/lib/auth/session", () => ({ requireStudentArea: session.requireStudentArea }));
vi.mock("@/lib/student/parity-shell-props", () => ({ loadParityShellProps: async () => ({}) }));
vi.mock("@/lib/ui-v2/flags", () => ({ uiV2: async () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => serviceHolder.current,
  createClient: async () => serviceHolder.current,
}));

const {
  CONVERSATION_PREPS_TABLE,
  GENERAL_GROUP_KEY,
  GENERAL_GROUP_TITLE,
  ID_SLICE,
  PREP_FALLBACK_TITLE,
  bindConversationPrep,
  generalOnly,
  groupConversations,
  loadConversationGroups,
} = await import("@/lib/tutor/conversation-groups");
const { NOT_STUDIO_EXAM_FILTER } = await import("@/lib/learning/studio-exam");
const { resolveChatMaterial } = await import("@/lib/ai/chat-material-load");
const { GET } = await import("@/app/api/teacher/conversations/route");
const { default: SohbetlerPage } = await import("@/app/sohbetler/page");
const { SohbetlerList } = await import("@/components/parity/sohbetler-list");

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P_BIO = "11111111-1111-4111-8111-111111111111";
const P_PHYS = "22222222-2222-4222-8222-222222222222";
const P_GONE = "33333333-3333-4333-8333-333333333333";

/* ---------- Sahte istemci: her zinciri kaydeder; cevabı tabloya göre verir ---------- */
type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };
type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

function fakeClient(handler: (call: Call) => Result | Promise<Result>) {
  const calls: Call[] = [];
  const client = {
    calls,
    rpc: vi.fn(),
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const op of ["select", "eq", "in", "neq", "or", "is", "order", "limit", "upsert", "insert", "update", "delete"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => {
        const result = { data: null, error: null, ...(await handler(call)) };
        return { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
      };
      builder.then = (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve()
          .then(() => handler(call))
          .then((result) => ({ data: null, error: null, ...result }))
          .then(resolve, reject);
      return builder;
    },
  };
  return client;
}

const opValues = (call: Call, op: string) => call.ops.filter((item) => item[0] === op).map((item) => item.slice(1));

/* ---------- Gruplama (saf) ---------- */
describe("gruplama: hazırlık başlığı + sınav tarihi, en yeni önce, sonda Genel", () => {
  const conversations = [
    { id: "c1", title: "Mitoz evreleri", updatedAt: "2026-11-18T10:00:00.000Z" },
    { id: "c2", title: "Newton'un ikinci yasası", updatedAt: "2026-11-20T09:00:00.000Z" },
    { id: "c3", title: "Krossing over", updatedAt: "2026-11-21T08:00:00.000Z" },
    { id: "c4", title: "Tanzimat Fermanı", updatedAt: "2026-11-21T11:00:00.000Z" },
    { id: "c5", title: "Silinen hazırlıktaki soru", updatedAt: "2026-11-19T07:00:00.000Z" },
  ];
  const links = [
    { conversationId: "c1", prepId: P_BIO },
    { conversationId: "c3", prepId: P_BIO },
    { conversationId: "c2", prepId: P_PHYS },
    { conversationId: "c5", prepId: P_GONE },
  ];
  const preps = [
    { id: P_BIO, title: "Hücre Bölünmeleri", examDate: "2026-12-26T00:00:00+03:00" },
    { id: P_PHYS, title: "  ", examDate: null },
  ];

  it("gruplar en yeni konuşmasına göre; içi güncelliğe göre; Genel her zaman sonda", () => {
    const groups = groupConversations({ conversations, links, preps });
    expect(groups.map((group) => group.key)).toEqual([P_BIO, P_PHYS, GENERAL_GROUP_KEY]);
    expect(groups[0]!.conversations.map((row) => row.id)).toEqual(["c3", "c1"]);
    // Genel'de en yeni konuşma (c4) bütün hazırlıklardan yeni olsa da grup sonda.
    expect(groups[2]).toMatchObject({ title: GENERAL_GROUP_TITLE, prepId: null, examDate: null });
    expect(groups[2]!.conversations.map((row) => row.id)).toEqual(["c4", "c5"]);
  });

  it("bağı listede olmayan hazırlığa giden (silinmiş, hedef, stüdyo) konuşma Genel'e; tarih gün olarak; boş ad yedek adla", () => {
    const groups = groupConversations({ conversations, links, preps });
    expect(groups.find((group) => group.key === GENERAL_GROUP_KEY)!.conversations.some((row) => row.id === "c5")).toBe(true);
    expect(groups[0]!.examDate).toBe("2026-12-26");
    expect(groups[1]!.title).toBe(PREP_FALLBACK_TITLE);
  });

  it("boş grup çizilmez; yinelenen konuşma bir kez; bağ yoksa yalnız Genel", () => {
    expect(groupConversations({ conversations: [], links, preps })).toEqual([]);
    const twice = groupConversations({ conversations: [conversations[0]!, conversations[0]!], links: [], preps });
    expect(twice).toHaveLength(1);
    expect(twice[0]!.conversations).toHaveLength(1);
    expect(generalOnly(conversations).map((group) => group.key)).toEqual([GENERAL_GROUP_KEY]);
  });
});

/* ---------- Yükleyici ---------- */
describe("yükleyici: kullanıcı süzgeci, 150'lik dilim, tablo yoksa null", () => {
  const many = Array.from({ length: ID_SLICE * 2 + 20 }, (_, index) => ({
    id: `c${index}`,
    title: `Soru ${index}`,
    updatedAt: new Date(Date.UTC(2026, 10, 21) - index * 60_000).toISOString(),
  }));

  it("bağlar ve hazırlıklar öğrencinin kimliğiyle, dilim dilim okunur; hazırlık süzgeci öbür listelerle aynı", async () => {
    const service = fakeClient((call) => {
      if (call.table === CONVERSATION_PREPS_TABLE) {
        const ids = opValues(call, "in")[0]![1] as string[];
        return {
          data: ids
            .filter((id) => id === "c0" || id === "c1" || id === "c300")
            .map((id) => ({ conversation_id: id, prep_id: id === "c300" ? P_GONE : P_BIO })),
        };
      }
      if (call.table === "exam_preps") return { data: [{ id: P_BIO, title: "Hücre Bölünmeleri", exam_type: "yks", exam_date: "2026-12-26" }] };
      throw new Error(`beklenmeyen tablo: ${call.table}`);
    });
    const groups = await loadConversationGroups(service as never, USER, many);
    const linkCalls = service.calls.filter((call) => call.table === CONVERSATION_PREPS_TABLE);
    expect(linkCalls).toHaveLength(3);
    for (const call of linkCalls) {
      expect(opValues(call, "eq")).toContainEqual(["user_id", USER]);
      expect((opValues(call, "in")[0]![1] as string[]).length).toBeLessThanOrEqual(ID_SLICE);
    }
    const prepCall = service.calls.find((call) => call.table === "exam_preps")!;
    expect(opValues(prepCall, "eq")).toContainEqual(["user_id", USER]);
    expect(opValues(prepCall, "neq")).toContainEqual(["exam_type", "hedef"]);
    expect(opValues(prepCall, "or")).toContainEqual([NOT_STUDIO_EXAM_FILTER]);
    expect(groups![0]).toMatchObject({ key: P_BIO, title: "Hücre Bölünmeleri", examDate: "2026-12-26" });
    expect(groups![0]!.conversations.map((row) => row.id)).toEqual(["c0", "c1"]);
    // Silinmiş hazırlığın bağı (P_GONE) Genel'e düşer.
    expect(groups![1]!.key).toBe(GENERAL_GROUP_KEY);
    expect(groups![1]!.conversations.some((row) => row.id === "c300")).toBe(true);
  });

  it("tablo yok (göç uygulanmadı): null, uyarı yok; okuma düşerse de null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const missing = fakeClient(() => ({ error: { code: "42P01", message: 'relation "tutor_conversation_preps" does not exist' } }));
    expect(await loadConversationGroups(missing as never, USER, many.slice(0, 3))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    const broken = fakeClient((call) =>
      call.table === CONVERSATION_PREPS_TABLE ? { data: [{ conversation_id: "c0", prep_id: P_BIO }] } : { error: { code: "57014", message: "timeout" } },
    );
    expect(await loadConversationGroups(broken as never, USER, many.slice(0, 3))).toBeNull();
    expect(warn).toHaveBeenCalledWith("tutor_history_preps_read_failed", { code: "57014" });
    warn.mockRestore();
  });

  it("konuşma yoksa hiçbir sorgu atılmaz", async () => {
    const service = fakeClient(() => ({ data: [] }));
    expect(await loadConversationGroups(service as never, USER, [])).toEqual([]);
    expect(service.calls).toHaveLength(0);
  });
});

/* ---------- Bağ yazımı ---------- */
describe("bağ yazımı: konuşma başına tek satır, asla fırlatmaz", () => {
  it("upsert konuşma kimliğiyle çakışır; öğrenci ve hazırlık yazılır", async () => {
    const service = fakeClient(() => ({ error: null }));
    expect(await bindConversationPrep(service as never, { userId: USER, conversationId: "c1", prepId: P_BIO })).toBe("saved");
    const [payload, options] = opValues(service.calls[0]!, "upsert")[0]! as [Record<string, unknown>, Record<string, unknown>];
    expect(service.calls[0]!.table).toBe(CONVERSATION_PREPS_TABLE);
    expect(payload).toMatchObject({ conversation_id: "c1", user_id: USER, prep_id: P_BIO });
    expect(typeof payload.updated_at).toBe("string");
    expect(options).toEqual({ onConflict: "conversation_id" });
  });

  it("tablo yoksa atlanır; hata ve istisna yutulur", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const missing = fakeClient(() => ({ error: { code: "PGRST205", message: "Could not find the table in the schema cache" } }));
    expect(await bindConversationPrep(missing as never, { userId: USER, conversationId: "c1", prepId: P_BIO })).toBe("skipped");
    const failing = fakeClient(() => ({ error: { code: "23503", message: "fk" } }));
    expect(await bindConversationPrep(failing as never, { userId: USER, conversationId: "c1", prepId: P_BIO })).toBe("failed");
    const throwing = fakeClient(() => {
      throw new Error("ağ");
    });
    await expect(bindConversationPrep(throwing as never, { userId: USER, conversationId: "c1", prepId: P_BIO })).resolves.toBe("failed");
    warn.mockRestore();
  });
});

describe("göç ile upsert: son bağlam geçerli, konuşma silinince bağ gider (PGlite)", () => {
  const db = new PGlite();
  const CONV = "44444444-4444-4444-8444-444444444444";

  beforeAll(async () => {
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.conversations (id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id), title text);
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id));
    `);
    await db.exec(read("supabase/migrations/20261121150000_tutor_memory_notes.sql"));
    await db.query(`INSERT INTO public.profiles (id) VALUES ($1), ($2)`, [USER, OTHER_USER]);
    await db.query(`INSERT INTO public.conversations (id, user_id) VALUES ($1, $2)`, [CONV, USER]);
    await db.query(`INSERT INTO public.exam_preps (id, user_id) VALUES ($1, $3), ($2, $3)`, [P_BIO, P_PHYS, USER]);
  });

  afterAll(async () => {
    await db.close();
  });

  it("aynı konuşma ikinci hazırlıkla yazılınca satır güncellenir (PostgREST upsert = ON CONFLICT konuşma)", async () => {
    const upsert = `INSERT INTO public.tutor_conversation_preps (conversation_id, user_id, prep_id, updated_at)
      VALUES ($1, $2, $3, now()) ON CONFLICT (conversation_id) DO UPDATE
      SET user_id = EXCLUDED.user_id, prep_id = EXCLUDED.prep_id, updated_at = EXCLUDED.updated_at`;
    await db.query(upsert, [CONV, USER, P_BIO]);
    await db.query(upsert, [CONV, USER, P_PHYS]);
    const { rows } = await db.query<{ prep_id: string }>(
      `SELECT prep_id FROM public.tutor_conversation_preps WHERE user_id = $1 AND conversation_id = ANY($2::uuid[])`,
      [USER, [CONV]],
    );
    expect(rows).toEqual([{ prep_id: P_PHYS }]);
    await db.query(`DELETE FROM public.conversations WHERE id = $1`, [CONV]);
    const left = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.tutor_conversation_preps`);
    expect(left.rows[0]!.n).toBe(0);
  });
});

/* ---------- Sohbet ucu: seçili hazırlığın sahipliği materyal okumasından ---------- */
function materialService(preps: Record<string, unknown>[]) {
  return fakeClient((call) => {
    const eq = opValues(call, "eq");
    const userFilter = eq.find(([field]) => field === "user_id")?.[1];
    if (call.table === "exam_preps") return { data: preps.filter((row) => row.user_id === userFilter) };
    if (call.table === "documents") return { data: [] };
    if (call.table === "exam_prep_topics") return { data: [] };
    if (call.table === "messages") return { data: [] };
    return { data: [] };
  });
}

describe("materyal okuması seçili hazırlığın sahipliğini söyler", () => {
  const preps = [
    { id: P_BIO, user_id: USER, title: "Hücre Bölünmeleri", exam_type: "yks", exam_date: null, created_at: "2026-11-01" },
    { id: P_PHYS, user_id: USER, title: "Kuvvet ve Hareket", exam_type: "yks", exam_date: null, created_at: "2026-11-02" },
    { id: P_GONE, user_id: OTHER_USER, title: "Osmanlı Tarihi", exam_type: "kpss", exam_date: null, created_at: "2026-11-03" },
  ];

  it("kendi hazırlığı: kimliği döner (mesaj başka hazırlığı ansa da)", async () => {
    const own = await resolveChatMaterial(materialService(preps) as never, USER, "bunu anlat", P_BIO);
    expect(own?.ownedContextPrepId).toBe(P_BIO);
    const named = await resolveChatMaterial(materialService(preps) as never, USER, "Kuvvet ve Hareket notumdan özet çıkar", P_BIO);
    expect(named?.match.preps.map((item) => item.prep.id)).toEqual([P_PHYS]);
    expect(named?.ownedContextPrepId).toBe(P_BIO);
  });

  it("başka öğrencinin hazırlık kimliği kabul edilmez", async () => {
    const foreign = await resolveChatMaterial(materialService(preps) as never, USER, "Kuvvet ve Hareket notumdan özet çıkar", P_GONE);
    expect(foreign?.ownedContextPrepId ?? null).toBeNull();
    expect(await resolveChatMaterial(materialService(preps) as never, USER, "bunu anlat", P_GONE)).toBeNull();
  });
});

describe("sohbet ucu: bağ yalnız v2'de, ana sohbette, sahiplenilen hazırlıkta ve yanıttan sonra", () => {
  const route = read("src/app/api/ai/chat/route.ts");
  const start = route.indexOf("const linkedConversationId");
  const block = route.slice(start, route.indexOf('stage("saved");', start));

  it("koşullar ve after() içinde doğrulanmış kimlik", () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("const linkedConversationId = rest.conversationId ?? savedConversationId ?? null;");
    expect(block).toContain("if (teacherV2 && !rest.prepId && rest.contextPrepId && linkedConversationId) {");
    expect(block).toMatch(/after\(async \(\) => \{[\s\S]*await materialEarly\.catch\(\(\) => null\)/);
    expect(block).toContain("if (link?.ownedContextPrepId !== selectedPrepId) return;");
    expect(block).toContain("await bindConversationPrep(service, { userId, conversationId: linkedConversationId, prepId: selectedPrepId });");
    // Bağ yazımı yalnız after içinde: yanıtı bekletmez.
    expect(route.match(/bindConversationPrep\(/g)).toHaveLength(1);
    expect(block.indexOf("after(async")).toBeLessThan(block.indexOf("bindConversationPrep("));
  });

  it("bağ kaydedilen turun sonrasında: işlem RPC'si ve başlık işinden sonra", () => {
    expect(route.indexOf('service.rpc("complete_chat_operation"')).toBeLessThan(start);
    expect(route.indexOf("const savedConversationId")).toBeLessThan(start);
  });
});

/* ---------- Geçmiş ucu ---------- */
function studentClient(rows: Record<string, unknown>[], fail = false) {
  return fakeClient((call) => {
    if (call.table !== "conversations") throw new Error(`öğrenci istemcisi yalnız konuşmaları okur: ${call.table}`);
    return fail ? { error: { code: "57014", message: "timeout" } } : { data: rows };
  });
}

describe("GET /api/teacher/conversations", () => {
  const rows = [
    { id: "c1", title: "Krossing over", updated_at: "2026-11-21T08:00:00.000Z" },
    { id: "c2", title: "Tanzimat Fermanı", updated_at: "2026-11-20T08:00:00.000Z" },
  ];
  const request = () => new Request("http://localhost/api/teacher/conversations");

  beforeEach(() => {
    guard.withUser.mockReset();
    flags.isFeatureEnabled.mockReset();
  });

  it("oturum yoksa kapının cevabı aynen döner", async () => {
    guard.withUser.mockResolvedValue({ ok: false, response: new Response("{}", { status: 401 }) });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(flags.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it("bayrak kapalıyken 404 ve hiçbir okuma yok", async () => {
    const service = fakeClient(() => ({ data: [] }));
    const supabase = studentClient(rows);
    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service, supabase } });
    flags.isFeatureEnabled.mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(flags.isFeatureEnabled).toHaveBeenCalledWith(service, "teacher.v2", USER);
    expect(service.calls).toHaveLength(0);
    expect(supabase.calls).toHaveLength(0);
  });

  it("bayrak açıkken gruplu liste; yalnız üç tablo okunur, model ya da kredi yok", async () => {
    const service = fakeClient((call) => {
      if (call.table === CONVERSATION_PREPS_TABLE) return { data: [{ conversation_id: "c1", prep_id: P_BIO }] };
      if (call.table === "exam_preps") return { data: [{ id: P_BIO, title: "Hücre Bölünmeleri", exam_type: "yks", exam_date: "2026-12-26" }] };
      throw new Error(`beklenmeyen tablo: ${call.table}`);
    });
    const supabase = studentClient(rows);
    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service, supabase } });
    flags.isFeatureEnabled.mockResolvedValue(true);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as { grouped: boolean; groups: { key: string; conversations: { id: string }[] }[] };
    expect(body.grouped).toBe(true);
    expect(body.groups.map((group) => group.key)).toEqual([P_BIO, GENERAL_GROUP_KEY]);
    expect(opValues(supabase.calls[0]!, "eq")).toContainEqual(["user_id", USER]);
    expect(opValues(supabase.calls[0]!, "is")).toContainEqual(["deleted_at", null]);
    expect(service.calls.map((call) => call.table).sort()).toEqual(["exam_preps", CONVERSATION_PREPS_TABLE].sort());
    expect(service.rpc).not.toHaveBeenCalled();
    const source = read("src/app/api/teacher/conversations/route.ts");
    expect(source).not.toMatch(/openai|reserveCredits|credit|generateJson/i);
    expect(source).toContain('withUser(request, { scope: "teacher-conversations-read", limit: 60 })');
  });

  it("bağ tablosu yoksa bütün konuşmalar Genel'de (grouped: false); liste okunamazsa 503", async () => {
    const missing = fakeClient(() => ({ error: { code: "42P01", message: "relation does not exist" } }));
    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service: missing, supabase: studentClient(rows) } });
    flags.isFeatureEnabled.mockResolvedValue(true);
    const body = (await (await GET(request())).json()) as { grouped: boolean; groups: { key: string; conversations: unknown[] }[] };
    expect(body.grouped).toBe(false);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]!.key).toBe(GENERAL_GROUP_KEY);
    expect(body.groups[0]!.conversations).toHaveLength(2);

    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service: missing, supabase: studentClient(rows, true) } });
    expect((await GET(request())).status).toBe(503);
  });
});

/* ---------- /sohbetler sayfası ---------- */
function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findElement(child, type);
        if (hit) return hit;
      }
    }
    return null;
  }
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

describe("/sohbetler: bayrak kapalıyken bugünkü liste, açıkken hazırlık grupları", () => {
  const rows = [
    { id: "c1", title: "Krossing over", updated_at: "2026-11-21T08:00:00.000Z" },
    { id: "c2", title: "Newton'un ikinci yasası", updated_at: "2026-11-20T08:00:00.000Z" },
  ];

  afterEach(() => {
    flags.isFeatureEnabled.mockReset();
    session.requireStudentArea.mockReset();
  });

  function setup(flagOn: boolean) {
    const student = studentClient(rows);
    const service = fakeClient((call) => {
      if (call.table === CONVERSATION_PREPS_TABLE) return { data: [{ conversation_id: "c2", prep_id: P_PHYS }] };
      if (call.table === "exam_preps") return { data: [{ id: P_PHYS, title: "Kuvvet ve Hareket", exam_type: "yks", exam_date: null }] };
      throw new Error(`beklenmeyen tablo: ${call.table}`);
    });
    serviceHolder.current = service;
    session.requireStudentArea.mockResolvedValue({ supabase: student, user: { id: USER, email: "ogrenci@ornek.test" } });
    flags.isFeatureEnabled.mockResolvedValue(flagOn);
    return { student, service };
  }

  it("bayrak kapalı: liste gruplarsız (bugünkü gün başlıkları), bağ tablosu okunmaz", async () => {
    const { service } = setup(false);
    const tree = await SohbetlerPage();
    const list = findElement(tree, SohbetlerList)!;
    expect(list).toBeTruthy();
    expect(list.props.groups).toBeUndefined();
    expect((list.props.items as unknown[]).length).toBe(2);
    expect(service.calls).toHaveLength(0);
  });

  it("bayrak açık: aynı konuşmalar hazırlığa göre gruplanır", async () => {
    setup(true);
    const tree = await SohbetlerPage();
    const list = findElement(tree, SohbetlerList)!;
    const groups = list.props.groups as { key: string; conversations: { id: string }[] }[];
    expect(groups.map((group) => group.key)).toEqual([P_PHYS, GENERAL_GROUP_KEY]);
    expect(groups[0]!.conversations.map((row) => row.id)).toEqual(["c2"]);
  });

  it("bayrak açık ama tablo yok: bugünkü liste", async () => {
    setup(true);
    serviceHolder.current = fakeClient(() => ({ error: { code: "42P01", message: "relation does not exist" } }));
    const tree = await SohbetlerPage();
    expect(findElement(tree, SohbetlerList)!.props.groups).toBeUndefined();
  });

  it("/ogretmen: panel yalnız bayrak açıkken ve sohbet panelinin dışında bağlanır; sohbet panelinde geçmiş yok", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain("{teacherV2 ? <TutorHistoryPanel activeConversationId={conversationId ?? null} /> : null}");
    expect(read("src/components/chat/chat-panel.tsx")).not.toContain("TutorHistoryPanel");
    const panel = read("src/components/parity/tutor-history-panel.tsx");
    expect(panel).toContain('export const HISTORY_ENDPOINT = "/api/teacher/conversations";');
    // Panel sunucu okuması yapmaz (sayfa bütçesine girmez): veritabanı istemcisi yok.
    expect(panel).not.toMatch(/supabase|createServiceClient/);
  });
});
