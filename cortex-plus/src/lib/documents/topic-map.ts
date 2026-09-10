/**
 * Build a document topic map from page analyses.
 * Heuristic only (no model calls) so CI and smoke probes stay free.
 */

import type { PageAnalysis } from "@/lib/documents/page-analysis";

export type TopicDraft = {
  title: string;
  learningObjective: string | null;
  prerequisites: string[];
  keyDefinitions: string[];
  keyRelations: string[];
  workedExamples: string[];
  commonMistakes: string[];
  sourceExercises: string[];
  pageNumbers: number[];
  /** Temporary key used while merging similar titles. */
  mergeKey: string;
};

export type TopicMapBuildResult = {
  topics: TopicDraft[];
  mergedTitles: { kept: string; dropped: string[] }[];
};

const SKIP_KINDS = new Set(["cover", "toc", "answer_key", "blank"]);

/** Known trigonometry sub-areas the plan calls out as separately trackable. */
const TRIG_SPLITTERS: { pattern: RegExp; title: string; objective: string }[] = [
  {
    pattern: /derece|radyan|°|π\s*radyan/i,
    title: "Derece ve radyan",
    objective: "Açı ölçü birimlerini birbirine çevirmek.",
  },
  {
    pattern: /birim\s*çember|birim\s*cember|unit\s*circle/i,
    title: "Birim çember",
    objective: "Birim çember üzerinde sinüs ve kosinüs değerlerini okumak.",
  },
  {
    pattern: /işaret|isaret|bölge|bolge|quadrant|referans\s*aç[ıi]/i,
    title: "İşaretler ve bölgeler",
    objective: "Dört bölgede trigonometrik fonksiyon işaretlerini belirlemek.",
  },
  {
    pattern: /kimlik|özdeşlik|ozdeslik|identity|sin\s*[²2]|cos\s*[²2]/i,
    title: "Trigonometrik kimlikler",
    objective: "Temel kimlikleri kullanarak ifadeleri sadeleştirmek.",
  },
  {
    pattern:
      /(?:trigonometr\w*|sin|cos|tan).{0,80}(?:grafik|graph|dalga|periyot|amplitude)|(?:y\s*=\s*[Aa]?\s*sin)/i,
    title: "Trigonometrik grafikler",
    objective: "Sinüs/kosinüs grafiklerini yorumlamak.",
  },
  {
    pattern:
      /(?:trigonometr\w*|sin|cos|tan).{0,80}denklem|denklem.{0,40}(?:sin|cos|tan)|sin\s*θ\s*=/i,
    title: "Trigonometrik denklemler",
    objective: "Basit trigonometrik denklemleri çözmek.",
  },
];

/** Stage 10 — non-trig curriculum seeds for subject-variety fixtures. */
const DOMAIN_SPLITTERS: { pattern: RegExp; title: string; objective: string }[] = [
  {
    pattern: /\b(newton|kuvvet|ivme|momentum|kinetik\s*enerji|potansiyel\s*enerji)\b/i,
    title: "Kuvvet ve hareket",
    objective: "Newton yasalarıyla kuvvet, ivme ve enerji ilişkilerini kurmak.",
  },
  {
    pattern: /\b(ohm|direnç|akım|voltaj|elektrik\s*devre|coulomb)\b/i,
    title: "Elektrik",
    objective: "Basit doğru akım devrelerinde Ohm yasasını uygulamak.",
  },
  {
    pattern: /\b(mol|avogadro|periyodik|asit|baz|tepki\s*denklemi|molekül)\b/i,
    title: "Kimyasal tepkimeler",
    objective: "Mol kavramı ve basit tepkime denklemlerini yorumlamak.",
  },
  {
    pattern: /\b(fotosentez|hücre|mitokondri|dna|enzim|klorofil)\b/i,
    title: "Hücre ve enerji",
    objective: "Hücresel enerji dönüşümlerini ve organelleri ayırt etmek.",
  },
  {
    pattern: /\b(osmanlı|cumhuriyet|inkılap|selçuklu|anadolu\s*beylik|lozan)\b/i,
    title: "Tarih",
    objective: "Dönem olaylarını neden-sonuç ilişkisiyle sıralamak.",
  },
  {
    pattern: /\b(iklim|harita|nüfus|yer\s*şekil|coğrafya|plato|delta)\b/i,
    title: "Coğrafya",
    objective: "Harita ve yer şekilleri üzerinden coğrafi kavramları okumak.",
  },
  {
    pattern: /\b(fiil|özne|yüklem|paragraf|anlatım\s*bozukluğu|yazım\s*kural|edat)\b/i,
    title: "Türkçe dil bilgisi",
    objective: "Cümle öğeleri ve anlatım kurallarını uygulamak.",
  },
];

