import { z } from "zod";

export type DecisionProviderMode = "auto" | "jev" | "openai";
export type JevAccessMode = "auto" | "typesafe" | "gateway";

export function parseJevAccess(value: string | undefined): JevAccessMode {
  const v = (value ?? "auto").trim().toLowerCase();
  if (v === "typesafe" || v === "gateway" || v === "auto") return v;
  return "auto";
}

const TRUTHY_ENV = new Set(["true", "1", "yes", "on"]);

/** Jev is explicit opt-in: absent, empty, or unrecognized values all stay off. */
export function jevEnabledFromEnv(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV.has(value.trim().toLowerCase());
}

/** Same explicit opt-in as JEV_ENABLED — used for shadow rollout. */
export function jevShadowModeFromEnv(value: string | undefined): boolean {
  return jevEnabledFromEnv(value);
}

/** Missing or unknown values stay on auto so startup never requires a Jev key. */
export function decisionProviderFromEnv(
  value: string | undefined,
): DecisionProviderMode {
  if (value === "jev" || value === "openai") return value;
  return "auto";
}

function jevMinConfidenceFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 0.45;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.45;
  return Math.max(0, Math.min(1, n));
}

function jevTimeoutFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 2000;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 2000;
  return n;
}

export const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Cortex Plus"),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  APP_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_STANDARD_MODEL: z.string().default("gpt-4o-mini"),
  /**
   * Asıl model (2 Ekim 2026, ürün sahibinin kararı): ders, podcast, test,
   * deneme, notlama ve AI öğretmen sohbeti — abone de ücretsiz de. Arka
   * plandaki kontrol ve onarım çağrıları OPENAI_STANDARD_MODEL'de kalır,
   * görsel çözüm OPENAI_ADVANCED_MODEL'de.
   */
  OPENAI_CONTENT_MODEL: z.string().default("gpt-6-luna"),
  /**
   * Hazırlık sohbeti (2 Ekim 2026): "teacher" serbest metin öğretmen cevabı +
   * belgeye karşı model denetimi; "legacy" JSON şablon + eski denetçiler.
   */
  TUTOR_ENGINE: z.enum(["teacher", "legacy"]).default("teacher"),
  /*
    Ders, test, podcast, kart, doğru/yanlış ve sözlü içerik yalnız öğretmen
    motorlarından gelir. Eski taslak + onarım zinciri ve onu seçen
    LESSON/QUIZ/PODCAST/CARDS/PRACTICE_ENGINE anahtarları 3 Ekim 2026'da
    silindi (ürün sahibinin kararı).
  */
  /** Kavram birimleri (2 Ekim 2026): "teacher" büyük ana konuyu luna ile 2-6 sayfalık derslere böler; "legacy" 3 sayfalık mekanik bölme. */
  TOPIC_UNITS_ENGINE: z.enum(["teacher", "legacy"]).default("teacher"),
  /**
   * Ders taslağı — abone. Doğrulama ve parça onarımı standart modelde kalır.
   * Kredi eylem kodu değişmez; yalnızca bu çağrının modeli değişir.
   */
  OPENAI_LESSON_MODEL: z.string().default("gpt-4.1"),
  /**
   * Ders taslağı — ücretsiz hesap. Astra da ücretsizde küçük model kullanıyor
   * (Plus'a "1,4 kat daha akıllı model" vaat ediyor). 29 Eylül 2026 hesabı:
   * günde 6 krediyi tam kullanan ücretsiz hesap gpt-4.1 ile ayda ~88 TL,
   * bu modelle ~52 TL.
   */
  OPENAI_LESSON_FREE_MODEL: z.string().default("gpt-4.1-mini"),
  /** Yalnız aboneye açık işler (model-router). gpt-4o'dan ucuz: $2/$8 vs $2,5/$10. */
  OPENAI_ADVANCED_MODEL: z.string().default("gpt-4.1"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_STT_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  /** TypeSafe Jev decision engine (server-only; never expose to client). */
  TYPESAFE_API_KEY: z.string().optional(),
  /** Vercel AI Gateway key (server-only). Alternative to TYPESAFE_API_KEY. */
  AI_GATEWAY_API_KEY: z.string().optional(),
  /** auto | typesafe | gateway — unknown → auto. */
  JEV_ACCESS: z
    .string()
    .optional()
    .transform((v) => parseJevAccess(v)),
  /** Optional base URL override (test/proxy). */
  JEV_BASE_URL: z.string().optional(),
  JEV_MODEL: z.string().optional(),
  /** Explicit opt-in only — see jevEnabledFromEnv. A present API key does not imply this. */
  JEV_ENABLED: z
    .string()
    .optional()
    .transform((v) => jevEnabledFromEnv(v)),
  /** Shadow mode: Jev runs after OpenAI decision; student sees OpenAI. */
  JEV_SHADOW_MODE: z
    .string()
    .optional()
    .transform((v) => jevShadowModeFromEnv(v)),
  JEV_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => jevTimeoutFromEnv(v)),
  /** Min next_action.confidence to accept a Jev decision (else escalate to OpenAI). */
  JEV_MIN_CONFIDENCE: z
    .string()
    .optional()
    .transform((v) => jevMinConfidenceFromEnv(v)),
  JEV_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  /**
   * auto: Jev when enabled and a credential exists, otherwise OpenAI primary.
   * openai: never call Jev. jev: prefer Jev; missing key still starts the app.
   */
  DECISION_PROVIDER: z
    .string()
    .optional()
    .transform((v) => decisionProviderFromEnv(v)),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  APP_SECRET: process.env.APP_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_STANDARD_MODEL: process.env.OPENAI_STANDARD_MODEL,
  OPENAI_CONTENT_MODEL: process.env.OPENAI_CONTENT_MODEL,
  TUTOR_ENGINE: process.env.TUTOR_ENGINE,
  TOPIC_UNITS_ENGINE: process.env.TOPIC_UNITS_ENGINE,
  OPENAI_LESSON_MODEL: process.env.OPENAI_LESSON_MODEL,
  OPENAI_LESSON_FREE_MODEL: process.env.OPENAI_LESSON_FREE_MODEL,
  OPENAI_ADVANCED_MODEL: process.env.OPENAI_ADVANCED_MODEL,
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
  OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL,
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  JEV_ACCESS: process.env.JEV_ACCESS,
  JEV_BASE_URL: process.env.JEV_BASE_URL,
  JEV_MODEL: process.env.JEV_MODEL,
  JEV_ENABLED: process.env.JEV_ENABLED,
  JEV_SHADOW_MODE: process.env.JEV_SHADOW_MODE,
  JEV_TIMEOUT_MS: process.env.JEV_TIMEOUT_MS,
  JEV_MIN_CONFIDENCE: process.env.JEV_MIN_CONFIDENCE,
  JEV_FALLBACK_ENABLED: process.env.JEV_FALLBACK_ENABLED,
  DECISION_PROVIDER: process.env.DECISION_PROVIDER,
});

export const env = parsed.success
  ? parsed.data
  : envSchema.parse({});

export type ActionCode =
  | "AI_CHAT_STANDARD"
  | "AI_CHAT_ADVANCED"
  | "AI_CHAT_PARENT"
  | "IMAGE_SOLUTION"
  | "DOCUMENT_PAGE_PROCESS"
  | "QUIZ_GENERATE"
  | "FLASHCARD_GENERATE"
  | "PRACTICE_EXAM_GENERATE"
  | "PRACTICE_EXAM_GRADE"
  | "STUDY_PLAN_GENERATE"
  | "EXPORT_PDF"
  | "AUDIO_SYNTHESIZE";
