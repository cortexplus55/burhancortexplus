/**
 * Podcast bölümü: tek öğretmen, süre seçimi, kaynak ve sayı denetimi.
 *
 * Canlıda "Ders oluştur" birkaç saniyede düşüyordu. İki ayrı kapı vardı.
 *
 * 1. Şema 180 karakteri aşan satırı tüm taslağı çöpe atıyordu. Türkçe bir
 *    öğretim cümlesi bu sınıra sığmıyor; model talimatı (25 kelime) de
 *    sık sık aşıyor. `parse` null dönünce kod `invalid_ai_response` oluyor,
 *    öğrenci ise genel cümleyi görüyordu.
 * 2. Ortak onarım yalnızca ders biçimini (`sections` / `content`) tanıyor.
 *    Podcast `{chapters}` onarımı `invalid_repair` ile düşüyordu.
 *
 * Burada taslak normalleştirilir, sayı denetimi sohbetteki aynı kapıdan
 * geçer, tutmayan cümle yenilenir. Önbellek aynı hazırlık + konu + süre
 * için ikinci üretimi ve krediyi keser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { foldTr } from "@/lib/documents/page-analysis";
import { loadTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";
import { loadPrepChatGrounding } from "@/lib/learning/prep-chat-grounding";
import { contentTokens, type SyllabusScope } from "@/lib/learning/prep-corpus";
import { emptyMistake, isScaffoldHeading } from "@/lib/learning/teaching-standards";
import {
  findAnalysisTopic,
  podcastDialogueIssues,
  type TeachingPriority,
} from "@/lib/learning/teacher-brain";
import {
  KEREM_SHARE_MAX,
  KEREM_SHARE_MIN,
  parsePodcastLength,
  podcastLengthSpec,
  speakerIdOf,
  spokenSentence,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import {
  splitSentences,
  type PodcastBeat,
  type PodcastChapter,
  type PodcastLine,
} from "@/lib/learning/podcast-script";
import { speakVerified, toDisplay } from "@/lib/learning/speech-normalizer";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { podcastCheckOf } from "@/lib/learning/podcast-check";
import { withoutTextbookLabel } from "@/lib/learning/podcast-textbook";

export {
  DEFAULT_PODCAST_LENGTH,
  PODCAST_LENGTHS,
  parsePodcastLength,
  podcastLengthSpec,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";

export type PodcastEpisode = {
  title: string;
  chapters: PodcastChapter[];
  length: PodcastLength;
};

export function podcastTopicKey(label: string): string {
  return label.trim().toLocaleLowerCase("tr-TR").replace(/s+/g, " ");
}

function stripBeatMarker(text: string): { text: string; beat?: PodcastBeat } {
  const trimmed = text.trim();
  const ask = trimmed.match(/^(?:\[dur\]|dur ve düşün\s*:)\s*/i);
  if (ask) return { text: trimmed.slice(ask[0].length).trim(), beat: "ask" };
  const reveal = trimmed.match(/^(?:\[cevap\]|cevap\s*:)\s*/i);
  if (reveal) return { text: trimmed.slice(reveal[0].length).trim(), beat: "reveal" };
  return { text: trimmed };
}

function conceptTitle(title: string, sample: string, topicLabel: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length >= 3 && !isScaffoldHeading(clean)) return clean.slice(0, 80);
  const fromLine = sample
    .replace(/^(?:\[dur\]|\[cevap\]|dur ve düşün\s*:|cevap\s*:)\s*/i, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[.!?…,:;]+$/g, "")
    .trim();
  if (fromLine.length >= 8 && !isScaffoldHeading(fromLine)) return fromLine.slice(0, 80);
  return topicLabel.trim().slice(0, 80) || "Konu";
}

/** Ekran simgeyi korur; sese giden metin ayrı durur. Ders kitabı etiketi ekranda kalır, okunmaz. */
function notationLine(text: string): { text: string; spoken: string } {
  const display = toDisplay(text.replace(/\s+/g, " ").trim());
  return { text: display, spoken: speakVerified(withoutTextbookLabel(display)) };
}

