import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { answerKey, normalizeQuizQuestion, sameOptionSet, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { duplicateOptionPair, singleAnswerIntegrityIssues } from "@/lib/learning/question-integrity";
import { shuffleOptions } from "@/lib/learning/teacher-quiz";
import { foldTr } from "@/lib/text/math-normalize";

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
  "eşik, tarih ya da kural uydurma; sayı kurguladıysan tutarlı olsun. Şık metinlerine harf (A), B) …) yazma.\n" +
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

/** Şık metninin başındaki harf etiketi ("A) ", "(b). ", "C- "). */
const OPTION_LETTER = /^\(?[A-Fa-f]\s*[).:\-–]\s+/;

/** Modelin ikiz sorusunu okur ve denetler; geçmezse null (öğrenciye "şu an hazırlanamadı" denir, kredi yok). */
export function readTwinQuestion(raw: unknown, original: QuizQuestion): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { text?: unknown; options?: unknown; correct?: unknown; explanation?: unknown };
  if (typeof data.text !== "string" || !Array.isArray(data.options)) return null;
  const correctRaw = Array.isArray(data.correct) ? data.correct : data.correct != null ? [data.correct] : [];
  // Model ana sorunun "A) …" biçimini kopyalayıp şık metnine harf yazabiliyor (31 Ekim 2026 canlı deneme: karışınca
  // ekranda "A · E) Terim C"). Bütün şıklar harfle başlıyorsa harf düşer; anahtar da aynı biçime çekilir.
  const rawOptions = data.options.map((option) => String(option).trim());
  const lettered = rawOptions.length > 0 && rawOptions.every((option) => OPTION_LETTER.test(option));
  const options = lettered ? rawOptions.map((option) => option.replace(OPTION_LETTER, "").trim()) : rawOptions;
  const correct = correctRaw.map((item) => {
    const value = String(item).trim();
    if (!lettered) return value;
    const bare = /^\(?([A-Fa-f])\)?\.?$/.exec(value);
    if (bare) return options[bare[1].toUpperCase().charCodeAt(0) - 65] ?? value;
    return value.replace(OPTION_LETTER, "").trim();
  });
  const parsed = normalizeQuizQuestion({
    text: data.text,
    options,
    correct,
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

/**
 * 6 Kasım 2026: canlıda ipucu seçilen iki şıkkı ayırmayan genel bir cümleydi ("tanımları karşılaştır"). Model artık
 * iki şıkkın metnini doğrudan karşılaştırır ve yalnız bu ikisini ayıran farkı adıyla söyler; kod her şıkkın ayırt
 * edici sözcüklerini (öbür şıkta kökü geçmeyen sözcükler) isteme koyar ve ipucunun en az birini andığını denetler.
 */
export const TWO_OPTION_SYSTEM =
  "Öğrenci bir çoktan seçmeli soruda iki şık arasında kaldı. İki şıkkın METNİNİ doğrudan karşılaştır ve yalnız BU İKİ " +
  "ŞIKKI birbirinden ayıran kritik farkı TEK kısa cümleyle söyle (en çok 30 kelime): iki şıkta farklı olan sözcüğü, " +
  "ölçütü ya da değeri adıyla an ve öğrenciye soru kökünde neye bakarak ayırt edeceğini göster. İki şıkkı eşit an; " +
  "birini öne çıkarma. Genel çalışma tavsiyesi (tanımları karşılaştır, dikkatli oku) yazma. Hangi şıkkın doğru ya da " +
  "yanlış olduğunu SÖYLEME, ima etme; soruyu çözme, sonucu yazma. Sade Türkçe, öğrenciye 'sen' diye.\n" +
  'Yalnız JSON döndür: {"hint": "tek cümle"}.';

/** İkinci deneme notu: önceki cevabın neden geri çevrildiği (cevap metni isteme girmez). */
export type TwoOptionRetry = "off_pair" | "giveaway";

export function twoOptionUserPrompt(question: QuizQuestion, pair: [string, string], retry?: TwoOptionRetry): string {
  const [onlyA, onlyB] = distinctiveWords(pair);
  const lines = [`Soru: ${question.text}`, `Şık 1: «${pair[0]}»`, `Şık 2: «${pair[1]}»`];
  if (onlyA.length || onlyB.length) {
    lines.push(
      `Yalnız Şık 1'de geçen sözcükler: ${onlyA.join(", ") || "(yok)"}`,
      `Yalnız Şık 2'de geçen sözcükler: ${onlyB.join(", ") || "(yok)"}`,
    );
  }
  if (retry === "off_pair") {
    lines.push("Önceki cevabın bu iki şıkkı birbirinden ayırmıyordu: iki şıkta farklı olan sözcükleri adıyla an.");
  }
  if (retry === "giveaway") {
    lines.push("Önceki cevabın hangi şıkkın doğru olduğunu ele veriyordu: iki şıkkı eşit an, sonucu söyleme.");
  }
  return lines.join("\n");
}

const GIVEAWAY =
  /(doğru\s+(cevap|yanıt|şık|seçenek|olan)|yanlış\s+(olan|şık|seçenek)|cevap\s+(budur|şudur)|doğrusu|bu\s+yüzden\s+cevap|\bcevabı?\b|(şık|seçenek)\S*\s+(doğrudur|yanlıştır))/i;

const HINT_STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "su", "olan", "icin", "gibi", "daha", "cok", "her", "hem", "veya", "ya", "da", "de",
  "ki", "en", "ise", "olarak", "olur", "eder", "yapar", "kadar", "sonra", "once", "degil", "yalniz", "sadece",
]);

/** Sözcük ve kökü: kök katlanmış yazımın ilk beş harfi (Türkçe ek farkı aynı köke iner); sayı olduğu gibi. */
function hintWords(text: string): { word: string; root: string }[] {
  const out: { word: string; root: string }[] = [];
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    const folded = foldTr(word).replace(/[^a-z0-9]/g, "");
    if (!folded) continue;
    const numeric = /^\d/.test(folded);
    if (!numeric && (folded.length < 3 || HINT_STOPWORDS.has(folded))) continue;
    out.push({ word, root: numeric ? folded : folded.slice(0, 5) });
  }
  return out;
}

