/**
 * Sözlü soru ve not — üretimde anlamsız prompt'u eler, notta rubriği
 * kaynak cümlesi yok diye sıfırlamaz, hata/çözüm alanına soru metnini yazmaz.
 */

import { contentStems, stemsOverlap } from "@/lib/learning/learner-fluency";
import { isUnsupportedComparativeAbsolute } from "@/lib/learning/absolute-claims";

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Karşılaştırmalı rol: sınırlayıcı, artan madde, hangisi tükenir, hangisi baskın. */
const COMPARATIVE_ROLE =
  /(sınırlayıcı|sinirlayici|artan\s+madde|hangisi\s+tüken|hangisi\s+tuken|hangi\s+(?:bileşen|bilesen|reaktan|madde|kuvvet|taraf)|baskın\s+olan|baskin\s+olan)/i;

/** İki taraf ya da bir denklem: + / → / vs / X ile Y / iki … */
const TWO_SIDES =
  /[+\u2192→]|vs\.?|versus|(^|[^a-zçğıöşü0-9])iki([^a-zçğıöşü0-9]|$)|(\S{1,24}\s+(?:ile|ve)\s+\S{1,24})/i;

/** Düz tanım sorusu: "Sınırlayıcı bileşen nedir?" terimi tanımlar, iki tarafı karşılaştırmaz. */
const DEFINITIONAL_ASK = /(nedir|ne demektir)\s*\?*\s*$/i;

/**
 * Karşılaştırmalı rol soruluyorsa en az iki taraf veya denklem gerekir.
 * Tek madde ("CO₂ tepkimesinde sınırlayıcı") düşer; kimyaya özel yama yok.
 * Düz tanım sorusu ("Sınırlayıcı bileşen nedir?") muaf: terimin kendisini
 * soruyor, iki reaktifi karşılaştırmıyor.
 */
export function verifyOralPrompt(prompt: string): string[] {
  const issues: string[] = [];
  const text = prompt.trim();
  if (text.length < 8) {
    issues.push("Soru kısa.");
    return issues;
  }
  // Tek madde + sınırlayıcı/artan rol: tepkime/denklem veya ikinci taraf yoksa anlamsız.
  if (COMPARATIVE_ROLE.test(text) && !TWO_SIDES.test(text) && !DEFINITIONAL_ASK.test(text)) {
    issues.push(
      "Karşılaştırmalı rol için en az iki taraf veya bir denklem gerekli.",
    );
  }
  return issues;
}

/**
 * Metin sorunun kendisi, içinden alınmış kırpığı veya kısa önek düşmüş hali mi?
 * "1 mol H₂O kaç gramdır?" → "mol H₂O kaç gramdır?" yankı sayılır.
 */
export function isPromptEcho(candidate: string, prompt: string): boolean {
  const a = fold(candidate);
  const b = fold(prompt);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 12 && (b.includes(a) || a.includes(b))) return true;

  // Kısa önek kırpığı: aday, sorunun sonundan başlayan bir parça.
  const promptWords = b.split(" ").filter(Boolean);
  const candWords = a.split(" ").filter(Boolean);
  if (candWords.length >= 3 && promptWords.length > candWords.length) {
    const tail = promptWords.slice(-candWords.length).join(" ");
    if (tail === a) return true;
    // Baştan 1–3 kelime düşmüş: "1 mol H2O kaç gramdır?" → "mol H2O kaç gramdır?"
    for (let drop = 1; drop <= 3; drop += 1) {
      if (promptWords.length - drop < 3) break;
      const stripped = promptWords.slice(drop).join(" ");
      if (stripped === a) return true;
    }
  }
  return false;
}

const NO_VERIFIED_SOLUTION =
  /doğrulanmış\s+(bir\s+)?çözüm|kaynakta\s+bu\s+soru\s+için|verified\s+solution/i;

/**
 * Hatanız / Eksik alanı: yalnızca cevaptaki gerçek eksik.
 * Soru metni, kırpığı veya "doğrulanmış çözüm yok" gerekçesi boşaltılır.
 */
export function sanitizeGap(
  gap: string | null | undefined,
  prompt: string,
): string | null {
  const raw = (gap ?? "").trim();
  if (!raw) return null;
  if (NO_VERIFIED_SOLUTION.test(raw)) return null;
  if (isPromptEcho(raw, prompt)) return null;
  // "Hatanız şuradaydı: <soru>" kalıbı
  const afterColon = raw.replace(/^[^:]{0,40}:\s*/u, "").trim();
  if (afterColon && isPromptEcho(afterColon, prompt)) return null;
  return raw;
}

