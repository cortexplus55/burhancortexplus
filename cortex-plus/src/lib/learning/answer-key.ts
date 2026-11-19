/**
 * Faz 2 (madde 7.2): geçerli cevap anahtarı olmayan soru KAYDEDİLMEZ.
 *
 * Kök neden: soru yazan her yol kendi şemasıyla kaydediyordu; bazı şemalarda anahtar isteğe bağlıydı (ders içi kontrol
 * `answerIndex?`), bazılarında aralık şıkların sayısına değil sabit bir tavana bakıyordu (havuz `answer`), deneme
 * satırı da `correct_answers[0] ?? null` ile anahtarsız yazılabiliyordu. Anahtarı olmayan soru notlanamaz: öğrenci
 * doğru cevabı verse de "yanlış" görür, Yanlışlar Defteri'ne boş "doğru cevap" düşer.
 *
 * Tek kural, saf ve bağımlılıksız; yazma noktalarının hepsi bunu çağırır. Geçmeyen soru atılır ve günlüğe düşer.
 */

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Şık dizisi: en az iki dolu, birbirinden farklı metin. */
export function validOptions(options: unknown): options is string[] {
  if (!Array.isArray(options) || options.length < 2) return false;
  const cleaned = options.map(text);
  if (cleaned.some((option) => !option)) return false;
  return new Set(cleaned).size === cleaned.length;
}

/** Şık numarası (correctIndex / answerIndex / havuz `answer`): tam sayı ve şıkların içinde. */
export function isValidChoiceIndex(options: unknown, index: unknown): boolean {
  return (
    validOptions(options) &&
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < (options as string[]).length
  );
}

/** Metinle verilen doğru cevap(lar) (correctAnswer / correct): boş değil ve her biri şıklardan biri. */
export function hasChoiceAnswerKey(options: unknown, correct: unknown, input: { multi?: boolean } = {}): boolean {
  if (!validOptions(options)) return false;
  const values = (Array.isArray(correct) ? correct : [correct]).map(text);
  if (!values.length || values.some((value) => !value)) return false;
  if (!input.multi && values.length !== 1) return false;
  const set = new Set(options.map(text));
  return values.every((value) => set.has(value));
}

/** Yazılı denemenin taslak sorusu (`MockExamQuestionDraft`), türüne göre. */
export function mockDraftHasAnswerKey(draft: {
  type: string;
  text: string;
  options: string[];
  correctAnswers: string[];
  rubric?: readonly unknown[];
  modelAnswer?: string;
  numericExpected?: number | null;
}): boolean {
  if (!text(draft.text)) return false;
  const first = text(draft.correctAnswers?.[0]);
  switch (draft.type) {
    case "mcq":
      return hasChoiceAnswerKey(draft.options, draft.correctAnswers);
    case "multi_mcq":
      return hasChoiceAnswerKey(draft.options, draft.correctAnswers, { multi: true });
    case "true_false":
      return Boolean(first);
    case "numeric":
      return Boolean(first) || (typeof draft.numericExpected === "number" && Number.isFinite(draft.numericExpected));
    case "short_answer":
      return Boolean(first) || Boolean(text(draft.modelAnswer));
    case "open":
      return (draft.rubric?.length ?? 0) > 0 || Boolean(text(draft.modelAnswer));
    default:
      return false;
  }
}

/** Ders içi kontrol (bölüm sonu / ekran kontrolü), türüne göre. Anahtarla notlanmayan "kendi cümlelerinle" serbest. */
export function lessonCheckHasAnswerKey(check: {
  type: string;
  options?: readonly string[];
  answerIndex?: number;
  answer?: string;
}): boolean {
  switch (check.type) {
    case "mcq":
    case "findError":
      return isValidChoiceIndex(check.options, check.answerIndex);
    case "trueFalse":
      // Şıklar yazılmadıysa ekran Doğru/Yanlış çizer: anahtar 0 ya da 1.
      return check.options === undefined
        ? check.answerIndex === 0 || check.answerIndex === 1
        : isValidChoiceIndex(check.options, check.answerIndex);
    case "numerical":
      return Boolean(text(check.answer));
    default:
      return true;
  }
}

/** Anahtarı geçerli olanları tutar; atılanları sayıyla günlüğe yazar (sessiz kayıp olmasın). */
export function keepAnswerKeyed<T>(items: readonly T[], valid: (item: T) => boolean, site: string): T[] {
  const kept = items.filter(valid);
  const dropped = items.length - kept.length;
  if (dropped > 0) console.warn("question_dropped_no_answer_key", { site, dropped, kept: kept.length });
  return kept;
}
