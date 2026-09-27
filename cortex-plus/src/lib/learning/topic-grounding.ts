import { foldTr } from "@/lib/documents/page-analysis";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";

/**
 * Öğrencinin yazdığı konu başlığı belgede duruyor mu?
 *
 * Model çağrılmaz. Başlık ya mevcut bir konu adıyla örtüşür ya da
 * belgenin sayfa metninde / başlığında geçer. Uydurma konu kabul edilmez.
 */

export const TOPIC_NOT_IN_MATERIAL =
  "Bu başlık yüklediğin materyalde geçmiyor. Konu, belgede yazan bir başlık ya da kavram olmalı.";

const STOP_WORDS = new Set([
  "ve",
  "bir",
  "bu",
  "su",
  "icin",
  "ile",
  "olan",
  "olarak",
  "gibi",
  "daha",
  "cok",
  "her",
  "konu",
  "ders",
  "nedir",
  "nasil",
  "the",
  "and",
  "of",
  "to",
  "with",
  "for",
]);

export type GroundPage = {
  pageNumber: number;
  text: string;
  headings: string[];
  documentId?: string;
  searchText?: string;
};

export type GroundingCorpus = {
  titles: string[];
  pages: GroundPage[];
  fileNamesByDocument?: Record<string, string>;
};

export type GroundMatch = {
  ok: true;
  linkedTitle: string | null;
  pageNumbers: number[];
  sourceRefs: TopicSourceRef[];
};

export type GroundRejection = {
  ok: false;
  message: string;
};

function distinctiveWords(folded: string): string[] {
  return folded
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

function pageBlob(page: GroundPage): string {
  return page.searchText ?? foldTr([page.text, ...page.headings].join("\n"));
}

function hasWord(blob: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${word}(?:[^a-z0-9]|$)`).test(blob);
}

function pagesMatching(corpus: GroundingCorpus, test: (page: GroundPage, blob: string) => boolean): GroundPage[] {
  return corpus.pages
    .filter((page) => test(page, pageBlob(page)))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

function groundMatch(
  corpus: GroundingCorpus,
  linkedTitle: string | null,
  pages: GroundPage[],
): GroundMatch {
  const byDocument = new Map<string, number[]>();
  for (const page of pages) {
    if (!page.documentId) continue;
    const numbers = byDocument.get(page.documentId) ?? [];
    numbers.push(page.pageNumber);
    byDocument.set(page.documentId, numbers);
  }
  return {
    ok: true,
    linkedTitle,
    pageNumbers: [...new Set(pages.map((page) => page.pageNumber))].sort((a, b) => a - b),
    sourceRefs: [...byDocument].map(([documentId, numbers]) => ({
      documentId,
      fileName: corpus.fileNamesByDocument?.[documentId] ?? "",
      pages: [...new Set(numbers)].sort((a, b) => a - b),
      nodeId: null,
    })),
  };
}

function linkExistingTitle(want: string, titles: string[]): string | null {
  let best: string | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const existing of titles) {
    const have = foldTr(existing);
    if (!have || !want) continue;
    if (have === want) return existing;
    if (have.length < 4 || want.length < 4) continue;
    if (!want.includes(have) && !have.includes(want)) continue;
    const gap = Math.abs(have.length - want.length);
    if (gap < bestGap) {
      best = existing;
      bestGap = gap;
    }
  }
  return best;
}

export function topicRejectedMessage(title: string): string {
  const clean = title.trim();
  if (!clean) return TOPIC_NOT_IN_MATERIAL;
  return `«${clean}» yüklediğin materyalde geçmiyor. Konu, belgede yazan bir başlık ya da kavram olmalı.`;
}

export function groundTopicTitle(
  title: string,
  corpus: GroundingCorpus,
): GroundMatch | GroundRejection {
  const raw = title.trim();
  const want = foldTr(raw).replace(/\s+/g, " ").trim();
  if (want.length < 3) return { ok: false, message: topicRejectedMessage(raw) };

  const linked = linkExistingTitle(want, corpus.titles);
  if (linked) {
    const linkedFold = foldTr(linked);
    const pages = pagesMatching(corpus, (_page, blob) => blob.includes(linkedFold));
    return groundMatch(corpus, linked, pages);
  }

  if (want.length >= 4) {
    const inHeading = pagesMatching(corpus, (page) =>
      page.headings.some((heading) => foldTr(heading).includes(want)),
    );
    if (inHeading.length) {
      return groundMatch(corpus, null, inHeading);
    }
  }

  if (want.length >= 8) {
    const inBody = pagesMatching(corpus, (_page, blob) => blob.includes(want));
    if (inBody.length) {
      return groundMatch(corpus, null, inBody);
    }
  }

  const words = distinctiveWords(want);
  if (words.length >= 2) {
    const together = pagesMatching(corpus, (_page, blob) =>
      words.every((word) => hasWord(blob, word)),
    );
    if (together.length) {
      return groundMatch(corpus, null, together);
    }
  }

  if (words.length === 1 && words[0].length >= 5) {
    const word = words[0];
    const hit = pagesMatching(corpus, (_page, blob) => hasWord(blob, word));
    if (hit.length) {
      return groundMatch(corpus, null, hit);
    }
  }

  return { ok: false, message: topicRejectedMessage(raw) };
}
