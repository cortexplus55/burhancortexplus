import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { entitlementsFromSubscriptionRow, type UserEntitlements } from "@/lib/billing/entitlements";
import { freeMetersFromRows, visibleFreePeriodKeys } from "@/lib/billing/free-usage-server";
import {
  buildPreviewAccountContext,
  buildStudentAccountContext,
  loadStudentAccountContextDirect,
  type AccountWalletRow,
  type StudentAccountContext,
} from "@/lib/student/account-context";
import { sharedCacheDelete, sharedCacheGet, sharedCacheSet } from "@/lib/cache/shared-ttl-cache";
import {
  gateFromProfile,
  SESSION_CACHE_VERSION,
  SESSION_CONTEXT_TTL_SECONDS,
  sessionContextKey,
  sessionGateKey,
} from "@/lib/auth/session-keys";

/**
 * Oturum bağlamı — tek merkez (Faz 2, madde 2).
 *
 * Eskiden her sayfa ve API açılışında oturum, profil, abonelik, kredi cüzdanı, yönetici rolü, ücretsiz sayaçlar ve
 * hesap durumu için 10–18 ayrı (çoğu sıralı) sorgu atılıyordu; 50 eşzamanlı kullanıcıda PostgREST bağlantı havuzu
 * doluyordu (PGRST003). Artık:
 *
 *  1. İstek içi tek okuma: `React.cache()` aynı Server Component / Route Handler isteğinde bağlamı bir kez yükler;
 *     kabuk, sayfa ve alt bileşenler aynı sözü paylaşır.
 *  2. 45 sn paylaşımlı önbellek (Upstash Redis, yoksa bellek LRU): `profile + subscription + credit_summary`.
 *     Kredi düşümü, ödeme onayı, profil güncellemesi ve hesap askısı `invalidateSessionUserContext` ile anında siler.
 *  3. Tek tur: önbellek boşsa bağlam tek bir RPC ile (`get_session_user_context`) gelir. Göç henüz uygulanmamışsa
 *     ayrı okumalar `Promise.all` ile tek turda yapılır (şelale yok).
 *
 * Önbellek yalnız gösterim ve okuma içindir. Kredi ayırma/düşüm/iade SQL'deki atomik fonksiyonlarda kalır.
 */

export { SESSION_CONTEXT_TTL_SECONDS, sessionContextKey, sessionGateKey } from "@/lib/auth/session-keys";
const CONTEXT_VERSION = SESSION_CACHE_VERSION;

export const SESSION_PROFILE_COLUMNS =
  "full_name, avatar_url, primary_role, onboarding_completed_at, deleted_at, tutor_style, grade_level, focus_subject, school_id, school_name";

export type SessionProfile = {
  full_name: string | null;
  avatar_url: string | null;
  primary_role: string | null;
  onboarding_completed_at: string | null;
  deleted_at: string | null;
  tutor_style: string | null;
  grade_level: string | null;
  focus_subject: string | null;
  school_id: string | null;
  school_name: string | null;
};

export type SessionUserContext = {
  version: number;
  userId: string;
  /** `current_account_active` ile aynı anlam; okunamadıysa null (çağıran geçirir, RLS yine denetler). */
  active: boolean | null;
  profile: SessionProfile | null;
  entitlements: UserEntitlements;
  account: StudentAccountContext;
  isAdmin: boolean;
  /** Nereden geldi (gözlem için): rpc | fallback | cache. */
  source: "rpc" | "fallback" | "cache";
};

type RpcPayload = {
  active?: boolean | null;
  profile?: SessionProfile | null;
  wallet?: AccountWalletRow;
  subscription?: Parameters<typeof entitlementsFromSubscriptionRow>[0];
  is_admin?: boolean | null;
  free_preview?: { started_at?: string | null; remaining?: number | null; period_ends_at?: string | null } | null;
  free_usage?: { meter: string; period_key: string; used: number }[] | null;
};

/** RPC göçten önce yoksa bir süre sorulmaz (her istekte boşa bir tur olmasın); süre dolunca yeniden denenir. */
const RPC_MISSING_RETRY_MS = 5 * 60_000;
let rpcMissingUntil = 0;

function rpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /Could not find the function public\.get_session_user_context/i.test(error.message ?? "")
  );
}

