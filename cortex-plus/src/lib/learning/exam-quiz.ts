import { z } from "zod";
import { stripListMarker } from "@/lib/text/list-marker";

export type QuizQuestion = {
  text: string;
  options: string[];
  correct: string[];
  multi: boolean;
  explanation?: string;
  /** Stage 5 teaching standard — clear per-item objective. */
  learningObjective?: string;
  /** Stage 5/6 — dominant misconception this item targets. */
  misconceptionTag?: string;
  /** Yanlış şık → o şıkka özgü hata gerekçesi (tekrar eden şablon yasak). */
  optionReasons?: Record<string, string>;
  /** Aynı üretim çağrısında, her şık için bir cümle. */
  optionWhy?: string[];
  /**
   * Çok adımlı hesapta çözüm adımları (2–5). Derste işlem adımları numaralı
   * liste olarak duruyor; quizde aynı hesap tek cümleye sıkışıyordu
   * ("n = 8/16 = 0,5 mol, dolayısıyla …"). Doğrulayıcı sayıları denetler ve
   * son adımın doğru şıkka vardığını kontrol eder; tutmazsa adımlar düşer.
   */
  steps?: string[];
  /** Hazırlıktaki konu adı. Bilinmeyen ad sınav sonunda gösterilmez. */
  topic?: string;
  /**
   * Konu testinde sorunun yokladığı "Sınavda sorulur" maddesi (numarası) ya da kaynak bölümü
   * (20 Ekim 2026). Kapsam denetimi okur; öğrenciye gitmez (`publicQuizQuestion` almaz).
   */
  point?: string;
  /** İkinci çözücü bunu görür. Öğrenciye gitmez. */
  needsSolver?: boolean;
  /**
   * Öğrencinin bildirdiği ve denetimde hatalı bulunan soru (31 Ekim 2026, Paket J2 #10): cevaptan bağımsız tam puan,
   * kanıt yazmaz. Anahtar düzeltildiyse `keyFixed`; `voidNote` denetçinin öğrenciye açıklaması.
   */
  voided?: boolean;
  keyFixed?: boolean;
  voidNote?: string;
};

export type PublicQuizQuestion = {
  text: string;
  options: string[];
  multi: boolean;
  correct?: string[];
  explanation?: string;
  optionWhy?: string[];
  steps?: string[];
  misconceptionTag?: string;
  voided?: boolean;
  keyFixed?: boolean;
  voidNote?: string;
};

const correctValueSchema = z.union([z.string(), z.number()]);

export const quizQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correct: z.union([correctValueSchema, z.array(correctValueSchema).min(1)]),
  multi: z.boolean().optional(),
  explanation: z.string().optional(),
  learningObjective: z.string().min(8).max(200).optional().catch(undefined),
  misconceptionTag: z.string().min(2).max(80).optional().catch(undefined),
  optionReasons: z.record(z.string(), z.string().min(8).max(400)).optional(),
  // Zod strips undeclared keys. Without this field the generated per-option
  // explanations vanished before the verifier, so every quiz was rejected.
  optionWhy: z.array(z.string().min(8).max(400)).min(2).max(6).optional(),
  // Bozuk adımlar soruyu düşürmez; yalnızca adımlar gösterilmez.
  steps: z.array(z.string()).max(8).optional().catch(undefined),
  topic: z.string().min(2).max(80).optional(),
});

function stripChoicePrefix(text: string) {
  return text.replace(/^[A-Ea-e][).:\-]\s*/, "").trim();
}

function resolveCorrects(options: string[], raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const resolved: string[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value)) {
      const byIndex = options[value] ?? options[value - 1];
      if (byIndex) resolved.push(byIndex);
      continue;
    }
    const text = String(value ?? "").trim();
    if (!text) continue;
    if (options.includes(text)) {
      resolved.push(text);
      continue;
    }
    const stripped = stripChoicePrefix(text);
    const byText = options.find(
      (option) => option === stripped || stripChoicePrefix(option) === stripped,
    );
    if (byText) {
      resolved.push(byText);
      continue;
    }
    const letter = text.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (letter.length === 1) {
      const option = options[letter.charCodeAt(0) - 65];
      if (option) resolved.push(option);
      continue;
    }
    const num = Number(text);
    if (Number.isInteger(num)) {
      const option = options[num] ?? options[num - 1];
      if (option) resolved.push(option);
    }
  }
  return [...new Set(resolved)];
}

type RawQuizQuestion = {
  text: string;
  options: string[];
  correct: string | number | (string | number)[] | string[] | number[];
  multi?: boolean;
  explanation?: string;
  learningObjective?: string;
  misconceptionTag?: string;
  optionReasons?: Record<string, string>;
  optionWhy?: string[];
  steps?: string[];
  topic?: string;
  point?: string;
  voided?: boolean;
  keyFixed?: boolean;
  voidNote?: string;
};

/** Kayıtlı ya da gelen soruyu okur: birden çok doğru işaretliyse soru çok cevaplı sayılır (eski kayıtlar böyle). */
export function normalizeQuizQuestion(raw: RawQuizQuestion): QuizQuestion | null {
  return normalizeQuizRow(raw, true);
}

