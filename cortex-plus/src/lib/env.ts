import { z } from "zod";

export type DecisionProviderMode = "auto" | "jev" | "openai";

/** Missing or unknown values stay on auto so startup never requires a Jev key. */
export function decisionProviderFromEnv(
  value: string | undefined,
): DecisionProviderMode {
  if (value === "jev" || value === "openai") return value;
  return "auto";
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
   * Ders taslağı. Doğrulama ve parça onarımı standart modelde kalır.
   * Kredi eylem kodu değişmez; yalnızca bu çağrının modeli değişir.
   */
  OPENAI_LESSON_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_ADVANCED_MODEL: z.string().default("gpt-4o"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_STT_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  /** TypeSafe Jev decision engine (server-only; never expose to client). */
  TYPESAFE_API_KEY: z.string().optional(),
  JEV_MODEL: z.string().optional(),
  JEV_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  JEV_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  JEV_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  /**
   * auto: Jev when enabled and a TypeSafe key exists, otherwise OpenAI primary.
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
  OPENAI_LESSON_MODEL: process.env.OPENAI_LESSON_MODEL,
  OPENAI_ADVANCED_MODEL: process.env.OPENAI_ADVANCED_MODEL,
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
  OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL,
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  JEV_MODEL: process.env.JEV_MODEL,
  JEV_ENABLED: process.env.JEV_ENABLED,
  JEV_TIMEOUT_MS: process.env.JEV_TIMEOUT_MS,
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