async function loadViaRpc(client: SupabaseClient, userId: string): Promise<SessionUserContext | null> {
  if (rpcMissingUntil > Date.now()) return null;
  const { data, error } = await client.rpc("get_session_user_context", {
    p_user_id: userId,
    p_period_keys: visibleFreePeriodKeys(),
  });
  if (error) {
    if (rpcMissing(error)) {
      rpcMissingUntil = Date.now() + RPC_MISSING_RETRY_MS;
      console.warn("session_context_rpc_missing");
    } else {
      console.warn("session_context_rpc_failed", { code: error.code ?? "rpc_error" });
    }
    return null;
  }
  // Çağıran bu kullanıcı değilse (ya da oturum yoksa) fonksiyon null döner: ayrı okumalara düşülür.
  if (!data || typeof data !== "object") return null;
  const payload = data as RpcPayload;
  const isAdmin = payload.is_admin === true;
  const preview =
    isAdmin && payload.free_preview && typeof payload.free_preview.started_at === "string" && typeof payload.free_preview.period_ends_at === "string"
      ? {
          startedAt: payload.free_preview.started_at,
          remaining: Number(payload.free_preview.remaining ?? 0),
          periodEndsAt: payload.free_preview.period_ends_at,
        }
      : null;
  // Önizlemedeki yönetici ücretsiz plan görür (getUserEntitlements ile aynı kural).
  const entitlements = entitlementsFromSubscriptionRow(preview ? null : (payload.subscription ?? null));
  const meters = freeMetersFromRows(Array.isArray(payload.free_usage) ? payload.free_usage : []);
  const account = preview
    ? buildPreviewAccountContext(preview, meters)
    : buildStudentAccountContext({
        wallet: payload.wallet ?? null,
        entitlements,
        isAdmin,
        meters: !entitlements.isPremium && !isAdmin ? meters : null,
      });
  return {
    version: CONTEXT_VERSION,
    userId,
    active: typeof payload.active === "boolean" ? payload.active : null,
    profile: payload.profile ?? null,
    entitlements,
    account,
    isAdmin,
    source: "rpc",
  };
}

/** Göç uygulanmadan önceki yol: ayrı okumalar, ama tek turda (`Promise.all`). */
async function loadViaQueries(client: SupabaseClient, userId: string): Promise<SessionUserContext> {
  const [active, profileRead, direct] = await Promise.all([
    accountActiveOrUnknown(client),
    client.from("profiles").select(SESSION_PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    loadStudentAccountContextDirect(client, userId),
  ]);
  return {
    version: CONTEXT_VERSION,
    userId,
    active,
    profile: (profileRead.data as SessionProfile | null) ?? null,
    entitlements: direct.entitlements,
    account: direct.account,
    isAdmin: direct.isAdmin,
    source: "fallback",
  };
}

async function loadFresh(client: SupabaseClient, userId: string): Promise<SessionUserContext> {
  try {
    const viaRpc = await loadViaRpc(client, userId);
    if (viaRpc) return viaRpc;
  } catch (error) {
    console.warn("session_context_rpc_threw", { cause: error instanceof Error ? error.name : "unknown" });
  }
  return loadViaQueries(client, userId);
}

function cacheable(context: SessionUserContext): boolean {
  // Askı, silinme ve okunamayan durum önbelleğe girmez: kapı her seferinde taze karar verir.
  // Kurulumu bitmemiş profil de girmez: kurulum tarayıcıdan tamamlanınca bir sonraki açılış taze profili görür.
  return context.active === true && !context.profile?.deleted_at && Boolean(context.profile?.onboarding_completed_at);
}

async function resolveContext(userId: string, client: SupabaseClient | undefined): Promise<SessionUserContext> {
  const cached = await sharedCacheGet<SessionUserContext>(sessionContextKey(userId));
  if (cached && cached.version === CONTEXT_VERSION && cached.userId === userId) {
    return { ...cached, source: "cache" };
  }
  const fresh = await loadFresh(client ?? (await createClient()), userId);
  if (cacheable(fresh)) {
    const gate = gateFromProfile(fresh.active, fresh.profile);
    await Promise.all([
      sharedCacheSet(sessionContextKey(userId), fresh, SESSION_CONTEXT_TTL_SECONDS),
      gate ? sharedCacheSet(sessionGateKey(userId), gate, SESSION_CONTEXT_TTL_SECONDS) : Promise.resolve(),
    ]);
  }
  return fresh;
}

/**
 * İstek kapsamlı kayıt: `React.cache` ile sarılı fabrika her Server Component / Route Handler isteği için tek bir
 * harita verir. Aynı istekte bağlam bir kez yüklenir; eşzamanlı çağıranlar aynı sözü bekler.
 */
const requestScope = cache((): Map<string, Promise<SessionUserContext>> => new Map());

/**
 * Oturum bağlamı. Aynı istekte DB'ye en çok bir kez gider; 45 sn içinde başka istekte önbellekten gelir.
 * `client` verilirse (API rotası, sunucu işi) o istemciyle okunur; yoksa çerezli sunucu istemcisi kullanılır.
 */
export const getSessionUserContext = cache(
  (userId: string, options: { client?: SupabaseClient } = {}): Promise<SessionUserContext> => {
    const scope = requestScope();
    const hit = scope.get(userId);
    if (hit) return hit;
    const pending = resolveContext(userId, options.client);
    scope.set(userId, pending);
    pending.catch(() => {
      if (scope.get(userId) === pending) scope.delete(userId);
    });
    return pending;
  },
);

/**
 * Kredi düşümü, iade, ödeme onayı, abonelik değişikliği, profil güncellemesi, hesap askısı ya da silinmesinden
 * sonra çağrılır: bir sonraki okuma tazedir. Hata atmaz (önbellek silinemese de 45 sn sonra kendiliğinden düşer).
 */
export async function invalidateSessionUserContext(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await sharedCacheDelete([sessionContextKey(userId), sessionGateKey(userId)]);
  } catch {
    // Önbellek silinemedi: değer en geç 45 sn sonra düşer.
  }
  try {
    requestScope().delete(userId);
  } catch {
    // İstek kapsamı dışında (arka plan işi): yalnız paylaşımlı önbellek silinir.
  }
}

