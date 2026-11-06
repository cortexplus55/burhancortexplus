import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ENGLISH_TERMS } from "./helpers/admin-english-terms";

/*
  Yönetim panelinin temeli (6 Kasım 2026): iki kademeli rol (Kurucu / Yönetici), kurucuya özel sunucu
  eylemleri, PIN kapısı, öğrenciye ve misafire 404, beş kategorili Türkçe menü, göç PGlite'ta.
*/

// ---- Sahte Next ve Supabase ---------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAdmin: false as boolean | "error",
  isFounder: false as boolean | "missing" | "error",
  active: true as boolean,
  cookies: {} as Record<string, string>,
  serviceCalls: 0,
  rpcCalls: [] as string[],
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
  cookies: async () => ({
    get: (name: string) => (state.cookies[name] ? { name, value: state.cookies[name] } : undefined),
    set: (name: string, value: string) => {
      state.cookies[name] = value;
    },
    delete: (name: string) => {
      delete state.cookies[name];
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

function chain(): unknown {
  const result = { data: null, error: null };
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result);
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      if (name === "current_account_active") return { data: state.active, error: null };
      if (name === "is_admin") {
        return state.isAdmin === "error" ? { data: null, error: { code: "500" } } : { data: state.isAdmin, error: null };
      }
      if (name === "is_founder") {
        if (state.isFounder === "missing") return { data: null, error: { code: "PGRST202" } };
        if (state.isFounder === "error") return { data: null, error: { code: "500" } };
        return { data: state.isFounder, error: null };
      }
      return { data: null, error: null };
    },
  }),
  createServiceClient: () => {
    state.serviceCalls += 1;
    return { from: () => chain(), rpc: () => chain(), auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } };
  },
}));

import {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_MAX_FAILURES,
  ADMIN_GATE_TTL_MS,
  adminGateConfigFrom,
  hashAdminPin,
  parsePinHash,
  pinFingerprint,
  signAdminGateCookie,
  verifyAdminGateCookie,
  verifyAdminPin,
} from "@/lib/auth/admin-gate-core";
import { decideAdminGateAttempt } from "@/lib/auth/admin-gate-attempt";
import { getAdminRole, isFounderUser, isMissingFunctionError } from "@/lib/auth/admin-role";
import { FOUNDER_GATE_ERROR, FOUNDER_ONLY_ERROR, requireAdminActor, requireFounderActor } from "@/lib/auth/admin-actor";
import { requireAdminPage, requireFounderPage } from "@/lib/auth/admin-guard";
import { adminTeamChangeProblem, mergeTeamRows } from "@/lib/admin/admin-team";
import { ADMIN_GATE_NAV, ADMIN_NAV, canOpenAdminItem } from "@/lib/admin/nav";
import { ADMIN_ROLE_BADGE, ADMIN_ROLE_LABEL } from "@/lib/auth/admin-role";

const ADMIN = "33333333-3333-4333-8333-333333333333";
const FOUNDER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const SECRET = "test-app-secret";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function setPin(pin: string | null) {
  if (pin === null) delete process.env.ADMIN_GATE_PIN_HASH;
  else process.env.ADMIN_GATE_PIN_HASH = hashAdminPin(pin, randomBytes(16));
}

beforeEach(() => {
  state.user = null;
  state.isAdmin = false;
  state.isFounder = false;
  state.active = true;
  state.cookies = {};
  state.serviceCalls = 0;
  state.rpcCalls = [];
  process.env.APP_SECRET = SECRET;
  setPin(null);
});

afterAll(() => {
  delete process.env.ADMIN_GATE_PIN_HASH;
});

function asAdmin(id = ADMIN) {
  state.user = { id };
  state.isAdmin = true;
  state.isFounder = false;
}
function asFounder(id = FOUNDER) {
  state.user = { id };
  state.isAdmin = true;
  state.isFounder = true;
}

// ---- 1. Rol çözümü ------------------------------------------------------------------------------

