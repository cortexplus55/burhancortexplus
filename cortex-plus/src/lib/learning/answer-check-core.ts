/**
 * `answer-check` çekirdeği (28 Kasım 2026, P0): hangi soru notlanıyor, gelen cevap o sorunun hangi şıkkı.
 *
 * Eskiden sunucu yalnız sıra numarasına bakıyor, gelen metni hiç denetlemeden kilitliyordu; ekran da cevaptaki
 * soruyu (kök, şıklar, SIRA) ve kilitli cevabı kendi gördüğünün üstüne yazıyordu. Öğrencinin gördüğü soru ile
 * sunucudaki soru ya da dokunduğu şık ile kilitlenen şık ayrıştığında ekran "B'yi seçtin" yerine başka şıkkı kırmızı
 * gösterebiliyordu. Şimdi:
 * - ekran gördüğü kökü de gönderir; sunucu o sıradaki soru o kök değilse kökü kayıtta arar, bulamazsa reddeder;
 * - cevap sorunun şıklarından birine (görünüm farkı yok sayılarak) denk gelmeli, kilide şıkkın kendi metni yazılır;
 * - dönen soru oturum paketiyle aynı süzgeçten geçer.
 *
 * Saf (veritabanı yok); eylem (`answer-check.ts`) ve e2e fikstürü aynı işlevi çağırır.
 */
import { normalizeQuizQuestion, publicQuizQuestion, selectedOptions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { matchOption, stemMatchKey } from "@/lib/learning/option-match";
import { studentSafePayload } from "@/lib/learning/student-safe-text";

export type QuizCheckQuestion = ReturnType<typeof publicQuizQuestion>;

/** Kayıtlı sorunun okunmuş hâli (notlamanın okuduğu biçim). */
export function storedQuizQuestion(payload: Record<string, unknown>, index: number): QuizQuestion | null {
  if (payload.type !== "quiz" || !Array.isArray(payload.questions)) return null;
  const raw = payload.questions[index] as QuizQuestion | undefined;
  if (!raw || typeof raw !== "object") return null;
  return normalizeQuizQuestion(raw as Parameters<typeof normalizeQuizQuestion>[0]) ?? raw;
}

/** Öğrenciye dönen geri bildirim: oturum paketiyle aynı süzgeç (`studentSafePayload`). */
export function quizCheckFeedback(question: QuizQuestion): QuizCheckQuestion {
  return studentSafePayload(publicQuizQuestion(question));
}

/**
 * Ekranın gördüğü kök hangi sıradaki soru. Kök verilmemişse (eski sekme) gelen sıra olduğu gibi. Kök o sıradakiyle
 * tutmuyorsa kayıtta tek eşleşen sıra aranır; yoksa null (sunucu başka soruyu notlamaz).
 */
export function resolveQuizIndex(payload: Record<string, unknown>, index: number, shownText?: string | null): number | null {
  const question = storedQuizQuestion(payload, index);
  if (!shownText) return question ? index : null;
  const want = stemMatchKey(shownText);
  if (question && stemMatchKey(question.text) === want) return index;
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const hits: number[] = [];
  questions.forEach((_, at) => {
    const candidate = storedQuizQuestion(payload, at);
    if (candidate && stemMatchKey(candidate.text) === want) hits.push(at);
  });
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Gelen cevabı sorunun kendi şık metinlerine çevirir. Şıklarda karşılığı olmayan, boş ya da tek doğrulu soruda birden
 * çok şık içeren cevap reddedilir (null): kilide asla şıklarda olmayan bir değer yazılmaz.
 */
export function canonicalQuizAnswer(question: QuizQuestion, submitted: unknown): string | string[] | null {
  const items = selectedOptions(submitted);
  if (!items.length) return null;
  const mapped: string[] = [];
  for (const item of items) {
    const option = matchOption(question.options, item);
    if (!option) return null;
    if (!mapped.includes(option)) mapped.push(option);
  }
  if (question.multi) return mapped;
  if (mapped.length !== 1) return null;
  return mapped[0]!;
}
