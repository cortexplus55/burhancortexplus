import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Yönetim panelinde kullanıcı yönetimi (6 Kasım 2026): paket tanımlama/iptal, yıldız, e-posta onayı, cihaz
  oturumları ve kurucunun kalıcı silmesi. Yetki kapısı gerçek (`admin-actor` → sahte oturum istemcisi), veritabanı
  sahte servis; silme sırası ve denetim kaydı adım adım izlenir. Göç PGlite'ta çalışır. Metin bekçisi
  `yonetim-temeli.test.ts`'teki İngilizce terim listesini okur.
*/

// ---- Sahte Next, oturum ve servis --------------------------------------------------------------

type Row = Record<string, unknown>;
type Filter = { kind: string; column: string; value: unknown };
type Call = { table: string; op: string; payload?: unknown; filters: Filter[] };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAdmin: false,
  isFounder: false,
  log: [] as string[],
  calls: [] as Call[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  audits: [] as { action: string; actorId?: string | null; entityId?: string; metadata?: Record<string, unknown> }[],
  roles: {} as Record<string, string[]>,
  plans: [] as Row[],
  subscriptions: [] as Row[],
  wallet: { free_allowance_remaining: 0 } as Row | null,
  preps: [] as Row[],
  documents: [] as Row[],
  rpcResult: {} as Record<string, { data: unknown; error: unknown }>,
  authUser: null as Row | null,
  authUpdates: [] as { id: string; attrs: Row }[],
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/audit", () => ({
  auditLog: async (_service: unknown, params: (typeof state.audits)[number]) => {
    state.log.push(`audit:${params.action}`);
    state.audits.push(params);
  },
  redact: (input: Row) => input,
}));

function filterValue(filters: Filter[], kind: string, column: string): unknown {
  return filters.find((f) => f.kind === kind && f.column === column)?.value;
}

function answer(call: Call): { data: unknown; error: unknown; count?: number } {
  const { table, op, filters } = call;
  const eqUser = (filterValue(filters, "eq", "user_id") as string | undefined) ?? null;
  const inIds = (filterValue(filters, "in", "id") as string[] | undefined) ?? null;
  if (table === "user_roles") {
    return { data: (state.roles[eqUser ?? ""] ?? []).map((role) => ({ role })), error: null };
  }
  if (table === "plans") {
    const id = filterValue(filters, "eq", "id");
    return { data: state.plans.find((plan) => plan.id === id) ?? null, error: null };
  }
  if (table === "subscriptions" && op === "select") {
    const status = filterValue(filters, "eq", "status");
    const rows = state.subscriptions.filter((row) => row.user_id === eqUser && (!status || row.status === status));
    return { data: rows[0] ?? null, error: null };
  }
  if (table === "credit_wallets" && op === "select") return { data: state.wallet, error: null };
  if (table === "exam_preps" && op === "select") {
    const rows = state.preps.filter((row) => row.user_id === eqUser && (!inIds || inIds.includes(row.id as string)));
    return { data: rows, error: null };
  }
  if (table === "documents" && op === "select") {
    const path = filterValue(filters, "eq", "storage_path");
    if (path) {
      const notId = filterValue(filters, "neq", "id");
      return { data: state.documents.filter((doc) => doc.storage_path === path && doc.id !== notId && !doc.deleted_at), error: null };
    }
    const id = filterValue(filters, "eq", "id");
    if (id) return { data: state.documents.find((doc) => doc.id === id && doc.user_id === eqUser) ?? null, error: null };
    const rows = state.documents.filter(
      (doc) => doc.user_id === eqUser && !doc.deleted_at && (!inIds || inIds.includes(doc.id as string)),
    );
    return { data: rows, error: null };
  }
  if (table === "document_deletion_requests") return { data: { document_id: "x" }, error: null };
  if (table === "user_device_sessions" && op === "update") return { data: [{ session_id: "a" }, { session_id: "b" }], error: null };
  return { data: null, error: null };
}

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const done = () => {
    state.calls.push(call);
    state.log.push(`${call.op}:${table}`);
    return answer(call);
  };
  const self: Record<string, unknown> = {};
  const chain = (fn?: (...args: unknown[]) => void) => (...args: unknown[]) => {
    fn?.(...args);
    return self;
  };
  Object.assign(self, {
    select: chain(() => undefined),
    insert: chain((payload) => ((call.op = "insert"), (call.payload = payload))),
    update: chain((payload) => ((call.op = "update"), (call.payload = payload))),
    upsert: chain((payload) => ((call.op = "upsert"), (call.payload = payload))),
    delete: chain(() => (call.op = "delete")),
    eq: chain((column, value) => call.filters.push({ kind: "eq", column: String(column), value })),
    neq: chain((column, value) => call.filters.push({ kind: "neq", column: String(column), value })),
    in: chain((column, value) => call.filters.push({ kind: "in", column: String(column), value })),
    is: chain((column, value) => call.filters.push({ kind: "is", column: String(column), value })),
    not: chain((column, _op, value) => call.filters.push({ kind: "not", column: String(column), value })),
    order: chain(),
    limit: chain(),
    range: chain(),
    abortSignal: chain(),
    maybeSingle: () => Promise.resolve(done()),
    single: () => Promise.resolve(done()),
    then: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(done()).then(resolve, reject),
  });
  return self;
}

