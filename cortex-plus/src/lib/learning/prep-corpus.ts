/**
 * Hazırlığın bütün belgelerinden kapsam kararı ve sınav programı okuması.
 *
 * Müfredat tespitinin şemasına yazmaz. Ana koddaki analiz JSON'unda ağırlık
 * veya kapsam alanı varsa okur; yoksa metindeki cümlelere bakar. İkisi de
 * yoksa boş döner.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import type { TeacherAnalysis } from "@/lib/learning/teacher-brain";

export type CorpusDoc = {
  documentId: string;
  documentName: string;
  text: string;
  pageNumber?: number | null;
  slide?: boolean;
};

export type CoverageDecision = "in" | "out" | "unknown";

export type ScopeHit = {
  topic: string;
  quote: string;
  documentName: string;
  pageNumber: number | null;
};

export type WeightHit = {
  topic: string;
  documentName: string;
  note: string;
  weight: number | null;
};

export type SyllabusScope = {
  excluded: ScopeHit[];
  weighted: WeightHit[];
};

const STOP = new Set([
  "nedir", "nasil", "nasıl", "anlat", "anlatir", "misin", "misiniz", "bana",
  "icin", "için", "kadar", "sonra", "once", "önce", "hangi", "hangisi",
  "neden", "diye", "olan", "olarak", "bunu", "suna", "şunu", "soyle", "söyle",
  "about", "there", "which", "would", "could", "please", "explain",
]);

export function contentTokens(text: string): string[] {
  return foldTr(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !STOP.has(word) && !/^\d+$/.test(word));
}

/**
 * Alıntı veya analiz metni soruya değiyorsa materyal içidir.
 * Hiç belge yoksa "unknown": "Materyal dışı" yapıştırılmaz.
 */
export function coverageDecision(
  question: string,
  docs: { text: string }[],
  hitCount: number,
): CoverageDecision {
  const corpus = docs.map((doc) => doc.text).join("\n").trim();
  if (!corpus && hitCount <= 0) return "unknown";
  if (hitCount > 0) return "in";
  const tokens = contentTokens(question);
  if (!tokens.length) return "in";
  const hay = foldTr(corpus);
  return tokens.some((token) => hay.includes(token)) ? "in" : "out";
}

export function flattenTeacherAnalysis(analysis: TeacherAnalysis, documentName: string): string {
  const lines = [`Belge: ${documentName}`, analysis.summary];
  for (const item of analysis.examFocus.keyDefinitions) {
    lines.push(`Tanım: ${item.term} — ${item.definition}`);
  }
  for (const item of analysis.examFocus.keyFormulas) {
    lines.push(`Formül: ${item.expression} — ${item.meaning}`);
  }
  for (const topic of analysis.topics) {
    lines.push(`Konu: ${topic.title} (${topic.emphasis})`);
    lines.push(...topic.strategy.examples);
  }
  for (const trap of analysis.misconceptions) {
    lines.push(`Yanılgı: ${trap.mistake} → ${trap.correction}`);
  }
  return lines.filter(Boolean).join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 1);
}

function pushExcluded(target: ScopeHit[], topic: string, quote: string, documentName: string, pageNumber: number | null) {
  const clean = topic.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return;
  const key = foldTr(clean);
  if (target.some((item) => foldTr(item.topic) === key)) return;
  target.push({ topic: clean, quote: quote.trim() || clean, documentName, pageNumber });
}

function pushWeighted(target: WeightHit[], topic: string, documentName: string, note: string, weight: number | null) {
  const clean = topic.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return;
  const key = foldTr(clean);
  if (target.some((item) => foldTr(item.topic) === key)) return;
  target.push({ topic: clean, documentName, note, weight });
}

