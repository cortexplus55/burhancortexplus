/**
 * Sayfa başına veritabanı sorgu sayacı (Faz 2, madde 2).
 *
 * Gerçek Supabase istemcileri kullanılır; yalnız `fetch` sahtedir. Her PostgREST (`/rest/v1/…`) ve Auth (`/auth/v1/…`)
 * isteği sayılır ve sabit bir gecikmeyle yanıtlanır. Toplam süre / gecikme ≈ ardışık tur (şelale) sayısıdır.
 */
import { vi } from "vitest";

export const SUPABASE_URL = "https://query-counter.supabase.co";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_PREP_ID = "00000000-0000-4000-8000-0000000000aa";
export const LATENCY_MS = 20;

export type CountedCall = { method: string; kind: "rest" | "rpc" | "auth" | "other"; target: string; startedAt: number; wave: number };

type RowFactory = (table: string, url: URL) => Record<string, unknown> | null;

const NOW_ISO = new Date("2026-01-01T09:00:00.000Z").toISOString();

const DEFAULT_ROWS: Record<string, Record<string, unknown>> = {
  profiles: {
    id: TEST_USER_ID,
    full_name: "Test Öğrenci",
    primary_role: "student",
    onboarding_completed_at: NOW_ISO,
    deleted_at: null,
    avatar_url: null,
    tutor_style: null,
    grade_level: null,
    focus_subject: null,
  },
  exam_preps: {
    id: TEST_PREP_ID,
    user_id: TEST_USER_ID,
    title: "Hazırlık",
    exam_type: "YKS",
    status: "ready",
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    exam_date: null,
    learning_preferences: {},
    source_document_ids: [],
  },
};

const RPC_RESULTS: Record<string, unknown> = {
  current_account_active: true,
  current_account_status: "active",
};

/** Faz 2 göçü (get_session_user_context) uygulandıktan sonraki yanıtın biçimi. */
export const SESSION_CONTEXT_RPC_PAYLOAD = {
  active: true,
  profile: { ...DEFAULT_ROWS.profiles, school_id: null, school_name: null },
  wallet: { balance: 0, free_allowance_remaining: 0, period_allowance: 0, period_ends_at: null, period_kind: null },
  subscription: null,
  is_admin: false,
  free_preview: null,
  free_usage: [],
};

export type CounterOptions = { rows?: RowFactory; rpc?: Record<string, unknown> };

