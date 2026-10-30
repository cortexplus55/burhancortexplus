import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { optionKey } from "@/lib/learning/question-integrity";
import { SAME_KIND_DISTRACTOR_RULE } from "@/lib/learning/teaching-rubric";

/**
 * Hafif test doğrulayıcısı (30 Ekim 2026, ürün sahibinin kararı: "kod yamasıyla kalıp kovalamak yerine tek geçişli hafif
 * AI kalite kontrolü").
 *
 * 26 Ekim'den beri test tek geçişte yazılıyor (ağır denetçi soruları siliyor ve dakikalar sürüyordu). Canlıda model
 * uydurma terim ("Reeskont maliyeti"), kökün sorduğu türle uyumsuz şık ("hangi maliyet?" → faiz oranı) yazdı; her kalıbı
 * kodla yakalamak bitmiyordu. Taslaktan hemen sonra, kod denetimlerinden ve öğrenciye gösterilmeden ÖNCE tek bir hızlı
 * çağrı: uydurma terimi gerçeğiyle, türü uymayan şıkkı aynı türden çeldiriciyle değiştirir, soruyu kendisi çözüp
 * anahtarı kesinleştirir. SORU SİLMEZ, kökü değiştirmez, şık sayısını ve sırasını korur.
 *
 * Kod metin yazmaz: model değiştirdiği sorunun bütün alanlarını (şıklar, anahtar, şık açıklamaları, açıklama) yeniden
 * verir; eksik ya da tutarsız yama alınmaz, soru taslaktaki hâliyle kalır. Süre aşılırsa taslak olduğu gibi devam eder.
 */

/** Doğrulayıcının süre tavanı: aşılırsa taslak olduğu gibi kalır (öğrenci beklemesin). */
export const QUIZ_SANITY_TIMEOUT_MS = 9_000;
/** Doğrulayıcıya giden kaynağın üst sınırı (karakter): hızlı kalsın. */
export const QUIZ_SANITY_SOURCE_CHARS = 7_000;

export function quizSanitySystem(mode: "document" | "topic"): string {
  return (
    "Sen hızlı bir test editörü-denetçisisin. Yazılmış çoktan seçmeli soruları yalnız üç açıdan düzeltirsin. Soru " +
    "SİLMEZSİN, kökü DEĞİŞTİRMEZSİN, şık sayısını ve şıkların sırasını korursun.\n" +
    "1) UYDURMA TERİM: Bir şık alanında gerçekte olmayan bir terimse (" +
    (mode === "document" ? "KAYNAKTA ve ders kitaplarında" : "ders kitaplarında") +
    " geçmeyen; çoğu zaman başka türden bir kavramın sonuna tür adı eklenmiştir: 'Reeskont maliyeti', 'Politika faizi " +
    "maliyeti') onu sorulan türden GERÇEK bir terimle değiştir.\n" +
    "2) ŞIK TÜRÜ: Kök bir tür soruyorsa ('hangi maliyet', 'hangi evre', 'hangi organ', 'hangi mahkeme', 'kaç TL', " +
    "'yüzde kaç') her şık o türden olur; olmayanı aynı türden, öğrencinin gerçekten karıştırdığı bir çeldiriciyle " +
    "değiştir. Sayı soruluyorsa her şık aynı birimde bir sayıdır.\n" +
    "3) ANAHTAR: Soruyu önce anahtara bakmadan kendin çöz. Kesin olarak başka bir şık doğruysa anahtarı düzelt. Emin " +
    "değilsen anahtara dokunma.\n" +
    "Değiştirdiğin şık doğru cevap olmamalı, başka bir şıkla eşdeğer olmamalı: soruda tek doğru kalır (çok cevaplıda " +
    "anahtardaki şıklar). Kaynakta olmayan sayı, eşik ya da kural uydurma.\n" +
    `${SAME_KIND_DISTRACTOR_RULE}\n\n` +
    "Yalnız DEĞİŞTİRDİĞİN soruları döndür; her biri için bütün alanları yeniden yaz: options (aynı sayıda, aynı sırada), " +
    "correct (doğru şıkkın metni; çok cevaplıda metinler dizisi), optionWhy (her şık için bir cümle, aynı sırada: " +
    "doğru şıkta neden doğru, yanlış şıkta o şıkkın gerçekte ne olduğu), explanation (doğrunun nedeni; şıklara harfle ya " +
    "da sırayla gönderme yapma), why (neyi neden değiştirdin, tek kısa cümle). Değişiklik yoksa boş liste.\n" +
    'Yalnız JSON: {"patches":[{"index":0,"options":["..."],"correct":"...","optionWhy":["..."],"explanation":"...","why":"..."}]}'
  );
}

