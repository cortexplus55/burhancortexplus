import { env, type ActionCode } from "@/lib/env";

export type ModelRouterInput = {
  actionCode: ActionCode;
  isPremium: boolean;
  hasImage: boolean;
  documentPages?: number;
  difficulty?: "easy" | "medium" | "hard";
  userSelectedAdvanced?: boolean;
  /**
   * Zor soru yükseltmesi bu istek için kullanılabilir mi.
   *
   * Yükseltmenin aylık bir tavanı var (`HARD_UPGRADE_MONTHLY_LIMIT`) ve tavan
   * veritabanında sayılıyor. Yönlendirici saf kalsın diye kararı kendisi
   * sormuyor: çağıran taraf `upgrade === "difficulty"` gördüğünde hakkı
   * ister, verilmezse aynı girdiyi bu bayrak kapalıyken bir daha çağırır.
   */
  hardUpgradeAllowed?: boolean;
};

/**
 * `upgrade` alanı, KREDİSİ ARTMADAN güçlü modele çıkıldığını söylüyor —
 * yani bedelini bizim ödediğimiz tek dal. Çağıran taraf tavanı bu alana
 * bakarak işletiyor; yönlendiricinin içinden okunamayan bir dal olsaydı
 * tavan er geç yönlendiriciden ayrışırdı.
 */
export type ModelRoute = {
  model: string;
  actionCode: ActionCode;
  upgrade: "difficulty" | null;
};

/**
 * Asıl model: içerik ve öğretmen işleri herkes için aynı modelde (2 Ekim
 * 2026, ürün sahibinin kararı — gpt-6-luna). Eski kademe ayrımı (abone
 * gpt-4.1, ücretsiz gpt-4.1-mini, sohbet gpt-4o-mini, zor soruda yükseltme)
 * kaldırıldı: öğrenci hangi kademede olursa olsun aynı öğretmeni görür.
 * Kredi kuralı değişmedi; gelişmiş sohbet ücreti yalnız aboneye yazılır.
 */
export function contentModel(): string {
  return env.OPENAI_CONTENT_MODEL;
}

/** Ders ve podcast taslağı. Kademe parametresi eski çağrılar için duruyor. */
export function lessonModel(_isPremium?: boolean): string {
  return contentModel();
}

/** Öğreten ya da değerlendiren işler: asıl modelde. */
const CONTENT_ACTIONS: ActionCode[] = [
  "AI_CHAT_STANDARD",
  "AI_CHAT_ADVANCED",
  "AI_CHAT_PARENT",
  "QUIZ_GENERATE",
  "FLASHCARD_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "PRACTICE_EXAM_GRADE",
  "STUDY_PLAN_GENERATE",
];

export function selectModel(input: ModelRouterInput): ModelRoute {
  // Fotoğraflı soru da öğretmen işi: luna görsel girdiyi kabul ediyor.
  if (input.hasImage) {
    return { model: contentModel(), actionCode: "IMAGE_SOLUTION", upgrade: null };
  }

  // Kredi: gelişmiş sohbet fiyatı yalnız aboneye yazılır. Ücretsiz hesap
  // AI_CHAT_ADVANCED gönderse de standart sohbet kredisi öder.
  const actionCode: ActionCode =
    input.actionCode === "AI_CHAT_ADVANCED" && !input.isPremium ? "AI_CHAT_STANDARD" : input.actionCode;

  if (CONTENT_ACTIONS.includes(input.actionCode)) {
    return { model: contentModel(), actionCode, upgrade: null };
  }

  // Belge işleme öğretmiyor: uzun belgede abone gelişmiş modeli alır.
  if (input.isPremium && (input.documentPages ?? 0) > 10) {
    return { model: env.OPENAI_ADVANCED_MODEL, actionCode, upgrade: null };
  }

  return { model: env.OPENAI_STANDARD_MODEL, actionCode, upgrade: null };
}
