/**
 * Mobil uygulamanın sürüm kuralı (26 Kasım 2026, mobil 1. adım). Saf; sunucu (`/api/app/version`) ve sınavlar kullanır.
 *
 * - `minimum`: bunun altındaki sürüm açılınca kapatılamayan "Güncelleme gerekli" ekranı çıkar (örneğin eski sürüm bir
 *   mağaza kuralını ya da yeni bir sunucu sözleşmesini karşılamıyorsa). Yükseltmek bir yayın kararıdır.
 * - `latest`: bunun altındaki sürümde kapatılabilen "Yeni sürüm hazır" şeridi çıkar.
 * - Değerler Vercel ortam değişkeniyle de değişir (yeniden yayın ister): `MOBILE_MIN_VERSION_IOS`,
 *   `MOBILE_MIN_VERSION_ANDROID`, `MOBILE_LATEST_VERSION_IOS`, `MOBILE_LATEST_VERSION_ANDROID`.
 * - Sürüm okunamazsa ya da biçimi tanınmazsa hiçbir şey gösterilmez: öğrenci yanlışlıkla kilitlenmez.
 * - Mağaza adresi: Google Play paket adından; App Store, uygulama kimliği (`APPLE_APP_STORE_ID`) tanımlanınca.
 */

export type AppStorePlatform = "ios" | "android";
export type AppVersionStatus = "ok" | "update_available" | "update_required";

export const APP_PACKAGE_ID = "app.cortexplus.mobile";

export const APP_VERSION_POLICY: Record<AppStorePlatform, { minimum: string; latest: string }> = {
  ios: { minimum: "1.0", latest: "1.0" },
  android: { minimum: "1.0", latest: "1.0" },
};

const VERSION_RE = /^\d{1,4}(?:\.\d{1,4}){0,3}$/;

export function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_RE.test(value.trim());
}

/** "1.2" ile "1.2.0" eşittir. a < b → eksi, eşit → 0, a > b → artı. */
export function compareVersions(a: string, b: string): number {
  const left = a.trim().split(".").map(Number);
  const right = b.trim().split(".").map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function versionPolicy(platform: AppStorePlatform, env: Record<string, string | undefined> = process.env) {
  const suffix = platform === "ios" ? "IOS" : "ANDROID";
  const base = APP_VERSION_POLICY[platform];
  const minimum = isVersion(env[`MOBILE_MIN_VERSION_${suffix}`]) ? String(env[`MOBILE_MIN_VERSION_${suffix}`]).trim() : base.minimum;
  const latestRaw = isVersion(env[`MOBILE_LATEST_VERSION_${suffix}`]) ? String(env[`MOBILE_LATEST_VERSION_${suffix}`]).trim() : base.latest;
  // "Son sürüm" hiçbir zaman en düşük sürümün altında olmaz.
  const latest = compareVersions(latestRaw, minimum) < 0 ? minimum : latestRaw;
  return { minimum, latest };
}

export function appVersionStatus(
  platform: AppStorePlatform,
  version: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): AppVersionStatus {
  if (!isVersion(version)) return "ok";
  const policy = versionPolicy(platform, env);
  if (compareVersions(version, policy.minimum) < 0) return "update_required";
  if (compareVersions(version, policy.latest) < 0) return "update_available";
  return "ok";
}

export function storeUrl(platform: AppStorePlatform, env: Record<string, string | undefined> = process.env): string | null {
  if (platform === "android") return `https://play.google.com/store/apps/details?id=${APP_PACKAGE_ID}`;
  const id = String(env.APPLE_APP_STORE_ID ?? "").trim();
  return /^\d{6,12}$/.test(id) ? `https://apps.apple.com/tr/app/id${id}` : null;
}

export const UPDATE_COPY = {
  requiredTitle: "Yeni sürüm gerekli",
  requiredBody: "Cortex Plus'ın bu sürümü artık desteklenmiyor. Çalışmaya devam etmek için uygulamayı güncelle; ilerlemen hesabında duruyor.",
  availableBody: "Cortex Plus'ın yeni sürümü hazır.",
  action: "Güncelle",
  later: "Sonra",
  iosFallback: "App Store'u aç, Cortex Plus'ı ara ve Güncelle'ye dokun.",
  androidFallback: "Google Play'i aç, Cortex Plus'ı ara ve Güncelle'ye dokun.",
} as const;