export function coercePodcastDraft(
  raw: unknown,
  input: { length: PodcastLength; topicLabel: string },
): PodcastEpisode | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const spec = podcastLengthSpec(input.length);
  const titleRaw = typeof row.title === "string" ? row.title.trim() : "";
  const title = titleRaw || input.topicLabel;
  const chaptersRaw = Array.isArray(row.chapters) ? row.chapters : [];
  const chapters: PodcastChapter[] = [];

  for (const item of chaptersRaw) {
    if (!item || typeof item !== "object") continue;
    const chapter = item as Record<string, unknown>;
    const lines: PodcastLine[] = [];
    const sourceLines = Array.isArray(chapter.lines) ? chapter.lines : [];
    for (const lineRaw of sourceLines) {
      if (!lineRaw || typeof lineRaw !== "object") continue;
      const line = lineRaw as Record<string, unknown>;
      const original = typeof line.text === "string" ? line.text : "";
      const marked = stripBeatMarker(original);
      if (!marked.text || emptyMistake(marked.text)) continue;
      for (const raw of splitSentences(marked.text)) {
        const sentence = spokenSentence(raw);
        if (!sentence) continue;
        const shown = notationLine(sentence);
        if (shown.text.length < 4) continue;
        // İki sunuculu türde konuşmacı taslaktan gelir ("öğretmen"/"sunucu" Ada'dır); tek öğretmende hep Ada.
        const speaker = spec.speakers === "duo" && speakerIdOf(line.speaker) === "kerem" ? "kerem" : "ada";
        const out: PodcastLine = { speaker, text: shown.text };
        if (shown.spoken !== shown.text) out.spoken = shown.spoken;
        if (marked.beat) out.beat = marked.beat;
        lines.push(out);
      }
    }
    if (!lines.length) continue;
    const heading = conceptTitle(
      typeof chapter.title === "string" ? chapter.title : "",
      lines[0]?.text ?? "",
      input.topicLabel,
    );
    chapters.push({ title: heading, lines });
  }

  const capped = chapters.slice(0, spec.maxChapters);
  const merged: PodcastChapter[] = [];
  for (const chapter of capped) {
    const previous = merged[merged.length - 1];
    if (previous && previous.lines.length < 2) {
      previous.lines.push(...chapter.lines);
      continue;
    }
    merged.push({ ...chapter, lines: [...chapter.lines] });
  }
  const ready = merged.filter((chapter) => chapter.lines.length >= 2);
  if (ready.length < spec.minChapters) return null;
  if (spec.speakers === "single" && podcastDialogueIssues(ready).length) return null;
  return { title: toDisplay(title).slice(0, 120), chapters: ready, length: input.length };
}

export function podcastScriptText(episode: PodcastEpisode): string {
  return episode.chapters
    .flatMap((chapter) => chapter.lines.map((line) => line.text))
    .join("\n");
}

export function podcastWordCount(episode: PodcastEpisode): number {
  return podcastScriptText(episode).split(/\s+/).filter(Boolean).length;
}

/** Kerem'in cümle payı (0-1). */
export function keremShare(episode: PodcastEpisode): number {
  const lines = episode.chapters.flatMap((chapter) => chapter.lines);
  if (!lines.length) return 0;
  return lines.filter((line) => line.speaker === "kerem").length / lines.length;
}

const ADDRESSES = { ada: /(?<!\p{L})kerem(?!\p{L})/iu, kerem: /(?<!\p{L})ada(?!\p{L})/iu } as const;

