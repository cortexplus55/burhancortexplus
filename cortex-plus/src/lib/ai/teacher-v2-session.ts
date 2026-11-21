import { wordCount } from "@/lib/ai/teacher-v2";
import {
  answerFirstLine,
  asksDirectAnswer,
  hasOwnSolution,
  looksLikeQuestion,
  STUCK_POINT_RULE,
} from "@/lib/learning/tutor-answer";
import {
  parseTutorStyle,
  STEP_CONTINUE_WORD,
  TEACH_MODE_SUMMARY,
  TEACH_MODE_TUTOR,
  type TeachModeV2,
  type TutorStyle,
} from "@/lib/learning/tutor-style";
import { asksNewExercise, followUpKind, looksLikeProblem, type TurnHistoryItem, type TurnPlan } from "@/lib/learning/tutor-turn";
import { parseQuickCheck, QUICK_CHECK_RULE } from "@/lib/teacher/quick-check";
import {
  PRIVATE_TUTOR_PACING,
  QUICK_SUMMARY_RULE,
  QUICK_SUMMARY_TURN_LINE,
  TUTOR_FIRST_PROBLEM_LINE,
  TUTOR_REVEAL_LINE,
  tutorLadderLine,
  wantsReveal,
} from "@/lib/teacher/tutor-pacing";

/*
  Faz 13B · ÖĞRETMEN HİSSİ (teacher.v2), 15 Kasım 2026. Kaynak: docs/ogretmen-hissi/PROMPT.md §4 B, C, D.

  B · Süreklilik: seansın durumu konuşma geçmişinden okunur (öğretmenin sorduğu sorular, öğrencinin son cevabı, aynı
      sorudaki deneme sayısı). Aynı soru aynı seansta tekrar sorulmaz; her tur öncekine bağlanır.
  C · İpucu merdiveni: yeni soruda cevap ilk turda verilmez; yanlış cevapta önce teşhis SORU olarak sorulur ("nasıl
      buldun?"), ikinci denemede doğru yol gösterilir. "Çöz / cevabı söyle / cevabı göster" merdiveni hemen atlar.
  D · "Rehberli" varsayılan stil (A-C kuralları); Adım Adım kavram sorusunda da gerçek adım modu (1. adım + Devam et).

  Hepsi modelsiz ve saf; yalnız ana sohbette ve yalnız bayrak açıkken çağrılır. Kod cevaba cümle yazmaz: satırlar
  modele o turun kuralını söyler, ölçüler günlüğe gider. Genel Türkçe sohbet sözcükleri dışında ders ya da konu sözcüğü yok.

  "Rehberli" (`guided`) profil sütununa yazılmaz (`profiles.tutor_style` CHECK'i üç değer kabul ediyor; göç yok):
  seçim tarayıcıda durur, istekte gelir; sunucu onu yalnız bayrak açıkken tanır.
*/

export const GUIDED_STYLE = "guided" as const;
/**
 * Faz 11 (21 Kasım 2026): bayrak açıkken ana sohbet iki moddan biriyle çalışır (`TeachModeV2`: Adım Adım Öğret, Hızlı
 * Özet; `resolveTeachModeV2`). Eski dört stil (Rehberli dahil) bu dosyanın saf işlevlerinde duruyor; sohbet ucu onları
 * artık bayrak açıkken seçmez.
 */
export type TeachStyle = TutorStyle | typeof GUIDED_STYLE | TeachModeV2;

const isTutorMode = (style: TeachStyle): boolean => style === TEACH_MODE_TUTOR;
const isSummaryMode = (style: TeachStyle): boolean => style === TEACH_MODE_SUMMARY;

/**
 * İstekteki stil. "guided" yalnız bayrak açıkken Rehberli olur (altındaki makine Sokratik'in cevabı saklayan
 * kurallarını kullanır); bayrak kapalıyken eski sekmeden gelse de profilin stili geçerli, yani bugünkü davranış.
 */
export function resolveTeachStyle(input: {
  requested: unknown;
  profile: unknown;
  teacherV2: boolean;
}): { style: TeachStyle; base: TutorStyle } {
  if (input.requested === GUIDED_STYLE) {
    if (input.teacherV2) return { style: GUIDED_STYLE, base: "hints_first" };
    const base = parseTutorStyle(input.profile);
    return { style: base, base };
  }
  const base = parseTutorStyle(input.requested ?? input.profile);
  return { style: base, base };
}

