/**
 * İçerik Güvenlik Politikası (CSP).
 *
 * Tarayıcıya "bu sayfada yalnızca şu kaynaklar çalışabilir" demek. Bir saldırgan
 * sayfaya kod sokmayı başarsa bile, o kodun veri gönderebileceği yer kalmıyor.
 * Ödeme almaya başlayan bir sitede bu başlığın olmaması eksiklik.
 *
 * BAŞLANGIÇTA RAPOR KİPİNDE. `Content-Security-Policy-Report-Only` hiçbir şeyi
 * engellemiyor; tarayıcı yalnızca "bu kuralı ihlal ederdim" diye bildiriyor.
 * Gerekçe: buradaki listeler koddan okunarak yazıldı ama gerçek trafikte
 * gözden kaçan bir kaynak olabilir ve zorunlu kipte o, bozuk bir sayfa demek.
 * Bir hafta rapor toplandıktan sonra `reportOnly: false` ile sıkılaştırılır.
 *
 * Kaynakların her biri kodda kanıtlanabilir bir kullanıma dayanıyor:
 *
 * | Kaynak                | Neden                                          |
 * |-----------------------|------------------------------------------------|
 * | fonts.googleapis.com  | `parity-app.css` ve `cortex-premium.css` @import |
 * | fonts.gstatic.com     | yukarıdaki stilin çektiği font dosyaları        |
 * | *.supabase.co         | tarayıcıdan giriş, veri ve depo (ses/görsel)    |
 * | videos.pexels.com     | `cinematic-hero.tsx` tanıtım videosu            |
 * | eu.i.posthog.com      | `analytics.tsx` ölçüm betiği ve gönderimi       |
 * | *.ingest.sentry.io    | hata bildirimi (Sentry tarayıcı SDK'sı)         |
 * | www.paytr.com         | ödeme iframe'i ve form hedefi                   |
 *
 * Sunucudan çağrılanlar (OpenAI, Resend, PayTR token ucu) buraya GİRMEZ: CSP
 * tarayıcıyı bağlar, sunucuyu değil.
 */

const SUPABASE = "https://*.supabase.co";

export type CspOptions = {
  /** Üretim dışında Next bazı yerlerde `eval` kullanıyor. */
  allowEval?: boolean;
  /** İhlallerin bildirileceği kendi ucumuz. */
  reportUri?: string | null;
};

export function cspDirectives(options: CspOptions = {}): Record<string, string[]> {
  const script = ["'self'", "'unsafe-inline'", "https://eu.i.posthog.com"];
  // Next App Router kendi hidrasyon verisini sayfaya satır içi gömüyor, bu
  // yüzden 'unsafe-inline' şimdilik zorunlu. Kalıcı çözüm middleware'den
  // nonce geçirmek; o ayrı bir iş ve sayfa çizimini etkiliyor.
  if (options.allowEval) script.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'", "https://www.paytr.com"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:", SUPABASE],
    "media-src": ["'self'", "blob:", SUPABASE, "https://videos.pexels.com"],
    "connect-src": [
      "'self'",
      SUPABASE,
      "wss://*.supabase.co",
      "https://eu.i.posthog.com",
      "https://*.ingest.sentry.io",
      "https://*.sentry.io",
    ],
    "frame-src": ["'self'", "https://www.paytr.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  if (options.reportUri) directives["report-uri"] = [options.reportUri];
  return directives;
}

export function cspHeaderValue(options: CspOptions = {}): string {
  return Object.entries(cspDirectives(options))
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/** Rapor kipinde mi, zorunlu kipte mi. */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}
