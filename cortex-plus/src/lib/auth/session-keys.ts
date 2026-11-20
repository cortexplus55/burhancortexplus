/**
 * Oturum bağlamı önbellek anahtarları (Faz 2). Middleware (Edge) ve sunucu aynı anahtarı kullanır; bu dosya
 * `server-only` değildir ve hiçbir şey içe aktarmaz.
 */
export const SESSION_CACHE_VERSION = 1;
export const SESSION_CONTEXT_TTL_SECONDS = 45;

export function sessionContextKey(userId: string) {
  return `cortex:sess:ctx:v${SESSION_CACHE_VERSION}:${userId}`;
}

export function sessionGateKey(userId: string) {
  return `cortex:sess:gate:v${SESSION_CACHE_VERSION}:${userId}`;
}

/** Middleware'in yönlendirme kararı için tuttuğu küçük kayıt. Yalnız etkin ve kurulumu bitmiş hesap yazılır. */
export type SessionGate = {
  active: true;
  primary_role: string | null;
  onboarding_completed_at: string;
  deleted_at: null;
};

export function gateFromProfile(
  active: boolean | null,
  profile: { primary_role?: string | null; onboarding_completed_at?: string | null; deleted_at?: string | null } | null,
): SessionGate | null {
  if (active !== true || !profile || profile.deleted_at || !profile.onboarding_completed_at) return null;
  return {
    active: true,
    primary_role: profile.primary_role ?? null,
    onboarding_completed_at: profile.onboarding_completed_at,
    deleted_at: null,
  };
}
