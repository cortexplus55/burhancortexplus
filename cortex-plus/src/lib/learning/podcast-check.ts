import type { PodcastEpisode } from "@/lib/learning/podcast-episode";
import {
  normalizeQuizQuestion,
  scoreQuizAnswers,
  selectedOptions,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import { parsePodcastLength, type PodcastLength } from "@/lib/learning/podcast-formats";
import type { PodcastChapter } from "@/lib/learning/podcast-script";
import { TEXTBOOK_LINE } from "@/lib/learning/podcast-textbook";

/**
 * Podcast'in dinleme kontrolü (20 Ekim 2026, kör kıyas): Astra'nın podcast'i sonda soru
 * soruyordu, bizimki "Dinledin, konu kulağında" deyip bitiyordu. Senaryo denetimden geçince
 * test motoru (`teacherQuizLoop`) senaryonun kendisinden üç soru yazar; denetçi her soruyu önce
 * kendisi çözer. Kontrol atlanabilir ("Şimdi değil"); atlanınca podcast bugünkü gibi 1/1,
 * puansız ve kanıtsız biter. Kontrol yazılamazsa podcast yine gelir, yalnız kontrolsüz.
 *
 * Saf modül: istemci ve sunucu aynı okuyucuyu kullanır.
 */

// 23 Ekim 2026 (ürün sahibinin kararı): 3 → 5; yargıçlar her turda Astra'nın beş sorusunu (vaka ve çok cevaplı dahil) daha iyi buldu.
export const PODCAST_CHECK_COUNT = 5;
/** Bundan az soru kaldıysa kontrol yok (tek soruluk kontrol ölçmez). */
export const MIN_CHECK_QUESTIONS = 2;

/** Test motorunun İSTEK satırı: kurallarla çelişirse test motorunun kuralları geçerli. */
export const PODCAST_CHECK_BRIEF =
  "Bu sorular öğrencinin az önce dinlediği podcast'in dinleme kontrolüdür. KAYNAK podcast'te konuşulanların bölüm " +
  "bölüm metnidir; yalnız orada açıkça söylenen bilgiyi sor. Her soru farklı bir bölümden, o bölümün ana fikrini, " +
  "nedenini ya da bir karşılaştırmayı yoklar; tek bir sayıyı ya da kelimeyi ezberden sorma. En az bir soru bölümde " +
  // 22 Ekim 2026 kör kıyas (2. tur): "dinleme kontrolü 3 kolay hatırlama sorusu, sınav üslubunda değil".
  "anlatılan bilgiyi kısa, somut bir durumda uygulatır (bir hasta, bir olay); durumdaki her ayrıntı konuşmada geçer. " +
  "Son soru çok cevaplıdır (birden fazla doğru şık); yanlış şıklar aynı bağlamdan. Sorular farklı türde: en az biri " +
  "bir nedeni sorar (neden önce bu etkilenir), konuşmada uyarı ya da alarm bulgusu geçtiyse biri onu yoklar; aynı " +
  "kalıpta (yaş eşleştirme gibi) en çok bir soru. Doğru şık en uzun şık olmaz. " +
  "'Öğrenci:' satırında " +
  "itiraf edilen yanılgı ('… sanmışım') doğru bilgi değildir; yalnız yanlış şık olabilir. Kökte konuşmacıdan söz " +
  "edilmez: 'podcast'te', 'dinlediğin bölümde', 'Ada', 'Kerem', 'öğretmene göre' geçmez.";

/** 1 dakikalık özette kontrol yok (ürün sahibinin kararı): ~95 kelime üç soruyu taşımaz. */
export function podcastCheckEligible(length: PodcastLength): boolean {
  return length !== "ozet";
}

const GENERAL_KNOWLEDGE = TEXTBOOK_LINE;

/**
 * Kontrolün KAYNAK'ı: bölüm bölüm konuşulanlar. Belgede olmayan, etiketli genel bilgi
 * ("Kitaplarda şöyle anlatılır: …", eski kayıtlarda "Belgende geçmiyor ama …") sorulmaz. İki sunuculu türde satırın başında rolü yazar:
 * Kerem'in itiraf ettiği yanılgı düz cümle gibi okunup doğru şık yapılmasın.
 */
export function podcastCheckSource(episode: PodcastEpisode): string {
  const duo = episode.chapters.some((chapter) => chapter.lines.some((line) => line.speaker === "kerem"));
  return episode.chapters
    .map((chapter) => {
      const lines = chapter.lines
        .filter((line) => !GENERAL_KNOWLEDGE.test(line.text.trim()))
        .map((line) => {
          const text = line.beat === "ask" ? `Dur ve düşün: ${line.text}` : line.beat === "reveal" ? `Cevap: ${line.text}` : line.text;
          return duo ? `${line.speaker === "kerem" ? "KEREM (öğrenci)" : "ADA"}: ${text}` : text;
        });
      return lines.length ? `${chapter.title}:\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Kayıttaki kontrol (attempt payload, önbellek satırı). Bozuk öğe atılır; yoksa boş. */
export function podcastCheckOf(payload: unknown): QuizQuestion[] {
  const raw = (payload as { check?: unknown } | null)?.check;
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.text !== "string" || !Array.isArray(row.options)) return [];
      const question = normalizeQuizQuestion({
        text: row.text,
        options: row.options.map((option) => String(option)),
        correct: (Array.isArray(row.correct) ? row.correct.map(String) : String(row.correct ?? "")) as string | string[],
        multi: row.multi === true,
        explanation: typeof row.explanation === "string" ? row.explanation : undefined,
        learningObjective: typeof row.learningObjective === "string" ? row.learningObjective : undefined,
        misconceptionTag: typeof row.misconceptionTag === "string" ? row.misconceptionTag : undefined,
        optionWhy: Array.isArray(row.optionWhy) ? row.optionWhy.map(String) : undefined,
        steps: Array.isArray(row.steps) ? row.steps.map(String) : undefined,
      });
      return question ? [question] : [];
    })
    .slice(0, PODCAST_CHECK_COUNT);
}

/** En az bir soru cevaplandı mı ("Şimdi değil" boş cevapla biter). */
export function podcastCheckAnswered(check: QuizQuestion[], answers: Record<string, unknown>): boolean {
  return check.some((_, index) => selectedOptions(answers[String(index)]).length > 0);
}

/** Kontrol yoksa ya da atlandıysa bugünkü gibi 1/1 (puansız); cevaplandıysa doğru sayısı / soru sayısı. */
export function scorePodcastCheck(payload: unknown, answers: Record<string, unknown>): { score: number; total: number } {
  const check = podcastCheckOf(payload);
  if (!check.length || !podcastCheckAnswered(check, answers)) return { score: 1, total: 1 };
  return scoreQuizAnswers(check, answers);
}

/** Kayıttaki podcast payload'ından önbelleğe yazılacak bölüm; podcast değilse null. */
export function podcastPayloadEpisode(payload: unknown): PodcastEpisode | null {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type !== "podcast" || typeof data.title !== "string") return null;
  if (!Array.isArray(data.chapters) || !data.chapters.length) return null;
  return { title: data.title, chapters: data.chapters as PodcastChapter[], length: parsePodcastLength(data.length) };
}
