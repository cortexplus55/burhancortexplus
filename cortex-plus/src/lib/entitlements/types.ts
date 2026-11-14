/**
 * Hak sisteminin türleri (Faz 3A, 14 Kasım 2026). Arayüz bu türleri okur; planı DOĞRUDAN okumaz.
 * Karar `getGate`'tedir ve bugünkü sunucu davranışını birebir taşır (sunucu gerçektir, tablo hedeftir):
 * `docs/design-migration/10-entitlements.md`.
 */

export type Plan = "free" | "plus" | "week" | "sigma" | "founder";

export type Action =
  | "lesson.create"
  | "teacher.message"
  | "photo.solve"
  | "podcast.create"
  | "video.create"
  | "oral.start"
  | "written.start"
  | "cram.export"
  | "duel.start";

/**
 * Kapının nedeni. İlk 12 ad ANA-PROMPT 3A tablosundan; son 6 ad bugünkü sunucunun tabloda olmayan retleridir
 * (OTONOM §9 karar 5): en yakın sheet'e eşlenir, yeni pazarlama metni yazılmaz, `spend_cap`'te teklif yoktur.
 */
export type GateReason =
  | "open"
  | "free_first_lesson_available"
  | "free_first_lesson_used"
  | "feature_requires_plus"
  | "daily_messages_available"
  | "daily_messages_used"
  | "daily_photo_available"
  | "daily_photo_used"
  | "quota_ok"
  | "plus_quota_90"
  | "plus_quota_100"
  | "quota_reset_wait"
  // Tabloda olmayan sunucu retleri:
  | "spend_cap"
  | "free_topic_limit"
  | "free_prep_limit"
  | "free_included_limit"
  | "free_photo_abuse_limit";

export type GatePeriod = "day" | "week" | "month" | "lifetime";

export type Gate = {
  state: "open" | "limited" | "locked";
  reason: GateReason;
  period?: GatePeriod;
  limit?: number;
  remaining?: number;
  /** ISO. */
  resetAt?: string;
  requiredPlan?: "plus" | "week" | "sigma";
};

/** Ücretsiz hesabın bir günlük sayacı (mesaj, fotoğraf, derse dahil). */
export type MeterSnapshot = { used: number; limit: number; resetsAt: string };

/**
 * `getGate`'in girdisi: sunucunun bugün okuduğu değerler. Sunucuda `entitlementSnapshot` (account-context'ten)
 * kurar; istemci aynı değerleri kabuk özelliklerinden alır. Hiçbir alan istemciden doğrulanmadan sunucu
 * kararına girmez: sunucu kararı yine SQL'dedir (`credit_reserve_metered`), kapı onu önceden söyler.
 */
export type EntitlementSnapshot = {
  plan: Plan;
  /** Sınav Haftası'nda aboneliğin kalan günü (`PLUS · N GÜN`). */
  weekDaysLeft?: number;
  /** Kurucu "ücretsiz gibi gör" önizlemesinde: ücretsiz hesap gibi, cüzdanı hediye sayılmaz. */
  freePreview?: boolean;
  /** Ücretli dönem hakkı (cüzdan, tembel yenileme uygulanmış: `quotaView`). Ücretsizde yok. */
  quota?: { remaining: number; allowance: number; usedPercent: number; resetsAt?: string };
  /** Cüzdan bakiyesi: ek paket ve hediye (davet). Önizlemede 0. */
  balance: number;
  /** Ücretsiz hesabın günlük sayaçları. Okunamadıysa yok: karar sunucuya kalır. */
  meters?: Partial<Record<"chat" | "photo" | "included", MeterSnapshot>>;
  /** Ücretsiz hesabın ilk dersi: hazırlık yok / açık / 1. konunun dersleri bitti. Okunamadıysa null. */
  firstLesson?: "none" | "open" | "done" | null;
  /** Küresel günlük harcama sigortası şu an ücretsiz işleri durduruyor mu (yalnız sunucu bilir). */
  spendCap?: boolean;
  /** Bugün 3 okunamayan fotoğraf (yalnız sunucu bilir). */
  photoAbuse?: boolean;
  /** Eylem bedeli (kredi) için veritabanı değeri; yoksa fiyat tablosu. */
  prices?: Partial<Record<Action, number>>;
};

/**
 * Eylemin bağlamı. Ücretsiz hesapta "ders" kararı düğüme bağlıdır (sunucuda tek bir "kullanıldı" durumu yok):
 * ilk hazırlığın 1. konusundaki adımın ilk açılışı ücretsizdir, başka konu `free_topic_limit` ile kilitlidir.
 */
export type GateContext = {
  /** Adım ilk dersin döngüsünde ve ilk kez açılıyor (`firstLessonCycleFree`). */
  firstLessonCycle?: boolean;
  /** Adım 1. konunun dışında (`freeTopicGate`). */
  otherTopic?: boolean;
};

export type ResolvedPlan = { plan: Plan; weekDaysLeft?: number };
