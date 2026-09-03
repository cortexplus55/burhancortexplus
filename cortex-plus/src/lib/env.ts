import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Cortex Plus"),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  APP_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_STANDARD_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_ADVANCED_MODEL: z.string().default("gpt-4o"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_STT_MODEL: z.string().default("gpt-4o-mini-transcribe"),
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
  OPENAI_ADVANCED_MODEL: process.env.OPENAI_ADVANCED_MODEL,
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
  OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL,
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
  | "EXPORT_PDF";