const fakeService = {
  from: (table: string) => builder(table),
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.rpcs.push({ name, args });
    state.log.push(`rpc:${name}`);
    return state.rpcResult[name] ?? { data: true, error: null };
  },
  storage: {
    from: () => ({
      remove: async (paths: string[]) => {
        state.log.push(`storage.remove:${paths.join(",")}`);
        return { error: null };
      },
    }),
  },
  auth: {
    admin: {
      getUserById: async () => ({ data: { user: state.authUser }, error: state.authUser ? null : { message: "yok" } }),
      updateUserById: async (id: string, attrs: Row) => {
        state.authUpdates.push({ id, attrs });
        state.log.push("auth.update");
        return { data: {}, error: null };
      },
    },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (name: string) => {
      if (name === "is_admin") return { data: state.isAdmin, error: null };
      if (name === "is_founder") return { data: state.isFounder, error: null };
      if (name === "current_account_active") return { data: true, error: null };
      return { data: null, error: null };
    },
  }),
  createServiceClient: () => fakeService,
}));

import {
  adjustUserStars,
  cancelUserPlan,
  confirmUserEmail,
  deleteUserDocuments,
  deleteUserPreps,
  grantUserPlan,
  resetUserDevices,
} from "@/app/admin/kullanicilar/actions";
import { FOUNDER_ONLY_ERROR } from "@/lib/auth/admin-actor";
import { STARS_MIGRATION_MISSING } from "@/lib/admin/user-manage";
import {
  deleteConfirmationMatches,
  documentStatusLabel,
  emailVerifiedState,
  formatFileSize,
  grantablePlanOptions,
  planGrantWallet,
  targetAccountProblem,
} from "@/lib/admin/user-manage-copy";
import { AUDIT_LABELS } from "@/lib/admin/labels";
import { STAR_SOURCE_LABEL } from "@/lib/stars/rules";

const FOUNDER = "44444444-4444-4444-8444-444444444444";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const STUDENT = "55555555-5555-4555-8555-555555555555";
const OTHER_FOUNDER = "66666666-6666-4666-8666-666666666666";
const PREP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PREP_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DOC_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const DOC_PART = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PLUS = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const WEEK = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const SIGMA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const EXTRA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const PLANS: Row[] = [
  { id: PLUS, slug: "plus-aylik", name: "Plus", tier: "plus", is_premium: true, active: true, billing_period: "monthly", monthly_allowance: 7200 },
  { id: WEEK, slug: "plus-haftalik", name: "Plus", tier: "plus", is_premium: true, active: true, billing_period: "weekly", monthly_allowance: 2700 },
  { id: SIGMA, slug: "sigma-aylik", name: "Sigma", tier: "sigma", is_premium: true, active: true, billing_period: "monthly", monthly_allowance: 60000 },
  { id: EXTRA, slug: "ek-kredi-50", name: "Ek paket S", tier: null, is_premium: false, active: true, billing_period: "one_time", monthly_allowance: null },
];

function as(role: "founder" | "admin" | "student" | "guest", id?: string) {
  state.user = role === "guest" ? null : { id: id ?? (role === "founder" ? FOUNDER : role === "admin" ? ADMIN : STUDENT) };
  state.isAdmin = role === "founder" || role === "admin";
  state.isFounder = role === "founder";
}

