/**
 * Tek pazarlama navigasyonu — header, footer ve site-header aynı kaynağı kullanır.
 * Sayfa başına farklı etiket/sıra üretmeyin.
 */
export const MARKETING_NAV = [
  { href: "/ozellikler", label: "Özellikler" },
  { href: "/sinav-hazirligi", label: "Sınav hazırlığı" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/yardim", label: "Yardım" },
] as const;

export const MARKETING_AUTH = {
  loginHref: "/giris",
  loginLabel: "Giriş yap",
  signupHref: "/kayit",
  signupLabel: "Ücretsiz dene",
} as const;

export type MarketingNavItem = (typeof MARKETING_NAV)[number];
