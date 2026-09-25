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

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

type Measure = {
  value: number;
  family: string;
  approx: boolean;
};

function unfoldSuperscripts(text: string): string {
  return text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) =>
    `^${[...run].map((char) => SUPERSCRIPT[char] ?? "").join("")}`,
  );
}

function familyOf(unit: string): string | null {
  const folded = foldTr(unit).replace(/\s+/g, "");
  if (/^°?[cf]$|derece|^k$/.test(folded)) return "temperature";
  if (/^(atm|bar|pa|torr|mmhg)$/.test(folded)) return "pressure";
  if (/^(l|lt|ml|m3|litre|litre)$/.test(folded) || folded === "l") return "volume";
  if (/^(g|kg|mg|gram)$/.test(folded)) return "mass";
  if (/^m\/s2?$|ms2|m\/s\^2/.test(folded)) return "acceleration";
  if (/^(mol|tanecik)$/.test(folded)) return "count";
  if (folded === "yil") return "year";
  return null;
}

function measuresIn(text: string): Measure[] {
  const prepared = unfoldSuperscripts(text).replace(/×/g, "x");
  const approx = /yaklasik|yaklaşık|about|approx|~|≈/i.test(text);
  const found: Measure[] = [];
  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(?:(?:x|\*)\s*10\s*\^\s*(\d+)|e\s*([+-]?\d+))?\s*(°\s*[CFcf]|derece|atm|bar|Pa|torr|mmHg|m\/s\^?2|m\/s²|L|l|mL|kg|mg|g|gram|mol|tanecik)?/g;
  for (const match of prepared.matchAll(pattern)) {
    const base = Number(match[1].replace(",", "."));
    if (!Number.isFinite(base)) continue;
    const exp = match[2] ?? match[3];
    const value = exp ? base * 10 ** Number(exp) : base;
    const unit = match[4] ?? "";
    let family = unit ? familyOf(unit) : null;
    if (!family && exp) family = "count";
    if (!family && !exp && Number.isInteger(base) && base >= 1000 && base <= 2099) family = "year";
    if (!family) continue;
    found.push({ value, family, approx: approx || /yaklasik|≈|~/i.test(match[0]) });
  }
  return found;
}

function claimMeasures(text: string): Measure[] {
  const all = measuresIn(text);
  const primary = all.filter((item) => item.family !== "temperature" && item.family !== "pressure");
  return primary.length ? primary : all;
}

function conditionSignature(text: string): string {
  const folded = foldTr(unfoldSuperscripts(text));
  const parts: string[] = [];
  if (/normal kosul|\bnk\b|\bstp\b/.test(folded)) parts.push("stp");
  if (/oda sicak/.test(folded)) parts.push("room");
  const measures = measuresIn(text);
  const families = new Set(measures.map((item) => item.family));
  // Sıcaklığın kendisi iddiaysa (kaynama noktası) koşul değildir.
  // Hacim gibi başka bir büyüklük varsa sıcaklık ve basınç koşuldur.
  const hasOther = [...families].some((family) => family !== "temperature" && family !== "pressure");
  for (const measure of measures) {
    if (measure.family === "temperature" && hasOther) parts.push(`temperature:${measure.value}`);
    if (measure.family === "pressure" && (hasOther || families.has("temperature"))) {
      parts.push(`pressure:${measure.value}`);
    }
  }
  return [...new Set(parts)].sort().join("|");
}

function explicitlyDifferentConditions(left: string, right: string): boolean {
  const a = conditionSignature(left);
  const b = conditionSignature(right);
  if (!a || !b || a === b) return false;
  // "normal koşullar" ile "0 °C ve 1 atm" aynı standart koşulun iki adıdır.
  const stp = (signature: string) =>
    signature === "stp" ||
    signature === "pressure:1|stp|temperature:0" ||
    signature === "pressure:1|temperature:0";
  if (stp(a) && stp(b)) return false;
  return true;
}

function closeEnough(left: Measure, right: Measure): boolean {
  // Yıl yuvarlanmaz: 1453 ile 1454 aynı olay için iki farklı iddiadır.
  if (left.family === "year" || right.family === "year") return left.value === right.value;
  if (left.value === right.value) return true;
  const scale = Math.max(Math.abs(left.value), Math.abs(right.value), 1e-9);
  const relative = Math.abs(left.value - right.value) / scale;
  if (left.approx || right.approx) return relative <= 0.05 || Math.abs(left.value - right.value) <= 0.05;
  return relative <= 0.005;
}

export type ClaimRelation = "conflict" | "same" | "candidate";

/** İki cümle aynı iddia mı, gerçekten uyumsuz mu, yoksa modele mi kalmalı. */
export function relateClaims(left: string, right: string): ClaimRelation {
  if (polarityConflicts(left, right) && !explicitlyDifferentConditions(left, right)) return "conflict";
  const leftExpr = normExpr(left);
  const rightExpr = normExpr(right);
  const formulaLike = (expr: string) => /=/.test(expr) && expr.length < 80;
  if (formulaLike(leftExpr) && formulaLike(rightExpr) && leftExpr !== rightExpr) return "conflict";

  const a = claimMeasures(left);
  const b = claimMeasures(right);
  const families = [...new Set(a.map((item) => item.family))].filter((family) =>
    b.some((item) => item.family === family),
  );
  if (!families.length) {
    if (a.length && b.length) return "same";
    const foldedLeft = foldTr(left);
    const foldedRight = foldTr(right);
    if (!foldedLeft || !foldedRight) return "same";
    if (foldedLeft.includes(foldedRight) || foldedRight.includes(foldedLeft)) return "same";
    return "candidate";
  }

  let conflict = false;
  for (const family of families) {
    const leftValues = a.filter((item) => item.family === family);
    const rightValues = b.filter((item) => item.family === family);
    const aligned = leftValues.every((item) => rightValues.some((other) => closeEnough(item, other)))
      && rightValues.every((item) => leftValues.some((other) => closeEnough(item, other)));
    if (aligned) continue;
    if (explicitlyDifferentConditions(left, right)) continue;
    conflict = true;
  }
  return conflict ? "conflict" : "same";
}

