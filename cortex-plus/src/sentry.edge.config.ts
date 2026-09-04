import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DSN,
  SENTRY_ENV,
  SENTRY_IGNORE,
  scrubEvent,
} from "@/lib/observability/sentry-shared";

/**
 * Edge çalışma ortamı — `middleware.ts` burada çalışıyor.
 *
 * Ayrı bir dosya olmasının sebebi teknik: edge'de Node API'leri yok, bu yüzden
 * Next.js iki ayrı paket derliyor ve her birinin kendi kurulumu gerekiyor.
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