beforeEach(() => {
  delete process.env.ADMIN_GATE_PIN_HASH;
  as("guest");
  state.log = [];
  state.calls = [];
  state.rpcs = [];
  state.audits = [];
  state.roles = { [FOUNDER]: ["founder", "admin"], [ADMIN]: ["admin"], [STUDENT]: ["student"], [OTHER_FOUNDER]: ["founder"] };
  state.plans = PLANS;
  state.subscriptions = [];
  state.wallet = { free_allowance_remaining: 0 };
  state.preps = [
    { id: PREP_A, user_id: STUDENT, title: "Fizik Vize" },
    { id: PREP_B, user_id: STUDENT, title: "Kimya Final" },
  ];
  state.documents = [
    { id: DOC_A, user_id: STUDENT, file_name: "notlar.pdf", part_of: null, storage_path: `${STUDENT}/${DOC_A}/notlar.pdf`, deleted_at: null },
    { id: DOC_PART, user_id: STUDENT, file_name: "notlar.pdf", part_of: DOC_A, storage_path: `${STUDENT}/${DOC_A}/notlar.pdf`, deleted_at: null },
  ];
  state.rpcResult = {};
  state.authUser = { id: STUDENT, email: "ogrenci@example.com", email_confirmed_at: null, app_metadata: { provider: "email", email_unverified: true } };
  state.authUpdates = [];
});

const writes = () => state.calls.filter((call) => call.op !== "select");

// ---- 1. Yetki kapısı ----------------------------------------------------------------------------

