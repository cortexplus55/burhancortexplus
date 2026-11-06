/**
 * Yönetim panelinde veritabanından gelen ham durum kodlarının Türkçe karşılığı (6 Kasım 2026).
 *
 * Kural: panelde bir kod (`verified`, `stale`, `pending`, `openai_fallback` …) ekrana yazılacaksa önce buradan
 * geçer. Bilinmeyen kod olduğu gibi döner (yeni bir durum sessizce kaybolmasın); öyle bir satır görülürse
 * karşılığı buraya eklenir. İşlem geçmişi ve kredi kodları ayrı dosyada (`labels.ts`), bu dosya onu tekrar etmez.
 *
 * Yalnız görüntü: hiçbir eşleme kodun karşılaştırmasında kullanılmaz.
 */

function pick(map: Record<string, string>, code: string | null | undefined, empty: string): string {
  if (code == null) return empty;
  const key = String(code).trim();
  if (!key) return empty;
  return map[key] ?? map[key.toLowerCase()] ?? key;
}

/** Genel durum kodları: içerik, soru havuzu, ödeme, başvuru, destek, oturum, iş kuyruğu. */
export const STATUS_LABELS: Record<string, string> = {
  verified: "Doğrulandı",
  stale: "Karantinada",
  rejected: "Reddedildi",
  pending: "Bekliyor",
  approved: "Onaylandı",
  active: "Etkin",
  inactive: "Etkin değil",
  enabled: "Açık",
  disabled: "Kapalı",
  draft: "Taslak",
  queued: "Sırada",
  creating: "Hazırlanıyor",
  running: "Çalışıyor",
  processing: "İşleniyor",
  in_progress: "Sürüyor",
  completed: "Tamamlandı",
  done: "Bitti",
  ready: "Hazır",
  failed: "Başarısız",
  error: "Hata",
  paid: "Ödendi",
  refunded: "İade edildi",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
  expired: "Süresi doldu",
  open: "Açık",
  answered: "Cevaplandı",
  closed: "Kapandı",
  abandoned: "Yarıda bırakıldı",
  archived: "Arşivlendi",
  superseded: "Yeni sürümle değişti",
  locked: "Kilitli",
  hidden: "Gizli",
  published: "Yayında",
};

export function statusLabel(code: string | null | undefined, empty = "—"): string {
  return pick(STATUS_LABELS, code, empty);
}

/** Soru zorluğu. */
export const DIFFICULTY_LABELS: Record<string, string> = {
  foundation: "Temel",
  easy: "Kolay",
  medium: "Orta",
  hard: "Zor",
  exam_level: "Sınav düzeyi",
};

export function difficultyLabel(code: string | null | undefined, empty = "—"): string {
  return pick(DIFFICULTY_LABELS, code, empty);
}

/** Üretim hatası kaydındaki içerik türü. */
export const GENERATION_KIND_LABELS: Record<string, string> = {
  lesson: "Ders",
  podcast: "Podcast",
  qa: "Alıştırma",
  oral: "Sözlü",
  quiz: "Test",
  cards: "Kartlar",
  true_false: "Doğru/Yanlış",
  video: "Video ders",
  mock_exam: "Yazılı deneme",
};

export function generationKindLabel(code: string | null | undefined, empty = "—"): string {
  return pick(GENERATION_KIND_LABELS, code, empty);
}

/** Uyarlamalı öğrenme: kararı veren sağlayıcı. */
export const DECISION_PROVIDER_LABELS: Record<string, string> = {
  jev: "Jev",
  openai_decision: "OpenAI kararı",
  openai_fallback: "OpenAI yedeği",
  deterministic: "Kural tabanlı",
};

export function decisionProviderLabel(code: string | null | undefined, empty = "—"): string {
  return pick(DECISION_PROVIDER_LABELS, code, empty);
}

/** Uyarlamalı öğrenme: seçilen sonraki adım. */
export const LEARNING_ACTION_LABELS: Record<string, string> = {
  teach: "Anlat",
  worked_example: "Çözümlü örnek",
  easier_example: "Daha kolay örnek",
  practice: "Alıştırma",
  retrieval_practice: "Hatırlama alıştırması",
  prerequisite_review: "Ön koşul tekrarı",
  reteach: "Yeniden anlat",
  mini_assessment: "Kısa ölçme",
  advance: "İlerle",
  scheduled_review: "Planlı tekrar",
};

export function learningActionLabel(code: string | null | undefined, empty = "—"): string {
  return pick(LEARNING_ACTION_LABELS, code, empty);
}

/** Uyarlamalı öğrenme: konu durumu. */
export const TOPIC_STATUS_LABELS: Record<string, string> = {
  unseen: "Görülmedi",
  introduced: "Tanıtıldı",
  learning: "Öğreniliyor",
  developing: "Gelişiyor",
  mastered: "Öğrenildi",
  review_due: "Tekrar zamanı",
  at_risk: "Risk altında",
};

export function topicStatusLabel(code: string | null | undefined, empty = "—"): string {
  return pick({ ...STATUS_LABELS, ...TOPIC_STATUS_LABELS }, code, empty);
}

/** Uyarlamalı öğrenme: olay türü. */
export const LEARNING_EVENT_LABELS: Record<string, string> = {
  misconception_detected: "Yanılgı yakalandı",
  intervention_started: "Müdahale başladı",
  mastery_updated: "Hâkimiyet güncellendi",
  answer_evaluated: "Cevap değerlendirildi",
};

export function learningEventLabel(code: string | null | undefined, empty = "—"): string {
  return pick(LEARNING_EVENT_LABELS, code, empty);
}

/** Özellik anahtarlarının (`feature_flags.key`) Türkçe adı; yalnız bu dosyayı kullanan sayfalarda görünenler. */
export const SETTING_KEY_LABELS: Record<string, string> = {
  adaptive_learning_enabled: "Uyarlamalı öğrenme",
  jev_enabled: "Jev karar motoru",
  adaptive_daily_replan_enabled: "Günlük yeniden planlama",
  adaptive_model_router_enabled: "Model yönlendirici",
  weekly_survey: "Haftalık anket",
};

export function settingKeyLabel(code: string | null | undefined, empty = "—"): string {
  return pick(SETTING_KEY_LABELS, code, empty);
}

/** İstem (yapay zekâ yönergesi) başlıkları. */
export const PROMPT_KEY_LABELS: Record<string, string> = {
  student_chat: "Sohbetteki öğretmen",
};

export function promptKeyLabel(code: string | null | undefined, empty = "—"): string {
  return pick(PROMPT_KEY_LABELS, code, empty);
}

/** Abonelik dilimi (anket satırı). */
export const SEGMENT_LABELS: Record<string, string> = {
  free: "Ücretsiz",
  plus: "Plus",
  sigma: "Sigma",
  beta: "Beta",
};

export function segmentLabel(code: string | null | undefined, empty = "—"): string {
  return pick(SEGMENT_LABELS, code, empty);
}

/** Ekranda ikincil gösterilen kimlik: ilk 8 karakter. */
export function shortId(id: string | null | undefined): string {
  return id ? String(id).slice(0, 8) : "—";
}
