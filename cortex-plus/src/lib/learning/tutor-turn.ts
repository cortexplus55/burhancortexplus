import { pacedStepNumber, type TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Sohbet turunun türü (10 Kasım 2026, güven paketi) — saf ve modelsiz, ders bağımsız.
 *
 * Canlı denetimde iki kusur: (1) Adım Adım modu çözümün tamamını tek balonda döküyordu; (2) öğrenci "devam et" ya da
 * "cevap kaç?" yazınca öğretmen yeni sayılarla yeni bir soru uyduruyordu. İkisinin de nedeni aynıydı: istem o turun ne
 * olduğunu bilmiyordu. Burası mesajı ve konuşma geçmişini okur; tura özel istem satırını `chat-turn-lines.ts` kurar.
 *
 * Yalnız genel Türkçe sohbet sözcükleri aranır (devam, sonraki, cevap, sonuç, yeni soru …); ders ya da konu sözcüğü yok.
 */

export type FollowUpKind = "continue" | "final_answer" | "full_solution";

export type ActiveQuestion =
  /** Öğrencinin konuşmada getirdiği son soru (metniyle). */
  | { source: "student"; text: string }
  /** Son alıştırmayı öğrencinin isteğiyle öğretmen sordu ya da son konu bir problem değil: metin alıntılanmaz. */
  | { source: "conversation" };

export type TurnPlan = {
  /** Mesaj yeni bir soru taşımıyor; konuşmadaki sorunun devamını istiyor. */
  followUp: FollowUpKind | null;
  /** Öğrenci açıkça yeni bir alıştırma istedi; kilit uygulanmaz. */
  newExercise: boolean;
  /** Bu mesaj çözülecek bir soru/problem taşıyor. */
  problem: boolean;
  /** Öğrenci tam çözümü açıkça istedi (bu mesajda). */
  fullSolution: boolean;
  /** Takip mesajının bağlandığı soru; takip değilse ya da geçmiş boşsa null. */
  active: ActiveQuestion | null;
  /** Adım Adım modunda bu turda yazılacak tek adımın numarası; adımlı tur değilse null. 0: numara bilinmiyor. */
  pacedStep: number | null;
};

export type TurnHistoryItem = { role: string; content?: unknown };

/** Türkçe küçük harf, aksansız; noktalama boşluk olur ("Devam et: 2. adıma geç." → "devam et 2 adima gec"). */
const fold = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[’'`"“”«»*_]/g, "")
    .replace(/[.,;:!?…()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Genel sohbette mesajın başına eklenen ders etiketi ("[Ders] …") sorunun parçası değildir. */
function withoutSubjectLabel(message: string): string {
  return (message ?? "").replace(/^\s*\[[^\]\n]{1,40}\]\s*/, "");
}

/** Takip mesajı kısadır ve yeni veri taşımaz: adım numarası dışında rakam ya da işlem yok. */
const FOLLOW_UP_MAX_WORDS = 10;

const CONTINUE_PATTERNS: RegExp[] = [
  /^(?:tamam |peki |evet |hadi |anladim |oldu |super |guzel )*devam(?: et| edelim| edebilirsin| edebiliriz| edin| lutfen)?\b/,
  /\bdevam et\b/,
  /\b(?:sonraki|siradaki|bir sonraki|diger|oteki) adim/,
  /\b(?:\d{1,2}|ilk|ikinci|ucuncu|dorduncu|besinci|sonraki|siradaki) adima gec/,
  /\b(?:ilk|sonraki|siradaki) adimi (?:goster|ver|yaz|anlat)/,
  /\b(?:bir )?ipucu(?: daha)?(?: ver| goster)?\b/,
  /^(?:tamam |peki |evet |hadi )*(?:gec|gecelim|ilerle|ilerleyelim|sonra|sonrasi|ee sonra|peki sonra|sonraki)$/,
];

const FINAL_ANSWER_PATTERNS: RegExp[] = [
  /^(?:peki |yani |e |ee |tamam |o zaman )*sonuc(?:u)?(?: ne| kac| nedir| kactir| ne oldu| ne cikti| ne cikiyor)?$/,
  /\bceva[pb]i? (?:kac|ne|nedir|kactir|hangisi|hangi sik)\b/,
  /\bcevab(?:i|ini) (?:soyle|ver|yaz|goster)\b/,
  /\bsonuc(?:u|unu) (?:soyle|ver|yaz|goster)\b/,
  /\bkac (?:cikiyor|cikti|cikar|eder|ediyor|oluyor|oldu|bulunur)\b/,
  /\b(?:dogru )?(?:sik|secenek) (?:hangisi|ne|nedir)\b/,
  /\bhangi (?:sik|secenek)\b/,
];

/** Açık tam çözüm isteği; soru getiren mesajda da geçerlidir. */
const FULL_SOLUTION_PATTERNS: RegExp[] = [
  /\b(?:tam|butun|tum) (?:cozum|adim)/,
  /\bcevabi ve (?:tum|butun) adimlari\b/,
  /\bhepsini (?:goster|coz|yaz|ver|anlat)\b/,
  /\b(?:cozumu|cozumun tamamini|tamamini|gerisini|kalanini|kalan adimlari) (?:goster|coz|yaz|ver)\b/,
  /\b(?:direkt|direk|dogrudan|eksiksiz|bastan sona|sonuna kadar)(?: \S+){0,3} coz/,
  /\btek (?:mesajda|seferde|kalemde)\b/,
];

/** Yalnız takip mesajında tam çözüm isteği sayılır ("çöz artık"); soru getiren mesajdaki "çöz" adımlamayı bozmaz. */
const FOLLOW_UP_SOLVE = /^(?:hadi |sen |tamam |peki |o zaman )*coz(?:uver| artik| sunu| bunu)?$/;

const NEW_EXERCISE_PATTERNS: RegExp[] = [
  /\b(?:yeni|baska|farkli|benzer|ayri)(?: bir| zorlukta bir)? (?:soru|ornek|problem|alistirma|test)/,
  /\bbir (?:soru|ornek|problem|alistirma) daha\b/,
  /\b(?:soru|ornek|problem|alistirma) daha (?:sor|ver|coz|goster)/,
  /\bbuna benzer\b/,
  /\btest et\b/,
  /\b(?:bana )?(?:\d+ )?(?:soru|alistirma) (?:sor|uret|hazirla)\b/,
  /\bornek soru (?:uret|ver|sor|coz)/,
];

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** Öğrenci açıkça yeni bir alıştırma istiyor mu ("yeni soru sor", "benzer örnek ver", "beni test et"). */
export function asksNewExercise(message: string): boolean {
  const text = fold(withoutSubjectLabel(message));
  return Boolean(text) && matchesAny(NEW_EXERCISE_PATTERNS, text);
}

/** Öğrenci tam çözümü açıkça istiyor mu ("cevabı ve tüm adımları göster", "tam çözümü göster", "direkt çöz"). */
export function asksFullSolution(message: string): boolean {
  const text = fold(withoutSubjectLabel(message));
  return Boolean(text) && matchesAny(FULL_SOLUTION_PATTERNS, text);
}

/** Mesaj adım numarası dışında sayı ya da işlem taşıyor mu (yeni veri). */
function carriesNewData(folded: string): boolean {
  const withoutStepNumber = folded.replace(/\b\d{1,2} ?adim\S*/g, " ");
  return /\d/.test(withoutStepNumber) || /[=+×÷^√]/.test(withoutStepNumber);
}

/**
 * Takip ifadesi: "devam et", "sonraki adım", "peki sonuç?", "cevap kaç?", "tam çözümü göster".
 * Yeni alıştırma isteği ve yeni veri taşıyan mesaj takip değildir.
 */
export function followUpKind(message: string): FollowUpKind | null {
  const text = fold(withoutSubjectLabel(message));
  if (!text || text.split(" ").length > FOLLOW_UP_MAX_WORDS) return null;
  if (matchesAny(NEW_EXERCISE_PATTERNS, text) || carriesNewData(text)) return null;
  if (matchesAny(FULL_SOLUTION_PATTERNS, text) || FOLLOW_UP_SOLVE.test(text)) return "full_solution";
  if (matchesAny(FINAL_ANSWER_PATTERNS, text)) return "final_answer";
  if (matchesAny(CONTINUE_PATTERNS, text)) return "continue";
  return null;
}

const SOLVE_WORDS =
  /\b(?:hesapla\w*|coz(?!um)\w*|kac\w*|bul(?:un|unuz|alim)?|degeri\w*|sonucu\w*|toplami\w*|carpimi\w*|farki\w*|orani\w*|yuzdesi\w*|esittir)\b/;

const OPERATION =
  /\d\s*[=+×·÷*\/^]\s*[\d(\p{L}]|[\p{L})]\s*[=+×·÷^]\s*\d|√|\\(?:frac|sqrt|times|cdot)/u;

/**
 * Çözülecek soru/problem: en az iki şıklı soru, ya da sayı taşıyıp hesap isteyen / işlem içeren mesaj.
 * Tanım ve kavram sorusu ("… nedir?", "fark ne?") problem değildir.
 */
export function looksLikeProblem(message: string): boolean {
  const raw = withoutSubjectLabel(message).trim();
  if (raw.length < 6) return false;
  const options = raw.match(/(?:^|[\s\n])[A-E][).:]/g) ?? [];
  if (options.length >= 2) return true;
  if (!/\d/.test(raw)) return false;
  return OPERATION.test(raw) || SOLVE_WORDS.test(fold(raw));
}

function textOf(content: unknown): string {
  return typeof content === "string" ? content : "";
}

/**
 * Aktif soru: konuşmadaki en son çözülmekte olan soru. Geçmiş sondan başa taranır; takip mesajları atlanır.
 * İlk gerçek öğrenci mesajı bir problemse aktif soru odur (metniyle); yeni alıştırma isteğiyse ya da problem
 * değilse aktif soru konuşmanın kendisindedir (öğretmenin sorduğu alıştırma dahil) ve alıntılanmaz.
 */
export function activeQuestion(history: readonly TurnHistoryItem[]): ActiveQuestion | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]!;
    if (item.role !== "user") continue;
    const text = textOf(item.content).trim();
    if (!text || followUpKind(text)) continue;
    if (!asksNewExercise(text) && looksLikeProblem(text)) {
      return { source: "student", text: withoutSubjectLabel(text).trim().slice(0, 600) };
    }
    return { source: "conversation" };
  }
  return history.some((item) => item.role === "assistant" && textOf(item.content).trim())
    ? { source: "conversation" }
    : null;
}

