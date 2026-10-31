import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { answerKey, normalizeQuizQuestion, sameOptionSet, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { duplicateOptionPair, singleAnswerIntegrityIssues } from "@/lib/learning/question-integrity";
import { shuffleOptions } from "@/lib/learning/teacher-quiz";

/**
 * "🔥 Anladığını Kanıtla: İkiz Soru" ve "🤔 İki şık arasında kaldım" (31 Ekim 2026, Paket J3 #12).
 *
 * İkiz soru: öğrenci konu testinde bir soruyu yanlış yapınca aynı kavramı aynı kalıpla yoklayan, yalnız sayıları ya da
 * öncülleri değişmiş TEK bir kardeş soru. Model yazar, kod yalnız denetler (şık sayısı aynı, tek doğru, aynı şık yok,
 * hesapla çelişen anahtar yok, ana soruyla aynı soru değil). Cevap anahtarı tarayıcıya gitmez: soruyla birlikte şifreli
 * bir belirteçte (AES-GCM) taşınır, cevap sunucuda notlanır. Doğru cevap +5 yıldız, ana sorunun yerine bir kez.
 *
 * İki şık ipucu: öğrenci cevabı kilitlemeden önce iki şık seçer; model yalnız ikisi arasındaki kavramsal farkı bir
 * cümleyle hatırlatır, hangisinin doğru olduğunu söylemez. Kod cevabı ele veren cümleyi geri çevirir; ipucu kullanılan
 * soru bağımsız başarı sayılmaz (`markHint`).
 */

export { TWIN_STARS, TWIN_BUTTON, TWO_OPTION_CHIP, TWO_OPTION_FALLBACK } from "@/lib/learning/twin-question-copy";
export const TWIN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

export const TWIN_SYSTEM =
  "Sen bir sınav öğretmenisin. Öğrenci aşağıdaki çoktan seçmeli soruyu yanlış yaptı. Aynı kavramı AYNI soru kalıbıyla " +
  "yoklayan TEK bir İKİZ soru yaz: yalnız sayıları, öncülleri, örnek durumu ya da özneleri değiştir; kavram, zorluk ve " +
  "soru türü aynı kalsın. Hesap sorusuysa yeni sayılarla sonucu yeniden hesapla ve doğru şıkkı buna göre koy. Ana " +
  "sorunun kökünü ya da doğru cevabını aynen tekrarlama. Şık sayısı ana soruyla AYNI; tek doğru (ana soru çok cevaplıysa " +
  "aynı sayıda doğru). Çeldiriciler öğrencinin gerçekten karıştırdığı, aynı türden seçenekler olsun. Kaynakta olmayan " +
  "eşik, tarih ya da kural uydurma; sayı kurguladıysan tutarlı olsun.\n" +
  'Yalnız JSON döndür: {"text": "soru kökü", "options": ["şık", ...], "correct": ["doğru şıkkın metni"], ' +
  '"explanation": "bir-iki cümle: neden bu şık doğru"}.';

export function twinUserPrompt(question: QuizQuestion): string {
  const letter = (index: number) => String.fromCharCode(65 + index);
  return [
    `Ana soru: ${question.text}`,
    "Şıklar:",
    ...question.options.map((option, index) => `${letter(index)}) ${option}`),
    `Doğru cevap: ${question.correct.join(" · ")}`,
    question.explanation ? `Açıklama: ${question.explanation}` : "",
    `Şık sayısı: ${question.options.length}${question.multi ? ` · çok cevaplı (${question.correct.length} doğru)` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Modelin ikiz sorusunu okur ve denetler; geçmezse null (öğrenciye "şu an hazırlanamadı" denir, kredi yok). */
export function readTwinQuestion(raw: unknown, original: QuizQuestion): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { text?: unknown; options?: unknown; correct?: unknown; explanation?: unknown };
  if (typeof data.text !== "string" || !Array.isArray(data.options)) return null;
  const correctRaw = Array.isArray(data.correct) ? data.correct : data.correct != null ? [data.correct] : [];
  const parsed = normalizeQuizQuestion({
    text: data.text,
    options: data.options.map((option) => String(option)),
    correct: correctRaw.map((item) => String(item)),
    multi: original.multi,
    explanation: typeof data.explanation === "string" ? data.explanation : undefined,
  });
  if (!parsed) return null;
  if (parsed.options.length !== original.options.length) return null;
  if (parsed.correct.length !== original.correct.length) return null;
  if (duplicateOptionPair(parsed.options)) return null;
  // Ana sorunun aynısı ikiz değildir.
  if (answerKey(parsed.text) === answerKey(original.text) && sameOptionSet(parsed.options, original.options)) return null;
  if (!parsed.multi) {
    const answerIndex = parsed.options.findIndex((option) => answerKey(option) === answerKey(parsed.correct[0]));
    const issues = singleAnswerIntegrityIssues({
      type: "mcq",
      prompt: parsed.text,
      options: parsed.options,
      answerIndex,
      explanation: parsed.explanation,
    });
    if (issues.length) return null;
  }
  // Model doğruyu çoğu zaman ilk şıkka yazıyor: soruya bağlı sabit sırayla karıştır.
  return shuffleOptions({ ...parsed, multi: original.multi });
}

// --- Şifreli belirteç: cevap anahtarı tarayıcıda okunmaz ---------------------------------------------------------

type TwinSeal = { a: string; i: number; c: string[]; x?: string; e: number };

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`twin-question:${secret}`).digest();
}

export function sealTwin(
  input: { attemptId: string; index: number; correct: string[]; explanation?: string },
  secret: string,
  now = Date.now(),
): string {
  const seal: TwinSeal = { a: input.attemptId, i: input.index, c: input.correct, e: now + TWIN_TOKEN_TTL_MS };
  if (input.explanation) seal.x = input.explanation.slice(0, 600);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(seal), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openTwin(token: string, secret: string, now = Date.now()): TwinSeal | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const seal = JSON.parse(text) as TwinSeal;
    if (typeof seal.a !== "string" || !Number.isInteger(seal.i) || !Array.isArray(seal.c) || !(seal.e > now)) return null;
    return seal;
  } catch {
    return null;
  }
}

// --- İki şık ipucu -----------------------------------------------------------------------------------------------

export const TWO_OPTION_SYSTEM =
  "Öğrenci bir çoktan seçmeli soruda iki şık arasında kaldı. Bu iki şık arasındaki KAVRAMSAL farkı hatırlatan TEK bir " +
  "kısa cümle yaz (en çok 30 kelime): iki kavramı ayıran ölçütü söyle. Hangi şıkkın doğru ya da yanlış olduğunu " +
  "SÖYLEME, ima etme; soruyu çözme, sonucu yazma. Sade Türkçe, öğrenciye 'sen' diye.\n" +
  'Yalnız JSON döndür: {"hint": "tek cümle"}.';

export function twoOptionUserPrompt(question: QuizQuestion, pair: [string, string]): string {
  return [`Soru: ${question.text}`, `Kaldığı iki şık: «${pair[0]}» ve «${pair[1]}»`].join("\n");
}

const GIVEAWAY =
  /(doğru\s+(cevap|yanıt|şık|seçenek)|yanlış\s+(olan|şık|seçenek)|cevap\s+(budur|şudur)|doğrusu|bu\s+yüzden\s+cevap|\bcevabı?\b)/i;

/** Modelin ipucunu okur; cevabı ele veren ya da uzun cümle geri çevrilir (null). */
export function readTwoOptionHint(raw: unknown, question: QuizQuestion, pair: [string, string]): string | null {
  if (!raw || typeof raw !== "object") return null;
  const hint = typeof (raw as { hint?: unknown }).hint === "string" ? (raw as { hint: string }).hint.replace(/\s+/g, " ").trim() : "";
  if (hint.length < 12 || hint.split(" ").length > 40) return null;
  if (GIVEAWAY.test(hint)) return null;
  // Yalnız doğru şıkkı adıyla anan (öbürünü anmayan) ipucu cevabı işaret eder.
  const fold = (text: string) => answerKey(text).toLocaleLowerCase("tr-TR");
  const text = fold(hint);
  const correct = pair.filter((option) => question.correct.some((answer) => answerKey(answer) === answerKey(option)));
  const wrong = pair.filter((option) => !correct.includes(option));
  if (correct.length === 1 && wrong.length === 1 && text.includes(fold(correct[0])) && !text.includes(fold(wrong[0]))) {
    return null;
  }
  return hint;
}

