import * as Sentry from "@sentry/nextjs";

/**
 * Next.js sunucu açılırken bir kez çalışıyor.
 *
 * İki ortam için iki ayrı dosya var; hangisinde çalıştığımızı `NEXT_RUNTIME`
 * söylüyor. `await import` kullanmamızın sebebi, edge paketine Node kodunun
 * karışmaması.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Sunucuda oluşan hatalar buradan Sentry'ye gidiyor.
 *
 * Adres girilmemişse Sentry başlatılmadığı için bu çağrı sessizce hiçbir şey
 * yapmıyor.
 */
export const onRequestError = Sentry.captureRequestError;
