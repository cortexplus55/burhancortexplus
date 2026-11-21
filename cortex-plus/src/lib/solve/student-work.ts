import {
  STEP_KIND_LABEL,
  UNREADABLE_LINE_MARK,
  WORK_MAX_LINES,
  analyzeWorkSteps,
  firstErrorSummary,
  mergeStepVerdicts,
  parseModelSteps,
  splitWorkLines,
  stepFeedbackLine,
  type WorkStepKind,
  type WorkStepVerdict,
} from "@/lib/learning/mock-exam/work-steps";
import { closeValues, segmentValue } from "@/lib/solve/step-arithmetic";
import { answersAgree, numericOf, quickFrom, type QuickAnswer, type Solution } from "@/lib/solve/question-solver";

/*
  Fotoğrafla el yazısı çözüm kontrolü (21 Kasım 2026, ürün sahibinin kararı; `teacher.v2` arkasında).

  Öğrenci soru fotoğrafında kendi el yazısı çözümünü de çekmişse öğretmen cevabı söylemez: doğru kurduğu satırları
  onaylar, ilk hatalı satırı nazikçe işaret eder ve doğrusunu bulması için tek yönlendirici soru sorar. Doğru çözüm
  sonuçta durur ama ekranda "Doğrusunu göster" denince açılır.

  Ek model çağrısı yok: soru çözücünün analitik çağrısı (aynı çağrı) soruyu çözerken öğrencinin satırlarını ayrı
  okur ve satır satır değerlendirir; şık eleyici çağrı öğrencinin satırlarına bakmadan bağımsız çözer. Satırlar
  yazılı denemenin modelsiz adım denetiminden geçer (`work-steps.ts`: işlem, işaret, birim); kod hesapta kazanır,
  kavram ve eksik adımda model. Sonuç, iki çözümün kesinleşen cevabıyla karşılaştırılır. Ders, konu ya da kişi adı
  yok; kurallar sayılarla ve genel cebirle karar verir.

  Bu dosya saftır (sunucu ve istemci ikisi de okur): istem parçaları, model çıktısının okunması, kontrol sonucu, cevap
  sızıntısı denetimi ve sohbete kaydedilen metin.
*/

/** İstemcinin isteği: "auto" (varsayılan) el yazısı görürse kontrole geçer; "solve" bugünkü çözüm; "check" kontrol. */
export type SolveIntent = "auto" | "solve" | "check";

/** Sunucunun çalışma biçimi: "off" bugünkü çözücü (istemler bayt bayt aynı), "auto" ve "check" satır okuma açık. */
export type StudentWorkMode = "off" | "auto" | "check";

export function parseSolveIntent(raw: unknown): SolveIntent {
  return raw === "solve" || raw === "check" ? raw : "auto";
}

/**
 * Bayrak kapalıysa ya da öğrenci açıkça "Soruyu çöz" dediyse bugünkü çözücü. "auto" yalnız fotoğrafta kontrole
 * geçebilir (yazılı soruda öğrencinin satırı sorunun kendisinden ayırt edilemez); "check" yazılı soruda da çalışır.
 */
export function studentWorkMode(input: { intent: SolveIntent; enabled: boolean; image: boolean }): StudentWorkMode {
  if (!input.enabled || input.intent === "solve") return "off";
  if (input.intent === "check") return "check";
  return input.image ? "auto" : "off";
}

/** Açık kontrol isteği yalnız bayrak açıkken kabul edilir. */
export function checkIntentRefused(intent: SolveIntent, enabled: boolean): boolean {
  return intent === "check" && !enabled;
}

export const CHECK_UNAVAILABLE_MESSAGE = "Çözüm kontrolü şu an açık değil. Soruyu çözdürmek için yeniden gönder.";

/* ---------- istem parçaları ---------- */

/** Şık eleyici, hakem ve denetçi öğrencinin satırlarına bakmaz: bağımsızlık bozulmasın. */
export const STUDENT_WORK_IGNORE_RULE =
  "ÖĞRENCİNİN SATIRLARI: Görselde ya da metinde öğrencinin kendi el yazısıyla yazdığı çözüm satırları olabilir " +
  "(işlem, ara adım, sonuç). Onlar sorunun parçası değildir: soruyu yalnız basılı ya da yazılı soru metninden kendin " +
  "çöz, öğrencinin vardığı sonucu kopyalama; question ve options alanlarına öğrencinin satırlarını yazma.";