describe("rol çözümü", () => {
  function fakeClient(admin: unknown, founder: unknown) {
    const calls: string[] = [];
    return {
      calls,
      client: {
        rpc: async (name: string) => {
          calls.push(name);
          const answer = name === "is_admin" ? admin : founder;
          return typeof answer === "object" && answer !== null ? { data: null, error: answer } : { data: answer, error: null };
        },
      } as never,
    };
  }

  it("öğrenci null, yönetici admin, kurucu founder", async () => {
    expect(await getAdminRole(fakeClient(false, false).client, OTHER)).toBeNull();
    expect(await getAdminRole(fakeClient(true, false).client, ADMIN)).toBe("admin");
    expect(await getAdminRole(fakeClient(true, true).client, FOUNDER)).toBe("founder");
    expect(await isFounderUser(fakeClient(true, true).client, FOUNDER)).toBe(true);
  });

  it("kurucu satırı olup yönetici olmayan kurucu sayılmaz (is_admin önce sorulur)", async () => {
    const fake = fakeClient(false, true);
    expect(await getAdminRole(fake.client, OTHER)).toBeNull();
    expect(fake.calls).not.toContain("is_founder");
  });

  it("göç yoksa (is_founder yok) kimse kurucu değil; yönetici yönetici kalır", async () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "500" })).toBe(false);
    expect(await getAdminRole(fakeClient(true, { code: "PGRST202" }).client, FOUNDER)).toBe("admin");
    expect(await getAdminRole(fakeClient(true, { code: "500" }).client, FOUNDER)).toBe("admin");
  });

  it("yönetici sorgusu düşerse yetki yok", async () => {
    expect(await getAdminRole(fakeClient({ code: "500" }, true).client, FOUNDER)).toBeNull();
  });
});

// ---- 2. Kapı çerezi ve PIN ----------------------------------------------------------------------

describe("PIN özeti ve kapı çerezi", () => {
  const pinHash = parsePinHash(hashAdminPin("482913", randomBytes(16)))!;
  const fp = pinFingerprint(pinHash);
  const now = Date.UTC(2026, 10, 6, 12);

  it("PIN düz metin saklanmaz; doğru PIN tutar, yanlışı tutmaz", () => {
    const raw = hashAdminPin("482913", randomBytes(16));
    expect(raw).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(raw).not.toContain("482913");
    expect(verifyAdminPin("482913", pinHash)).toBe(true);
    expect(verifyAdminPin(" 482913 ", pinHash)).toBe(true);
    expect(verifyAdminPin("482914", pinHash)).toBe(false);
    expect(verifyAdminPin("123", pinHash)).toBe(false);
    expect(parsePinHash("482913")).toBeNull();
    expect(parsePinHash("scrypt$3$8$1$aaaa$bbbb")).toBeNull();
  });

  it("betik aynı biçimi üretir ve doğrulayıcı onu okur", () => {
    const out = spawnSync(process.execPath, ["scripts/admin-pin-hash.mjs", "739204"], { encoding: "utf8" });
    expect(out.status).toBe(0);
    const parsed = parsePinHash(out.stdout.trim());
    expect(parsed).not.toBeNull();
    expect(verifyAdminPin("739204", parsed!)).toBe(true);
    expect(verifyAdminPin("739205", parsed!)).toBe(false);
    const short = spawnSync(process.execPath, ["scripts/admin-pin-hash.mjs", "12"], { encoding: "utf8" });
    expect(short.status).toBe(1);
  });

  it("çerez imzalı, kullanıcıya bağlı, 12 saatlik; PIN değişince ölür", () => {
    const value = signAdminGateCookie({ userId: FOUNDER, now, secret: SECRET, fingerprint: fp });
    const ok = (v: string, over: Partial<{ userId: string; now: number; secret: string; fingerprint: string }> = {}) =>
      verifyAdminGateCookie(v, { userId: FOUNDER, now, secret: SECRET, fingerprint: fp, ...over });
    expect(ok(value)).toBe(true);
    expect(ok(value, { now: now + ADMIN_GATE_TTL_MS - 1000 })).toBe(true);
    expect(ok(value, { now: now + ADMIN_GATE_TTL_MS + 1 })).toBe(false);
    expect(ok(value, { userId: ADMIN })).toBe(false);
    expect(ok(value, { secret: "baska" })).toBe(false);
    expect(ok(value, { fingerprint: "baskapin" })).toBe(false);
    const [v, user, exp, sig] = value.split(".");
    expect(ok(`${v}.${user}.${Number(exp) + 60_000}.${sig}`)).toBe(false);
    expect(ok(`${v}.${ADMIN}.${exp}.${sig}`, { userId: ADMIN })).toBe(false);
    // Geleceğe uzatılmış, yeniden imzalanmış çerez de kabul edilmez (ömür > 12 saat).
    const far = signAdminGateCookie({ userId: FOUNDER, now: now + 2 * ADMIN_GATE_TTL_MS, secret: SECRET, fingerprint: fp });
    expect(ok(far)).toBe(false);
    expect(ok("")).toBe(false);
  });

  it("PIN tanımsızken kapı kapalı; bozuk özet ya da anahtarsız kapı panel açmaz", () => {
    expect(adminGateConfigFrom({}).state).toBe("off");
    expect(adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: "  " }).state).toBe("off");
    expect(adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: "bozuk", APP_SECRET: SECRET })).toEqual({ state: "misconfigured", reason: "pin_hash_invalid" });
    const raw = hashAdminPin("482913", randomBytes(16));
    expect(adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: raw })).toEqual({ state: "misconfigured", reason: "secret_missing" });
    expect(adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: raw, APP_SECRET: SECRET }).state).toBe("on");
  });

  it("yanlış PIN 10 dakikada 5 kez; sonra doğru PIN de kilitli", async () => {
    const config = adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: hashAdminPin("482913", randomBytes(16)), APP_SECRET: SECRET });
    let failures = 0;
    const counter = { count: async () => failures, record: async () => ++failures };
    for (let i = 1; i < ADMIN_GATE_MAX_FAILURES; i += 1) {
      expect(await decideAdminGateAttempt({ pin: "000000", config, failures: counter })).toEqual({ kind: "wrong", remaining: ADMIN_GATE_MAX_FAILURES - i });
    }
    expect(await decideAdminGateAttempt({ pin: "000000", config, failures: counter })).toEqual({ kind: "locked" });
    expect(await decideAdminGateAttempt({ pin: "482913", config, failures: counter })).toEqual({ kind: "locked" });
    failures = 0;
    expect(await decideAdminGateAttempt({ pin: "482913", config, failures: counter })).toEqual({ kind: "passed" });
    expect(failures).toBe(0);
    expect(await decideAdminGateAttempt({ pin: "x", config: { state: "off" }, failures: counter })).toEqual({ kind: "off" });
  });
});

