/**
 * Etkinlik sayımı TEK yerden (30 Ekim 2026, Paket I #7).
 *
 * Canlıda aynı etkinliğin sayıları birbirini tutmuyordu: son kontrolde ekranda 7 "Doğru" işareti varken
 * sonuç 6/8; kart sonucu "6.6/8"; Hazırsın satırı "36 denemeden 15 doğru, 22 yanlış" (toplam 37). Her ekran
 * kendi sayımını yapıyordu. Şimdi test, son kontrol, odaklı pratik, doğru/yanlış, kartlar, dinleme kontrolü
 * ve yazılı deneme aynı dört sayıyı buradan alır: doğru / kısmen / yanlış / boş. Dördünün toplamı öğe
 * sayısıdır; puan doğru sayısı, yüzde doğru / toplam. Kısmen doğru (çok cevaplıda bir kısmı, kartta
 * "Zorlandım") ayrı yazılır ve puana girmez: ekrandaki x/y ile yüzde hep aynı sayılardan çıkar.
 *
 * İstemci ve sunucu bu modülü birlikte okur (sunucuya özel içe aktarma yok).
 */

import { multiPartialPercent, sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { cardAnswerCredit } from "@/lib/learning/flashcard-round";
import { verdictCounts, type ExamVerdict, type VerdictCounts } from "@/lib/learning/mock-exam/verdict-counts";

export type ItemVerdict = ExamVerdict;
export type AnswerTally = VerdictCounts;

function blankAnswer(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every((item) => String(item ?? "").trim() === "");
  return false;
}

/** Çoktan seçmeli (tek ya da çok cevaplı) sorunun kararı. */
export function quizItemVerdict(
  question: { correct?: readonly string[] | null; multi?: boolean | null; voided?: boolean | null },
  answer: unknown,
): ItemVerdict {
  // Bildirilip hatalı bulunan soru tam puan (31 Ekim 2026, Paket J2 #10); puanla aynı karar.
  if (question.voided) return "dogru";
  if (blankAnswer(answer)) return "bos";
  const correct = [...(question.correct ?? [])];
  const selected = selectedOptions(answer);
  if (correct.length && sameOptionSet(selected, correct)) return "dogru";
  if (question.multi && correct.length && multiPartialPercent(selected, correct) > 0) return "kismen";
  return "yanlis";
}

/** Doğru/yanlış önermesinin kararı. */
export function trueFalseItemVerdict(item: { correct: boolean }, answer: unknown): ItemVerdict {
  if (blankAnswer(answer)) return "bos";
  return answer === item.correct || answer === String(item.correct) ? "dogru" : "yanlis";
}

/** Kartın kararı: Bildim doğru, Zorlandım kısmen, Bilemedim yanlış, cevapsız boş. */
export function cardItemVerdict(answer: unknown): ItemVerdict {
  const credit = cardAnswerCredit(answer);
  if (credit == null) return "bos";
  if (credit >= 1) return "dogru";
  if (credit > 0) return "kismen";
  return "yanlis";
}

type PayloadLike = { type?: unknown; questions?: unknown; items?: unknown; cards?: unknown; check?: unknown };

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Etkinliğin öğe öğe kararları; puanlanmayan türde (ders, podcast kontrolsüz) boş liste. */
export function activityVerdicts(payload: unknown, answers: Record<string, unknown>): ItemVerdict[] {
  const data = (payload ?? {}) as PayloadLike;
  const at = (index: number) => answers[String(index)];
  if (data.type === "quiz") {
    return rows(data.questions).map((row, index) =>
      quizItemVerdict((row ?? {}) as { correct?: string[]; multi?: boolean; voided?: boolean }, at(index)),
    );
  }
  if (data.type === "true_false") {
    return rows(data.items).map((row, index) => trueFalseItemVerdict((row ?? { correct: false }) as { correct: boolean }, at(index)));
  }
  if (data.type === "cards") return rows(data.cards).map((_, index) => cardItemVerdict(at(index)));
  if (data.type === "mock_exam") {
    return rows(data.items).map((row) => {
      const verdict = (row as { verdict?: unknown } | null)?.verdict;
      return verdict === "dogru" || verdict === "kismen" || verdict === "yanlis" || verdict === "bos" ? verdict : "yanlis";
    });
  }
  return [];
}

/** Dört sayı; toplamları öğe sayısıdır. */
export function activityTally(payload: unknown, answers: Record<string, unknown>): AnswerTally {
  return verdictCounts(activityVerdicts(payload, answers));
}

/** Kayda ve ekrana giden puan: doğru sayısı / öğe sayısı (en az 1). */
export function tallyScore(tally: AnswerTally): { score: number; total: number } {
  return { score: tally.correct, total: Math.max(1, tally.total) };
}

/** Yüzde, puanla aynı iki sayıdan. */
export function tallyPercent(tally: AnswerTally): number {
  const { score, total } = tallyScore(tally);
  return Math.round((score / total) * 100);
}

const BARE_ANSWER = /^(?:\(?boş\)?|doğru|yanlış|dogru|yanlis|evet|hayır|hayir|true|false|[a-e]\)?|-?\d+(?:[.,]\d+)?)$/iu;

/**
 * Tek başına anlam taşımayan cevap metni: "(boş)", "Doğru", "Yanlış", "B", "12". Bilgi eksiği satırının
 * iddiası ya da önizlemesi bu olamaz (Paket I #7).
 */
export function isBareAnswerText(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  return !value || BARE_ANSWER.test(value);
}

/**
 * Sayım satırı: "8 sorudan 6 doğru · 1 kısmen · 1 yanlış". Sıfır olanlar yazılmaz; doğru her zaman.
 * `from` öğenin ayrılma hâli ("sorudan", "karttan", "önermeden").
 */
export function tallyLine(tally: AnswerTally, from = "sorudan"): string {
  const parts = [`${tally.total} ${from} ${tally.correct} doğru`];
  if (tally.partial) parts.push(`${tally.partial} kısmen`);
  if (tally.wrong) parts.push(`${tally.wrong} yanlış`);
  if (tally.blank) parts.push(`${tally.blank} boş`);
  return parts.join(" · ");
}