/**
 * Çözüm kutusu: yankı veya kırpık çözüm gösterme; rubrik noktalarını birleştir.
 */
export function displaySolution(
  solution: string | null | undefined,
  prompt: string,
  expectedPoints?: string[] | null,
): string | null {
  const fromPoints = (expectedPoints ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
  const candidate = (solution ?? "").trim() || fromPoints;
  if (!candidate) return null;
  if (isPromptEcho(candidate, prompt)) return null;
  return candidate;
}

export type OralGradeItem = {
  index: number;
  correct: boolean;
  gap?: string | null;
};

export type OralQuestionForGrade = {
  prompt: string;
  expectedPoints?: string[];
  learningObjective?: string;
};

/**
 * Öğrenci cevabı beklenen noktaların köklerini karşılıyor mu?
 * Kaynaksız mutlak karşılaştırmalı iddia (yalnızca bir sınırlayıcı, hepsi tükenir)
 * doğru sayılmaz.
 */
export function answerCoversExpectedPoints(
  answer: string,
  expectedPoints: string[],
): boolean {
  const answerText = answer.trim();
  if (!answerText || answerText.length < 8) return false;
  if (isUnsupportedComparativeAbsolute(answerText)) return false;

  const usable = expectedPoints
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isUnsupportedComparativeAbsolute(p));
  if (!usable.length) {
    // Rubrik yoksa uzun, somut bir cevap model hükmüne bırakılır; burada
    // yalnızca mutlak iddia engeli uygulanır.
    return answerText.length >= 40;
  }

  const answerStems = contentStems(answerText);
  let hits = 0;
  for (const point of usable) {
    const pointStems = contentStems(point);
    if (!pointStems.length) continue;
    const shared = pointStems.filter((stem) =>
      stemsOverlap([stem], answerStems),
    );
    if (shared.length >= Math.min(2, pointStems.length)) hits += 1;
  }
  const need = Math.max(1, Math.ceil(usable.length * 0.5));
  return hits >= need;
}

/**
 * Model hükmünü rubrikle uzlaştırır. Kaynakta hazır çözüm cümlesi olmaması
 * tek başına 0 gerekçesi değildir.
 */
export function reconcileOralGrade(input: {
  questions: OralQuestionForGrade[];
  answers: Record<string, unknown>;
  modelItems?: OralGradeItem[] | null;
  modelCorrectCount?: number | null;
}): {
  correctIndices: number[];
  correctCount: number;
  total: number;
  items: { index: number; correct: boolean; gap: string | null }[];
} {
  const total = input.questions.length || 1;
  const items: { index: number; correct: boolean; gap: string | null }[] = [];
  const modelByIndex = new Map(
    (input.modelItems ?? []).map((item) => [item.index, item]),
  );

  input.questions.forEach((question, index) => {
    const answer = String(input.answers[String(index)] ?? "");
    const model = modelByIndex.get(index);
    const covers = answerCoversExpectedPoints(
      answer,
      question.expectedPoints ?? [],
    );
    let correct = Boolean(model?.correct);
    if (covers) correct = true;
    // Model "doğrulanmış çözüm yok" diye eksik yazdıysa ve cevap rubriği
    // tutuyorsa zaten doğru; tutmuyorsa gap temizlensin.
    const rawGap = model?.gap ?? null;
    const gap = correct ? null : sanitizeGap(rawGap, question.prompt);
    // Gap yalnızca soru metniyse ve cevap boş değilse, modelin gerekçesini
    // yok say; yine de covers false ise yanlış kalır.
    items.push({ index, correct, gap });
  });

  // Model yalnızca sayı verdiyse ve madde listesi yoksa: rubrik örtüşmesi
  // olanları doğru say, kalanları model sayısına göre doldurma (ilk N yasağı).
  if (!input.modelItems?.length && typeof input.modelCorrectCount === "number") {
    // Rubrik tutanlar zaten doğru. Model sayısından fazla doğru üretme yok;
    // rubrik tutmayanlar yanlış kalır (ilk N'ye güvenme).
    void input.modelCorrectCount;
  }

  const correctIndices = items.filter((i) => i.correct).map((i) => i.index);
  return {
    correctIndices,
    correctCount: correctIndices.length,
    total,
    items,
  };
}

/** Yüzde skoru — uzlaşmış doğru / toplam. */
export function oralPercentScore(correctCount: number, total: number): number {
  const t = Math.max(1, total);
  return Math.round((Math.min(correctCount, t) / t) * 100);
}