export function installQueryCounter(options: CounterOptions = {}) {
  const calls: CountedCall[] = [];
  const t0 = Date.now();
  /** Ardışık tur: bir istek, başladığı anda biten isteklerin en derin turundan bir sonraki turdadır. */
  let completedWave = 0;
  let waveFloor = 0;
  const original = globalThis.fetch;
  const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!url.href.startsWith(SUPABASE_URL)) {
      calls.push({ method, kind: "other", target: url.host, startedAt: Date.now() - t0, wave: 0 });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    const path = url.pathname;
    const isRpc = path.startsWith("/rest/v1/rpc/");
    const kind: CountedCall["kind"] = isRpc ? "rpc" : path.startsWith("/rest/v1/") ? "rest" : path.startsWith("/auth/v1/") ? "auth" : "other";
    const target = isRpc ? path.slice("/rest/v1/rpc/".length) : path.replace(/^\/(?:rest|auth)\/v1\//, "");
    const wave = Math.max(completedWave, waveFloor) + 1;
    calls.push({ method, kind, target, startedAt: Date.now() - t0, wave });
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    completedWave = Math.max(completedWave, wave);
    const headers = new Headers({ "content-type": "application/json", "content-range": "0-0/0" });
    if (kind === "auth") {
      if (target === "user") {
        return new Response(
          JSON.stringify({ id: TEST_USER_ID, aud: "authenticated", role: "authenticated", email: "ogrenci@example.com", app_metadata: {}, user_metadata: {}, created_at: NOW_ISO }),
          { status: 200, headers },
        );
      }
      return new Response("{}", { status: 200, headers });
    }
    if (kind === "rpc") {
      const name = target;
      const value = options.rpc && name in options.rpc ? options.rpc[name] : name in RPC_RESULTS ? RPC_RESULTS[name] : null;
      return new Response(JSON.stringify(value), { status: 200, headers });
    }
    const accept = (init?.headers instanceof Headers ? init.headers.get("accept") : (init?.headers as Record<string, string> | undefined)?.Accept ?? (init?.headers as Record<string, string> | undefined)?.accept) ?? "";
    const row = options.rows?.(target, url) ?? (method === "GET" ? DEFAULT_ROWS[target] ?? null : null);
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    if (accept.includes("vnd.pgrst.object")) {
      return new Response(JSON.stringify(row), { status: 200, headers });
    }
    return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers });
  });
  globalThis.fetch = fake as unknown as typeof fetch;
  return {
    calls,
    elapsed: () => Date.now() - t0,
    /** Sayacı sıfırlar (ısıtma isteğinden sonra yalnız ikinci isteği ölçmek için). */
    reset() {
      calls.length = 0;
      waveFloor = 0;
      completedWave = 0;
    },
    restore: () => {
      globalThis.fetch = original;
    },
    summary() {
      const db = calls.filter((call) => call.kind === "rest" || call.kind === "rpc");
      const auth = calls.filter((call) => call.kind === "auth");
      const rounds = calls.reduce((max, call) => Math.max(max, call.wave), 0);
      return { db: db.length, auth: auth.length, total: db.length + auth.length, rounds, targets: calls.filter((c) => c.kind !== "other").map((c) => `${c.kind}:${c.target}`) };
    },
  };
}

/** Oturum çerezi: @supabase/ssr'nin okuyacağı biçimde, süresi dolmamış sahte oturum. */
export function sessionCookie() {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: TEST_USER_ID, exp, role: "authenticated", aud: "authenticated", email: "ogrenci@example.com", app_metadata: {}, user_metadata: {} })).toString("base64url");
  const session = {
    access_token: `${header}.${payload}.sig`,
    refresh_token: "refresh",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: TEST_USER_ID, aud: "authenticated", role: "authenticated", email: "ogrenci@example.com", app_metadata: {}, user_metadata: {}, created_at: NOW_ISO },
  };
  return { name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` };
}

/**
 * Sunucu bileşeni ağacını yürütür: async bileşenler beklenir, kanca kullanan (istemci) bileşenler atlanır.
 * Böylece sayfanın ve içindeki sunucu bileşenlerinin bütün veri okumaları sayılır.
 */
export async function renderServerTree(node: unknown, depth = 0): Promise<void> {
  if (depth > 60 || node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) await renderServerTree(child, depth + 1);
    return;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof (node as Promise<unknown>).then === "function") {
    await renderServerTree(await (node as Promise<unknown>), depth + 1);
    return;
  }
  if (!element.props) return;
  if (typeof element.type === "function") {
    let out: unknown;
    try {
      out = (element.type as (props: unknown) => unknown)(element.props);
      if (out && typeof (out as Promise<unknown>).then === "function") out = await out;
    } catch (error) {
      if (isNavigationSignal(error)) throw error;
      // İstemci bileşeni (kanca) ya da yalnız tarayıcıda çalışan kod: sunucu sorgusu yok.
      out = null;
    }
    await renderServerTree(out, depth + 1);
  }
  for (const [key, value] of Object.entries(element.props)) {
    if (key === "children" || (value && typeof value === "object" && "props" in (value as object))) {
      await renderServerTree(value, depth + 1);
    }
  }
}

export class NavigationSignal extends Error {
  constructor(public kind: "redirect" | "notFound", public to?: string) {
    super(`${kind}:${to ?? ""}`);
  }
}

export function isNavigationSignal(error: unknown): error is NavigationSignal {
  return error instanceof NavigationSignal;
}