function readLooseAnalysis(raw: unknown, documentName: string, scope: SyllabusScope) {
  const row = asRecord(raw);
  if (!row) return;
  for (const topic of stringList(row.excludedTopics ?? row.outOfScope)) {
    pushExcluded(scope.excluded, topic, topic, documentName, null);
  }
  const nested = asRecord(row.scope) ?? asRecord(row.examScope);
  if (nested) {
    for (const topic of stringList(nested.excluded ?? nested.outOfScope)) {
      pushExcluded(scope.excluded, topic, topic, documentName, null);
    }
    const weights = Array.isArray(nested.weights) ? nested.weights : [];
    for (const item of weights) {
      const rec = asRecord(item);
      if (!rec || typeof rec.topic !== "string") continue;
      const weight = typeof rec.weight === "number" ? rec.weight : null;
      pushWeighted(scope.weighted, rec.topic, documentName, weight != null ? `ağırlık ${weight}` : "ağırlıklı", weight);
    }
  }
  if (Array.isArray(row.weights)) {
    for (const item of row.weights) {
      const rec = asRecord(item);
      if (!rec || typeof rec.topic !== "string") continue;
      const weight = typeof rec.weight === "number" ? rec.weight : null;
      pushWeighted(scope.weighted, rec.topic, documentName, typeof rec.note === "string" ? rec.note : "ağırlıklı", weight);
    }
  }
  if (Array.isArray(row.topics)) {
    for (const item of row.topics) {
      const rec = asRecord(item);
      if (!rec || typeof rec.title !== "string") continue;
      if (rec.outOfScope === true || rec.inScope === false) {
        pushExcluded(scope.excluded, rec.title, rec.title, documentName, null);
      }
      const weight = typeof rec.weight === "number" ? rec.weight : null;
      if (rec.emphasis === "core" || (weight != null && weight >= 20)) {
        pushWeighted(scope.weighted, rec.title, documentName, weight != null ? `ağırlık ${weight}` : "çekirdek konu", weight);
      }
    }
  }
}

function readProse(text: string, documentName: string, pageNumber: number | null, scope: SyllabusScope) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const excluded = sentence.match(/(.{3,80}?)\s+sınav kapsamı dışındadır/i)
      ?? sentence.match(/(.{3,80}?)\s+kapsam dışındadır/i);
    if (excluded) {
      const topic = excluded[1].replace(/^.*\b(?:ve|ile|ancak|fakat)\s+/i, "").trim();
      pushExcluded(scope.excluded, topic, sentence.trim(), documentName, pageNumber);
    }
    const weighted = sentence.match(/(.{3,60}?)\s+(?:ağırlıklı(?:\s+konu(?:dur|su)?)?|yüksek ağırlıklı|en çok puan)/i);
    if (weighted) {
      const topic = weighted[1].replace(/^.*\b(?:olan|ise|olarak)\s+/i, "").trim();
      pushWeighted(scope.weighted, topic, documentName, sentence.trim(), null);
    }
  }
}

export function readSyllabusScope(docs: Array<{
  documentName: string;
  text: string;
  pageNumber?: number | null;
  analysis?: unknown;
}>): SyllabusScope {
  const scope: SyllabusScope = { excluded: [], weighted: [] };
  for (const doc of docs) {
    readLooseAnalysis(doc.analysis, doc.documentName, scope);
    if (doc.text.trim()) readProse(doc.text, doc.documentName, doc.pageNumber ?? null, scope);
  }
  scope.weighted.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return scope;
}

export function matchExcludedTopic(question: string, scope: SyllabusScope): ScopeHit | null {
  let best: { hit: ScopeHit; score: number } | null = null;
  const questionTokens = contentTokens(question);
  for (const hit of scope.excluded) {
    const topicTokens = contentTokens(hit.topic);
    if (!topicTokens.length) continue;
    const score = topicTokens.filter((token) =>
      questionTokens.some((item) => item === token || item.startsWith(token.slice(0, 5)) || token.startsWith(item.slice(0, 5))),
    ).length;
    const strong = score >= 2 || (topicTokens.length === 1 && score === 1);
    if (!strong) continue;
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit ?? null;
}

export function topWeightedTopic(scope: SyllabusScope): WeightHit | null {
  return scope.weighted[0] ?? null;
}

/** Soruya değen kısa alıntılar. Eşleşme yoksa her belgenin adını yine göster. */
export function excerptsForQuestion(question: string, docs: CorpusDoc[], maxChars = 3600): string {
  const tokens = contentTokens(question);
  const chunks: string[] = [];
  let used = 0;
  const ranked = docs
    .map((doc) => {
      const hay = foldTr(doc.text);
      const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score);
  for (const { doc, score } of ranked) {
    if (used >= maxChars) break;
    const page = doc.pageNumber != null ? (doc.slide ? ` · slayt ${doc.pageNumber}` : ` · s.${doc.pageNumber}`) : "";
    const slice = doc.text.replace(/\s+/g, " ").trim().slice(0, score > 0 ? 700 : 280);
    if (!slice) continue;
    const line = `[${doc.documentName}${page}] ${slice}`;
    chunks.push(line);
    used += line.length;
  }
  return chunks.join("\n");
}
