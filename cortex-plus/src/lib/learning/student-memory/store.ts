/**
 * Öğrenme hafızası kaydı (5 Kasım 2026): okuma ve yenileme. Model çağrısı yok.
 *
 * Yenileme sınırlı sorgularla çalışır (son 90 gün, en çok 300 tamamlanmış test/doğru-yanlış kaydı; öbür
 * kaynaklar 200 satır) ve yalnız yanıttan sonra (`after`) çağrılır: öğrenciyi hiçbir zaman bekletmez.
 * Bir kaynak okunamazsa (geçici hata) özet YAZILMAZ — eksik veriyle yazılan özet iyi bir özetin üstüne
 * biner. Tablo göçten önce yoksa okuma null, yazma uyarıyla atlanır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { withOpenMisconceptions } from "@/lib/learning/misconception-store";
import { missingRelation } from "@/lib/learning/missing-column";
import { scanAttemptErrors } from "./attempt-errors";
import {
  buildStudentMemory,
  parseStudentMemory,
  STUDENT_MEMORY_VERSION,
  WEAK_OUTCOME_MIN_N,
  type MemoryInputs,
  type StudentMemory,
} from "./summary";

export const MEMORY_TABLE = "student_learning_memory";
export const MEMORY_WINDOW_DAYS = 90;
export const MEMORY_ATTEMPT_LIMIT = 300;
const ROW_LIMIT = 200;
const TIME_LIMIT = 300;

type DbError = { message?: string; code?: string } | null | undefined;
type Rows<T> = { data: T[] | null; error: DbError };
type SourceResult<T> = { rows: T[]; failed: boolean };
type Row = Record<string, unknown>;

function cause(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160);
  const message = (error as { message?: unknown } | null)?.message;
  return String(message ?? error).slice(0, 160);
}

/** Bir kaynağı okur: hata uyarıyla `failed`, tablo yoksa boş ve başarılı. Asla fırlatmaz. */
async function readSource<T extends Row>(label: string, run: () => PromiseLike<Rows<T>>): Promise<SourceResult<T>> {
  try {
    const { data, error } = await run();
    if (!error) return { rows: data ?? [], failed: false };
    if (missingRelation(error)) return { rows: [], failed: false };
    console.warn("student_memory_source_failed", { label, cause: cause(error) });
    return { rows: [], failed: true };
  } catch (error) {
    console.warn("student_memory_source_failed", { label, cause: cause(error) });
    return { rows: [], failed: true };
  }
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Kayıtlı özet; yoksa, tablo yoksa ya da okunamazsa null (uyarıyla). */
export async function loadStudentMemory(service: SupabaseClient, userId: string): Promise<StudentMemory | null> {
  try {
    const { data, error } = await service.from(MEMORY_TABLE).select("memory").eq("user_id", userId).maybeSingle();
    if (error) {
      if (!missingRelation(error)) console.warn("student_memory_read_failed", { cause: cause(error) });
      return null;
    }
    return data ? parseStudentMemory((data as { memory?: unknown }).memory) : null;
  } catch (error) {
    console.warn("student_memory_read_failed", { cause: cause(error) });
    return null;
  }
}

/**
 * Kayıtlardan özeti yeniden kurar ve tabloya yazar. Her kaynak kendi sınırıyla; biri düşerse yazım atlanır.
 * Döner: yazılan özet ya da null. Asla fırlatmaz — arka plan işi için.
 */
export async function refreshStudentMemory(
  service: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<StudentMemory | null> {
  try {
    const since = new Date(now.getTime() - MEMORY_WINDOW_DAYS * 86_400_000).toISOString();
    const [attempts, outcomes, misconceptions, mistakes, preps, times] = await Promise.all([
      readSource<Row>("attempts", () =>
        service
          .from("exam_prep_node_attempts")
          .select("payload, answers, updated_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .in("payload->>type", ["quiz", "true_false"])
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(MEMORY_ATTEMPT_LIMIT),
      ),
      readSource<Row>("outcomes", () =>
        service
          .from("outcome_mastery")
          .select("outcome_id, unit_id, program_id, alpha, beta, n")
          .eq("user_id", userId)
          .gte("n", WEAK_OUTCOME_MIN_N)
          .order("n", { ascending: false })
          .limit(ROW_LIMIT),
      ),
      readSource<Row>("misconceptions", () =>
        withOpenMisconceptions((onlyOpen) => {
          const query = service
            .from("exam_prep_misconceptions")
            .select("topic_label, claim")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(ROW_LIMIT);
          return onlyOpen ? query.is("resolved_at", null) : query;
        }),
      ),
      readSource<Row>("mistakes", () =>
        service
          .from("mistake_entries")
          .select("topic_label, wrong_count")
          .eq("user_id", userId)
          .is("mastered_at", null)
          .order("wrong_count", { ascending: false })
          .limit(ROW_LIMIT),
      ),
      readSource<Row>("preferences", () =>
        service
          .from("exam_preps")
          .select("id, learning_preferences")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1),
      ),
      readSource<Row>("response_times", () =>
        service
          .from("item_responses")
          .select("time_ms")
          .eq("user_id", userId)
          .not("time_ms", "is", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(TIME_LIMIT),
      ),
    ]);

    const failed = Object.entries({ attempts, outcomes, misconceptions, mistakes, preps, times })
      .filter(([, source]) => source.failed)
      .map(([label]) => label);
    if (failed.length) {
      console.warn("student_memory_refresh_skipped", { failed });
      return null;
    }

    const prep = preps.rows[0] ?? null;
    const prepId = text(prep?.id);
    // Aşinalık yalnız zenginleştirme: okunamazsa özet yine yazılır.
    const familiarities = prepId
      ? await readSource<Row>("familiarities", () =>
          service.from("exam_prep_topics").select("familiarity").eq("exam_prep_id", prepId).limit(ROW_LIMIT),
        )
      : { rows: [], failed: false };

    let answeredCount = 0;
    const wrongAnswers: MemoryInputs["wrongAnswers"][number][] = [];
    for (const row of attempts.rows) {
      const scan = scanAttemptErrors(row.payload, row.answers, text(row.updated_at));
      answeredCount += scan.answered;
      wrongAnswers.push(...scan.wrong);
    }

    const prefs = prep ? parseLearningPreferences(prep.learning_preferences) : null;
    const memory = buildStudentMemory({
      now,
      wrongAnswers,
      answeredCount,
      outcomes: outcomes.rows.map((row) => ({
        outcomeId: String(row.outcome_id ?? ""),
        unitId: String(row.unit_id ?? ""),
        programId: String(row.program_id ?? ""),
        alpha: num(row.alpha),
        beta: num(row.beta),
        n: num(row.n),
      })),
      misconceptions: misconceptions.rows.map((row) => ({ topicLabel: text(row.topic_label), claim: String(row.claim ?? "") })),
      mistakes: mistakes.rows.map((row) => ({ topicLabel: text(row.topic_label), wrongCount: num(row.wrong_count) })),
      preferences: prefs ? { modalities: prefs.modalities ?? [], style: prefs.style ?? null } : null,
      familiarities: familiarities.rows.map((row) => text(row.familiarity) ?? "").filter(Boolean),
      responseTimesMs: times.rows.map((row) => Number(row.time_ms)).filter((value) => Number.isFinite(value)),
    });

    const { error } = await service
      .from(MEMORY_TABLE)
      .upsert({ user_id: userId, memory, version: STUDENT_MEMORY_VERSION, updated_at: memory.updatedAt }, { onConflict: "user_id" });
    if (error) {
      console.warn(missingRelation(error) ? "student_memory_table_missing" : "student_memory_write_failed", { cause: cause(error) });
      return null;
    }
    return memory;
  } catch (error) {
    console.warn("student_memory_refresh_failed", { cause: cause(error) });
    return null;
  }
}
