/**
 * Faz 2, madde 2: sayfa başına veritabanı sorgu sayısı (layout, /ogretmen, /deneme-sinavlari/[prepId], /ayarlar).
 *
 * Gerçek sayfa fonksiyonu çalıştırılır; Supabase istemcileri gerçektir, yalnız ağ sahtedir (helpers/query-counter).
 * `React.cache` Next.js'teki gibi istek boyunca not tutar (her sayfa ayrı bir istektir).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSharedCacheForTests } from "@/lib/cache/shared-ttl-cache";
import {
  installQueryCounter,
  NavigationSignal,
  renderServerTree,
  SESSION_CONTEXT_RPC_PAYLOAD,
  sessionCookie,
  SUPABASE_URL,
  TEST_PREP_ID,
} from "./helpers/query-counter";

const requestCache = vi.hoisted(() => ({ maps: new Map<unknown, Map<unknown, unknown>>() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // React'in sunucu `cache`i gibi: argümanlar kimlikleriyle (nesne) ya da değerleriyle (ilkel) anahtar olur.
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    return (...args: A): R => {
      let node = requestCache.maps.get(fn) as Map<unknown, unknown> | undefined;
      if (!node) {
        node = new Map();
        requestCache.maps.set(fn, node);
      }
      for (const arg of args) {
        let next = node.get(arg) as Map<unknown, unknown> | undefined;
        if (!next) {
          next = new Map();
          node.set(arg, next);
        }
        node = next;
      }
      const RESULT = "__result__";
      if (node.has(RESULT)) return node.get(RESULT) as R;
      const value = fn(...args);
      node.set(RESULT, value);
      return value;
    };
  };
  return { ...actual, default: { ...actual, cache }, cache };
});

vi.mock("next/headers", () => {
  const cookie = () => sessionCookie();
  return {
    cookies: async () => ({
      getAll: () => [cookie()],
      get: (name: string) => (name === cookie().name ? cookie() : undefined),
      has: (name: string) => name === cookie().name,
      set: () => undefined,
      delete: () => undefined,
    }),
    headers: async () => new Headers({ host: "cortexplus.app", "x-forwarded-for": "203.0.113.5", "user-agent": "vitest" }),
    draftMode: async () => ({ isEnabled: false }),
  };
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: (to: string) => {
      throw new NavigationSignal("redirect", to);
    },
    permanentRedirect: (to: string) => {
      throw new NavigationSignal("redirect", to);
    },
    notFound: () => {
      throw new NavigationSignal("notFound");
    },
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined, connection: async () => undefined };
});

let counter: ReturnType<typeof installQueryCounter>;

/**
 * Üç ölçüm kipi:
 *  - "yedek":  göç henüz uygulanmamış (RPC yok) — ayrı okumalar paralel.
 *  - "rpc":    göç uygulanmış, önbellek soğuk — oturum bağlamı tek çağrı.
 *  - "sicak":  45 sn önbellek dolu (aynı kullanıcının ikinci açılışı) — yalnız ölçülen ikinci istek sayılır.
 */
type Mode = "yedek" | "rpc" | "sicak";
const MODES: Mode[] = ["yedek", "rpc", "sicak"];

/** Faz 2 öncesi ölçüm (aynı test düzeneği, değişiklikten önceki kod üzerinde koşturuldu). */
const BEFORE: Record<string, number> = {
  middleware: 3,
  layout: 13,
  "/ogretmen": 27,
  "/deneme-sinavlari/[prepId]": 35,
  "/ayarlar": 24,
};

/** Hedef üst sınırlar (göç uygulanmış, soğuk önbellek). */
const RPC_BUDGET: Record<string, number> = {
  middleware: 3,
  layout: 6,
  "/ogretmen": 16,
  "/deneme-sinavlari/[prepId]": 22,
  "/ayarlar": 9,
};

function setup(mode: Mode) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  delete process.env.VERCEL_ENV;
  requestCache.maps.clear();
  resetSharedCacheForTests({ cache: mode === "sicak" });
  counter = installQueryCounter(mode === "yedek" ? {} : { rpc: { get_session_user_context: SESSION_CONTEXT_RPC_PAYLOAD } });
}