function syllabusFile(fileName: string): boolean {
  return /mufredat|syllabus|izlence|ders-konu|konu-list/.test(foldTr(fileName));
}

export function formatContradiction(item: TopicContradiction): string {
  const sides = item.claims
    .map((claim) => `${claim.fileName || "Kaynak"} «${claim.value}» diyor`)
    .join("; ");
  const syllabus = item.claims.find((claim) => syllabusFile(claim.fileName));
  const guide = syllabus
    ? `Sınavda ${syllabus.fileName} dosyasındaki değeri kullan; diğeri aynı koşullarda farklı bir iddia.`
    : "Sınavda öğretmeninin ya da müfredatın verdiği değeri kullan.";
  const why = item.claims.length >= 2 && relateClaims(item.claims[0].value, item.claims[1].value) === "conflict"
    ? "Aynı koşullarda uyuşmuyorlar; biri diğerinin yuvarlanmış ya da daha ayrıntılı hâli değil."
    : "İki kaynak aynı şey için farklı konuşuyor.";
  return `Bu konuda kaynaklar çelişiyor (${item.concept}): ${sides}. ${why} ${guide} İkisini de sakladık; birini sessizce seçmedik.`;
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

export type EquivalenceVerdict = "same" | "conflict" | "unsure";

/** Model cevabı eksik ya da bozuksa çelişki yazılmaz. */
export function parseEquivalenceVerdicts(raw: unknown, count: number): EquivalenceVerdict[] {
  const fallback = Array.from({ length: count }, () => "unsure" as const);
  if (!raw || typeof raw !== "object") return fallback;
  const list = (raw as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(list)) return fallback;
  return fallback.map((item, index) => {
    const value = list[index];
    return value === "same" || value === "conflict" || value === "unsure" ? value : item;
  });
}

export type ContradictionCandidate = {
  title: string | null;
  item: TopicContradiction;
};

function toContradiction(bucket: Bucket, claims: (ContradictionClaim & { pages: number[] })[]): TopicContradiction {
  return {
    concept: bucket.concept,
    claims: claims.map((claim) => ({
      documentId: claim.documentId,
      fileName: claim.fileName,
      value: clip(claim.value),
    })),
  };
}

function classifyBucket(bucket: Bucket): { kind: "conflict" | "candidate"; item: TopicContradiction } | null {
  const byDoc = new Map<string, (typeof bucket.claims)[number]>();
  for (const claim of bucket.claims) {
    if (!byDoc.has(claim.documentId)) byDoc.set(claim.documentId, claim);
  }
  const claims = [...byDoc.values()];
  if (claims.length < 2) return null;
  let candidate = false;
  for (let index = 0; index < claims.length; index += 1) {
    for (const other of claims.slice(index + 1)) {
      const relation = relateClaims(claims[index].value, other.value);
      if (relation === "conflict") return { kind: "conflict", item: toContradiction(bucket, claims) };
      if (relation === "candidate") candidate = true;
    }
  }
  if (!candidate) return null;
  return { kind: "candidate", item: toContradiction(bucket, claims) };
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
export type ContradictionAssignment = {
  byTitle: Map<string, TopicContradiction[]>;
  unassigned: TopicContradiction[];
  /** Sayı veya yön bunu çözemedi. Emin değilsek öğrenciye çelişki yazılmaz. */
  candidates: ContradictionCandidate[];
};

function placeContradiction(
  topics: TopicPages[],
  item: TopicContradiction,
  pages: number[],
  byTitle: Map<string, TopicContradiction[]>,
  unassigned: TopicContradiction[],
) {
  const documentIds = [...new Set(item.claims.map((claim) => claim.documentId))];
  const title = topicFor(topics, documentIds, pages, item.concept);
  if (!title) {
    unassigned.push(item);
    return;
  }
  const list = byTitle.get(title) ?? [];
  list.push(item);
  byTitle.set(title, list);
}

export function assignContradictions(
  topics: TopicPages[],
  documents: ContradictionDocument[],
): ContradictionAssignment {
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
  const candidates: ContradictionCandidate[] = [];
  for (const bucket of buckets.values()) {
    const classified = classifyBucket(bucket);
    if (!classified) continue;
    const pages = bucket.claims.flatMap((claim) => claim.pages);
    if (classified.kind === "candidate") {
      const documentIds = [...new Set(classified.item.claims.map((claim) => claim.documentId))];
      candidates.push({
        title: topicFor(topics, documentIds, pages, classified.item.concept),
        item: classified.item,
      });
      continue;
    }
    placeContradiction(topics, classified.item, pages, byTitle, unassigned);
  }
  return { byTitle, unassigned, candidates };
}

/** Model "çelişki" demedikçe aday öğrenciye gösterilmez. */
export function applyEquivalenceVerdicts(
  assignment: ContradictionAssignment,
  verdicts: EquivalenceVerdict[],
): ContradictionAssignment {
  const byTitle = new Map(assignment.byTitle);
  const unassigned = [...assignment.unassigned];
  assignment.candidates.forEach((candidate, index) => {
    if (verdicts[index] !== "conflict") return;
    if (!candidate.title) {
      unassigned.push(candidate.item);
      return;
    }
    const list = byTitle.get(candidate.title) ?? [];
    list.push(candidate.item);
    byTitle.set(candidate.title, list);
  });
  return { byTitle, unassigned, candidates: [] };
}