function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeKeyFor(title: string): string {
  return normalizeTitle(title).slice(0, 48);
}

function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) >= 8;
  }
  return false;
}

function definitionsFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (/^.+:\s+.+/.test(trimmed) && trimmed.length < 140) {
      out.push(trimmed.slice(0, 140));
    } else if (/\b(tanım|tanim|definition)\b/i.test(trimmed)) {
      out.push(trimmed.slice(0, 140));
    }
  }
  return out.slice(0, 8);
}

function examplesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/\b(örnek|ornek|example|çözüm|cozum)\b/i.test(line)) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 8);
}

function exercisesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/^\s*(\d+[.)]|[a-d][.)]|soru)\s+/i.test(line) && line.length > 8) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 10);
}

function mistakesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/\b(yanlış|yanlis|hata|dikkat|kaçın|kacin|common\s*mistake)\b/i.test(line)) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 6);
}

function relationsFromFormulas(formulas: string[]): string[] {
  return formulas.filter((f) => /[=≠≈]/.test(f)).slice(0, 10);
}

function topicSeedsForPage(page: PageAnalysis): { title: string; objective: string | null }[] {
  const blob = [page.headings.join(" "), page.textContent.slice(0, 1600)].join("\n");
  const seeds: { title: string; objective: string | null }[] = [];

  for (const splitter of TRIG_SPLITTERS) {
    if (splitter.pattern.test(blob)) {
      seeds.push({ title: splitter.title, objective: splitter.objective });
    }
  }

  // Prefer canonical curriculum splits when they fire; headings become notes only.
  if (seeds.length) return seeds;

  for (const splitter of DOMAIN_SPLITTERS) {
    if (splitter.pattern.test(blob)) {
      seeds.push({ title: splitter.title, objective: splitter.objective });
    }
  }
  if (seeds.length) return seeds;

  if (page.pageKind === "content") {
    seeds.push({
      title: `Sayfa ${page.pageNumber} içeriği`,
      objective: "Bu sayfadaki öğretim içeriğini anlamak.",
    });
  }

  return seeds;
}

/**
 * Build topic drafts from analyzed pages. Content pages without a topic seed
 * still get a page-local topic so coverage can reach 100% of instructional pages.
 */
