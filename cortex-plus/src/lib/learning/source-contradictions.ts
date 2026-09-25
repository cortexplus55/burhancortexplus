import { foldTr } from "@/lib/documents/page-analysis";
import { topicMatchKey } from "@/lib/learning/topic-merge";

/**
 * Aynı kavram için iki kaynak farklı sayı, formül ya da yön söylüyorsa
 * ikisi de saklanır. Sessizce biri seçilmez.
 */

export type ContradictionClaim = {
  documentId: string;
  fileName: string;
  value: string;
};

export type TopicContradiction = {
  concept: string;
  claims: ContradictionClaim[];
};

export type ContradictionDocument = {
  documentId: string;
  fileName: string;
  definitions: { term: string; definition: string; pageNumbers: number[] }[];
  formulas: { expression: string; meaning: string; pageNumbers: number[] }[];
};

type TopicPages = {
  title: string;
  sources: { documentId: string; pages: number[] }[];
};

const OPPOSITES: [string, string][] = [
  ["artar", "azalir"],
  ["yukselir", "duser"],
  ["vardir", "yoktur"],
  ["dogru", "yanlis"],
  ["pozitif", "negatif"],
];

function clip(text: string, max = 180): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function numbersIn(text: string): number[] {
  const raw = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const out: number[] = [];
  for (const item of raw) {
    const value = Number(item.replace(",", "."));
    if (!Number.isFinite(value)) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out.sort((a, b) => a - b);
}

function sameNumbers(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function polarityHits(text: string): Set<string> {
  const folded = foldTr(text);
  const hits = new Set<string>();
  for (const [up, down] of OPPOSITES) {
    if (new RegExp(`\\b${up}\\b`).test(folded)) hits.add(up);
    if (new RegExp(`\\b${down}\\b`).test(folded)) hits.add(down);
  }
  return hits;
}

function polarityConflicts(left: string, right: string): boolean {
  const a = polarityHits(left);
  const b = polarityHits(right);
  for (const [up, down] of OPPOSITES) {
    if ((a.has(up) && b.has(down)) || (a.has(down) && b.has(up))) return true;
  }
  return false;
}

function normExpr(expression: string): string {
  return foldTr(expression).replace(/\s+/g, "").replace(/\\/g, "");
}

function pagesOverlap(left: number[], right: number[]): boolean {
  if (!left.length || !right.length) return false;
  const have = new Set(left);
  return right.some((page) => have.has(page));
}

export function formatContradiction(item: TopicContradiction): string {
  const sides = item.claims
    .map((claim) => `${claim.fileName || "Kaynak"} «${claim.value}» diyor`)
    .join("; ");
  return `Bu konuda kaynaklar çelişiyor (${item.concept}): ${sides}. İkisini de sakladık; birini sessizce seçmedik.`;
}

export function formatContradictions(items: TopicContradiction[]): string {
  return items.map(formatContradiction).join(" ");
}

type Bucket = {
  concept: string;
  claims: (ContradictionClaim & { pages: number[] })[];
};

function pushClaim(buckets: Map<string, Bucket>, concept: string, claim: ContradictionClaim & { pages: number[] }) {
  const key = topicMatchKey(concept);
  if (!key) return;
  const have = buckets.get(key) ?? { concept: concept.trim(), claims: [] };
  const duplicate = have.claims.some(
    (item) =>
      item.documentId === claim.documentId &&
      foldTr(item.value) === foldTr(claim.value),
  );
  if (!duplicate) have.claims.push(claim);
  buckets.set(key, have);
}

function conflicting(bucket: Bucket): TopicContradiction | null {
  const byDoc = new Map<string, (typeof bucket.claims)[number]>();
  for (const claim of bucket.claims) {
    if (!byDoc.has(claim.documentId)) byDoc.set(claim.documentId, claim);
  }
  const claims = [...byDoc.values()];
  if (claims.length < 2) return null;

  const numeric = claims.map((claim) => numbersIn(claim.value)).filter((list) => list.length);
  const numbersDiffer =
    numeric.length >= 2 &&
    numeric.some((list) => !sameNumbers(list, numeric[0]));
  const directionDiffers = claims.some((left, index) =>
    claims.slice(index + 1).some((right) => polarityConflicts(left.value, right.value)),
  );
  const expressions = claims.map((claim) => normExpr(claim.value));
  const looksLikeFormula = expressions.every((item) => /[=+\-/*^]/.test(item) || /[a-z]\/[a-z]/.test(item));
  const formulasDiffer = looksLikeFormula && new Set(expressions).size > 1;

  if (!numbersDiffer && !directionDiffers && !formulasDiffer) return null;
  return {
    concept: bucket.concept,
    claims: claims.map((claim) => ({
      documentId: claim.documentId,
      fileName: claim.fileName,
      value: clip(claim.value),
    })),
  };
}

function topicFor(
  topics: TopicPages[],
  documentIds: string[],
  pages: number[],
  concept: string,
): string | null {
  const conceptKey = topicMatchKey(concept);
  const titled = topics.find((topic) => topicMatchKey(topic.title) === conceptKey);
  if (titled) return titled.title;
  const overlapped = topics.filter((topic) =>
    topic.sources.some(
      (source) =>
        documentIds.includes(source.documentId) && pagesOverlap(source.pages, pages),
    ),
  );
  if (overlapped.length === 1) return overlapped[0].title;
  const contained = topics.filter((topic) => {
    const key = topicMatchKey(topic.title);
    if (!key || !conceptKey || key.length < 4) return false;
    return conceptKey.includes(key) || key.includes(conceptKey);
  });
  return contained.length === 1 ? contained[0].title : overlapped[0]?.title ?? null;
}

/**
 * Çelişen iddiaları konulara bağlar.
 * Eşleşen konu yoksa iddia düşmez: `unassigned` içinde kalır.
 */
export function assignContradictions(
  topics: TopicPages[],
  documents: ContradictionDocument[],
): { byTitle: Map<string, TopicContradiction[]>; unassigned: TopicContradiction[] } {
  const buckets = new Map<string, Bucket>();
  for (const document of documents) {
    for (const definition of document.definitions) {
      pushClaim(buckets, definition.term, {
        documentId: document.documentId,
        fileName: document.fileName,
        value: definition.definition,
        pages: definition.pageNumbers,
      });
    }
    for (const formula of document.formulas) {
      const concept = formula.meaning.trim() || formula.expression;
      pushClaim(buckets, concept, {
        documentId: document.documentId,
        fileName: document.fileName,
        value: formula.expression,
        pages: formula.pageNumbers,
      });
    }
  }

  const byTitle = new Map<string, TopicContradiction[]>();
  const unassigned: TopicContradiction[] = [];
  for (const bucket of buckets.values()) {
    const conflict = conflicting(bucket);
    if (!conflict) continue;
    const pages = bucket.claims.flatMap((claim) => claim.pages);
    const documentIds = [...new Set(conflict.claims.map((claim) => claim.documentId))];
    const title = topicFor(topics, documentIds, pages, conflict.concept);
    if (!title) {
      unassigned.push(conflict);
      continue;
    }
    const list = byTitle.get(title) ?? [];
    list.push(conflict);
    byTitle.set(title, list);
  }
  return { byTitle, unassigned };
}