/**
 * İki sesli türde payı koda bağlar: düzeltme turu da Kerem'i %35-50 bandına getirmediyse konuşma sırasının (birden
 * çok cümlelik) son cümlesi öbür konuşmacıya yazılır. Açılış ve kapanış Ada'da kalır; bir sıranın ilk cümlesi (soruya
 * verilen cevap) yerinde kalır; soruyla biten cümle, ardından gelen konuşmacı kendi sorusunu cevaplamasın diye taşınmaz;
 * karşısındakine adıyla seslenen cümle de taşınmaz. Kod cümle yazmaz, yalnız konuşmacı alanını değiştirir.
 */
export function balanceKerem(
  episode: PodcastEpisode,
  band: { min: number; max: number } = { min: KEREM_SHARE_MIN, max: KEREM_SHARE_MAX },
): PodcastEpisode {
  const spec = podcastLengthSpec(episode.length);
  if (spec.speakers !== "duo") return episode;
  const chapters = episode.chapters.map((chapter) => ({ ...chapter, lines: chapter.lines.map((line) => ({ ...line })) }));
  const flat = chapters.flatMap((chapter) => chapter.lines);
  if (flat.length < 3) return episode;
  const total = flat.length;
  const count = () => flat.filter((line) => line.speaker === "kerem").length;
  const target = count() / total < band.min ? "kerem" : count() / total > band.max ? "ada" : null;
  if (!target) return episode;
  const from = target === "kerem" ? "ada" : "kerem";
  const inBand = () => (target === "kerem" ? count() / total >= band.min : count() / total <= band.max);

  // Önce yalnız sıranın sonundaki cümle; o da kalmadıysa (tek sesli taslak) sıranın ortasındaki cümleler.
  const pass = (relaxed: boolean): boolean => {
    let moved = false;
    for (let index = flat.length - 2; index >= 1 && !inBand(); index -= 1) {
      const line = flat[index]!;
      const previous = flat[index - 1]!;
      const next = flat[index + 1];
      if (line.speaker !== from || previous.speaker !== from) continue;
      if (next && next.speaker === from && !relaxed) continue;
      if (/\?\s*$/.test(line.text) && next && next.speaker !== from) continue;
      if (line.beat === "reveal" && previous.beat === "ask") continue;
      if (ADDRESSES[from].test(line.text)) continue;
      line.speaker = target;
      moved = true;
      if (relaxed) index -= 1;
    }
    return moved;
  };
  let progressed = true;
  while (!inBand() && progressed) progressed = pass(false) || pass(true);
  return { ...episode, chapters };
}

export async function podcastScopeBrief(
  service: SupabaseClient,
  documentIds: string[],
  topicLabel: string,
  priority: TeachingPriority | null,
): Promise<string> {
  const examples: string[] = [];
  const excluded: string[] = [];
  const current = topicLabel.trim().toLocaleLowerCase("tr-TR");
  for (const documentId of documentIds) {
    const analysis = await loadTeacherAnalysis(service, documentId);
    if (!analysis) continue;
    const topic = findAnalysisTopic(analysis, topicLabel);
    if (topic?.strategy.examples.length) examples.push(...topic.strategy.examples);
    if (topic?.strategy.workedExamplePlan) examples.push(topic.strategy.workedExamplePlan);
    for (const item of analysis.topics) {
      if (item.emphasis !== "skim") continue;
      if (item.title.trim().toLocaleLowerCase("tr-TR") === current) continue;
      excluded.push(item.title);
    }
  }
  return podcastGroundingBrief({
    priority,
    examples: [...new Set(examples.map((item) => item.trim()).filter(Boolean))].slice(0, 2),
    excludedTopics: [...new Set(excluded)].slice(0, 4),
  });
}

function sameTopic(left: string, right: string): boolean {
  const a = foldTr(left);
  const b = foldTr(right);
  if (a.length < 3 || b.length < 3) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = contentTokens(right);
  return tokens.length > 0 && tokens.every((token) => a.includes(token));
}

/**
 * Müfredat okuması sohbetle aynı korpustan gelir. Ağırlık veya kapsam
 * cümlesi yoksa boş döner; podcast o zaman kapsam uydurmaz.
 */
