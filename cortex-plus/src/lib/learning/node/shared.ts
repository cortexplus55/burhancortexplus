/** Yol etkinliği ucunun ortak parçaları: türün kredi kodu, hata sınıfı, `after` sarmalayıcıları, cüzdan ve kayıt sayısı. */
import "server-only";
import { after } from "next/server";
import { commitCredits, refundCredits } from "@/lib/credits/service";
import { podcastCheckOf } from "@/lib/learning/podcast-check";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Rotanın `maxDuration` değeri (saniye). Next.js rota yapılandırmasını dosyadan düz sayı olarak okur; değer
 * `route.ts`'te de 300 yazılı durur, bekçi test ikisinin aynı kaldığını tutar.
 */
export const NODE_MAX_DURATION_SECONDS = 300;

/** Öğretmen test motorunun yazdığı düğümler (2 Ekim 2026). */
export const TEACHER_QUIZ_KINDS = new Set<PlanNodeKind>(["quiz", "gaps"]);
/** Öğretmen motorlarının konunun çekirdek sayfalarını okuduğu düğümler. */
/** Öğretmen kart motorunun yazdığı düğümler (2 Ekim 2026). */
export const TEACHER_CARD_KINDS = new Set<PlanNodeKind>(["flashcards", "spaced"]);
export const TEACHER_PAGE_KINDS = new Set<PlanNodeKind>([...TEACHER_QUIZ_KINDS, ...TEACHER_CARD_KINDS, "podcast", "true_false"]);

/** Kredi sistemi v2 (8 Ekim 2026): her iş kendi ölçülen maliyetiyle fiyatlanır. */
export function actionForKind(kind: PlanNodeKind) {
  if (kind === "flashcards" || kind === "spaced") return "FLASHCARD_GENERATE" as const;
  if (kind === "lesson") return "STUDY_PLAN_GENERATE" as const;
  if (kind === "podcast") return "PODCAST_GENERATE" as const;
  if (kind === "oral") return "ORAL_EXAM_GENERATE" as const;
  return "QUIZ_GENERATE" as const;
}

/**
 * Takılı kalan parça parça dersin bekleyen kredisi. Anahtar açılışın kredi anahtarı; ders
 * motoru krediyi bu anahtarla ayırıyor. Kesinleşmiş ya da iade edilmiş kayda dokunulmaz.
 */
export async function settlePendingStart(
  service: SupabaseClient,
  input: { userId: string; key: string; outcome: "commit" | "refund" },
) {
  const { data } = await service
    .from("credit_reservations")
    .select("id")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.key)
    .eq("status", "pending")
    .maybeSingle();
  if (!data?.id) return;
  const settle = input.outcome === "commit" ? commitCredits : refundCredits;
  await settle(service, data.id as string).catch(() => undefined);
}

/** `after` yalnız bir istek içinde çalışır; rotayı doğrudan çağıran birim testlerinde arka plan işi atlanır. */
export function afterResponse(task: () => unknown) {
  try {
    after(task);
  } catch {
    // İstek dışı: yapılacak arka plan işi yok.
  }
}

/** `after` kurulabildi mi: kurulamazsa (istek dışı) çağıran işi yanıt içinde koşar. */
export function scheduleAfter(task: () => Promise<unknown>): boolean {
  try {
    after(task);
    return true;
  } catch {
    return false;
  }
}

/** Arka plan notlandırmasının içinde zaten yanıt sonrasındayız: iş beklenerek koşar. */
export function deferTask(task: () => Promise<unknown> | unknown, background: boolean) {
  if (!background) {
    afterResponse(task);
    return;
  }
  void Promise.resolve()
    .then(task)
    .catch(() => undefined);
}

export class NodeGenerationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reasons: string[] = [],
  ) {
    super(code);
  }
}

/** Başarılı üretimden sonra cüzdan. Açılışta ayrı ücret yok. */
export async function readWalletBalance(
  service: SupabaseClient,
  userId: string,
): Promise<{ balance?: number }> {
  const { data } = await service
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return typeof data?.balance === "number" ? { balance: data.balance } : {};
}

export function countTotal(kind: PlanNodeKind, payload: Record<string, unknown>) {
  if (payload.type === "quiz") return ((payload.questions as unknown[]) ?? []).length;
  if (payload.type === "true_false") return ((payload.items as unknown[]) ?? []).length;
  if (payload.type === "cards") return Math.max(1, ((payload.cards as unknown[]) ?? []).length);
  if (payload.type === "oral") return ((payload.questions as unknown[]) ?? []).length;
  // Dinleme kontrolü varsa soru sayısı; atlanırsa tamamlama yine 1/1 yazar (`scorePodcastCheck`).
  if (payload.type === "podcast") return podcastCheckOf(payload).length || 1;
  return 1;
}