const wordRoot = (word: string) => hintWords(word)[0]?.root ?? "";

/** Her şıkkın ayırt edici sözcükleri: kökü öbür şıkta geçmeyenler (yazıldığı gibi, tekrarsız). */
export function distinctiveWords(pair: readonly [string, string]): [string[], string[]] {
  const sameRoot = (left: string, right: string) =>
    /^\d/.test(left) || /^\d/.test(right) ? left === right : left.startsWith(right) || right.startsWith(left);
  const only = (text: string, other: string) => {
    const others = hintWords(other).map((entry) => entry.root);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const { word, root } of hintWords(text)) {
      if (others.some((entry) => sameRoot(entry, root)) || seen.has(root)) continue;
      seen.add(root);
      out.push(word);
    }
    return out;
  };
  return [only(pair[0], pair[1]), only(pair[1], pair[0])];
}

export type TwoOptionVerdict = { hint: string | null; problem: "unreadable" | TwoOptionRetry | null };

/**
 * Modelin ipucunu tartar. Geri çevrilir: okunamayan ya da uzun cümle; cevabı ele veren cümle (sözcükle ya da yalnız
 * doğru şıkkı anarak); iki şıkla ilgisiz cümle (hiçbir şıkkın ayırt edici sözcüğünü ya da iki şıkkı birden anmıyor).
 */
export function twoOptionHintVerdict(raw: unknown, question: QuizQuestion, pair: [string, string]): TwoOptionVerdict {
  if (!raw || typeof raw !== "object") return { hint: null, problem: "unreadable" };
  const hint = typeof (raw as { hint?: unknown }).hint === "string" ? (raw as { hint: string }).hint.replace(/\s+/g, " ").trim() : "";
  if (hint.length < 12 || hint.split(" ").length > 40) return { hint: null, problem: "unreadable" };
  if (GIVEAWAY.test(hint)) return { hint: null, problem: "giveaway" };
  const fold = (text: string) => answerKey(text).toLocaleLowerCase("tr-TR");
  const text = fold(hint);
  // İpucundaki sözcük şıkkın sözcüğünün kökünü taşıyorsa (ekli biçim) anılmış sayılır; sayı birebir.
  const hintTerms = hintWords(hint).map((entry) => foldTr(entry.word).replace(/[^a-z0-9]/g, ""));
  const touches = (words: readonly string[]) =>
    words.some((word) => {
      const root = wordRoot(word);
      if (!root) return false;
      return /^\d/.test(root) ? hintTerms.includes(root) : hintTerms.some((term) => term.startsWith(root));
    });
  const [onlyA, onlyB] = distinctiveWords(pair);
  const distinct = [onlyA, onlyB] as const;
  const correctAt = pair
    .map((option, index) => (question.correct.some((answer) => answerKey(answer) === answerKey(option)) ? index : -1))
    .filter((index) => index >= 0);
  // Yalnız doğru şıkkı anan (öbürünü anmayan) ipucu cevabı işaret eder: şıkkın tamamıyla ya da ayırt edici sözcüğüyle.
  if (correctAt.length === 1) {
    const right = correctAt[0]!;
    const wrong = 1 - right;
    const namesRight = text.includes(fold(pair[right])) || touches(distinct[right]);
    const namesWrong = text.includes(fold(pair[wrong])) || touches(distinct[wrong]);
    if (namesRight && !namesWrong && (distinct[wrong].length > 0 || text.includes(fold(pair[right])))) {
      return { hint: null, problem: "giveaway" };
    }
  }
  const both = text.includes(fold(pair[0])) && text.includes(fold(pair[1]));
  const anyDistinct = onlyA.length > 0 || onlyB.length > 0;
  if (!both && anyDistinct && !touches(onlyA) && !touches(onlyB)) return { hint: null, problem: "off_pair" };
  return { hint, problem: null };
}

/** Modelin ipucunu okur; geri çevrilen cümle null. */
export function readTwoOptionHint(raw: unknown, question: QuizQuestion, pair: [string, string]): string | null {
  return twoOptionHintVerdict(raw, question, pair).hint;
}

/**
 * Model iki denemede de geçerli ipucu vermezse iki şıkkı eşit anan kod cümlesi (genel "tanımları karşılaştır"
 * yerine): her şıkkın ayırt edici sözcüğü adıyla. Ayırt edici sözcük yoksa genel yönlendirme.
 */
export function twoOptionFallback(pair: readonly [string, string]): string | null {
  const [onlyA, onlyB] = distinctiveWords(pair);
  if (!onlyA.length || !onlyB.length) return null;
  const a = onlyA.slice(0, 2).join(", ");
  const b = onlyB.slice(0, 2).join(", ");
  return `İki şıkkı ayıran fark şurada: birinde «${a}», öbüründe «${b}» geçiyor. Soru kökü bu ikisinden hangisini gerektiriyor, ona bak.`;
}

