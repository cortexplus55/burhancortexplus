/**
 * Yönetim panelinde (menü, rozet, sayfa başlığı, tablo sütunu, açıklama) geçmemesi gereken İngilizce terimler.
 * Özel adlar — OpenAI, PayTR, Sentry, Jev, AI, Plus — hariç. Bekçiler: `yonetim-temeli.test.ts`, `yonetim-gelir.test.ts`.
 */
export const ADMIN_ENGLISH_TERMS = [
  "admin", "dashboard", "debug", "feature", "flag", "flags", "audit", "log", "logs", "prompt", "prompts", "settings",
  "user", "users", "payment", "payments", "cockpit", "quarantine", "support", "overview", "system", "abuse", "refund",
  "fallback", "only", "role", "roles", "team", "owner", "founder", "billing", "pricing", "credit", "rules", "survey",
  "errors", "votes", "health", "adaptive", "teacher", "applications", "promo", "codes", "costs", "usage", "login", "gate",
];

/** Metinde, sözcük olarak geçen ilk İngilizce terim; yoksa null. */
export function englishTermIn(text: string): string | null {
  for (const term of ADMIN_ENGLISH_TERMS) {
    if (new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "iu").test(text)) return term;
  }
  return null;
}