export function podcastSyllabusLines(topicLabel: string, scope: SyllabusScope): string {
  const lines: string[] = [];
  const weighted = scope.weighted.find((hit) => sameTopic(hit.topic, topicLabel));
  if (weighted) {
    const note = weighted.note.trim();
    lines.push(
      `Bu konu sınavda ağırlıklı${note ? ` (${note})` : ""}. Bunu bir kez, bu konunun sınavda hangi noktasının sorulduğuyla birlikte söyle ("bu konu sınavda ağırlıklı; özellikle … soruluyor"); tek başına kalıp cümle olarak kurma.`,
    );
  }
  const selfExcluded = scope.excluded.find((hit) => sameTopic(hit.topic, topicLabel));
  if (selfExcluded) {
    lines.push(`Bu konu kaynakta kapsam dışı geçiyor: "${selfExcluded.quote.trim()}". Bunu söyle.`);
  }
  const excluded = scope.excluded
    .filter((hit) => !sameTopic(hit.topic, topicLabel))
    .slice(0, 4)
    .map((hit) => hit.topic);
  if (excluded.length) {
    lines.push(
      `Sınav kapsamında olmayan konular: ${excluded.join(", ")}. ` +
        "Yalnızca bu liste duruyorsa bir cümlede kapsam dışı olduklarını söyle. Liste boşken kapsam uydurma.",
    );
  }
  return lines.join("\n");
}

/** Sayfa kaynağının yanına hazırlıktaki diğer belgelerin pasajını ekler. */
export function mergePodcastSource(pageBlock: string, excerpts: string): string {
  const extra = excerpts.trim();
  if (!extra) return pageBlock;
  const head = extra.slice(0, 80);
  if (head && pageBlock.includes(head)) return pageBlock;
  const page = pageBlock.trim();
  return page ? `${page}\n\nHazırlıktaki belgeler:\n${extra}` : extra;
}

/**
 * Sohbetin hazırlık korpusu: her belgede arama ve müfredat kapsamı.
 * Arama düşerse boş döner; üretim sayfa kaynağıyla devam eder.
 */
export async function loadPodcastCorpus(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  topicLabel: string,
): Promise<{ excerpts: string; syllabus: string }> {
  try {
    const grounding = await loadPrepChatGrounding(service, userId, prepId, topicLabel);
    return {
      excerpts: grounding.excerpts,
      syllabus: podcastSyllabusLines(topicLabel, grounding.scope),
    };
  } catch (error) {
    console.error("podcast_corpus_unavailable", {
      code: error instanceof Error ? error.name : "unknown",
    });
    return { excerpts: "", syllabus: "" };
  }
}

export function podcastGroundingBrief(input: {
  priority: TeachingPriority | null;
  examples: string[];
  excludedTopics: string[];
}): string {
  const lines: string[] = [];
  if (input.examples.length) {
    // 20 Ekim 2026 kör kıyas: bu satır yazara '"notlarındaki örnek" de' diyordu; Kerem bir podcast'te
    // dört kez "Notlarındaki örnekte …" dedi. Örnek kaynağı anmadan anlatılır; kod denetimi de
    // kaynağa göndermeyi düzeltme turuna yollar (`podcastStructureIssues`).
    lines.push(
      `Kaynaktaki örnek: ${input.examples.slice(0, 2).join(" | ")}. ` +
        "Bu örneği kendi sözlerinle, kaynağı anmadan anlat ('notlarındaki', 'belgende yazan' deme). " +
        "Sayıları bu örnekten al, yenisini uydurma.",
    );
  }
  if (input.priority === "important") {
    // 22 Ekim 2026 kör kıyas: "Bu konu sınavda ağırlıklı." bölüm sonunda bağlamsız tek satır olarak duruyordu.
    lines.push('Bu konu sınavda ağırlıklı. Bunu bir kez, bu konunun sınavda hangi noktasının sorulduğuyla birlikte söyle ("bu konu sınavda ağırlıklı; özellikle … soruluyor"); tek başına kalıp cümle olarak kurma.');
  }
  if (input.excludedTopics.length) {
    lines.push(
      `Sınav kapsamında olmayan veya daha az önemli konular: ${input.excludedTopics.slice(0, 4).join(", ")}. ` +
        "Yalnızca bu liste duruyorsa bir cümlede kapsam dışı olduklarını söyle. Liste boşken kapsam uydurma.",
    );
  }
  return lines.join("\n");
}

function cacheRelationMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("exam_prep_podcasts") ||
    message.includes("schema cache")
  );
}

/** Sütun yok: göç uygulanmadan önce yazılan kayıt (`listening_check`, 20261020150000). */
function cacheColumnMissing(error: { code?: string } | null): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

/**
 * Önbellekten podcast + dinleme kontrolü (20 Ekim 2026). Sütun listesi değil `*`: kod göçten önce
 * yayına çıkarsa adlı `listening_check` her okumayı 42703 ile düşürür, her açılış yeniden yazıp
 * yeniden ücret alırdı. Eski satırda kontrol yok (boş dizi): o podcast puansız kalır.
 */
export async function readPodcastCache(
  service: SupabaseClient,
  prepId: string,
  topicLabel: string,
  length: PodcastLength,
): Promise<(PodcastEpisode & { check: QuizQuestion[] }) | null> {
  let data: { title?: string; chapters?: unknown; length?: string; listening_check?: unknown } | null = null;
  let error: { code?: string; message?: string } | null = null;
  try {
    const result = await service
      .from("exam_prep_podcasts")
      .select("*")
      .eq("exam_prep_id", prepId)
      .eq("topic_key", podcastTopicKey(topicLabel))
      .eq("length", length)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (caught) {
    console.error("podcast_cache_skipped", {
      code: caught instanceof Error ? caught.name : "throw",
    });
    return null;
  }
  if (error) {
    console.error(cacheRelationMissing(error) ? "podcast_cache_skipped" : "podcast_cache_read_failed", {
      code: error.code ?? "unknown",
    });
    return null;
  }
  if (!data) return null;
  const chapters = Array.isArray(data.chapters) ? (data.chapters as PodcastChapter[]) : [];
  if (!chapters.length || typeof data.title !== "string") return null;
  return {
    title: data.title,
    chapters,
    length: parsePodcastLength(data.length),
    check: podcastCheckOf({ check: data.listening_check }),
  };
}

export async function writePodcastCache(
  service: SupabaseClient,
  input: {
    prepId: string;
    userId: string;
    topicLabel: string;
    episode: PodcastEpisode;
    /** Dinleme kontrolü (20 Ekim 2026); yoksa sütun boş kalır. */
    check?: QuizQuestion[];
  },
): Promise<void> {
  try {
    const row = {
      exam_prep_id: input.prepId,
      user_id: input.userId,
      topic_key: podcastTopicKey(input.topicLabel),
      topic_label: input.topicLabel.trim(),
      length: input.episode.length,
      title: input.episode.title,
      chapters: input.episode.chapters,
    };
    const upsert = (body: Record<string, unknown>) =>
      service.from("exam_prep_podcasts").upsert(body, { onConflict: "exam_prep_id,topic_key,length" });
    let { error } = await upsert({ ...row, listening_check: input.check?.length ? input.check : null });
    // Göç (20261020150000) uygulanmadıysa sütun yok: podcast kontrolsüz de olsa önbelleğe girsin.
    if (cacheColumnMissing(error)) ({ error } = await upsert(row));
    if (error) {
      console.error(cacheRelationMissing(error) ? "podcast_cache_skipped" : "podcast_cache_write_failed", {
        code: error.code ?? "unknown",
      });
    }
  } catch (caught) {
    console.error("podcast_cache_skipped", {
      code: caught instanceof Error ? caught.name : "throw",
    });
  }
}