function lastAssistantText(history: readonly TurnHistoryItem[]): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]!.role === "assistant") return textOf(history[index]!.content);
  }
  return "";
}

/** Mesaj + geçmiş + seçili mod → bu turun planı. */
export function planTurn(input: {
  message: string;
  style: TutorStyle;
  history: readonly TurnHistoryItem[];
}): TurnPlan {
  const newExercise = asksNewExercise(input.message);
  const followUp = newExercise ? null : followUpKind(input.message);
  const problem = !followUp && !newExercise && looksLikeProblem(input.message);
  const fullSolution = followUp === "full_solution" || (problem && asksFullSolution(input.message));
  const active = followUp ? activeQuestion(input.history) : null;

  let pacedStep: number | null = null;
  if (input.style === "step_by_step" && !fullSolution) {
    if (problem) pacedStep = 1;
    else if (followUp === "continue" && active) {
      // Önceki yanıt adımlıysa sıradaki adım; değilse kaçıncı adımda olunduğu bilinmez (0).
      const previous = pacedStepNumber(lastAssistantText(input.history));
      pacedStep = previous ? previous + 1 : 0;
    }
  }
  return { followUp, newExercise, problem, fullSolution, active, pacedStep };
}

/**
 * Modun cevabı sakladığı tur mu: Adım Adım ya da Sokratik modda, tam çözümü açıkça istemeyen bir problem.
 * `answerFirstLine` bu turda "ilk cümle tam cevap" demez (mod satırıyla çelişiyordu).
 */
export function holdsFinalAnswer(message: string, style?: TutorStyle | null): boolean {
  if (style !== "step_by_step" && style !== "hints_first") return false;
  return looksLikeProblem(message) && !asksFullSolution(message);
}
