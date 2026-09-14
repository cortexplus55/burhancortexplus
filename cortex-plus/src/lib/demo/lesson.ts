import "server-only";
import raw from "./lesson.json";
import { createServiceClient } from "@/lib/supabase/server";
import { AUDIO_BUCKET } from "@/lib/learning/audio-cache";
import { normalizeChapters, type PodcastChapter } from "@/lib/learning/podcast-script";
import { chunkText } from "@/lib/rag/chunk";

/**
 * Örnek akış — sıfır maliyetli önizleme.
 *
 * Sayfanın gösterdiği her şey (konu çıkarımı, podcast senaryosu, quiz, sözlü
 * soruları ve seslendirme) bir kez üretilip depoya sabit veri olarak konuldu.
 * Ziyaretçi kaç kez açarsa açsın tek bir AI çağrısı yapılmıyor.
 *
 * Sesler içerik adresli önbellekte duruyor; burada yalnızca kısa ömürlü
 * imzalı URL üretiliyor — o da ücretsiz.
 */

const SIGNED_URL_SECONDS = 60 * 60;

export type DemoQuiz = {
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

/**
 * Ziyaretçiye gösterilen hat sayıları.
 *
 * Hiçbiri elle yazılmadı: sayfa sayısı kaynak PDF'ten, karakter sayısı
 * çıkarılan metnin kendisinden, parça sayısı üretimin kullandığı
 * `chunkText`ten, konu sayısı da bu dosyadaki konu listesinden geliyor.
 */
export type DemoPipeline = {
  pages: number;
  characters: number;
  chunks: number;
  topics: number;
};

export type DemoLesson = {
  sourceName: string;
  sourceHref: string;
  sourceText: string;
  pipeline: DemoPipeline;
  topics: string[];
  podcastTitle: string;
  chapters: PodcastChapter[];
  /** Cümle sırasıyla hizalı; boş dizi = ses hazırlanamadı. */
  audio: { url: string; durationMs: number }[];
  quiz: DemoQuiz[];
  oral: { prompt: string; hint?: string }[];
};

type RawShape = {
  sourceName: string;
  pages: number;
  sourceHref: string;
  sourceText: string;
  topics: string[];
  podcast: { title: string; chapters: unknown[] };
  audio: { hash: string; durationMs: number }[];
  quiz: DemoQuiz[];
  oral: { prompt: string; hint?: string }[];
};

export async function loadDemoLesson(): Promise<DemoLesson> {
  const data = raw as RawShape;
  const chapters = normalizeChapters(data.podcast.chapters);

  let audio: DemoLesson["audio"] = [];
  try {
    const service = createServiceClient();
    const paths = data.audio.map((a) => `${a.hash.slice(0, 2)}/${a.hash}.mp3`);
    const { data: signed } = await service.storage
      .from(AUDIO_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);

    const urls = (signed ?? []).map((s) => s.signedUrl ?? "");
    // Tümü gelmezse hiç ses göstermiyoruz: eksik bir listede oynatıcı
    // yanlış cümleyi vurgular.
    if (urls.length === data.audio.length && urls.every(Boolean)) {
      audio = urls.map((url, i) => ({ url, durationMs: data.audio[i].durationMs }));
    }
  } catch {
    audio = [];
  }

  return {
    sourceName: data.sourceName,
    sourceHref: data.sourceHref,
    sourceText: data.sourceText,
    // Kaynak tek sayfa, hat da parçalamayı sayfa sayfa yapıyor; bu yüzden
    // metnin tamamını parçalamak hattın bu belgede yaptığının aynısı.
    pipeline: {
      pages: data.pages,
      characters: data.sourceText.length,
      chunks: chunkText(data.sourceText).length,
      topics: data.topics.length,
    },
    topics: data.topics,
    podcastTitle: data.podcast.title,
    chapters,
    audio,
    quiz: data.quiz,
    oral: data.oral,
  };
}
