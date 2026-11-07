/**
 * Destek talebinin konu türü (7 Kasım 2026, uyum paketi). İade talebi ve KVKK başvurusu ayrı görünsün diye:
 * kullanım koşulları "Ödeme ve iade" konusunu, aydınlatma metni "Kişisel veri başvurusu"nu adıyla anar. Tür ayrı
 * bir sütun değil, konunun önüne yazılır ("[Ödeme ve iade] …"): yönetim panelinde göç gerektirmeden görünür.
 */
export const SUPPORT_CATEGORIES = [
  { id: "genel", label: "Genel soru" },
  { id: "odeme", label: "Ödeme ve iade" },
  { id: "hesap", label: "Hesap ve giriş" },
  { id: "teknik", label: "Teknik sorun" },
  { id: "kvkk", label: "Kişisel veri başvurusu (KVKK)" },
] as const;

export type SupportCategoryId = (typeof SUPPORT_CATEGORIES)[number]["id"];

export const SUPPORT_CATEGORY_IDS = SUPPORT_CATEGORIES.map((item) => item.id) as [
  SupportCategoryId,
  ...SupportCategoryId[],
];

export function isSupportCategory(value: unknown): value is SupportCategoryId {
  return typeof value === "string" && SUPPORT_CATEGORY_IDS.includes(value as SupportCategoryId);
}

/** Konunun kayıtlı hâli: "[Ödeme ve iade] Konu". Konu zaten önekliyse ikinci kez eklenmez; 150 karaktere sığar. */
export function categorizedSubject(category: SupportCategoryId | undefined, subject: string): string {
  const clean = subject.trim();
  if (!category || category === "genel") return clean.slice(0, 150);
  const label = SUPPORT_CATEGORIES.find((item) => item.id === category)?.label ?? "";
  const prefix = `[${label}] `;
  if (clean.startsWith(prefix)) return clean.slice(0, 150);
  return `${prefix}${clean}`.slice(0, 150);
}
