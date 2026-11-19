import type { LessonScreen } from "@/lib/learning/lesson-v3";
import { sentences } from "@/lib/learning/relation-text";
import {
  presentsTruthAsMistake,
  repeatsSourceError,
  type SourceCorrectionWarning,
} from "@/lib/learning/source-correction";

/**
 * Kaynak düzeltme bekçisi, canlı ders yolu (20 Kasım 2026). Not bir bağıntıyı ya da formülü bilimsel olarak yanlış
 * yazmışsa (Faz 1-A §2.1 uyarısı) yazar doğrusunu okur; ama "tek geçiş"te yapı denetimi canlıda çağrılmadığı için
 * yanlışı yine yazan bir cümle, kutu, soru ya da özet maddesi öğrenciye gidebiliyordu (`correctionRepeatIssue` yalnız
 * testte çalışıyordu).
 *
 * Bu bekçi modelsiz ve deterministiktir; metin YAZMAZ, yalnız siler (19 Ekim kuralı: parça düşer, istek düşmez):
 *  - metin bloğunda yanlışı öğreten cümle düşer, blok boşalırsa blok düşer;
 *  - formül, kart, not, örnek, şema ve sahne bloğu yanlışı taşıyorsa blok düşer;
 *  - soru (anahtarı, açıklaması ya da ikinci sorusu) yanlışı doğru sayıyorsa soru düşer (ekranda başka blok kalırsa);
 *  - sınav tuzağı kartı yanlış inancı bilerek gösterir: dokunulmaz;
 *  - özet maddesi, genel bakış ve hedef cümlesi düşer; sık yapılan hata alanı yanlışı "düzeltme" diye ya da doğruyu
 *    "hata" diye gösteriyorsa alan düşer; bilgi/hata bulma/sayısal kontrol yanlışı cevap sayıyorsa düşer.
 * Doğrusu, dersin ilk ekranındaki "Kaynağında düzeltilmesi gereken bir bilgi var" kartında ve yazarın ekranlarında kalır.
 */

export type CorrectionGuardResult<T> = { lesson: T; dropped: number };

/** Bloğun içindeki bütün metin (iç içe nesne ve dizilerdeki dizeler); şema ve sahne türlerinden bağımsız. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) stringsOf(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      // Tür adı, kimlik ve görsel ayarı metin değil.
      if (key === "type" || key === "id" || key === "tone" || key === "kind" || key === "icon") continue;
      stringsOf(item, out);
    }
  }
  return out;
}

const plain = (text: string) => text.replace(/==|\*\*/g, "");

function repeats(text: string, warning: SourceCorrectionWarning): boolean {
  return repeatsSourceError(plain(text), warning);
}

type CheckLike = {
  type?: unknown;
  prompt?: unknown;
  options?: unknown;
  answerIndex?: unknown;
  explanation?: unknown;
  whyRight?: unknown;
  review?: unknown;
};

/** Sorunun "doğru" diye öğrettiği önermeler: anahtar şık (kökle), D/Y'de "Doğru" önerme, açıklama ve gerekçe. */
function checkTeaches(check: CheckLike | null | undefined, warning: SourceCorrectionWarning): boolean {
  if (!check || typeof check !== "object") return false;
  const options = Array.isArray(check.options) ? check.options.map(String) : [];
  const answer = typeof check.answerIndex === "number" ? check.answerIndex : -1;
  const prompt = typeof check.prompt === "string" ? check.prompt : "";
  const statements: string[] = [];
  if (check.type === "trueFalse" && /^do[gğ]ru$/i.test(options[answer]?.trim() ?? "")) statements.push(prompt);
  else if (options[answer]) statements.push(options[answer]!, `${prompt} ${options[answer]}`.replace(/[?]\s*/g, " "));
  for (const key of ["explanation", "whyRight"] as const) {
    if (typeof check[key] === "string") statements.push(check[key] as string);
  }
  return statements.some((statement) => repeats(statement, warning));
}

function guardText(text: string, warning: SourceCorrectionWarning): { text: string; dropped: number } {
  if (!repeats(text, warning)) return { text, dropped: 0 };
  const parts = sentences(text);
  const kept = parts.filter((sentence) => !repeats(sentence, warning));
  // Cümle düzeyinde yakalanamıyorsa (yanlış iki cümleye yayılmış) bütün metin yanlışı taşıyor: blok düşer.
  if (kept.length === parts.length) return { text: "", dropped: 1 };
  return { text: kept.join(" "), dropped: parts.length - kept.length };
}

type Block = LessonScreen["blocks"][number];

