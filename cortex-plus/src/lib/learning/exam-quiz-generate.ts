import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { randomUUID } from "node:crypto";
import { runTeacherQuiz } from "@/lib/learning/teacher-quiz-run";

export async function generateExamQuiz(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  userPrompt: string;
  difficulty?: "easy" | "medium" | "hard";
  verificationMode?: "full" | "schema";
  /** Stage 5: enforce pedagogy validators (fail closed via quality gate). */
  teachingV2?: boolean;
  /** Diagnostic retries stay within one credit reservation. */
  maxDraftAttempts?: 1 | 2 | 3;
  /** Verify each displayed explanation against its own option. */
  verifyOptionReasoning?: boolean;
  schemaHintExtra?: string;
  /** Stage 7: source excerpt for independent source checks. */
  sourceExcerpt?: string;
  requireSourceSupport?: boolean;
  sourcePages?: number[];
  /** Shared key if caller already reserved this user operation elsewhere. */
  idempotencyKey?: string;
  /** Yazılı deneme motoru PRACTICE_EXAM_GENERATE ile tek ücret keser. */
  actionCode?: ActionCode;
  /**
   * Ücret çağıran taraf işi bitirince kesilsin (düello: soru kümesi
   * kullanılamazsa iade). true iken dönen reservationId pending'dir.
   */
  deferCommit?: boolean;
  /**
   * Ayrıştırıcı ve doğrulayıcı en fazla bu kadar soru tutar (varsayılan 8).
   * Düello 7 soru gösteriyor; 8 adaydan 7'sinin doğrulamayı geçmesi
   * beklenemiyor, o yüzden 12 istiyor.
   */
  maxQuestions?: number;
  /**
   * Açıklama ve şık gerekçeleri öğrenciye gösterilmiyor (düello). Gerekçe
   * kapıları yalnızca gösterilen alanlara bakar; bkz. ChoiceVerifyOptions.
   */
  hiddenRationale?: boolean;
  /** Öğrenciye gidecek soru sayısı (öğretmen motoru). Yoksa maxQuestions ya da 5. */
  count?: number;
  /** Öğretmen motorunun istemi için; yoksa çağıranın userPrompt'u bağlamı taşır. */
  topicLabel?: string;
  prepTitle?: string;
}): Promise<
  | { ok: true; questions: QuizQuestion[]; reservationId?: string }
  | { ok: false; status: number; error: string }
> {
  /*
    Öğretmen test motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik yeni
    motora). Düello, tanışma testi, tanı testi, deneme sınavı, test aracı ve
    düğümün kalan türleri (yazılı deneme, son kontrol, odaklı pratik,
    soru-cevap) buradan geçer: çağıranın kaynak bloğu KAYNAK, isteği İSTEK
    olur; soruları bağımsız çözen denetim, sorunlu sorunun düzeltilmesi.
    Eski taslak + onarım zinciri 3 Ekim 2026'da silindi.
  */
  const source = input.sourceExcerpt?.trim() ?? "";
  const count = input.count ?? Math.min(input.maxQuestions ?? 5, 12);
  const outcome = await runTeacherQuiz(input.service, {
    userId: input.userId,
    actionCode: input.actionCode ?? "QUIZ_GENERATE",
    idempotencyKey: input.idempotencyKey ?? `quiz:${randomUUID()}`,
    topicLabel: input.topicLabel ?? "",
    prepTitle: input.prepTitle ?? "",
    pages: [],
    sourceBlock: source || undefined,
    mode: source ? "document" : "topic",
    count,
    minimum: Math.min(3, count),
    brief: [input.userPrompt, input.schemaHintExtra].filter(Boolean).join("\n"),
    deferCommit: input.deferCommit,
  });
  if (!outcome.ok) return { ok: false, status: outcome.status, error: outcome.error };
  return { ok: true, questions: outcome.questions, reservationId: outcome.reservationId };
}
