import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DSN,
  SENTRY_ENV,
  SENTRY_IGNORE,
  scrubEvent,
} from "@/lib/observability/sentry-shared";

/**
 * Sunucu tarafı hata takibi.
 *
 * Adres girilmemişse `init` hiç çağrılmıyor: paket yüklü olsa bile tek bir ağ
 * isteği çıkmıyor, hiçbir şey yavaşlamıyor. Yani anahtar yapıştırılana kadar
 * uygulama bugünküyle birebir aynı çalışıyor.
 */
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    // Hız ölçümü kapalı. Ücretsiz Sentry kotasını hatalar için saklıyoruz;
    // performans izlemeyi açmak istersen 0.1 gibi küçük bir değer yeterli.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE,
    beforeSend: (event) => scrubEvent(event),
  });
}