// ---- 3. Sayfa koruması: öğrenciye ve misafire 404 ------------------------------------------------

describe("sayfa koruması", () => {
  it("misafir, öğrenci, askıdaki yönetici ve rolü okunamayan 404 alır", async () => {
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    state.user = { id: OTHER };
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    asAdmin();
    state.active = false;
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    state.active = true;
    state.isAdmin = "error";
    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("PIN tanımsızken yönetici girer; kurucu sayfası yöneticiye 404", async () => {
    asAdmin();
    const context = await requireAdminPage();
    expect(context.role).toBe("admin");
    expect(context.gate.state).toBe("off");
    await expect(requireFounderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    asFounder();
    expect((await requireFounderPage()).role).toBe("founder");
  });

  it("PIN tanımlıysa çerezsiz istek kapıya; geçerli çerezle sayfa açılır; başkasının çerezi geçmez", async () => {
    setPin("482913");
    asFounder();
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/kapi");
    expect((await requireAdminPage({ skipGate: true })).gate.state).toBe("required");
    const config = adminGateConfigFrom({ ADMIN_GATE_PIN_HASH: process.env.ADMIN_GATE_PIN_HASH, APP_SECRET: SECRET });
    if (config.state !== "on") throw new Error("kapı açık olmalı");
    state.cookies[ADMIN_GATE_COOKIE] = signAdminGateCookie({ userId: ADMIN, now: Date.now(), secret: SECRET, fingerprint: config.fingerprint });
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/kapi");
    state.cookies[ADMIN_GATE_COOKIE] = signAdminGateCookie({ userId: FOUNDER, now: Date.now(), secret: SECRET, fingerprint: config.fingerprint });
    expect((await requireAdminPage()).gate.state).toBe("passed");
  });

  it("her yönetim sayfası kendi korumasını çağırır; kurucu sayfaları requireFounderPage; Suspense/loading yok", () => {
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "page.tsx") pages.push(full);
        expect(name).not.toBe("loading.tsx");
      }
    };
    walk("src/app/admin");
    expect(pages.length).toBeGreaterThan(20);
    for (const file of pages) {
      const text = read(file);
      expect(text, file).toMatch(/await require(Admin|Founder)Page\(/);
      expect(text, file).not.toContain('from "@/lib/auth/session"');
    }
    for (const slug of ["yoneticiler", "paketler", "kredi-kurallari", "feature-flags"]) {
      expect(read(`src/app/admin/${slug}/page.tsx`)).toContain("await requireFounderPage()");
    }
    const layout = read("src/app/admin/layout.tsx");
    expect(layout).not.toMatch(/<Suspense|from "react"/);
    expect(layout).toContain("notFound()");
    expect(existsSync("src/app/admin/loading.tsx")).toBe(false);
  });

  it("ara katman misafiri /admin için girişe göndermez (sayfa 404 verir)", () => {
    const middleware = read("src/lib/supabase/middleware.ts");
    expect(middleware).toContain('const GUEST_NOT_FOUND_PREFIXES = ["/admin"]');
    expect(middleware).toContain("if (isProtected && !user && !matches(path, GUEST_NOT_FOUND_PREFIXES))");
  });
});

// ---- 4. Kurucuya özel eylemler ------------------------------------------------------------------

const FOUNDER_ONLY: Array<[string, string, string]> = [
  ["src/app/admin/actions.ts", "updateCreditRule", "creditRule"],
  ["src/app/admin/actions.ts", "toggleFeatureFlag", "flag"],
  ["src/app/admin/actions.ts", "updatePlan", "plan"],
  ["src/app/admin/cockpit-actions.ts", "saveUsdTryRate", "fx"],
  ["src/app/admin/cockpit-actions.ts", "saveDailySpendCap", "cap"],
  ["src/app/admin/adaptive/actions.ts", "updateAdaptivePilotUser", "pilot"],
  ["src/app/admin/adaptive/actions.ts", "addSelfToAdaptivePilots", "pilotSelf"],
  ["src/app/admin/yoneticiler/actions.ts", "grantAdminByEmail", "grant"],
  ["src/app/admin/yoneticiler/actions.ts", "revokeAdminRole", "revoke"],
];

async function callFounderAction(kind: string): Promise<{ ok: boolean; error?: string }> {
  const actions = await import("@/app/admin/actions");
  const cockpit = await import("@/app/admin/cockpit-actions");
  const adaptive = await import("@/app/admin/adaptive/actions");
  const team = await import("@/app/admin/yoneticiler/actions");
  switch (kind) {
    case "creditRule":
      return actions.updateCreditRule({ actionCode: "CHAT_MESSAGE", creditCost: 3 });
    case "flag":
      return actions.toggleFeatureFlag("weekly_survey", false);
    case "plan":
      return actions.updatePlan({ planId: OTHER, priceTry: 100, creditAmount: 10, active: true });
    case "fx":
      return cockpit.saveUsdTryRate(40);
    case "cap":
      return cockpit.saveDailySpendCap(30);
    case "pilot":
      return adaptive.updateAdaptivePilotUser({ flagKey: "jev_enabled", userId: OTHER, op: "add" });
    case "pilotSelf":
      return adaptive.addSelfToAdaptivePilots();
    case "grant":
      return team.grantAdminByEmail("yeni@cortexplus.app");
    case "revoke":
      return team.revokeAdminRole(OTHER);
    case "setAdminRole":
      return actions.setUserRole({ userId: OTHER, role: "admin", grant: true });
    default:
      throw new Error(kind);
  }
}

describe("kurucuya özel eylemler", () => {
  it("kaynakta her biri checkFounderActor ister", () => {
    for (const [file, name] of FOUNDER_ONLY) {
      const text = read(file);
      const start = text.indexOf(`export async function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = text.indexOf("\nexport async function ", start + 10);
      const body = text.slice(start, next === -1 ? undefined : next);
      expect(body, name).toContain("await checkFounderActor()");
    }
  });

  it.each([...FOUNDER_ONLY.map(([, , kind]) => kind), "setAdminRole"])("yönetici %s çağıramaz; veriye dokunulmaz", async (kind) => {
    asAdmin();
    const result = await callFounderAction(kind);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(FOUNDER_ONLY_ERROR);
    expect(state.serviceCalls).toBe(0);
  });

  it("öğrenci ve misafir de çağıramaz", async () => {
    expect((await callFounderAction("plan")).error).toBe(FOUNDER_ONLY_ERROR);
    state.user = { id: OTHER };
    expect((await callFounderAction("cap")).error).toBe(FOUNDER_ONLY_ERROR);
    expect(state.serviceCalls).toBe(0);
  });

  it("PIN tanımlıysa kurucu da geçerli kapı çerezi ister", async () => {
    setPin("482913");
    asFounder();
    const result = await callFounderAction("fx");
    expect(result).toEqual({ ok: false, error: FOUNDER_GATE_ERROR });
    expect(state.serviceCalls).toBe(0);
    expect(await requireFounderActor()).toBeNull();
    expect(await requireAdminActor()).toBe(FOUNDER);
  });

  it("kurucu PIN kapalıyken geçer (veriye ulaşır)", async () => {
    asFounder();
    expect(await requireFounderActor()).toBe(FOUNDER);
    await callFounderAction("fx");
    expect(state.serviceCalls).toBeGreaterThan(0);
  });

  it("yönetici günlük işleri yapmaya devam eder", async () => {
    asAdmin();
    expect(await requireAdminActor()).toBe(ADMIN);
    for (const name of ["markSupportAnswered", "createSharedBetaCode", "setFreePreview"]) {
      const file = name === "markSupportAnswered" ? "support-actions" : name === "setFreePreview" ? "free-preview-actions" : "beta-code-actions";
      const text = read(`src/app/admin/${file}.ts`);
      expect(text).toContain("await requireAdminActor()");
      expect(text).not.toContain("checkFounderActor");
    }
  });
});

describe("yönetici ekibi kuralları", () => {
  it("kurucu kendini ve başka kurucuyu çıkaramaz; zaten yönetici olana ikinci kez verilmez", () => {
    expect(adminTeamChangeProblem({ op: "revoke", actorId: FOUNDER, targetId: FOUNDER, targetRoles: ["admin", "founder"] })).toMatch(/Kendi/);
    expect(adminTeamChangeProblem({ op: "revoke", actorId: FOUNDER, targetId: OTHER, targetRoles: ["founder"] })).toMatch(/Kurucu/);
    expect(adminTeamChangeProblem({ op: "revoke", actorId: FOUNDER, targetId: OTHER, targetRoles: ["student"] })).toMatch(/değil/);
    expect(adminTeamChangeProblem({ op: "revoke", actorId: FOUNDER, targetId: OTHER, targetRoles: ["admin"] })).toBeNull();
    expect(adminTeamChangeProblem({ op: "grant", actorId: FOUNDER, targetId: OTHER, targetRoles: ["admin"] })).toMatch(/zaten/);
    expect(adminTeamChangeProblem({ op: "grant", actorId: FOUNDER, targetId: OTHER, targetRoles: ["student"] })).toBeNull();
  });

  it("aynı kişinin iki satırı tek satır; kurucu önce", () => {
    const rows = mergeTeamRows([
      { user_id: ADMIN, role: "admin", granted_at: "2026-03-01T00:00:00Z", granted_by: FOUNDER },
      { user_id: FOUNDER, role: "admin", granted_at: "2026-01-01T00:00:00Z", granted_by: null },
      { user_id: FOUNDER, role: "founder", granted_at: "2026-11-06T00:00:00Z", granted_by: null },
      { user_id: OTHER, role: "teacher", granted_at: "2026-01-01T00:00:00Z", granted_by: null },
    ]);
    expect(rows.map((row) => [row.userId, row.role])).toEqual([
      [FOUNDER, "founder"],
      [ADMIN, "admin"],
    ]);
    expect(rows[0]?.grantedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("yönetici sayfası satır silmez, denetim kaydı yazar, yeni hesap açmaz", () => {
    const text = read("src/app/admin/yoneticiler/actions.ts") + read("src/lib/admin/admin-team.ts");
    expect(text).not.toMatch(/\.delete\(/);
    expect(text).not.toMatch(/createUser|inviteUserByEmail/);
    expect(read("src/app/admin/yoneticiler/actions.ts")).toContain('action: "admin_role.granted"');
    expect(read("src/app/admin/yoneticiler/actions.ts")).toContain('action: "admin_role.revoked"');
    expect(read("src/lib/admin/admin-team.ts")).toContain("revoked_at: new Date().toISOString()");
  });
});

// ---- 5. Menü: beş kategori, tamamen Türkçe ------------------------------------------------------

/** Menüde ve rozette geçmemesi gereken İngilizce terimler: ortak liste (`helpers/admin-english-terms.ts`). */
const ENGLISH_TERMS = ADMIN_ENGLISH_TERMS;

describe("menü", () => {
  it("beş kategori, istenen sıra ve adresler; kurucuya özel öğeler işaretli", () => {
    expect(ADMIN_NAV.map((group) => group.group)).toEqual([
      "📊 Genel Bakış & Kokpit",
      "👥 Kullanıcılar & Ekip",
      "💳 Gelir & Paketler",
      "📚 İçerik & Kalite",
      "⚙️ Sistem & Güvenlik",
    ]);
    const hrefs = ADMIN_NAV.flatMap((group) => group.items.map((item) => item.href));
    for (const href of [
      "/admin", "/admin/maliyetler", "/admin/ai-kullanimi", "/admin/kullanicilar", "/admin/yoneticiler", "/admin/destek",
      "/admin/kotuye-kullanim", "/admin/odemeler", "/admin/paketler", "/admin/kredi-kurallari", "/admin/promosyonlar",
      "/admin#karantina", "/admin/ders-hatalari", "/admin/yanit-oylari", "/admin/promptlar", "/admin/anket", "/admin/beta",
      "/admin/sistem", "/admin/feature-flags", "/admin/audit-log", "/admin/adaptive", "/admin/ogretmen-basvurulari",
    ]) {
      expect(hrefs).toContain(href);
    }
    const founderOnly = ADMIN_NAV.flatMap((group) => group.items.filter((item) => item.founderOnly).map((item) => item.href));
    expect(founderOnly.sort()).toEqual(["/admin/feature-flags", "/admin/kredi-kurallari", "/admin/paketler", "/admin/yoneticiler"]);
    for (const group of ADMIN_NAV) {
      for (const item of group.items) {
        expect(canOpenAdminItem(item, "founder")).toBe(true);
        expect(canOpenAdminItem(item, "admin")).toBe(!item.founderOnly);
        // Menüdeki her gerçek sayfa var.
        if (!item.href.includes("#")) expect(existsSync(`src/app${item.href}/page.tsx`), item.href).toBe(true);
      }
    }
    expect(read("src/app/admin/page.tsx")).toContain('id="karantina"');
  });

  it("menü, rozet ve üst çubuk metinleri tamamen Türkçe", () => {
    const texts = [
      ...ADMIN_NAV.flatMap((group) => [group.group, ...group.items.flatMap((item) => [item.label, item.blurb])]),
      ADMIN_GATE_NAV.label,
      ADMIN_GATE_NAV.blurb,
      ...Object.values(ADMIN_ROLE_BADGE),
      ...Object.values(ADMIN_ROLE_LABEL),
    ];
    const layout = read("src/app/admin/layout.tsx");
    const jsxText = [...layout.matchAll(/>([^<>{}]*[A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]*)</g)].map((match) => match[1]!.trim()).filter(Boolean);
    expect(jsxText).toContain("🛡️ Yönetim Paneli");
    const navLinks = read("src/components/admin/admin-nav-links.tsx");
    const quoted = [...navLinks.matchAll(/(?:title|aria-label)="([^"]+)"/g)].map((match) => match[1]!);
    for (const text of [...texts, ...jsxText.filter((t) => !t.includes("ADMIN_GATE_PIN_HASH")), ...quoted]) {
      for (const term of ENGLISH_TERMS) {
        expect(new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "iu").test(text), `"${text}" içinde "${term}"`).toBe(false);
      }
    }
    expect(ADMIN_ROLE_BADGE).toEqual({ founder: "👑 Kurucu", admin: "🛡️ Yönetici" });
  });
});

// ---- 6. Göç PGlite'ta ---------------------------------------------------------------------------

describe("göç 20261106150000_founder_role.sql", () => {
  const MIGRATION = "supabase/migrations/20261106150000_founder_role.sql";
  let db: PGlite;
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const S = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role text NOT NULL,
        granted_by uuid REFERENCES public.profiles(id),
        granted_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        UNIQUE (user_id, role)
      );
      ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
        CHECK (role IN ('student','parent','teacher','verified_teacher','admin'));
      CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'admin' AND ur.revoked_at IS NULL)
      $$;`);
    for (const id of [A, B, C, S]) await db.query("INSERT INTO public.profiles(id) VALUES ($1)", [id]);
    await db.query("INSERT INTO auth.users(id, email) VALUES ($1, 'Kurucu@CortexPlus.app'), ($2, 'yonetici@cortexplus.app')", [A, B]);
    // C en eski ama iptal edilmiş; A en eski etkin yönetici.
    await db.query("INSERT INTO public.user_roles(user_id, role, granted_at, revoked_at) VALUES ($1, 'admin', '2025-01-01', '2025-06-01')", [C]);
    await db.query("INSERT INTO public.user_roles(user_id, role, granted_at) VALUES ($1, 'admin', '2026-08-01')", [A]);
    await db.query("INSERT INTO public.user_roles(user_id, role, granted_at) VALUES ($1, 'admin', '2026-09-01')", [B]);
    await db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, 'student')", [S]);
    await db.exec(read(MIGRATION));
  });

  afterAll(async () => {
    await db.close();
  });

  const one = async <T>(sql: string, params: unknown[] = []) => ((await db.query<T>(sql, params)).rows[0] as T);

  it("en eski etkin yönetici kurucu olur; admin satırı yerinde kalır", async () => {
    const founders = await db.query<{ user_id: string }>("SELECT user_id FROM public.user_roles WHERE role = 'founder' AND revoked_at IS NULL");
    expect(founders.rows.map((row) => row.user_id)).toEqual([A]);
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM public.user_roles WHERE user_id = $1 AND role = 'admin'", [A])).n).toBe(1);
  });

  it("is_founder ve is_admin: kurucu yönetici sayılır, öğrenci hiçbiri", async () => {
    const check = async (fn: string, id: string) => (await one<{ v: boolean }>(`SELECT public.${fn}($1) AS v`, [id])).v;
    expect(await check("is_founder", A)).toBe(true);
    expect(await check("is_founder", B)).toBe(false);
    expect(await check("is_admin", A)).toBe(true);
    expect(await check("is_admin", B)).toBe(true);
    expect(await check("is_admin", S)).toBe(false);
    expect(await check("is_admin", C)).toBe(false);
    // Yalnız founder satırı olan da yönetici sayılır (davranış genişler).
    await db.query("UPDATE public.user_roles SET revoked_at = now() WHERE user_id = $1 AND role = 'admin'", [A]);
    expect(await check("is_admin", A)).toBe(true);
    await db.query("UPDATE public.user_roles SET revoked_at = NULL WHERE user_id = $1 AND role = 'admin'", [A]);
  });

  it("CHECK genişledi: 'founder' yazılır, uydurma rol yazılmaz", async () => {
    await db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, 'parent')", [S]);
    await expect(db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, 'superuser')", [S])).rejects.toThrow();
  });

  it("tekrar çalıştırılınca ikinci kurucu eklenmez", async () => {
    await db.exec(read(MIGRATION));
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM public.user_roles WHERE role = 'founder'")).n).toBe(1);
  });

  it("e-postayla hesap bulma büyük/küçük harf ve boşluk duyarsız", async () => {
    expect((await one<{ id: string | null }>("SELECT public.admin_user_id_by_email($1) AS id", ["  kurucu@cortexplus.APP "])).id).toBe(A);
    expect((await one<{ id: string | null }>("SELECT public.admin_user_id_by_email($1) AS id", ["yok@cortexplus.app"])).id).toBeNull();
  });

  it("yetkiler: is_founder authenticated ve service_role; e-posta araması yalnız service_role", async () => {
    const can = async (role: string, fn: string) =>
      (await one<{ v: boolean }>(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS v`)).v;
    expect(await can("authenticated", "public.is_founder(uuid)")).toBe(true);
    expect(await can("service_role", "public.is_founder(uuid)")).toBe(true);
    expect(await can("anon", "public.is_founder(uuid)")).toBe(false);
    expect(await can("anon", "public.is_admin(uuid)")).toBe(false);
    expect(await can("service_role", "public.admin_user_id_by_email(text)")).toBe(true);
    expect(await can("authenticated", "public.admin_user_id_by_email(text)")).toBe(false);
    expect(await can("anon", "public.admin_user_id_by_email(text)")).toBe(false);
  });

  it("hiç yönetici yoksa kurucu uydurulmaz; göç yalnız ekleme", async () => {
    const empty = new PGlite();
    await empty.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role text NOT NULL,
        granted_by uuid, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, UNIQUE (user_id, role));`);
    await empty.exec(read(MIGRATION));
    expect((await empty.query<{ n: number }>("SELECT count(*)::int AS n FROM public.user_roles")).rows[0]?.n).toBe(0);
    await empty.close();
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|FUNCTION)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/@/);
  });
});