/** Ekranların kaynak düzeltmesine karşı süzülmüş hâli. Düzeltme yoksa aynı dizi (aynı başvuru) döner. */
export function guardScreensForCorrection(
  screens: readonly LessonScreen[],
  warning: SourceCorrectionWarning | null | undefined,
  options: { keepScreens?: boolean } = {},
): { screens: LessonScreen[]; dropped: number } {
  if (!warning) return { screens: screens as LessonScreen[], dropped: 0 };
  let dropped = 0;
  const out: LessonScreen[] = [];
  for (const screen of screens) {
    let changed = false;
    const blocks: Block[] = [];
    for (const block of screen.blocks) {
      if (block.type === "exam_trap_card") {
        blocks.push(block);
        continue;
      }
      if (block.type === "text") {
        const guarded = guardText(block.text, warning);
        if (!guarded.dropped) blocks.push(block);
        else {
          changed = true;
          dropped += guarded.dropped;
          if (guarded.text.trim()) blocks.push({ ...block, text: guarded.text });
        }
        continue;
      }
      if (block.type === "check") {
        const check = block.check as unknown as CheckLike;
        if (checkTeaches(check, warning)) {
          changed = true;
          dropped += 1;
          continue;
        }
        if (check.review && checkTeaches(check.review as CheckLike, warning)) {
          changed = true;
          dropped += 1;
          const { review: _review, ...rest } = block.check as unknown as Record<string, unknown>;
          blocks.push({ ...block, check: rest } as Block);
          continue;
        }
        blocks.push(block);
        continue;
      }
      if (stringsOf(block).some((text) => repeats(text, warning)) || repeats(stringsOf(block).join(" "), warning)) {
        changed = true;
        dropped += 1;
        continue;
      }
      blocks.push(block);
    }
    if (!changed) out.push(screen);
    else if (blocks.length) out.push({ ...screen, blocks });
    // Bütün blokları yanlışı taşıyan ekran yayımda düşer. Kayıtlı ders okunurken ekran sayısı değişmez (cevaplar ekran
    // sırasına bağlı): ekran yerinde kalır.
    else if (options.keepScreens) out.push(screen);
  }
  return { screens: dropped ? out : (screens as LessonScreen[]), dropped };
}

type ClosingLesson = {
  screens: LessonScreen[];
  objective?: string;
  overview?: string;
  summary?: string[];
  commonMistake?: { claim: string; correction: string };
  infoCheck?: { prompt: string; answer: string };
  findError?: { explanation: string };
  numericalCheck?: { prompt: string; answer: string; explanation: string };
  sourceCorrectionWarning?: SourceCorrectionWarning | null;
};

/**
 * Bütün ders: ekranlar + kapanış alanları. Uyarı verilmezse dersin kendi `sourceCorrectionWarning`'i kullanılır
 * (kayıtlı ders okunurken de aynı bekçi çalışır).
 */
export function guardLessonForCorrection<T extends ClosingLesson>(
  lesson: T,
  warningArg?: SourceCorrectionWarning | null,
  options: { keepScreens?: boolean } = {},
): CorrectionGuardResult<T> {
  const warning = warningArg ?? lesson.sourceCorrectionWarning ?? null;
  if (!warning) return { lesson, dropped: 0 };
  const guarded = guardScreensForCorrection(lesson.screens, warning, options);
  let dropped = guarded.dropped;
  const next: T = { ...lesson, screens: guarded.screens };

  const trimText = (key: "objective" | "overview") => {
    const value = lesson[key];
    if (typeof value !== "string") return;
    const result = guardText(value, warning);
    if (!result.dropped) return;
    dropped += result.dropped;
    if (result.text.trim()) (next as ClosingLesson)[key] = result.text;
    else delete (next as ClosingLesson)[key];
  };
  trimText("objective");
  trimText("overview");

  if (lesson.summary?.length) {
    const summary = lesson.summary.filter((item) => !repeats(item, warning));
    if (summary.length !== lesson.summary.length) {
      dropped += lesson.summary.length - summary.length;
      if (summary.length) next.summary = summary;
      else delete next.summary;
    }
  }
  if (
    lesson.commonMistake &&
    (repeats(lesson.commonMistake.correction, warning) || presentsTruthAsMistake(lesson.commonMistake.claim, warning))
  ) {
    dropped += 1;
    delete next.commonMistake;
  }
  if (lesson.infoCheck && repeats(`${lesson.infoCheck.prompt} ${lesson.infoCheck.answer}`, warning)) {
    dropped += 1;
    delete next.infoCheck;
  }
  // "Hatayı bul" metni yanlışı bilerek taşır; yalnız açıklama yanlışı doğru diye anlatıyorsa alan düşer.
  if (lesson.findError && repeats(lesson.findError.explanation, warning)) {
    dropped += 1;
    delete next.findError;
  }
  if (
    lesson.numericalCheck &&
    (repeats(lesson.numericalCheck.explanation, warning) ||
      repeats(`${lesson.numericalCheck.prompt} ${lesson.numericalCheck.answer}`, warning))
  ) {
    dropped += 1;
    delete next.numericalCheck;
  }
  return dropped ? { lesson: next, dropped } : { lesson, dropped: 0 };
}