export function buildTopicMap(pages: PageAnalysis[]): TopicMapBuildResult {
  const drafts = new Map<string, TopicDraft>();
  const mergedTitles: { kept: string; dropped: string[] }[] = [];

  const ensureTopic = (
    title: string,
    objective: string | null,
  ): TopicDraft => {
    const key = mergeKeyFor(title);
    const existing = drafts.get(key);
    if (existing) return existing;

    for (const [otherKey, other] of drafts) {
      if (titlesSimilar(other.title, title)) {
        const bucket = mergedTitles.find((m) => m.kept === other.title);
        if (bucket) bucket.dropped.push(title);
        else mergedTitles.push({ kept: other.title, dropped: [title] });
        // Prefer canonical curriculum titles over numbered heading variants.
        const preferIncoming =
          Boolean(objective) ||
          (!other.learningObjective && title.length > other.title.length);
        if (preferIncoming) other.title = title;
        if (!other.learningObjective && objective) {
          other.learningObjective = objective;
        }
        return other;
      }
      void otherKey;
    }

    const draft: TopicDraft = {
      title,
      learningObjective: objective,
      prerequisites: [],
      keyDefinitions: [],
      keyRelations: [],
      workedExamples: [],
      commonMistakes: [],
      sourceExercises: [],
      pageNumbers: [],
      mergeKey: key,
    };
    drafts.set(key, draft);
    return draft;
  };

  for (const page of pages) {
    if (SKIP_KINDS.has(page.pageKind)) continue;
    if (page.pageKind === "unreadable" || page.pageKind === "uncertain") {
      // Still attempt linkage when some text exists; coverage reports the gap.
      if (!page.extractionOk && page.charCount < 20) continue;
    }

    const seeds = topicSeedsForPage(page);
    for (const seed of seeds) {
      const topic = ensureTopic(seed.title, seed.objective);
      if (!topic.pageNumbers.includes(page.pageNumber)) {
        topic.pageNumbers.push(page.pageNumber);
      }
      topic.keyDefinitions.push(...definitionsFromText(page.textContent));
      topic.keyRelations.push(...relationsFromFormulas(page.formulas));
      topic.workedExamples.push(...examplesFromText(page.textContent));
      topic.commonMistakes.push(...mistakesFromText(page.textContent));
      topic.sourceExercises.push(...exercisesFromText(page.textContent));
    }
  }

  // Deduplicate list fields and sort page numbers.
  const topics = [...drafts.values()].map((topic, index) => ({
    ...topic,
    sortHint: index,
    pageNumbers: [...new Set(topic.pageNumbers)].sort((a, b) => a - b),
    keyDefinitions: [...new Set(topic.keyDefinitions)].slice(0, 12),
    keyRelations: [...new Set(topic.keyRelations)].slice(0, 12),
    workedExamples: [...new Set(topic.workedExamples)].slice(0, 12),
    commonMistakes: [...new Set(topic.commonMistakes)].slice(0, 8),
    sourceExercises: [...new Set(topic.sourceExercises)].slice(0, 12),
    prerequisites: inferPrerequisites(topic.title, [...drafts.values()]),
  }));

  topics.sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));

  return { topics, mergedTitles };
}

/**
 * Build one draft from a model-produced topic (title + objective + pages).
 * Mirrors the enrichment {@link buildTopicMap} does per page, so the persisted
 * shape and coverage report are identical whichever builder ran.
 */
export function draftFromLlmTopic(
  title: string,
  learningObjective: string | null,
  pageNumbers: number[],
  pages: PageAnalysis[],
  index: number,
) {
  const byNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const draft: TopicDraft & { sortHint: number } = {
    title,
    learningObjective: learningObjective?.trim() || null,
    prerequisites: [],
    keyDefinitions: [],
    keyRelations: [],
    workedExamples: [],
    commonMistakes: [],
    sourceExercises: [],
    pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
    mergeKey: mergeKeyFor(`${title} ${index}`),
    sortHint: index,
  };

  for (const pageNumber of draft.pageNumbers) {
    const page = byNumber.get(pageNumber);
    if (!page) continue;
    draft.keyDefinitions.push(...definitionsFromText(page.textContent));
    draft.keyRelations.push(...relationsFromFormulas(page.formulas));
    draft.workedExamples.push(...examplesFromText(page.textContent));
    draft.commonMistakes.push(...mistakesFromText(page.textContent));
    draft.sourceExercises.push(...exercisesFromText(page.textContent));
  }

  draft.keyDefinitions = [...new Set(draft.keyDefinitions)].slice(0, 12);
  draft.keyRelations = [...new Set(draft.keyRelations)].slice(0, 12);
  draft.workedExamples = [...new Set(draft.workedExamples)].slice(0, 12);
  draft.commonMistakes = [...new Set(draft.commonMistakes)].slice(0, 8);
  draft.sourceExercises = [...new Set(draft.sourceExercises)].slice(0, 12);
  return draft;
}

function inferPrerequisites(title: string, all: TopicDraft[]): string[] {
  const order = [
    "Derece ve radyan",
    "Birim çember",
    "İşaretler ve bölgeler",
    "Trigonometrik kimlikler",
    "Trigonometrik grafikler",
    "Trigonometrik denklemler",
  ];
  const idx = order.indexOf(title);
  if (idx <= 0) return [];
  const prior = order[idx - 1];
  return all.some((t) => t.title === prior) ? [prior] : [];
}
