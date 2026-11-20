import type { Activation24hInput } from "@/lib/email/templates/activation-24h";
import type { ExamEveCheatSheetInput } from "@/lib/email/templates/exam-eve-cheat-sheet";
import type { FreeFirstUnitCompletedInput } from "@/lib/email/templates/free-first-unit-completed";
import type { PaymentConfirmedInput } from "@/lib/email/templates/payment-confirmed";
import type { SmartTrapNudgeInput } from "@/lib/email/templates/smart-trap-nudge";
import type { SubscriptionExpiryReminderInput } from "@/lib/email/templates/subscription-expiry-reminder";
import type { WeeklyStudyDigestInput } from "@/lib/email/templates/weekly-study-digest";
import type { WelcomeOnboardingInput } from "@/lib/email/templates/welcome-onboarding";

/*
  Örnek girdiler (testler ve yönetimdeki önizleme). Genel içerik: gerçek öğrenci verisi ve gerçek kimlik yok; hazırlık
  kimliği açıkça yer tutucu, bağlantılar canlı adresin yol biçiminde.
*/

export const SAMPLE_ORIGIN = "https://cortexplus.app";
export const SAMPLE_PREP_ID = "00000000-0000-4000-8000-000000000001";
export const SAMPLE_PREFERENCES_URL = `${SAMPLE_ORIGIN}/bildirim-tercihleri?token=ornek-tercih-anahtari`;

export const SAMPLE_WELCOME_ONBOARDING: WelcomeOnboardingInput = {
  firstName: "Elif",
  origin: SAMPLE_ORIGIN,
  unverified: true,
  daysToExam: 42,
};

export const SAMPLE_PAYMENT_CONFIRMED: PaymentConfirmedInput = {
  firstName: "Elif",
  planName: "Plus",
  kind: "plus_monthly",
  amountKurus: 59900,
  periodEnd: "2026-12-20T09:00:00.000Z",
  benefits: [
    "İlk dersten sonraki bütün konular ve yeni anlatımlar",
    "Podcast, video ders, sözlü ve yazılı deneme",
    "Sınav Sabahı kâğıdı",
  ],
  parentPaid: false,
  origin: SAMPLE_ORIGIN,
};

export const SAMPLE_ACTIVATION_24H: Activation24hInput = {
  firstName: "Elif",
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

export const SAMPLE_FREE_FIRST_UNIT_COMPLETED: FreeFirstUnitCompletedInput = {
  firstName: "Elif",
  prepTitle: "TYT Matematik",
  masteryPct: 82,
  remainingUnits: 11,
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

export const SAMPLE_SMART_TRAP_NUDGE: SmartTrapNudgeInput = {
  firstName: "Elif",
  prepTitle: "TYT Matematik",
  topicTitle: "Üslü Sayılar",
  mistakeCount: 5,
  prepId: SAMPLE_PREP_ID,
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

export const SAMPLE_EXAM_EVE_CHEAT_SHEET: ExamEveCheatSheetInput = {
  firstName: "Elif",
  prepTitle: "TYT Matematik",
  hoursLeft: 48,
  learnedTopics: 9,
  totalTopics: 12,
  weakestTopics: ["Üslü Sayılar", "Oran ve Orantı", "Problemler"],
  cramSheetAvailable: true,
  prepId: SAMPLE_PREP_ID,
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

export const SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER: SubscriptionExpiryReminderInput = {
  firstName: "Elif",
  planName: "Plus",
  window: "3d",
  periodEnd: "2026-12-20T09:00:00.000Z",
  learnedTopics: 7,
  completedSteps: 38,
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

export const SAMPLE_WEEKLY_STUDY_DIGEST: WeeklyStudyDigestInput = {
  firstName: "Elif",
  weeklyLearned: 3,
  completedActivities: 14,
  streakDays: 5,
  nextStep: {
    title: "Konu Testi · Oran ve Orantı",
    href: `${SAMPLE_ORIGIN}/deneme-sinavlari/${SAMPLE_PREP_ID}`,
  },
  origin: SAMPLE_ORIGIN,
  preferencesUrl: SAMPLE_PREFERENCES_URL,
};

/** Şablon anahtarı → örnek girdi (`TEMPLATE_KEY` değerleriyle aynı). */
export const SAMPLE_INPUTS = {
  welcome_onboarding: SAMPLE_WELCOME_ONBOARDING,
  payment_confirmed: SAMPLE_PAYMENT_CONFIRMED,
  activation_24h: SAMPLE_ACTIVATION_24H,
  free_first_unit_completed: SAMPLE_FREE_FIRST_UNIT_COMPLETED,
  smart_trap_nudge: SAMPLE_SMART_TRAP_NUDGE,
  exam_eve_cheat_sheet: SAMPLE_EXAM_EVE_CHEAT_SHEET,
  subscription_expiry_reminder: SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER,
  weekly_study_digest: SAMPLE_WEEKLY_STUDY_DIGEST,
} as const;

export type SampleTemplateKey = keyof typeof SAMPLE_INPUTS;