/** Analitik çağrı: soruyu çözerken öğrencinin satırlarını ayrı okur. */
export const STUDENT_WORK_READ_RULE =
  "ÖĞRENCİNİN ÇÖZÜMÜNÜ AYRI OKU: Görselde ya da metinde öğrencinin kendi el yazısıyla yazdığı çözüm satırları varsa " +
  "(kâğıda yazılmış işlem, ara adım, sonuç; basılı soru metni ve basılı şıklar değil) studentWork.present true ve " +
  "studentWork.lines'a satırları kâğıttaki sırayla, kâğıttaki gösterimle birebir yaz: düzeltme, tamamlama, sadeleştirme " +
  "yok; her satır ayrı bir dize. Okunamayan satırın yerine \"[okunamadı]\" yaz, sırayı bozma. Öğrencinin vardığı sonucu " +
  "studentWork.answer'a yaz (işaretlediği şık varsa letter, yazdığı değer varsa value). Öğrencinin satırı yoksa " +
  "studentWork.present false ve lines boş. Öğrencinin satırları senin çözümünü belirlemez: soruyu kendin çöz; question " +
  "ve options yalnız sorunun kendisi.";

/** Analitik çağrı: satırları tek tek denetler; cevabı vermeden yönlendirir. */
export const STUDENT_WORK_CHECK_RULE =
  "ÖĞRENCİNİN SATIRLARINI DENETLE (satır varsa): studentWork.steps her satır için {\"n\":satır numarası,\"ok\":true|false," +
  "\"kind\":\"islem|isaret|birim|kavram|eksik\",\"note\":\"…\"}; islem hesap hatası, isaret terim ya da çarpan karşıya " +
  "geçerken işaret/işlem hatası, birim dönüşüm hatası, kavram yanlış kural ya da kavram, eksik atlanmış adım. note en çok " +
  "15 kelime. studentWork.resultOk: öğrencinin vardığı sonuç senin bulduğun doğru cevapla aynıysa true, değilse false. " +
  "studentWork.hint: ilk hatalı satırı nazikçe söyleyen tek cümle; öncesinde doğru kurduğu kısmı da an. " +
  "studentWork.question: öğrencinin hatayı kendisinin bulması için tek yönlendirici soru. hint, question ve note doğru " +
  "sonucu, doğru şıkkı, doğru satırı ya da doğru ara değeri YAZMAZ; azar ve övgü yok. Hata yoksa hint kısa bir onay, " +
  "question boş.";

const STUDENT_WORK_JSON =
  'JSON\'a ek olarak studentWork alanını ekle: {"studentWork":{"present":true,"lines":["…","…"],' +
  '"answer":{"letter":"","value":"…"},"resultOk":false,"steps":[{"n":1,"ok":true},{"n":2,"ok":false,"kind":"isaret",' +
  '"note":"…"}],"hint":"…","question":"…"}}';

const CHECK_REQUEST_RULE =
  "Öğrenci kendi çözümünün kontrol edilmesini istedi: görselde ya da metinde onun satırlarını ara; soru metninin " +
  "altında ya da yanında, kâğıdın boşluklarında olabilir.";

/** Satır okuma açıkken analitik çözücünün sistem istemi; "off" çağrılmaz (bugünkü istem aynen kullanılır). */
export function studentWorkSolverSystem(base: string, mode: Exclude<StudentWorkMode, "off">): string {
  const rules = [STUDENT_WORK_READ_RULE, STUDENT_WORK_CHECK_RULE, ...(mode === "check" ? [CHECK_REQUEST_RULE] : []), STUDENT_WORK_JSON];
  return `${base}\n\n${rules.join("\n")}`;
}

/** Satır okuma açıkken şık eleyici, hakem ve denetçi aynı bağımsızlık kuralını okur. */
export function studentWorkSideSystem(base: string): string {
  return `${base}\n\n${STUDENT_WORK_IGNORE_RULE}`;
}

