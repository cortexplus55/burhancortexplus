import type { ActionCode } from "@/lib/env";
import { FREE_LIMITS, PLUS_ONLY_ACTIONS } from "@/lib/billing/free-meters";
import { FREE_PREP_LIMIT } from "@/lib/billing/free-tier-copy";
import { CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import type { Action, Plan } from "@/lib/entitlements/types";

/*
  Hak sisteminin yapılandırması (Faz 3A, 14 Kasım 2026). Bu dosya sayı UYDURMAZ ve DEĞİŞTİRMEZ: her değer bugün
  tutulduğu yerden okunur (`docs/design-migration/04-limit-ve-fiyat-yapilandirmasi.md`). Aynı sayılar SQL'de de
  durur (`free_meter_limit`, `credit_rules`, `plans`); ikisi birlikte değişir, bekçi testler eşitliği tutar.
  Arayüz fiyat, süre ve kota sayısını yalnız buradan (ve fiyatlar için veritabanı okuyucusundan) alır.
*/

/** Ücretsiz hesabın günlük sınırları (SQL `free_meter_limit`). Ders sayacı 0: ücretsiz hesap = tek ders. */
export const FREE_DAILY_LIMITS = {
  messages: FREE_LIMITS.chat,
  photos: FREE_LIMITS.photo,
  /** İlk dersin döngüsü ve ders içi yardım ("derse dahil"); kötüye kullanım sınırı. */
  included: FREE_LIMITS.included,
  lessons: FREE_LIMITS.lesson,
} as const;

/** Ücretsiz hesapta hazırlık sayısı. */
export const FREE_PREPS = FREE_PREP_LIMIT;

/** Ücretli planlar: veritabanı `plans` satırının kodu, dönem hakkı (kredi), dönem uzunluğu (gün). */
export const PAID_PLANS = {
  plus: { slug: "plus-aylik", allowance: PLAN_ALLOWANCES.plusMonthly, periodDays: 30, period: "month" },
  week: { slug: "plus-haftalik", allowance: PLAN_ALLOWANCES.plusWeekly, periodDays: 7, period: "week" },
  sigma: { slug: "sigma-aylik", allowance: PLAN_ALLOWANCES.sigmaMonthly, periodDays: 30, period: "month" },
} as const satisfies Record<Exclude<Plan, "free" | "founder">, { slug: string; allowance: number; periodDays: number; period: "week" | "month" }>;

/**
 * Eylemin sunucudaki kredi kodu. `cram.export` (sınav sabahı kâğıdı) kredi işi değil: karar sayfada
 * (`plusOnlyLocked`). `photo.solve` soru çözücünün kodu; sohbetteki fotoğraf `AI_CHAT_STANDARD` + fotoğraf
 * sayacıyla gider (bilinen fark, 10-entitlements.md). `video.create` "1 dk video" (çizimli özet).
 */
export const ACTION_CODE: Record<Action, ActionCode | null> = {
  "lesson.create": "STUDY_PLAN_GENERATE",
  "teacher.message": "AI_CHAT_STANDARD",
  "photo.solve": "IMAGE_SOLUTION",
  "podcast.create": "PODCAST_GENERATE",
  "video.create": "SKETCH_VIDEO_GENERATE",
  "oral.start": "ORAL_EXAM_GENERATE",
  "written.start": "PRACTICE_EXAM_GENERATE",
  "cram.export": null,
  "duel.start": "QUIZ_GENERATE",
};

/** Ücretsiz hesabın sayacı: hangi eylem hangi günlük sayaçtan düşer (yoksa null). */
export const ACTION_METER: Partial<Record<Action, "chat" | "photo">> = {
  "teacher.message": "chat",
  "photo.solve": "photo",
};

/** Eylemin bedeli (kredi), fiyat tablosundan. Kredi işi olmayan eylemde 0. */
export function actionCost(action: Action): number {
  const code = ACTION_CODE[action];
  return code ? CREDIT_PRICE_TABLE[code].credits : 0;
}

/** Ücretsiz hesapta hiç açılmayan eylem (SQL `plus_only_action` ile aynı liste; sınav sabahı kâğıdı da Plus'ta). */
export function plusOnly(action: Action): boolean {
  if (action === "cram.export") return true;
  const code = ACTION_CODE[action];
  return code !== null && PLUS_ONLY_ACTIONS.includes(code);
}

/**
 * Düello: bugünkü davranışın aynısı (ANA-PROMPT §3.11, 3.0 inceleme §4). Kurmak ücretsizde Plus'ta (cüzdan
 * bakiyesi test bedelini karşılıyorsa bakiyeden), ücretli hesapta dönem hakkından; oynamak ve bot herkese açık
 * (misafir dahil). Günlük hak yok, yalnız hız sınırı.
 */
export const DUEL_ACCESS = {
  create: { free: "gift_balance_or_plus", paid: "quota", founder: "open" },
  play: "everyone",
  bot: "everyone",
  dailyLimit: null,
  createPerMinute: 6,
} as const;

/** Sınav Haftası ikinci seçeneği yalnız sınav bu kadar gün içindeyse (ANA-PROMPT §3.11). */
export const EXAM_WEEK_OFFER_THRESHOLD_DAYS = 14;

/** Plus kotasında uyarı eşiği (ANA-PROMPT 3A: ≥ %90). */
export const PLUS_QUOTA_WARN_PERCENT = 90;