const textOf = (content: unknown) => (typeof content === "string" ? content : "");

/**
 * Öğretmen mesajındaki sorular: kutular (">" satırları) ve $$formül$$ dışındaki düz metinde "?" ile biten cümleler.
 * Faz 11: mini yoklamanın sorusu ("> ❓ Yoklama: …") kutu içinde olsa da öğretmenin sorusudur (en sona eklenir), böylece
 * öğrencinin şık cevabı cevap merdiveninde deneme sayılır.
 */
export function tutorQuestions(text: string): string[] {
  const plain = textOf(text)
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  const questions = plain
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((sentence) => sentence.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 4 && /\?\s*$/.test(sentence));
  const check = parseQuickCheck(textOf(text));
  return check ? [...questions, check.question] : questions;
}

/** Soru karşılaştırması için yalın biçim: küçük harf, harf ve rakam dışı boşluk. */
export function normalizeQuestion(question: string): string {
  return question
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameQuestion(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const left = new Set(a.split(" "));
  const right = new Set(b.split(" "));
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared) >= 0.8;
}

/** Cevaptaki soru bu seansta daha önce sorulmuş biriyle aynı mı (ölçü; PROMPT §9 "tekrar edilen soru oranı"). */
export function repeatsAskedQuestion(reply: string, asked: readonly string[]): boolean {
  const before = asked.map(normalizeQuestion);
  return tutorQuestions(reply)
    .map(normalizeQuestion)
    .some((question) => before.some((previous) => sameQuestion(question, previous)));
}

/** Öğretmenin bir önceki cevabı onaylayarak açtığı mesaj: aynı sorudaki deneme zinciri orada biter. */
const CONFIRMATION = /^[\s*_>]*(?:doğru(?!\s+değil)|evet|tam isabet|aynen|harika|bravo|süper|çok iyi|mükemmel|kesinlikle)/iu;

/** Bir cevap denemesi kısadır: soruya verilen cevap tek satırlık bir sonuç, şık ya da kısa bir açıklamadır. */
const ANSWER_MAX_WORDS = 25;

/** Öğrencinin mesajı öğretmenin son sorusuna verilmiş bir cevap mı. */
export function isAnswerTo(userText: string, tutorText: string): boolean {
  const text = textOf(userText).trim();
  if (!text || !tutorQuestions(tutorText).length) return false;
  if (followUpKind(text) || asksNewExercise(text) || asksDirectAnswer(text)) return false;
  // Şıklarıyla gelen yeni bir soru cevap değildir.
  if ((text.match(/(?:^|[\s\n])[A-E][).:]/g) ?? []).length >= 2) return false;
  return wordCount(text) <= ANSWER_MAX_WORDS;
}

export type TutorSession = {
  /** Öğretmenin bu seansta sorduğu sorular (en yeni 5, tekrarsız). */
  asked: string[];
  /** Öğretmenin son mesajındaki son soru. */
  lastQuestion: string | null;
  /** Bu mesaj öğretmenin son sorusuna bir cevap denemesi. */
  answering: boolean;
  /** Aynı sorudaki deneme sırası (1'den başlar); cevap değilse 0. */
  attempt: number;
};

export function readTutorSession(history: readonly TurnHistoryItem[], message: string): TutorSession {
  const seen = new Set<string>();
  const asked: string[] = [];
  for (let index = history.length - 1; index >= 0 && asked.length < 5; index -= 1) {
    const item = history[index]!;
    if (item.role !== "assistant") continue;
    for (const question of tutorQuestions(textOf(item.content)).reverse()) {
      const key = normalizeQuestion(question);
      if (!key || seen.has(key) || asked.length >= 5) continue;
      seen.add(key);
      asked.unshift(question);
    }
  }
  const last = history[history.length - 1];
  const lastTutor = last?.role === "assistant" ? textOf(last.content) : "";
  const lastQuestion = lastTutor ? tutorQuestions(lastTutor).at(-1) ?? null : null;
  const answering = Boolean(lastTutor) && isAnswerTo(message, lastTutor);
  let attempt = 0;
  if (answering) {
    attempt = 1;
    // Geriye doğru: öğretmen onaylamadıkça, her "öğretmen sorusu → öğrenci cevabı" çifti aynı zincirdeki bir deneme.
    for (let index = history.length - 1; index >= 2 && attempt < 5; index -= 2) {
      const tutor = history[index]!;
      const student = history[index - 1]!;
      const asking = history[index - 2]!;
      if (tutor.role !== "assistant" || student.role !== "user" || asking.role !== "assistant") break;
      if (CONFIRMATION.test(textOf(tutor.content))) break;
      if (!isAnswerTo(textOf(student.content), textOf(asking.content))) break;
      attempt += 1;
    }
  }
  return { asked, lastQuestion, answering, attempt };
}