export function quizSanityUserPrompt(input: {
  mode: "document" | "topic";
  topicLabel: string;
  source: string;
  questions: readonly QuizQuestion[];
}): string {
  const source =
    input.mode === "document"
      ? `KAYNAK:\n${input.source.slice(0, QUIZ_SANITY_SOURCE_CHARS)}`
      : `KONU: ${input.topicLabel} (belge yok; konunun yerleşik ders kitabı bilgisi geçerli).`;
  const rows = input.questions.map((question, index) => ({
    index,
    text: question.text,
    options: question.options,
    correct: question.multi ? question.correct : (question.correct[0] ?? ""),
    multi: question.multi,
  }));
  return `KONU: ${input.topicLabel}\n\n${source}\n\nSORULAR:\n${JSON.stringify(rows)}`;
}

type Patch = {
  index?: unknown;
  options?: unknown;
  correct?: unknown;
  optionWhy?: unknown;
  explanation?: unknown;
  why?: unknown;
};

const textList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 400)
    ? (value as string[]).map((item) => item.trim())
    : null;

export type QuizSanityResult = {
  questions: QuizQuestion[];
  /** Alınan yama sayısı. */
  patched: number;
  /** Anahtarı değişen soru sayısı. */
  keyChanged: number;
  /** Geçersiz diye alınmayan yama sayısı. */
  rejected: number;
  /** Alınan yamaların kısa gerekçeleri (günlük için). */
  reasons: string[];
};

/**
 * Yamaları uygular (saf). Bir yama ancak bütün alanları tutarlıysa alınır: şık sayısı aynı, şıklar boş değil ve
 * birbirinden farklı, anahtar şıklardan biri (çok cevaplıda en az biri), şık açıklaması şık sayısı kadar, açıklama dolu.
 * Kök, konu, öğrenme hedefi ve öbür alanlar olduğu gibi kalır; anahtar değiştiyse eski çözüm adımları düşer (yeni
 * anahtarla çelişmesin). Soru sayısı ve sırası hiç değişmez.
 */
export function applyQuizSanity(questions: readonly QuizQuestion[], raw: unknown): QuizSanityResult {
  const out = [...questions];
  const patches = Array.isArray((raw as { patches?: unknown } | null)?.patches)
    ? ((raw as { patches: Patch[] }).patches ?? [])
    : [];
  let patched = 0;
  let keyChanged = 0;
  let rejected = 0;
  const reasons: string[] = [];
  const seen = new Set<number>();
  for (const entry of patches) {
    const patch: Patch = entry && typeof entry === "object" ? entry : {};
    const index = typeof patch.index === "number" && Number.isInteger(patch.index) ? patch.index : -1;
    const question = out[index];
    if (!question || seen.has(index)) {
      rejected += 1;
      continue;
    }
    const options = textList(patch.options);
    const why = textList(patch.optionWhy);
    const explanation = typeof patch.explanation === "string" ? patch.explanation.trim() : "";
    const correctRaw = Array.isArray(patch.correct) ? patch.correct : [patch.correct];
    const correct = correctRaw.filter((item): item is string => typeof item === "string").map((item) => item.trim());
    const valid =
      options !== null &&
      options.length === question.options.length &&
      new Set(options.map(optionKey)).size === options.length &&
      why !== null &&
      why.length === options.length &&
      explanation.length >= 10 &&
      correct.length >= 1 &&
      (question.multi || correct.length === 1) &&
      correct.every((answer) => options.includes(answer));
    if (!valid) {
      rejected += 1;
      continue;
    }
    seen.add(index);
    const oldKeys = question.correct.map((answer) => question.options.indexOf(answer)).sort().join(",");
    const newKeys = correct.map((answer) => options.indexOf(answer)).sort().join(",");
    const keyMoved = oldKeys !== newKeys;
    out[index] = {
      ...question,
      options,
      correct,
      optionWhy: why,
      explanation,
      optionReasons: undefined,
      ...(keyMoved ? { steps: undefined } : {}),
    };
    patched += 1;
    if (keyMoved) keyChanged += 1;
    if (typeof patch.why === "string" && patch.why.trim()) reasons.push(patch.why.trim().slice(0, 160));
  }
  return { questions: out, patched, keyChanged, rejected, reasons };
}

/**
 * Doğrulayıcıyı koşar: tek çağrı, süre tavanıyla. Çağrı düşer, süre aşılır ya da cevap okunamazsa taslak aynen döner.
 */
export async function runQuizSanity(
  ask: (system: string, user: string) => Promise<unknown | null>,
  input: { mode: "document" | "topic"; topicLabel: string; source: string; questions: readonly QuizQuestion[] },
  timeoutMs = QUIZ_SANITY_TIMEOUT_MS,
): Promise<QuizSanityResult & { ms: number; timedOut: boolean }> {
  const started = Date.now();
  const unchanged = { questions: [...input.questions], patched: 0, keyChanged: 0, rejected: 0, reasons: [] };
  if (!input.questions.length) return { ...unchanged, ms: 0, timedOut: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const answer = await Promise.race([
      ask(quizSanitySystem(input.mode), quizSanityUserPrompt(input)).catch(() => null),
      timeout,
    ]);
    if (answer === "timeout") return { ...unchanged, ms: Date.now() - started, timedOut: true };
    return { ...applyQuizSanity(input.questions, answer), ms: Date.now() - started, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
