import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DSN,
  SENTRY_ENV,
  SENTRY_IGNORE,
  scrubEvent,
} from "@/lib/observability/sentry-shared";

/**
 * Tarayıcı tarafı hata takibi.
 *
 * Oturum kaydı (replay) bilerek kapalı: öğrencinin ekranını kaydetmek demek,
 * yazdığı her şeyi kaydetmek demek. Hangi hatanın nerede çıktığını görmek için
 * gerekmiyor.
 */
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE,
    beforeSend: (event) => scrubEvent(event),
  });
}

/** Sayfa geçişlerinin süresini ölçmek için Next.js'in beklediği kanca. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