/** Cevap denemesi yeni bir problem sayılmaz (ör. kesirli bir sonuç işlem gibi görünür): adım satırı açılmaz. */
export function answerTurnPlan(plan: TurnPlan): TurnPlan {
  return { ...plan, problem: false, pacedStep: null };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const SESSION_HEAD = "SEANS SÜREKLİLİĞİ (bu konuşma, kesin): ";

export function continuityLine(session: TutorSession): string {
  if (!session.asked.length) return "";
  const list = session.asked.map((question) => `«${clip(question, 140)}»`).join(" · ");
  return (
    `${SESSION_HEAD}Bu seansta öğrenciye şunları sordun: ${list}. Bunları ya da aynı şeyi yoklayan benzerini TEKRAR ` +
    "SORMA; yoklaman gerekiyorsa başka bir yönden ya da başka sayılarla sor. Her turu bir öncekine bağla: öğrencinin son " +
    "söylediğini tek cümleyle an (\"az önce … demiştin\" gibi), konuşmayı baştan başlatma."
  );
}

const LADDER_HEAD = "CEVAP MERDİVENİ — BU TUR (kesin; 'ilk cümle tam cevap' ve 'doğrusunu ver' kurallarından önce gelir): ";

/** Öğrencinin cevap denemesi: ilk yanlışta teşhis sorusu, ikinci yanlışta doğru yol. */
export function ladderLine(attempt: number, question: string | null): string {
  const target = question
    ? `Öğrencinin mesajı senin son soruna («${clip(question, 160)}») bir cevap denemesi gibi görünüyor`
    : "Öğrenci kendi çözümünü ya da cevabını yazdı";
  if (attempt <= 1) {
    return (
      `${LADDER_HEAD}${target} (1. deneme). Doğruysa: kısa onayla ve neden doğru olduğunu tek cümleyle söyle; konuyu ` +
      "kapatıyorsan \"> ✅ Akılda kalsın:\" kutusu kullanabilirsin. Yanlışsa: doğru cevabı, doğru şıkkı ya da sonucu bu " +
      "mesajda SÖYLEME ve düzeltme yapma; önce öğrencinin bu sonuca nasıl ulaştığını tek bir SORUYLA sor ve olası hatayı o " +
      "sorunun içinde adıyla tahmin et (\"şunu mu yaptın?\" biçiminde). Suçlama ve şablon moral cümlesi yok; mesaj o teşhis " +
      "sorusuyla biter. Mesaj aslında bir cevap değilse (yeni soru, sohbet) bu satırı yok say."
    );
  }
  return (
    `${LADDER_HEAD}${target} (aynı soruda ${attempt}. deneme). Doğruysa: kısa onayla, nedenini tek cümleyle söyle. ` +
    "Yanlışsa ya da öğrenci yöntemini açıkladıysa: artık bekletme; hatayı adıyla tek cümleyle göster, doğru yolu kısa " +
    "adımlarla ver ve doğru cevabı söyle; sonra farklı sayılarla tek bir benzer mini soru sor. Mesaj aslında bir cevap " +
    "değilse bu satırı yok say."
  );
}

export const FIRST_TURN_LINE =
  "İLK TUR — BU TUR (kesin; 'ilk cümle tam cevap' kuralından önce gelir): Öğrenci yeni bir soru getirdi. Cevabı (sonucu, " +
  "doğru şıkkı, türetmenin sonunu, 'neden'in son açıklamasını) bu mesajda VERME. Kısa bir sezgi, hatırlatma ya da ipucu " +
  "ver ve öğrencinin atacağı sıradaki küçük adımı TEK soruyla sor. Formül kartı, örnek ya da kutu cevabı ele vermesin. " +
  "Kavram sorusunda bu tur 45-60 kelime. Öğrenci 'çöz', 'cevabı söyle' ya da 'cevabı göster' derse bekletmeden tam " +
  "çözüme geç.";

export const REVEAL_LINE =
  "CEVAP İSTENDİ — BU TUR (kesin): Öğrenci cevabı açıkça istedi. İpucu merdivenini atla, bekletme ve pazarlık etme: " +
  "doğrudan çöz, sonucu ilk cümlede ver, gerekçesi kısa.";

export const CONCEPT_STEP_LINE =
  "ADIM ADIM — BU TUR (kesin; 'ilk cümle tam cevap' kuralından önce gelir): Öğrenci bir kavram sorusu sordu. Açıklamayı " +
  "2-4 adıma böl ve bu mesajda YALNIZ 1. adımı yaz (\"**1. adım:**\" başlığıyla, en çok iki kısa cümle; tur 45-60 kelime); sonraki " +
  "adımları " +
  `ve son açıklamayı yazma. Mesajı şu anlamda tek cümleyle bitir: 1. adım netleştiyse '${STEP_CONTINUE_WORD}' yaz, 2. ` +
  "adıma geçelim.";

export const GUIDED_STYLE_LINE =
  "REHBERLİ MOD (kesin): Özel ders öğretmeni gibi tek hamleyle ilerle. Yeni bir soru ya da problem geldiğinde sonucu, " +
  "doğru şıkkı ya da türetmenin sonunu bu turda verme: kısa bir sezgi, hatırlatma ya da ipucu ver ve öğrencinin atacağı " +
  "sıradaki küçük adımı TEK soruyla sor. Öğrenci denedikçe ona bağlan; yanlışta önce nasıl bulduğunu sor. Öğrenci 'çöz', " +
  "'cevabı söyle' ya da 'cevabı göster' derse bekletmeden doğrudan çöz.";

export const SOCRATIC_V2_LINE =
  "SOKRATİK MOD (kesin): Öğrenci açıkça 'çöz', 'cevabı söyle', 'cevabı göster' ya da 'tam çözümü göster' demedikçe " +
  "nihai cevabı, doğru şıkkı, sayısal sonucu ya da 'neden'in son açıklamasını ilk mesajda verme; kavram sorusunda da. " +
  "Konuyu ya da kavramı adıyla an, tek bir ipucu ya da 1. adım ver ve öğrenciye tek bir yönlendirici soru sor.";

/**
 * Bayrak açıkken stil satırı; null ise eski `teacherStyleLine` geçerli (Adım Adım, Doğrudan Çöz). Faz 11 modları:
 * Adım Adım Öğret özel ders ritmi + mini yoklama kuralı, Hızlı Özet doğrudan ve eksiksiz cevap.
 */
export function v2StyleLine(style: TeachStyle): string | null {
  if (isTutorMode(style)) return `${PRIVATE_TUTOR_PACING}\n${QUICK_CHECK_RULE}`;
  if (isSummaryMode(style)) return QUICK_SUMMARY_RULE;
  if (style === GUIDED_STYLE) return GUIDED_STYLE_LINE;
  if (style === "hints_first") return SOCRATIC_V2_LINE;
  return null;
}

/** Adım Adım modunda kavram sorusu: gerçek adım modu (1. adım + Devam et). */
export function conceptStepTurn(input: {
  style: TeachStyle;
  plan: TurnPlan;
  session: TutorSession;
  message: string;
}): boolean {
  const { style, plan, session, message } = input;
  if (style !== "step_by_step") return false;
  if (plan.followUp || plan.newExercise || plan.problem || plan.fullSolution || session.answering) return false;
  if (hasOwnSolution(message) || asksDirectAnswer(message)) return false;
  return looksLikeQuestion(message);
}

function revealTurn(plan: TurnPlan, message: string): boolean {
  return asksDirectAnswer(message) || plan.followUp === "final_answer" || plan.followUp === "full_solution";
}

/** Adım Adım Öğret'te cevabın açıkça istendiği tur: takip isteği, tam çözüm isteği ya da "tamam göster" (`wantsReveal`). */
export function tutorRevealTurn(plan: TurnPlan, message: string): boolean {
  return revealTurn(plan, message) || plan.fullSolution || wantsReveal(message);
}

/**
 * `answerFirstLine`'ın bayrak açıkken hâli: Rehberli ve Sokratik'te yeni soruda, her stilde cevap denemesinde ve Adım
 * Adım kavram turunda "ilk cümle tam cevap" demez (merdivenle çelişirdi). Cevap açıkça istenirse eskisi gibi.
 */
export function v2AnswerFirstLine(input: {
  message: string;
  style: TeachStyle;
  base: TutorStyle;
  session: TutorSession;
  plan: TurnPlan;
}): string {
  const { message, style, base, session, plan } = input;
  // Faz 11 · Hızlı Özet: doğrudan çözüm satırı. Adım Adım Öğret: açık istek ya da tam çözümde "ilk cümle tam cevap";
  // cevap denemesinde ve yeni problemde demez (merdivenle çelişirdi); kavram sorusunda der (tanım saklanmaz).
  if (isSummaryMode(style)) return answerFirstLine(message, "direct_solve");
  if (isTutorMode(style)) {
    if (tutorRevealTurn(plan, message)) return answerFirstLine(message, "direct_solve");
    if (session.answering || hasOwnSolution(message)) return STUCK_POINT_RULE;
    if (plan.problem || looksLikeProblem(message)) return STUCK_POINT_RULE;
    return answerFirstLine(message, base);
  }
  if (style === "direct_solve" || asksDirectAnswer(message)) return answerFirstLine(message, base);
  if (session.answering || hasOwnSolution(message)) return STUCK_POINT_RULE;
  if (style === GUIDED_STYLE || style === "hints_first") return STUCK_POINT_RULE;
  if (conceptStepTurn({ style, plan, session, message })) return STUCK_POINT_RULE;
  return answerFirstLine(message, base);
}

/** Bayrak açıkken bu turun seans satırları; sistem isteminin sonuna (öbür tur satırlarından sonra) eklenir. */
export function teacherV2SessionLines(input: {
  session: TutorSession;
  style: TeachStyle;
  plan: TurnPlan;
  message: string;
}): string[] {
  const { session, style, plan, message } = input;
  const lines: string[] = [];
  const continuity = continuityLine(session);
  if (continuity) lines.push(continuity);
  // Faz 11 · Adım Adım Öğret: açık istekte adımı göster; denemede ipucu merdiveni; yeni problemde yalnız ilk küçük adım.
  if (isTutorMode(style)) {
    if (tutorRevealTurn(plan, message)) {
      lines.push(TUTOR_REVEAL_LINE);
      return lines;
    }
    if (session.answering) lines.push(tutorLadderLine(session.attempt, session.lastQuestion));
    else if (hasOwnSolution(message)) lines.push(tutorLadderLine(1, null));
    else if (!plan.followUp && !plan.newExercise && plan.problem) lines.push(TUTOR_FIRST_PROBLEM_LINE);
    return lines;
  }
  // Faz 11 · Hızlı Özet: soru ya da problem turunda eksiksiz çözüm kelime sınırına takılmasın.
  if (isSummaryMode(style)) {
    if (!session.answering && (plan.problem || plan.followUp || plan.newExercise || looksLikeQuestion(message))) {
      lines.push(QUICK_SUMMARY_TURN_LINE);
    }
    return lines;
  }
  if (style === "direct_solve") return lines;
  if (revealTurn(plan, message)) {
    lines.push(REVEAL_LINE);
    return lines;
  }
  if (session.answering) lines.push(ladderLine(session.attempt, session.lastQuestion));
  else if (hasOwnSolution(message)) lines.push(ladderLine(1, null));
  else if (conceptStepTurn({ style, plan, session, message })) lines.push(CONCEPT_STEP_LINE);
  else if (
    (style === GUIDED_STYLE || style === "hints_first") &&
    !plan.followUp &&
    !plan.newExercise &&
    (plan.problem || looksLikeQuestion(message))
  ) {
    lines.push(FIRST_TURN_LINE);
  }
  return lines;
}