afterEach(() => {
  counter?.restore();
  resetSharedCacheForTests();
});

async function measure(mode: Mode, label: string, run: () => Promise<unknown>) {
  const once = async () => {
    let navigation: string | null = null;
    try {
      await renderServerTree(await run());
    } catch (error) {
      if (error instanceof NavigationSignal) navigation = error.message;
      else throw error;
    }
    return navigation;
  };
  if (mode === "sicak") {
    await once();
    requestCache.maps.clear();
    counter.reset();
  }
  const navigation = await once();
  const summary = counter.summary();
  const report = { mode, label, ...summary, navigation, before: BEFORE[label] ?? null };
  if (process.env.QUERY_BUDGET_REPORT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.QUERY_BUDGET_REPORT, `${JSON.stringify(report)}\n`);
  }
  return report;
}

function expectBudget(mode: Mode, report: { label: string; total: number; navigation: string | null }) {
  expect(report.navigation).toBeNull();
  const before = BEFORE[report.label];
  if (mode === "yedek") expect(report.total).toBeLessThanOrEqual(before);
  else expect(report.total).toBeLessThanOrEqual(RPC_BUDGET[report.label]);
  if (mode !== "yedek" && report.label !== "middleware") expect(report.total).toBeLessThan(before);
}

describe.each(MODES)("sayfa başına sorgu bütçesi (%s)", (mode) => {
  beforeEach(() => setup(mode));

  it("middleware (her oturumlu sayfa açılışı)", async () => {
    const { NextRequest } = await import("next/server");
    const { updateSession } = await import("@/lib/supabase/middleware");
    const cookie = sessionCookie();
    const request = () => new NextRequest("https://cortexplus.app/ogretmen", { headers: { cookie: `${cookie.name}=${cookie.value}` } });
    const report = await measure(mode, "middleware", () => updateSession(request()).then(() => null));
    expectBudget(mode, report);
    // Sıcak önbellekte hesap durumu ve profil okunmaz: yalnız oturum doğrulaması kalır.
    if (mode === "sicak") expect(report.targets.filter((t) => t.startsWith("rest:") || t.startsWith("rpc:"))).toEqual([]);
  });

  it("layout (AppShell)", async () => {
    const { AppShell } = await import("@/components/layout/app-shell");
    const report = await measure(mode, "layout", () => AppShell({ children: null }));
    expectBudget(mode, report);
    // Oturum bağlamı istekte bir kez çözülür: aynı istekte hesap durumu iki kez sorulmaz.
    expect(report.targets.filter((t) => t === "rpc:current_account_active").length).toBeLessThanOrEqual(1);
    expect(report.targets.filter((t) => t === "rpc:get_session_user_context").length).toBeLessThanOrEqual(1);
  });

  it("/ogretmen", async () => {
    const { default: Page } = await import("@/app/ogretmen/page");
    const report = await measure(mode, "/ogretmen", () => Page({ searchParams: Promise.resolve({}) }));
    expectBudget(mode, report);
    expect(report.targets.filter((t) => t === "rpc:get_session_user_context").length).toBeLessThanOrEqual(1);
  });

  it("/deneme-sinavlari/[prepId]", async () => {
    const { default: Page } = await import("@/app/deneme-sinavlari/[prepId]/page");
    const report = await measure(mode, "/deneme-sinavlari/[prepId]", () =>
      (Page as (props: unknown) => Promise<unknown>)({ params: Promise.resolve({ prepId: TEST_PREP_ID }), searchParams: Promise.resolve({}) }),
    );
    expect(report.total).toBeGreaterThan(0);
    const before = BEFORE[report.label];
    expect(report.total).toBeLessThan(before);
    if (mode !== "yedek") expect(report.total).toBeLessThanOrEqual(RPC_BUDGET[report.label]);
  });

  it("/ayarlar", async () => {
    const { default: Page } = await import("@/app/ayarlar/page");
    const report = await measure(mode, "/ayarlar", () => (Page as (props: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({}) }));
    expectBudget(mode, report);
  });
});
