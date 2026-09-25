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
import OpenAI from "openai";
import { env } from "@/lib/env";
import { generateJson } from "@/lib/ai/generate";
import { foldTr } from "@/lib/documents/page-analysis";
import { loadTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";
import { loadPrepChatGrounding } from "@/lib/learning/prep-chat-grounding";
import { contentTokens, type SyllabusScope } from "@/lib/learning/prep-corpus";
import { emptyMistake, isScaffoldHeading } from "@/lib/learning/teaching-standards";
import {
  findAnalysisTopic,
  podcastDialogueIssues,
  podcastNarrationBrief,
  SINGLE_NARRATOR_SCHEMA,
  type TeachingPriority,
} from "@/lib/learning/teacher-brain";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import {
  splitSentences,
  type PodcastBeat,
  type PodcastChapter,
  type PodcastLine,
} from "@/lib/learning/podcast-script";
import { speakVerified, toDisplay } from "@/lib/learning/speech-normalizer";
import {
  auditQuantitative,
  dropUnverifiedExample,
  needsQuantModelCheck,
  parseQuantSelfCheck,
  quantSelfCheckPrompt,
  repairQuantitative,
} from "@/lib/learning/tutor-quant";

export const PODCAST_LENGTHS = ["ozet", "standart", "derin"] as const;
export type PodcastLength = (typeof PODCAST_LENGTHS)[number];

export type PodcastEpisode = {
  title: string;
  chapters: PodcastChapter[];
  length: PodcastLength;
};

export function parsePodcastLength(value: unknown): PodcastLength {
  return value === "ozet" || value === "derin" || value === "standart" ? value : "standart";
}

export function podcastTopicKey(label: string): string {
  return label.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

export function podcastLengthSpec(length: PodcastLength): {
  label: string;
  minutes: number;
  minChapters: number;
  maxChapters: number;
  brief: string;
} {
  if (length === "ozet") {
    return {
      label: "Özet",
      minutes: 1,
      minChapters: 3,
      maxChapters: 4,
      brief: "Yaklaşık 1 dakika, 3 kısa bölüm, toplam 120-180 kelime. Sınav öncesi tekrar.",
    };
  }
  if (length === "derin") {
    return {
      label: "Derinlemesine",
      minutes: 10,
      minChapters: 6,
      maxChapters: 8,
      brief: "Yaklaşık 10 dakika, 6-8 bölüm, toplam 1100-1400 kelime. Örnek ve bağlamla tam konu.",
    };
  }
  return {
    label: "Standart",
    minutes: 5,
    minChapters: 4,
    maxChapters: 6,
    brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 550-750 kelime.",
  };
}

/**
 * Formülü Türkçe konuşmaya çevirir. H₂O → "H iki O", 10²³ → "on üzeri yirmi üç".
 * "kare" ve "küp" yalnız bir değişkenin 2 ve 3. üssüdür.
 * Zaten konuşulmuş metin ("H iki O") ikinci kez değişmez.
 */
export function speakFormulas(text: string): string {
  return speakVerified(text);
}

/** Türkçe ondalık: 0.5 → 0,5. "9. sınıf" boşluklu olduğu için durur. */
export function turkishDecimalComma(text: string): string {
  return text.replace(/(\d)\.(\d)/g, "$1,$2");
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

/** Ekran simgeyi korur; sese giden metin ayrı durur. */
function notationLine(text: string): { text: string; spoken: string } {
  const display = toDisplay(text.replace(/\s+/g, " ").trim());
  return { text: display, spoken: speakVerified(display) };
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
      for (const sentence of splitSentences(marked.text)) {
        const shown = notationLine(sentence);
        if (shown.text.length < 4) continue;
        const line: PodcastLine = { speaker: "ada", text: shown.text };
        if (shown.spoken !== shown.text) line.spoken = shown.spoken;
        if (marked.beat) line.beat = marked.beat;
        lines.push(line);
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
  if (podcastDialogueIssues(ready).length) return null;
  return { title: toDisplay(title).slice(0, 120), chapters: ready, length: input.length };
}

export function podcastScriptText(episode: PodcastEpisode): string {
  return episode.chapters
    .flatMap((chapter) => chapter.lines.map((line) => line.text))
    .join("\n");
}

function dropLines(episode: PodcastEpisode, predicate: (text: string) => boolean): PodcastEpisode | null {
  const chapters = episode.chapters
    .map((chapter) => ({
      ...chapter,
      lines: chapter.lines.filter((line) => !predicate(line.text)),
    }))
    .filter((chapter) => chapter.lines.length >= 2);
  const spec = podcastLengthSpec(episode.length);
  if (chapters.length < Math.min(3, spec.minChapters)) return null;
  return { ...episode, chapters };
}

/**
 * Sayı ve yıl kapısı. Sohbetle aynı deterministik denetim.
 * Tutmayan eşitlik varsa sorun listesi döner; çağıran bir kez yeniler.
 */
export function podcastQuantIssues(episode: PodcastEpisode, source: string): string[] {
  const text = podcastScriptText(episode);
  const audit = auditQuantitative(text, source);
  const issues = audit.issues.map((issue) => issue.detail);
  if (source.trim()) {
    const stray = podcastNumbersOutsideLesson(text, source);
    if (stray.length) issues.push(`Kaynakta olmayan sayı: ${stray.join(", ")}`);
  }
  const asks = episode.chapters.flatMap((chapter) => chapter.lines).filter((line) => line.beat === "ask");
  const reveals = episode.chapters.flatMap((chapter) => chapter.lines).filter((line) => line.beat === "reveal");
  if (episode.length !== "ozet" && asks.length < 1) {
    issues.push('En az bir "Dur ve düşün" sorusu ve ardından cevap satırı yaz.');
  }
  if (asks.length && reveals.length < asks.length) {
    issues.push("Her dur-ve-düşün sorusunun hemen ardından cevap satırı gelsin.");
  }
  const last = episode.chapters[episode.chapters.length - 1];
  if (last && last.lines.length < 3 && episode.length !== "ozet") {
    issues.push("Son bölüm üç maddelik tekrar olsun; her madde ayrı satır.");
  }
  return issues;
}

export function repairPodcastEpisode(episode: PodcastEpisode, source: string): PodcastEpisode {
  const text = repairQuantitative(podcastScriptText(episode), auditQuantitative(podcastScriptText(episode), source));
  if (text === podcastScriptText(episode)) return episode;
  const lines = episode.chapters.flatMap((chapter) => chapter.lines);
  const rewritten = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (rewritten.length !== lines.length) return episode;
  let cursor = 0;
  return {
    ...episode,
    chapters: episode.chapters.map((chapter) => ({
      ...chapter,
      lines: chapter.lines.map((line) => {
        const next = notationLine(rewritten[cursor] ?? line.text);
        cursor += 1;
        return {
          ...line,
          text: next.text,
          ...(next.spoken !== next.text ? { spoken: next.spoken } : { spoken: undefined }),
        };
      }),
    })),
  };
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
      `Bu konu sınavda ağırlıklı${note ? ` (${note})` : ""}. Bunu bir cümlede açıkça söyle: "bu konu sınavda ağırlıklı".`,
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
    lines.push(
      `Öğrencinin notlarındaki örnek: ${input.examples.slice(0, 2).join(" | ")}. ` +
        'Bu örneği kullanırken "notlarındaki örnek" de. Sayıları bu örnekten al, yenisini uydurma.',
    );
  }
  if (input.priority === "important") {
    lines.push('Bu konu sınavda ağırlıklı. Bunu bir cümlede açıkça söyle: "bu konu sınavda ağırlıklı".');
  }
  if (input.excludedTopics.length) {
    lines.push(
      `Sınav kapsamında olmayan veya daha az önemli konular: ${input.excludedTopics.slice(0, 4).join(", ")}. ` +
        "Yalnızca bu liste duruyorsa bir cümlede kapsam dışı olduklarını söyle. Liste boşken kapsam uydurma.",
    );
  }
  return lines.join("\n");
}

export type Rederive = (script: string) => Promise<{ ok: boolean; note: string } | null>;

export async function rederivePodcastClaims(script: string, rederive?: Rederive): Promise<{ ok: boolean; note: string } | null> {
  const audit = auditQuantitative(script, "");
  if (!needsQuantModelCheck(script, audit)) return { ok: true, note: "" };
  if (rederive) return rederive(script);
  if (!env.OPENAI_API_KEY) return null;
  try {
    const prompt = quantSelfCheckPrompt(script);
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
    const review = await client.chat.completions.create({
      model: env.OPENAI_STANDARD_MODEL,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    return parseQuantSelfCheck(review.choices[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

function applyModelDrop(episode: PodcastEpisode): PodcastEpisode | null {
  const dropped = dropUnverifiedExample(podcastScriptText(episode));
  if (dropped === podcastScriptText(episode)) return episode;
  const kept = dropLines(episode, (text) => /→|->/.test(text) || /\d\s*[+×÷*/\-]\s*\d\s*[=≈]/.test(text));
  return kept;
}

export async function generatePodcastEpisode(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  topicLabel: string;
  sourceBlock: string;
  teacherBrief?: string;
  lessonBrief?: string;
  length: PodcastLength;
  grounding?: string;
  idempotencyKey?: string;
  requestId?: string | null;
  rederive?: Rederive;
}): Promise<
  | { ok: true; data: PodcastEpisode }
  | { ok: false; status: number; error: string; reasons: string[] }
> {
  const spec = podcastLengthSpec(input.length);
  const source = [input.lessonBrief, input.sourceBlock, input.teacherBrief].filter(Boolean).join("\n");
  const reasons: string[] = [];
  let parses = 0;

  const outcome = await generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: input.isPremium,
    difficulty: "hard",
    modelOverride: env.OPENAI_LESSON_MODEL,
    validationProfile: "v2",
    maxDraftAttempts: 2,
    allowIndependentAccept: true,
    trustIndependent: true,
    activityKind: "podcast",
    idempotencyKey: input.idempotencyKey,
    schemaHint:
      'JSON: {"title":string,"chapters":[{"title":string,"lines":[{"speaker":"ada","text":string}]}]}. ' +
      `${spec.minChapters}-${spec.maxChapters} bölüm. ` +
      "Başlık o bölümde konuşulan kavramın adı olsun. Tanım, Neden, Örnek, Özet, Yaygın hata başlık olmasın. " +
      SINGLE_NARRATOR_SCHEMA +
      ' Bir veya iki satırın başına "Dur ve düşün:" koy; hemen sonraki satır "Cevap:" ile başlasın. ' +
      "Son bölüm üç kısa tekrar maddesi olsun. Ondalık virgül kullan. Formülü ve üssü simgeyle yaz: H₂O, CO₂, 10²³, n = m/M. Konuşma diline çevirme. " +
      "İki ayrı büyüklüğü aynıdır diye yazma (mol kütlesi ile atomik kütle, kütle ile ağırlık, ısı ile sıcaklık). Sayıları eşit olabilir; birimleri farklıdır.",
    userPrompt: [
      podcastNarrationBrief(),
      spec.brief,
      `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}.`,
      input.grounding ?? "",
      input.teacherBrief ? `Öğretmen notu:\n${input.teacherBrief}` : "",
      input.lessonBrief ? `Ders özeti (sayıları bunun dışına çıkarma):\n${input.lessonBrief}` : "",
      input.sourceBlock ? `Kaynak:\n${input.sourceBlock}` : "",
      "Tek öğretmen anlatır. Benzetme açıklamanın yerine geçmez. Yaygın hatayı somut söyle.",
      "Kaynakta olmayan sayı, formül ve kapsam cümlesi yazma.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    buildIndependent: (_content, parsed) => {
      const coerced = coercePodcastDraft(parsed, { length: input.length, topicLabel: input.topicLabel });
      return {
        pedagogyIssues: coerced ? [] : ["Podcast bölümleri kurulamadı. Her bölümde en az iki cümle olsun."],
        minItems: spec.minChapters,
        sourceExcerpt: source,
        requireSourceSupport: Boolean(source.trim()),
      };
    },
    describeParseFailure: () => reasons.slice(0, 6),
    parse: (raw) => {
      parses += 1;
      let episode = coercePodcastDraft(raw, { length: input.length, topicLabel: input.topicLabel });
      if (!episode) {
        reasons.push("Podcast bölümleri kurulamadı.");
        return null;
      }
      episode = repairPodcastEpisode(episode, source);
      const issues = podcastQuantIssues(episode, source);
      if (issues.length && parses < 2) {
        reasons.splice(0, reasons.length, ...issues);
        return null;
      }
      if (issues.length) {
        const stray = issues.find((issue) => issue.startsWith("Kaynakta olmayan sayı"));
        const stripped = stray
          ? dropLines(episode, (text) => podcastNumbersOutsideLesson(text, source).length > 0)
          : episode;
        if (!stripped) {
          reasons.splice(0, reasons.length, ...issues);
          return null;
        }
        episode = stripped;
      }
      return episode;
    },
  });

  if (!outcome.ok) {
    console.error("podcast_generation_failed", {
      requestId: input.requestId ?? null,
      code: outcome.error,
      reasons: reasons.slice(0, 6),
    });
    return { ok: false, status: outcome.status, error: outcome.error, reasons: reasons.slice(0, 6) };
  }

  let episode = outcome.data;
  const verdict = await rederivePodcastClaims(podcastScriptText(episode), input.rederive);
  if (verdict && !verdict.ok) {
    const dropped = applyModelDrop(episode);
    if (dropped) {
      episode = dropped;
    } else {
      // Deterministik denetim geçmiş bir metin. Küçük model uyuşmazsa
      // örneği düşüremiyorsak üretimi çöpe atmayız: kredi bu noktada
      // yazılmış olur ve öğrenci hem parasını hem podcasti kaybeder.
      console.error("podcast_rederive_kept", {
        requestId: input.requestId ?? null,
        note: verdict.note || "Sayısal iddia yeniden türetilemedi.",
      });
    }
  }

  return { ok: true, data: episode };
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

export async function readPodcastCache(
  service: SupabaseClient,
  prepId: string,
  topicLabel: string,
  length: PodcastLength,
): Promise<PodcastEpisode | null> {
  let data: { title?: string; chapters?: unknown; length?: string } | null = null;
  let error: { code?: string; message?: string } | null = null;
  try {
    const result = await service
      .from("exam_prep_podcasts")
      .select("title, chapters, length")
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
  return { title: data.title, chapters, length: parsePodcastLength(data.length) };
}

export async function writePodcastCache(
  service: SupabaseClient,
  input: { prepId: string; userId: string; topicLabel: string; episode: PodcastEpisode },
): Promise<void> {
  try {
    const { error } = await service.from("exam_prep_podcasts").upsert(
      {
        exam_prep_id: input.prepId,
        user_id: input.userId,
        topic_key: podcastTopicKey(input.topicLabel),
        topic_label: input.topicLabel.trim(),
        length: input.episode.length,
        title: input.episode.title,
        chapters: input.episode.chapters,
      },
      { onConflict: "exam_prep_id,topic_key,length" },
    );
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
