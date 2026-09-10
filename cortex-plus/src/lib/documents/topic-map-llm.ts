import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import type { PageAnalysis } from "@/lib/documents/page-analysis";
import {
  draftFromLlmTopic,
  type TopicMapBuildResult,
} from "@/lib/documents/topic-map";

/**
 * Model-backed topic map. The heuristic in {@link buildTopicMap} only recognises
 * a fixed trigonometry/curriculum fixture set; for any other document it emits
 * coincidental or "Sayfa N" titles. This reads the actual page text and returns
 * the document's own topic structure, the way a real syllabus map would look.
 *
 * Returns `null` on any failure (no key, insufficient credits, invalid output)
 * so the caller can fall back to the heuristic without surfacing an error.
 */

const llmSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        learningObjective: z.string().trim().min(4).max(240).nullable(),
        pageNumbers: z.array(z.number().int().positive()).min(1).max(60),
      }),
    )
    .min(1)
    .max(24),
});

const MAX_PAGE_CHARS = 900;

function pageDigest(pages: PageAnalysis[]): string {
  return pages
    .filter((page) => page.pageKind === "content" || page.pageKind === "uncertain")
    .map((page) => {
      const heading = page.headings[0] ? ` [${page.headings[0]}]` : "";
      const body = page.textContent.replace(/\s+/g, " ").slice(0, MAX_PAGE_CHARS);
      return `--- Sayfa ${page.pageNumber}${heading}\n${body}`;
    })
    .join("\n");
}

export async function buildTopicMapLLM(
  service: SupabaseClient,
  documentId: string,
  userId: string,
  fileName: string,
  pages: PageAnalysis[],
): Promise<TopicMapBuildResult | null> {
  const contentPages = pages.filter(
    (page) => page.pageKind === "content" || page.pageKind === "uncertain",
  );
  if (contentPages.length < 2) return null;

  const contentNumbers = new Set(contentPages.map((page) => page.pageNumber));

  let outcome;
  try {
    outcome = await generateJson({
      service,
      userId,
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: await isPremiumUser(service, userId),
      verificationMode: "schema",
      schemaHint:
        'JSON: {"topics":[{"title":string,"learningObjective":string|null,"pageNumbers":number[]}]}. ' +
        "title: belgenin kendi dilinde, o bölümün gerçek konu başlığı (5-9 kelime, \"Sayfa N\" yazma). " +
        "learningObjective: o konuda öğrencinin kazanacağı beceri, tek cümle. " +
        "pageNumbers: konunun işlendiği sayfa numaraları. " +
        "Konular belgedeki sıraya göre; her öğretim sayfası en az bir konuya bağlanmalı; 4-14 konu ideal.",
      userPrompt: `Aşağıda "${fileName}" adlı ders belgesinin sayfa sayfa metni var. Belgenin konu haritasını çıkar: her ana konu için başlık, öğrenme hedefi ve o konunun geçtiği sayfa numaraları. Sadece bu belgede geçen konuları kullan, dışarıdan konu ekleme.\n\n${pageDigest(contentPages)}`,
      parse: (raw) => {
        const parsed = llmSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      },
    });
  } catch {
    return null;
  }

  if (!outcome.ok) return null;

  const seen = new Set<string>();
  const topics = outcome.data.topics
    .map((topic) => {
      const pageNumbers = [...new Set(topic.pageNumbers)]
        .filter((n) => contentNumbers.has(n))
        .sort((a, b) => a - b);
      return { ...topic, pageNumbers };
    })
    .filter((topic) => {
      if (!topic.pageNumbers.length) return false;
      const key = topic.title.toLocaleLowerCase("tr").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((topic, index) =>
      draftFromLlmTopic(
        topic.title,
        topic.learningObjective,
        topic.pageNumbers,
        pages,
        index,
      ),
    );

  if (topics.length < 2) return null;

  // Attach any content page the model missed to the nearest earlier topic so
  // coverage can still reach 100%.
  const linked = new Set<number>();
  for (const topic of topics) for (const n of topic.pageNumbers) linked.add(n);
  for (const page of contentPages) {
    if (linked.has(page.pageNumber)) continue;
    let host = topics[0];
    for (const topic of topics) {
      if ((topic.pageNumbers[0] ?? Infinity) <= page.pageNumber) host = topic;
    }
    host.pageNumbers = [...new Set([...host.pageNumbers, page.pageNumber])].sort(
      (a, b) => a - b,
    );
  }

  topics.sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));

  return { topics, mergedTitles: [] };
}