describe("yetki kapısı", () => {
  const manage = [
    () => grantUserPlan({ userId: STUDENT, planId: PLUS, days: 7 }),
    () => cancelUserPlan({ userId: STUDENT }),
    () => adjustUserStars({ userId: STUDENT, delta: 10 }),
    () => confirmUserEmail({ userId: STUDENT }),
    () => resetUserDevices({ userId: STUDENT }),
  ];
  const destroy = [
    () => deleteUserPreps({ userId: STUDENT, ids: [PREP_A], confirm: "SİL" }),
    () => deleteUserDocuments({ userId: STUDENT, ids: [DOC_A], confirm: "SİL" }),
  ];

  it("misafir ve öğrenci hiçbir şey yapamaz; servise yazım yok", async () => {
    for (const who of ["guest", "student"] as const) {
      as(who);
      for (const run of manage) expect(await run()).toEqual({ ok: false, error: "Yetkisiz işlem." });
      for (const run of destroy) expect(await run()).toEqual({ ok: false, error: FOUNDER_ONLY_ERROR });
    }
    expect(writes()).toEqual([]);
    expect(state.rpcs).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("yönetici silemez: kapı servisten önce döner", async () => {
    as("admin");
    for (const run of destroy) expect(await run()).toEqual({ ok: false, error: FOUNDER_ONLY_ERROR });
    expect(state.calls).toEqual([]);
    expect(state.rpcs).toEqual([]);
  });

  it("yönetici bir yöneticinin ya da kurucunun hesabında değişiklik yapamaz; kurucu yapabilir", async () => {
    as("admin");
    const result = await grantUserPlan({ userId: FOUNDER, planId: PLUS, days: 7 });
    expect(result.ok).toBe(false);
    expect(writes()).toEqual([]);
    as("founder");
    expect((await grantUserPlan({ userId: ADMIN, planId: PLUS, days: 7 })).ok).toBe(true);
  });

  it("kurucu başka bir kurucunun içeriğini silemez, kendi içeriğini siler", async () => {
    as("founder");
    state.preps.push({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", user_id: FOUNDER, title: "Kendi" });
    const other = await deleteUserPreps({ userId: OTHER_FOUNDER, ids: [PREP_A], confirm: "SİL" });
    expect(other.ok).toBe(false);
    expect(state.rpcs).toEqual([]);
    const own = await deleteUserPreps({ userId: FOUNDER, ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"], confirm: "sil" });
    expect(own).toEqual({ ok: true, message: "1 hazırlık kalıcı olarak silindi." });
  });

  it("saf kural: kendi hesabı her zaman serbest", () => {
    expect(targetAccountProblem({ actorId: ADMIN, actorRole: "admin", targetId: ADMIN, targetRoles: ["admin"] })).toBeNull();
    expect(targetAccountProblem({ actorId: ADMIN, actorRole: "admin", targetId: STUDENT, targetRoles: [] })).toBeNull();
    expect(targetAccountProblem({ actorId: FOUNDER, actorRole: "founder", targetId: OTHER_FOUNDER, targetRoles: ["founder"] })).toBeNull();
    expect(
      targetAccountProblem({ actorId: FOUNDER, actorRole: "founder", targetId: OTHER_FOUNDER, targetRoles: ["founder"], destructive: true }),
    ).not.toBeNull();
  });
});

// ---- 2. Silme: onay, sahiplik, sıra, denetim ---------------------------------------------------

describe("kalıcı silme", () => {
  it("onay metni eşleşmeden hiçbir şey silinmez", async () => {
    as("founder");
    for (const confirm of ["", "evet", "SİLL", "Fizik Vize", " si l "]) {
      const result = await deleteUserPreps({ userId: STUDENT, ids: [PREP_A], confirm });
      expect(result.ok).toBe(false);
    }
    expect(state.calls).toEqual([]);
    expect(state.rpcs).toEqual([]);
    expect(deleteConfirmationMatches("SİL")).toBe(true);
    expect(deleteConfirmationMatches("  sil ")).toBe(true);
    expect(deleteConfirmationMatches("SIL")).toBe(true);
  });

  it("hazırlık: sahiplik yeniden okunur → öğrencinin silme fonksiyonu → denetim kaydı (başlıklarla)", async () => {
    as("founder");
    const result = await deleteUserPreps({ userId: STUDENT, ids: [PREP_A, PREP_B], confirm: "SİL" });
    expect(result).toEqual({ ok: true, message: "2 hazırlık kalıcı olarak silindi." });
    expect(state.log).toEqual([
      "select:user_roles",
      "select:exam_preps",
      "rpc:delete_exam_prep",
      "rpc:delete_exam_prep",
      "audit:exam_preps.deleted_by_founder",
    ]);
    expect(state.rpcs.map((call) => call.args)).toEqual([
      { p_prep_id: PREP_A, p_user_id: STUDENT },
      { p_prep_id: PREP_B, p_user_id: STUDENT },
    ]);
    expect(state.audits[0]).toMatchObject({
      actorId: FOUNDER,
      entityId: STUDENT,
      metadata: { titles: ["Fizik Vize", "Kimya Final"], failed: [] },
    });
  });

  it("seçilenlerden biri başkasınınsa hiçbiri silinmez", async () => {
    as("founder");
    state.preps[1]!.user_id = ADMIN;
    const result = await deleteUserPreps({ userId: STUDENT, ids: [PREP_A, PREP_B], confirm: "SİL" });
    expect(result.ok).toBe(false);
    expect(state.rpcs).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("belge: kuyruk + mantıksal silme → dosya → kayıt → denetim; parça kopyası tek başına seçilemez", async () => {
    as("founder");
    const part = await deleteUserDocuments({ userId: STUDENT, ids: [DOC_PART], confirm: "SİL" });
    expect(part.ok).toBe(false);
    expect(state.rpcs).toEqual([]);
    state.log = [];

    state.rpcResult.soft_delete_document = { data: true, error: null };
    // Mantıksal silme sonrası belge "silindi" görünsün (temizlik bunu ister).
    const original = fakeService.rpc;
    fakeService.rpc = async (name: string, args: Record<string, unknown>) => {
      const out = await original(name, args);
      if (name === "soft_delete_document") {
        for (const doc of state.documents) if (doc.id === args.p_document_id) doc.deleted_at = "2026-11-06T10:00:00Z";
      }
      return out;
    };
    try {
      const result = await deleteUserDocuments({ userId: STUDENT, ids: [DOC_A], confirm: "SİL" });
      expect(result).toEqual({ ok: true, message: "1 belge kalıcı olarak silindi." });
    } finally {
      fakeService.rpc = original;
    }
    expect(state.log).toEqual([
      "select:user_roles",
      "select:documents",
      "rpc:soft_delete_document",
      "select:documents",
      "select:documents",
      `storage.remove:${STUDENT}/${DOC_A}/notlar.pdf`,
      "delete:exam_preps",
      "delete:documents",
      "update:document_deletion_requests",
      "audit:documents.deleted_by_founder",
    ]);
    expect(state.audits.at(-1)).toMatchObject({ metadata: { names: ["notlar.pdf"], pending: [] } });
  });

  it("dosya başka canlı bir belgede de kullanılıyorsa depodan silinmez", async () => {
    as("founder");
    state.documents.push({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
      user_id: STUDENT,
      file_name: "kopya.pdf",
      part_of: null,
      storage_path: `${STUDENT}/${DOC_A}/notlar.pdf`,
      deleted_at: null,
    });
    const original = fakeService.rpc;
    fakeService.rpc = async (name: string, args: Record<string, unknown>) => {
      const out = await original(name, args);
      if (name === "soft_delete_document") {
        for (const doc of state.documents) if (doc.id === args.p_document_id) doc.deleted_at = "2026-11-06T10:00:00Z";
      }
      return out;
    };
    try {
      expect((await deleteUserDocuments({ userId: STUDENT, ids: [DOC_A], confirm: "SİL" })).ok).toBe(true);
    } finally {
      fakeService.rpc = original;
    }
    expect(state.log.some((entry) => entry.startsWith("storage.remove"))).toBe(false);
    expect(state.log).toContain("delete:documents");
  });
});

// ---- 3. Paket, yıldız, e-posta, cihaz -----------------------------------------------------------

describe("paket ve hak", () => {
  it("tanımlanabilen planlar yalnız satıştaki Plus ve Sigma; ek kredi paketi değil", () => {
    expect(grantablePlanOptions(PLANS as never)).toEqual([
      { id: SIGMA, label: "Sigma (aylık)" },
      { id: PLUS, label: "Plus (aylık)" },
      { id: WEEK, label: "Sınav Haftası (haftalık Plus)" },
    ]);
  });

  it("aboneliği yokken: abonelik eklenir (ücretsiz dönem), cüzdana orantılı hak; ödeme kaydı yok", async () => {
    as("admin");
    const result = await grantUserPlan({ userId: STUDENT, planId: PLUS, days: 7 });
    expect(result.ok).toBe(true);
    const insert = state.calls.find((call) => call.table === "subscriptions" && call.op === "insert");
    expect(insert?.payload).toMatchObject({ user_id: STUDENT, plan_id: PLUS, status: "active", auto_renew: false });
    const payload = insert?.payload as Row;
    expect(payload.trial_until).toBe(payload.current_period_end);
    const wallet = state.calls.find((call) => call.table === "credit_wallets" && call.op === "update");
    expect(wallet?.payload).toMatchObject({ free_allowance_remaining: 1680, period_allowance: 1680, period_kind: "monthly" });
    expect(state.calls.some((call) => call.table === "payments")).toBe(false);
    expect(state.audits[0]).toMatchObject({ action: "subscription.granted", metadata: { days: 7, paid: false, plan: "Plus (aylık)" } });
  });

  it("süren dönem varsa sonuna eklenir; aynı planda cüzdana dokunulmaz", async () => {
    as("admin");
    const end = new Date(Date.now() + 10 * 86_400_000).toISOString();
    state.subscriptions = [{ id: "s1", user_id: STUDENT, plan_id: PLUS, status: "active", current_period_end: end, trial_until: null }];
    expect((await grantUserPlan({ userId: STUDENT, planId: PLUS, days: 30 })).ok).toBe(true);
    const update = state.calls.find((call) => call.table === "subscriptions" && call.op === "update");
    const after = new Date((update?.payload as Row).current_period_end as string).getTime();
    expect(Math.round((after - new Date(end).getTime()) / 86_400_000)).toBe(30);
    expect(state.calls.some((call) => call.table === "credit_wallets")).toBe(false);
  });

  it("satışta olmayan ya da dönem açmayan plan tanımlanmaz; gün sınırı", async () => {
    as("admin");
    expect((await grantUserPlan({ userId: STUDENT, planId: EXTRA, days: 7 })).ok).toBe(false);
    expect((await grantUserPlan({ userId: STUDENT, planId: PLUS, days: 0 })).ok).toBe(false);
    expect((await grantUserPlan({ userId: STUDENT, planId: PLUS, days: 400 })).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("cüzdan kuralı: pencereden kısa süre orantılı, uzun süre tam hak", () => {
    const now = new Date("2026-11-06T10:00:00Z");
    const end = new Date("2026-11-20T10:00:00Z");
    expect(planGrantWallet({ billingPeriod: "monthly", monthlyAllowance: 7200, days: 14, subscriptionEnd: end, now })).toEqual({
      allowance: 3360,
      periodKind: "monthly",
      periodEndsAt: end.toISOString(),
    });
    expect(planGrantWallet({ billingPeriod: "weekly", monthlyAllowance: 2700, days: 7, subscriptionEnd: end, now })).toEqual({
      allowance: 2700,
      periodKind: "weekly",
      periodEndsAt: "2026-11-13T00:00:00.000Z",
    });
  });

  it("iptal: abonelik iptal edildi, dönem hakkı sıfır; etkin abonelik yoksa yazım yok", async () => {
    as("admin");
    expect((await cancelUserPlan({ userId: STUDENT })).ok).toBe(false);
    expect(writes()).toEqual([]);
    state.subscriptions = [{ id: "s1", user_id: STUDENT, plan_id: PLUS, status: "active", current_period_end: null }];
    expect((await cancelUserPlan({ userId: STUDENT })).ok).toBe(true);
    expect(writes().map((call) => [call.table, call.payload])).toEqual([
      ["subscriptions", expect.objectContaining({ status: "cancelled" })],
      ["credit_wallets", expect.objectContaining({ free_allowance_remaining: 0 })],
    ]);
    expect(state.audits.map((audit) => audit.action)).toEqual(["subscription.cancelled"]);
  });

  it("yıldız: SQL fonksiyonu; göç yoksa açık mesaj; sıfır geçersiz", async () => {
    as("admin");
    state.rpcResult.admin_adjust_stars = { data: { ok: true, total: 140 }, error: null };
    expect(await adjustUserStars({ userId: STUDENT, delta: -60 })).toEqual({ ok: true, message: "60 yıldız düşüldü. Toplam: 140." });
    expect(state.rpcs[0]).toMatchObject({ name: "admin_adjust_stars", args: { p_user: STUDENT, p_delta: -60 } });
    expect(state.audits[0]).toMatchObject({ action: "stars.adjusted", metadata: { delta: -60, total: 140 } });

    state.rpcResult.admin_adjust_stars = { data: null, error: { code: "PGRST202" } };
    expect(await adjustUserStars({ userId: STUDENT, delta: 5 })).toEqual({ ok: false, error: STARS_MIGRATION_MISSING });
    expect((await adjustUserStars({ userId: STUDENT, delta: 0 })).ok).toBe(false);
    expect(state.audits).toHaveLength(1);
  });

  it("e-posta: bayrak kalkar ve onay tarihi yazılır; zaten onaylıysa dokunulmaz", async () => {
    as("admin");
    expect((await confirmUserEmail({ userId: STUDENT })).ok).toBe(true);
    expect(state.authUpdates).toEqual([
      { id: STUDENT, attrs: { email_confirm: true, app_metadata: { provider: "email", email_unverified: false } } },
    ]);
    expect(state.audits.map((audit) => audit.action)).toEqual(["email.confirmed_by_admin"]);

    state.authUser = { id: STUDENT, email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: { email_unverified: false } };
    expect(await confirmUserEmail({ userId: STUDENT })).toEqual({ ok: true, message: "E-posta zaten onaylı." });
    expect(state.authUpdates).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(emailVerifiedState(state.authUser as never)).toBe("verified");
    expect(emailVerifiedState({ email_confirmed_at: "x", app_metadata: { email_unverified: true } })).toBe("unverified");
  });

  it("cihazlar: SQL fonksiyonu; göç yoksa yalnız bizim kayıtlar düşer", async () => {
    as("admin");
    state.rpcResult.admin_reset_device_sessions = { data: { revoked: 2, authSessions: 3 }, error: null };
    expect((await resetUserDevices({ userId: STUDENT })).ok).toBe(true);
    expect(writes()).toEqual([]);
    expect(state.audits[0]).toMatchObject({ action: "devices.reset", metadata: { revoked: 2, authSessions: 3, viaFunction: true } });

    state.rpcResult.admin_reset_device_sessions = { data: null, error: { code: "42883" } };
    const fallback = await resetUserDevices({ userId: STUDENT });
    expect(fallback).toEqual({ ok: true, message: "2 cihaz kaydı düşürüldü; o cihazlar en geç 5 dakika içinde çıkış yapar." });
    const update = writes().find((call) => call.table === "user_device_sessions");
    expect(update?.payload).toHaveProperty("revoked_at");
    expect(update?.filters).toEqual(
      expect.arrayContaining([{ kind: "eq", column: "user_id", value: STUDENT }, { kind: "is", column: "revoked_at", value: null }]),
    );
  });
});

// ---- 4. Türkçe metin bekçisi -------------------------------------------------------------------

/** `yonetim-temeli.test.ts`'teki liste, kopyalanmadan okunur. */
function englishTerms(): string[] {
  const source = read("tests/unit/yonetim-temeli.test.ts");
  const block = source.match(/const ENGLISH_TERMS = \[([\s\S]*?)\];/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

const UI_FILES = [
  "src/app/admin/kullanicilar/page.tsx",
  "src/app/admin/kullanicilar/[userId]/page.tsx",
  "src/components/admin/user-manage-tools.tsx",
  "src/components/admin/user-content-delete.tsx",
];
const MESSAGE_FILES = ["src/app/admin/kullanicilar/actions.ts", "src/lib/admin/user-manage.ts"];

function visibleTexts(): string[] {
  const texts: string[] = [];
  for (const file of UI_FILES) {
    const source = read(file);
    for (const match of source.matchAll(/>([^<>{}]*[A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]*)</g)) {
      const text = match[1]!.trim();
      // Kod parçası (iki JSX öğesi arasındaki üçlü ifade, çağrı) metin değildir.
      if (text && !/[=;"']|=>|\.\w+\(|&&|\|\|/.test(text)) texts.push(text);
    }
    for (const match of source.matchAll(/(?:title|desc|aria-label|placeholder|label)="([^"]+)"/g)) texts.push(match[1]!);
    for (const match of source.matchAll(/columns=\{\[([^\]]+)\]\}/g)) {
      texts.push(...[...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
    }
  }
  for (const file of MESSAGE_FILES) {
    const source = read(file);
    for (const match of source.matchAll(/(?:error|message):\s*[`"]([^`"]+)[`"]/g)) texts.push(match[1]!);
    for (const match of source.matchAll(/\n\s+[`"]([A-ZÇĞİÖŞÜ][^`"\n]* [^`"\n]*)[`"],?\n/g)) texts.push(match[1]!);
  }
  return texts;
}

describe("metinler Türkçe", () => {
  it("terim listesi okunuyor", () => {
    expect(englishTerms()).toEqual(expect.arrayContaining(["admin", "user", "credit", "role", "founder"]));
  });

  it("sayfa, bileşen ve eylem mesajlarında İngilizce terim ve teknik alan adı yok", () => {
    const terms = englishTerms();
    const texts = visibleTexts();
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      for (const term of terms) {
        expect(new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "iu").test(text), `"${text}" içinde "${term}"`).toBe(false);
      }
      expect(/\b(user_id|prep_id|document_id|plan_id)\b/.test(text), `"${text}" teknik alan adı`).toBe(false);
    }
  });

  it("denetim kayıtlarının, durumların ve yıldız kaynağının Türkçe adı var", () => {
    for (const action of [
      "subscription.granted",
      "subscription.extended",
      "subscription.cancelled",
      "stars.adjusted",
      "email.confirmed_by_admin",
      "devices.reset",
      "exam_preps.deleted_by_founder",
      "documents.deleted_by_founder",
    ]) {
      expect(AUDIT_LABELS[action], action).toMatch(/[a-zçğıöşü]/);
      expect(read("src/app/admin/kullanicilar/actions.ts")).toContain(`action: "${action}"`.replace("subscription.extended", "subscription.granted"));
    }
    expect(documentStatusLabel("completed")).toBe("Hazır");
    expect(documentStatusLabel("garip_kod")).toBe("Bilinmiyor");
    expect(STAR_SOURCE_LABEL.admin).toBe("Destek düzeltmesi");
    expect(formatFileSize(73447)).toBe("72 KB");
  });

  it("liste sayfası: arama, plan rozeti, son etkinlik, Benim hesabım; dar ekranda kart düzeni", () => {
    const list = read("src/app/admin/kullanicilar/page.tsx");
    expect(list).toContain('placeholder="İsim ya da e-postayla ara"');
    expect(list).toContain('"Son etkinlik"');
    expect(list).toContain("👤 Benim hesabım");
    expect(list).toContain("<AdminTableFrame stack");
    const css = read("src/styles/admin-panel.css");
    expect(css).toContain(".adm-table--stack thead { display: none; }");
    const detail = read("src/app/admin/kullanicilar/[userId]/page.tsx");
    expect(detail).toContain('export const dynamic = "force-dynamic"');
    expect(detail).toContain("canDelete={actorRole === \"founder\" && !deleteProblem}");
  });
});

// ---- 5. Göç PGlite'ta ---------------------------------------------------------------------------

describe("göç 20261106163000_yonetim_kullanicilar.sql", () => {
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const total = async (user: string) =>
    Number((await db.query<{ n: number }>("SELECT coalesce(sum(amount),0)::int AS n FROM public.star_events WHERE user_id = $1", [user])).rows[0]?.n);

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
      CREATE TABLE public.schools (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, school_id uuid, referred_by uuid);
      INSERT INTO auth.users VALUES ('${A}'), ('${B}');
      INSERT INTO public.profiles VALUES ('${A}', 'Ayşe Kaya', NULL, NULL), ('${B}', 'Can Demir', NULL, NULL);`);
    await db.exec(read("supabase/migrations/20261017120000_stars.sql"));
    await db.exec(read("supabase/migrations/20261031170000_device_sessions.sql"));
    await db.exec(read("supabase/migrations/20261106163000_yonetim_kullanicilar.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("yönetici yıldız ekler ve düşer; toplam sıfırın altına inmez", async () => {
    const add = await db.query<{ r: Row }>("SELECT public.admin_adjust_stars($1, 120, 'admin:x:1') AS r", [A]);
    expect(add.rows[0]!.r).toEqual({ ok: true, total: 120 });
    const drop = await db.query<{ r: Row }>("SELECT public.admin_adjust_stars($1, -100, 'admin:x:2') AS r", [A]);
    expect(drop.rows[0]!.r).toEqual({ ok: true, total: 20 });
    const tooMuch = await db.query<{ r: Row }>("SELECT public.admin_adjust_stars($1, -50, 'admin:x:3') AS r", [A]);
    expect(tooMuch.rows[0]!.r).toMatchObject({ ok: false, reason: "insufficient_stars" });
    const dup = await db.query<{ r: Row }>("SELECT public.admin_adjust_stars($1, 5, 'admin:x:1') AS r", [A]);
    expect(dup.rows[0]!.r).toMatchObject({ ok: false, reason: "duplicate" });
    expect(await total(A)).toBe(20);
  });

  it("eksi miktar yalnız yönetici kaynağında; öbür kaynakların sınırı aynen", async () => {
    await expect(db.exec(`INSERT INTO public.star_events (user_id, source, amount, ref, day) VALUES ('${B}', 'prep', -5, 'r', current_date)`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO public.star_events (user_id, source, amount, ref, day) VALUES ('${B}', 'prep', 501, 'r2', current_date)`)).rejects.toThrow();
  });

  it("yönetici yıldızı günlük hedef bonusunu tetiklemez", async () => {
    await db.query("SELECT public.admin_adjust_stars($1, 100, 'admin:y:1')", [B]);
    const awarded = await db.query<{ n: number }>("SELECT public.award_stars($1, 'prep', 'attempt-1', 10) AS n", [B]);
    expect(Number(awarded.rows[0]!.n)).toBe(10);
    const goal = await db.query("SELECT 1 FROM public.star_events WHERE user_id = $1 AND source = 'daily_goal'", [B]);
    expect(goal.rows).toHaveLength(0);
  });

  it("cihaz sıfırlama: açık kayıtlar düşer, Supabase oturumları silinir, başka hesaba dokunulmaz", async () => {
    await db.exec(`INSERT INTO public.user_device_sessions (session_id, user_id) VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001', '${A}'), ('aaaaaaaa-0000-4000-8000-000000000002', '${A}'),
        ('aaaaaaaa-0000-4000-8000-000000000003', '${B}');
      INSERT INTO auth.sessions VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '${A}'),
        ('aaaaaaaa-0000-4000-8000-000000000009', '${A}'), ('aaaaaaaa-0000-4000-8000-000000000003', '${B}');`);
    const result = await db.query<{ r: Row }>("SELECT public.admin_reset_device_sessions($1) AS r", [A]);
    expect(result.rows[0]!.r).toEqual({ revoked: 2, authSessions: 2 });
    const open = await db.query("SELECT 1 FROM public.user_device_sessions WHERE revoked_at IS NULL");
    expect(open.rows).toHaveLength(1);
    const left = await db.query<{ user_id: string }>("SELECT user_id FROM auth.sessions");
    expect(left.rows.map((row) => row.user_id)).toEqual([B]);
  });

  it("yalnız ekleme ve genişletme; fonksiyonlar yalnız sunucuya", () => {
    const sql = read("supabase/migrations/20261106163000_yonetim_kullanicilar.sql");
    expect(sql).not.toMatch(/DROP (TABLE|FUNCTION|POLICY|COLUMN)/i);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_adjust_stars(uuid, integer, text) TO service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_reset_device_sessions(uuid) TO service_role;");
  });
});