/**
 * Yeni üretilen soru (`parseTeacherQuiz`). Model soruyu açıkça tek cevaplı bildirip (`multi: false`) iki doğru
 * işaretlediyse soru tek cevaplı kalır; sessizce çok cevaplıya dönmez, yapı denetimi onu yakalar (30 Ekim 2026,
 * Paket I #6). Model hiçbir şey bildirmediyse eski davranış: çok cevaplı sayılır, kökle uyumuna yapı denetimi bakar.
 */
export function normalizeGeneratedQuizQuestion(raw: RawQuizQuestion, declaredMulti: boolean | undefined): QuizQuestion | null {
  return normalizeQuizRow({ ...raw, multi: declaredMulti === true }, declaredMulti !== false);
}

function normalizeQuizRow(raw: RawQuizQuestion, multiFromKey: boolean): QuizQuestion | null {
  const options = [...new Set(raw.options.map((item) => item.trim()).filter(Boolean))];
  const corrects = resolveCorrects(options, raw.correct);
  if (!raw.text.trim() || options.length < 2 || !corrects.length) return null;
  const optionReasons = raw.optionReasons
    ? Object.fromEntries(
        Object.entries(raw.optionReasons)
          .map(([key, value]) => [key.trim(), String(value).trim()] as const)
          .filter(([, value]) => value.length >= 8),
      )
    : undefined;
  return {
    text: raw.text.trim(),
    options,
    correct: corrects,
    multi: raw.multi === true || (multiFromKey && corrects.length > 1),
    explanation: raw.explanation?.trim() || undefined,
    learningObjective: raw.learningObjective?.trim() || undefined,
    misconceptionTag: raw.misconceptionTag?.trim() || undefined,
    optionReasons:
      optionReasons && Object.keys(optionReasons).length ? optionReasons : undefined,
    optionWhy: Array.isArray(raw.optionWhy)
      ? raw.optionWhy.map((line) => line.trim()).filter((line) => line.length >= 8)
      : undefined,
    steps: normalizeSteps(raw.steps),
    topic: raw.topic?.trim() || undefined,
    point: raw.point?.trim().slice(0, 80) || undefined,
    ...(raw.voided === true
      ? { voided: true, keyFixed: raw.keyFixed === true || undefined, voidNote: raw.voidNote?.trim() || undefined }
      : {}),
  };
}

/** 2–5 kısa adım; "1)" gibi numara önekleri atılır (liste zaten numaralı). */
export function normalizeSteps(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps = raw
    .filter((line): line is string => typeof line === "string")
    .map((line) => stripListMarker(line).trim())
    .filter((line) => line.length >= 4 && line.length <= 220);
  return steps.length >= 2 ? steps.slice(0, 5) : undefined;
}

/** Yazılı deneme sırasında istemciye giden soru. Doğru şık ve açıklama yok. */
export function sealedQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  return {
    text: question.text,
    options: question.options,
    multi: question.multi,
  };
}

export function publicQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  return {
    text: question.text,
    options: question.options,
    multi: question.multi,
    correct: question.correct,
    explanation: question.explanation,
    optionWhy: question.optionWhy,
    steps: question.steps,
    misconceptionTag: question.misconceptionTag,
    ...(question.voided ? { voided: true, keyFixed: question.keyFixed, voidNote: question.voidNote } : {}),
  };
}

export function selectedOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

/**
 * Şık karşılaştırma anahtarı (30 Ekim 2026, Paket I #7): boşluk ve Unicode biçimi farkı yok sayılır.
 * Sunucu kayıtlı soruyu okurken şıkları kırpıyor (`normalizeQuizQuestion`), istemci ham şıkla cevap
 * gönderiyordu: sonunda boşluk olan şıkta ekran "Doğru" derken not yanlış sayıyordu (7 işaret, 6/8).
 */
export function answerKey(value: string): string {
  return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

export function sameOptionSet(left: string[], right: string[]) {
  const a = [...new Set(left.map(answerKey))].sort();
  const b = [...new Set(right.map(answerKey))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Çok cevaplı soruda kısmi doğruluk yüzdesi: (doğru seçilen − yanlış seçilen) / doğru sayısı,
 * sıfırın altına inmez. Yazılı denemenin `multiMcqPoints` kuralıyla aynı.
 */
export function multiPartialPercent(selected: string[], correct: string[]): number {
  const want = new Set(correct.map(answerKey));
  if (!want.size) return 0;
  let hit = 0;
  let miss = 0;
  for (const pick of new Set(selected.map(answerKey))) {
    if (want.has(pick)) hit += 1;
    else miss += 1;
  }
  return Math.round(Math.max(0, (hit - miss) / want.size) * 100);
}

export function scoreQuizAnswers(
  questions: QuizQuestion[],
  answers: Record<string, unknown>,
) {
  let score = 0;
  questions.forEach((question, index) => {
    // Bildirilip hatalı bulunan soru herkese tam puan (Paket J2 #10).
    if (question.voided || sameOptionSet(selectedOptions(answers[String(index)]), question.correct)) {
      score += 1;
    }
  });
  return { score, total: questions.length || 1 };
}