/** Açık kontrol isteğinde analitik çağrının kullanıcı metnine eklenen satır. */
export const CHECK_USER_LINE =
  "Öğrenci kendi çözüm satırlarının kontrol edilmesini istiyor. Satırlarını ayrı oku ve tek tek denetle; doğru cevabı " +
  "hint, question ve note'ta söyleme.";

/* ---------- model çıktısının okunması ---------- */

export type StudentWorkRead = {
  /** Okunabilir en az bir öğrenci satırı var. */
  present: boolean;
  /** Kâğıttaki sırayla satırlar; okunamayan satır `[okunamadı]`. */
  lines: string[];
  answer: QuickAnswer;
  /** Modelin kendi cevabına göre kararı (yalnız kod karar veremezse ve cevap aynı kaldıysa kullanılır). */
  resultOk?: boolean;
  modelSteps: WorkStepVerdict[];
  hint: string;
  question: string;
  /** Satırları değerlendiren çözümün cevabı: `resultOk` buna göredir. */
  basis: QuickAnswer;
};

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : typeof value === "number" ? String(value) : "";

const UNREADABLE_WORD = /^\[?\s*okun(?:a|u)m(?:a|ı)d(?:ı|i)\s*\]?\.?$/iu;

function readLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const lines = raw
    .map((item) => clean(item, 240))
    .filter(Boolean)
    .map((line) => (UNREADABLE_WORD.test(line) ? UNREADABLE_LINE_MARK : line.replace(/`/g, "'")));
  return splitWorkLines(lines.join("\n")).slice(0, WORK_MAX_LINES);
}

function readAnswer(raw: unknown): QuickAnswer {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const letter = clean(row.letter, 4).toUpperCase().replace(/[^A-EÇĞİÖŞÜ]/g, "").charAt(0) || undefined;
  const value = clean(row.value, 80) || undefined;
  return { letter, value };
}

/** Satırların hepsi sorunun kendi metninden mi (model basılı soruyu öğrencinin satırı sanmış). */
function onlyQuestionText(lines: readonly string[], top: Record<string, unknown>): boolean {
  const options = Array.isArray(top.options)
    ? top.options.map((item) => clean((item as { text?: unknown } | null)?.text, 400)).join(" ")
    : "";
  const printed = normText(`${clean(top.question, 3000)} ${options}`);
  const readable = lines.filter((line) => line !== UNREADABLE_LINE_MARK).map((line) => normText(line));
  return Boolean(printed) && readable.length > 0 && readable.every((line) => line.length > 0 && printed.includes(line));
}

/**
 * Analitik çağrının JSON'undan öğrencinin satırları. `studentWork` yoksa, satır yoksa, satırların hepsi okunamadıysa
 * ya da hepsi sorunun basılı metniyse `present` false (açık kontrol isteğinde "satırlarını göremedim" denir).
 */
export function parseStudentWork(raw: unknown): StudentWorkRead {
  const top = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const row = (top.studentWork && typeof top.studentWork === "object" ? top.studentWork : {}) as Record<string, unknown>;
  const lines = row.present === false ? [] : readLines(row.lines);
  const readable = lines.some((line) => line !== UNREADABLE_LINE_MARK);
  return {
    present: row.present !== false && readable && !onlyQuestionText(lines, top),
    lines,
    answer: readAnswer(row.answer),
    resultOk: typeof row.resultOk === "boolean" ? row.resultOk : undefined,
    modelSteps: parseModelSteps(row.steps, lines),
    hint: clean(row.hint, 320),
    question: clean(row.question, 220),
    basis: quickFrom(raw),
  };
}

/** Kontrol modu kendiliğinden mi açılsın: açık istekte her zaman, "auto"da yalnız okunabilir satır varsa. */
export function checkActive(mode: StudentWorkMode, read: StudentWorkRead | null): boolean {
  if (mode === "check") return true;
  return mode === "auto" && Boolean(read?.present);
}

/* ---------- sonuç karşılaştırması ---------- */

export type StudentResult = "match" | "mismatch" | "unknown";

const LETTER_LINE = /^(?:cevap\s*[:=]?\s*)?\(?([A-E])\)?\s*(?:şıkkı|şık)?\.?$/iu;
/** Tek bir büyüklüğün adı: "x", "v", "t1", "Fnet"; "2x" ya da "x+1" değil. */
const FINAL_LEFT = /^\p{L}[\p{L}\d_'₀-₉]{0,4}$/u;

/**
 * Öğrencinin vardığı sonuç: modelin okuduğu cevap; yoksa son satırın harfi ya da son eşitliğin değeri. Sonuç satırı ya
 * yalnız bir değerdir ("13", "4,5 m") ya da tek bir büyüklüğün değeridir ("x = 12 / 2 = 6"); "2x = 26" gibi ara satır
 * sonuç sayılmaz (öğrenci henüz bitirmemiş olabilir).
 */
export function studentFinalAnswer(read: Pick<StudentWorkRead, "answer" | "lines">): QuickAnswer {
  if (read.answer.letter || read.answer.value) return read.answer;
  const last = [...read.lines].reverse().find((line) => line !== UNREADABLE_LINE_MARK);
  if (!last) return {};
  const letter = last.match(LETTER_LINE)?.[1];
  if (letter) return { letter: letter.toUpperCase() };
  const parts = last.split(/=|⇒|→/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && !FINAL_LEFT.test(parts[0]!.replace(/\s+/g, ""))) return {};
  const tail = parts[parts.length - 1] ?? "";
  return segmentValue(tail) === null ? {} : { value: tail };
}

/** Değer okuması: işlem ve birim taşıyan parça hesaplanır ("12 / 2", "6 m"), değilse ilk sayı. */
function valueOf(text: string | undefined): number | null {
  if (!text) return null;
  return segmentValue(text) ?? numericOf(text);
}

const normText = (text?: string) => (text ?? "").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

/** Öğrencinin sonucu kesinleşen doğru cevapla aynı mı; şıklıda harf (yoksa değer), açık uçluda sayı ya da metin. */
export function studentResult(solution: Solution, answer: QuickAnswer): StudentResult {
  if (solution.kind === "mcq") {
    if (answer.letter) {
      if (!solution.answer.letter) return "unknown";
      return answer.letter === solution.answer.letter ? "match" : "mismatch";
    }
    const value = valueOf(answer.value);
    if (value === null) return "unknown";
    const correct = solution.options.find((option) => option.letter === solution.answer.letter);
    const target = numericOf(solution.answer.value) ?? numericOf(correct?.text);
    if (target === null) return "unknown";
    return closeValues(value, target) ? "match" : "mismatch";
  }
  const target = numericOf(solution.answer.value ?? solution.answer.text);
  const value = valueOf(answer.value);
  if (target !== null && value !== null) return closeValues(target, value) ? "match" : "mismatch";
  const given = normText(answer.value);
  if (given && given === normText(solution.answer.value)) return "match";
  return "unknown";
}

/* ---------- cevap sızıntısı ---------- */

const GIVEAWAY =
  /doğru\s+(?:cevap|yanıt|şık|seçenek|sonuç)\w*\s*(?:şudur|budur|[:=]|[A-E]\b|-?\d)|doğrusu\s*(?:şudur|budur|[:=]|-?\d)|cevap\w*\s*(?:şudur|budur|[:=])/iu;

function numbersIn(text: string): number[] {
  const stripped = text
    .replace(/\d+\s*\.\s*satır\p{L}*/giu, " ")
    .replace(/\d+\s*\.\s*(?:adım|soru|şık)\p{L}*/giu, " ");
  return [...stripped.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter(Number.isFinite);
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Model metni cevabı ya da doğru ara değeri ele veriyor mu. Bilinen sayılar (soruda verilen, öğrencinin kendi
 * yazdığı) serbesttir; yalnız doğru çözümde geçip öğrencinin bilmediği sayı sızıntıdır. Şıklıda doğru harfin anılması,
 * metin cevabın kendisi ve "doğru cevap: …" kalıbı da sızıntıdır. Satır numaraları ("2. satırda") sayı sayılmaz.
 */
export function revealsAnswer(text: string, solution: Solution, studentLines: readonly string[]): boolean {
  const value = text.trim();
  if (!value) return false;
  if (GIVEAWAY.test(value)) return true;
  const known = [solution.question, ...solution.given, ...studentLines].flatMap(numbersIn);
  const correctOption = solution.options.find((option) => option.letter === solution.answer.letter);
  const secret = [
    solution.answer.value ?? "",
    solution.answer.text,
    correctOption?.text ?? "",
    ...solution.steps.map((step) => step.math ?? ""),
  ].flatMap(numbersIn);
  for (const number of numbersIn(value)) {
    if (!secret.some((item) => sameNumber(item, number))) continue;
    if (known.some((item) => sameNumber(item, number))) continue;
    // 0 ve 1 dilde çok geçer ("1 terim"); yalnız eşitliğin sağında sızıntı sayılır.
    if (Number.isInteger(number) && Math.abs(number) <= 1 && !/=\s*-?[01](?![\d.,])/.test(value)) continue;
    return true;
  }
  if (solution.kind === "mcq" && solution.answer.letter) {
    const letter = solution.answer.letter;
    const named = new RegExp(`(?:^|[^\\p{L}])${letter}(?:\\s*\\)|\\s*şık|\\s*seçene)|şık\\p{L}*\\s+${letter}(?![\\p{L}])`, "u");
    if (named.test(value)) return true;
  }
  const said = normText(value);
  const mine = normText([solution.question, ...studentLines].join(" "));
  for (const answerText of [solution.answer.value, correctOption?.text]) {
    const key = normText(answerText);
    if (key.length < 3 || /^\d+$/.test(key) || mine.includes(key)) continue;
    if (said.includes(key)) return true;
  }
  return false;
}

/* ---------- kontrol sonucu ---------- */

export type StudentCheckState = "correct" | "error" | "incomplete" | "no_work";

export type StudentCheck = {
  state: StudentCheckState;
  /** Kâğıttaki sırayla satırlar: ok (✓), error (✗), unknown (·). İlk hatadan sonraki "ok" satırı "unknown" olur. */
  lines: WorkStepVerdict[];
  firstError: { line: number; kind?: WorkStepKind; note?: string } | null;
  result: StudentResult;
  /** Tek cümle; doğru cevabı söylemez. */
  explanation: string;
  /** Tek yönlendirici soru; doğru çözümde boş. */
  question: string;
  /** Öğrencinin vardığı sonuç (okunabildiyse; kendi yazdığı, sızıntı değil). */
  studentAnswer?: string;
};

const KIND_QUESTION: Record<WorkStepKind, string> = {
  islem: "Bu satırdaki işlemi yavaşça bir daha yapsan aynı sonucu bulur musun?",
  isaret: "Bu terimi eşitliğin öbür yanına geçirirken işaretine ne olur?",
  birim: "Bu satırdaki değerler aynı birimde mi; dönüştürürken hangi çarpanı kullanmalısın?",
  kavram: "Bu adımda kullandığın kural sorudaki duruma gerçekten uyuyor mu?",
  eksik: "Bu satırla bir öncekinin arasında atladığın bir adım var mı?",
};
const RESULT_QUESTION = "Sorunun tam olarak neyi istediğini ilk satırda doğru kurdun mu?";
const INCOMPLETE_QUESTION = "Buradan sonra hangi büyüklüğü bulman gerekiyor?";

export const CHECK_CORRECT_LINE = "Çözümün doğru: yazdığın satırlar tutarlı ve vardığın sonuç doğru.";
const RESULT_MISMATCH_LINE =
  "Satırların kendi içinde tutarlı görünüyor, ama vardığın sonuç beklenen sonuçla aynı değil. Soruyu nasıl kurduğuna, yani ilk satıra bir daha bak.";
const INCOMPLETE_LINE = "Buraya kadar yazdığın satırlarda bir hata görmedim. Sonuca varmak için devam et.";
const NO_WORK_LINE = "Fotoğrafta senin çözüm satırlarını göremedim. Satırlarını kâğıda yazıp yeniden çekebilir ya da doğrusunu açabilirsin.";
const UNREADABLE_WORK_LINE = "Çözüm satırlarını okuyamadım. Daha net yazıp yeniden çekebilir ya da doğrusunu açabilirsin.";
const RESULT_RIGHT_TAIL = "Vardığın sonuç doğru; yine de bu satırı düzeltmekte fayda var.";

function answerLabel(answer: QuickAnswer, solution: Solution): string | undefined {
  if (answer.letter) {
    const option = solution.options.find((item) => item.letter === answer.letter);
    return option ? `${option.letter}) ${option.text}` : answer.letter;
  }
  return answer.value;
}

function questionOk(text: string): boolean {
  return text.length >= 8 && text.length <= 220 && /\?\s*$/.test(text);
}

/**
 * Kontrol sonucunu kurar. Satır kararı kod + model (`mergeStepVerdicts`), sonuç kesinleşen çözümün cevabıyla;
 * açıklama ve soru modelin cümlesi ancak cevabı ele vermiyorsa ve aynı satırı işaret ediyorsa, yoksa kodun cümlesi.
 */
export function buildStudentCheck(read: StudentWorkRead | null, solution: Solution): StudentCheck {
  if (!read || !read.present) {
    const unreadable = Boolean(read?.lines.length) && read!.lines.every((line) => line === UNREADABLE_LINE_MARK);
    return {
      state: "no_work",
      lines: [],
      firstError: null,
      result: "unknown",
      explanation: unreadable ? UNREADABLE_WORK_LINE : NO_WORK_LINE,
      question: "",
    };
  }
  const leaks = (text: string) => revealsAnswer(text, solution, read.lines);
  const merged = mergeStepVerdicts(analyzeWorkSteps(read.lines), read.modelSteps);
  const at = merged.findIndex((step) => step.status === "error");
  const lines: WorkStepVerdict[] = merged.map((step, index) => {
    // İlk hatadan sonra hesabı tutan satır "doğru" gösterilmez: hata oradan taşınmış olabilir.
    if (at >= 0 && index > at && step.status === "ok") return { n: step.n, text: step.text, status: "unknown" };
    const note = step.note && !leaks(step.note) ? step.note : undefined;
    return {
      n: step.n,
      text: step.text,
      status: step.status,
      ...(step.kind ? { kind: step.kind } : {}),
      ...(note ? { note } : {}),
    };
  });
  const firstError = firstErrorSummary(lines);
  const answer = studentFinalAnswer(read);
  let result = studentResult(solution, answer);
  if (result === "unknown" && read.resultOk !== undefined && answersAgree(solution, read.basis)) {
    result = read.resultOk ? "match" : "mismatch";
  }
  const modelFirst = read.modelSteps.find((step) => step.status === "error")?.n ?? null;
  const modelHint = read.hint && !leaks(read.hint) ? read.hint : "";
  const modelQuestion = read.question && questionOk(read.question) && !leaks(read.question) ? read.question : "";
  const studentAnswer = answerLabel(answer, solution);

  if (firstError) {
    const sameLine = modelFirst === firstError.line;
    const codeLine = stepFeedbackLine(lines) ?? `${firstError.line}. satırda bir hata var.`;
    const base = sameLine && modelHint ? modelHint : codeLine;
    return {
      state: "error",
      lines,
      firstError,
      result,
      explanation: result === "match" ? `${base} ${RESULT_RIGHT_TAIL}` : base,
      question: sameLine && modelQuestion ? modelQuestion : KIND_QUESTION[firstError.kind ?? "kavram"],
      ...(studentAnswer ? { studentAnswer } : {}),
    };
  }
  if (result === "mismatch") {
    return {
      state: "error",
      lines,
      firstError: null,
      result,
      explanation: modelFirst === null && modelHint ? modelHint : RESULT_MISMATCH_LINE,
      question: modelFirst === null && modelQuestion ? modelQuestion : RESULT_QUESTION,
      ...(studentAnswer ? { studentAnswer } : {}),
    };
  }
  if (result === "match") {
    return { state: "correct", lines, firstError: null, result, explanation: CHECK_CORRECT_LINE, question: "", ...(studentAnswer ? { studentAnswer } : {}) };
  }
  return {
    state: "incomplete",
    lines,
    firstError: null,
    result,
    explanation: modelFirst === null && modelHint ? modelHint : INCOMPLETE_LINE,
    question: modelFirst === null && modelQuestion ? modelQuestion : INCOMPLETE_QUESTION,
  };
}

/** Kontrol sonucunu çözüme bağlar (olay ve ekran aynı nesneyi taşır). */
export function withStudentCheck(solution: Solution, read: StudentWorkRead | null): Solution {
  return { ...solution, studentCheck: buildStudentCheck(read, solution) };
}

/* ---------- ekran ve sohbet metni ---------- */

export const CHECK_STATE_TITLE: Record<StudentCheckState, string> = {
  correct: "Çözümün doğru",
  error: "Çözümünü kontrol ettim",
  incomplete: "Buraya kadar doğru",
  no_work: "Çözüm satırlarını göremedim",
};

/** Satır işareti ve ekran okuyucu adı. */
export function lineMark(status: WorkStepVerdict["status"]): { mark: string; label: string } {
  if (status === "ok") return { mark: "✓", label: "Doğru" };
  if (status === "error") return { mark: "✗", label: "Hatalı" };
  return { mark: "·", label: "Değerlendirilmedi" };
}

export function lineNote(step: Pick<WorkStepVerdict, "status" | "kind" | "note">): string {
  if (step.status !== "error") return step.note ?? "";
  const label = step.kind ? STEP_KIND_LABEL[step.kind] : "hata";
  return step.note ? `${label}: ${step.note}` : label;
}

/**
 * Sohbete kaydedilen metin: doğru cevap yok, yalnız satırlar, ilk hata ve yönlendirme. Not (denetimin düzeltme notu
 * cevabı söyleyebilir) yalnız cevabı ele vermiyorsa yazılır.
 */
export function studentCheckMarkdown(solution: Solution, check: StudentCheck, note?: string): string {
  const out: string[] = [`**${CHECK_STATE_TITLE[check.state]}**`];
  if (note && !revealsAnswer(note, solution, check.lines.map((line) => line.text))) out.push("", `_${note}_`);
  if (check.lines.length) {
    out.push("");
    for (const step of check.lines) {
      const { mark } = lineMark(step.status);
      const detail = lineNote(step);
      out.push(`${step.n}. ${mark} \`${step.text.replace(/`/g, "'")}\`${detail ? ` — ${detail}` : ""}`);
    }
  }
  out.push("", check.explanation);
  if (check.question) out.push("", `> 🤔 ${check.question}`);
  if (check.state !== "correct") out.push("", "_Doğru çözümü görmek istersen \"Doğrusunu göster\" de._");
  return out.join("\n").trim();
}

/** Sohbette öğrencinin satırı: okunan soru ve öğrencinin kendi satırları (fotoğraf saklanmaz). */
export function studentCheckUserLine(solution: Solution, check: StudentCheck, note: string | undefined, photo: boolean): string {
  const head = `${photo ? "📷" : "✍️"} Çözümümü kontrol et${note ? ` · ${note}` : ""}`;
  const question = solution.question.length > 600 ? `${solution.question.slice(0, 600)}…` : solution.question;
  const options = solution.options.map((o) => `${o.letter}) ${o.text}`).join("\n");
  const work = check.lines.length ? ["Benim çözümüm:", ...check.lines.map((line) => `${line.n}. ${line.text}`)].join("\n") : "";
  return [head, question, options, work].filter(Boolean).join("\n");
}

/** "Öğretmene sor" istemi: doğru cevap yok; öğrenci ilk hatalı satırı kendisi düzeltmek ister. */
export function studentCheckDiscussPrompt(solution: Pick<Solution, "question" | "subject">, check: StudentCheck): string {
  const subject = solution.subject.trim() ? `${solution.subject.trim()}: ` : "";
  const question = solution.question.trim().slice(0, 500);
  const work = check.lines
    .slice(0, 12)
    .map((line) => `${line.n}. ${line.text}`)
    .join("\n")
    .slice(0, 700);
  const first = check.firstError
    ? `Hata ${check.firstError.line}. satırda görünüyor${check.firstError.kind ? ` (${STEP_KIND_LABEL[check.firstError.kind]})` : ""}.`
    : check.state === "error"
      ? "Sonucum doğru cevapla aynı değil."
      : "";
  return [
    `Çözümümü birlikte düzeltelim. ${subject}${question}`,
    work ? `Benim satırlarım:\n${work}` : "",
    first,
    "Doğru cevabı söyleme; hatayı kendim bulayım, bana tek bir ipucu ver.",
  ]
    .filter(Boolean)
    .join("\n");
}
