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

function plainNumber(value: string): string {
  const dotted = value.replace(",", ".");
  return dotted.includes(".") ? dotted.replace(/0+$/, "").replace(/\.$/, "") : dotted;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(plainNumber);
}

/** Sohbet kelimeleri: soruyu anlatır, konuyu değil ("karıştırıyorum", "farkı ne"). */
const CHAT_NOISE_STEMS = new Set([
  "karis", "anlam", "fark", "farki", "farkl", "acikl", "anlat", "ogren", "lutfe", "yardi", "soru", "sorus",
  "nedir", "neden", "nasil", "hangi", "daha", "peki", "neyi", "niye", "bana", "beni", "bunu", "sunu", "olan",
  "olur", "ol", "icin", "gibi", "kadar", "sadec", "cevap", "kisac", "basit", "ornek", "tekra", "biraz", "acaba",
]);

/**
 * Kelime araması için sorudaki kökler (ilk 5 harf), uzun kelimeler önce.
 * `raw` veritabanında ilike için (Türkçe harfler korunur), `folded` puanlama için.
 */
export function searchStems(question: string, max = 4): { raw: string; folded: string }[] {
  const seen = new Set<string>();
  const stems: { raw: string; folded: string }[] = [];
  const words = question
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    // 4 harf: "kast", "grev" gibi terimler. Canlıda "Kast ile taksiri
    // karıştırıyorum" sorusunda "kast" atlanıp "karış" aranmıştı.
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word) && !STOP.has(foldTr(word)))
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    const raw = word.slice(0, 5);
    const folded = foldTr(raw);
    if (seen.has(folded) || CHAT_NOISE_STEMS.has(folded) || STOP.has(folded)) continue;
    seen.add(folded);
    stems.push({ raw, folded });
    if (stems.length >= max) break;
  }
  return stems;
}

export type ExactToken = {
  kind: "acronym" | "number" | "sequence" | "formula";
  /** Öğrencinin yazdığı biçim. */
  raw: string;
  /** Veritabanı ilike kalıpları (`%` joker); herhangi biri tutarsa sayfa gelir. */
  patterns: string[];
  /** Sayfa metnindeki ilk yeri; yoksa -1 (ilike geniş arar, bu kesin bakar). */
  find: (text: string) => number;
};

const firstIndex = (regex: RegExp, text: string) => regex.exec(text)?.index ?? -1;

/**
 * Sohbete giden belge bağlamı karakter bütçesiyle dolar (30 Ekim 2026, Paket I #11): sabit "en iyi 4 parça"
 * kısa parçalarda bağlamı boş bırakıyor, şekil okunmuş sayfanın kenar listesi parçalara bölünüp kayboluyordu.
 */
export const CHAT_PASSAGE_BUDGET = 7200;

/** Sıradaki öğeleri bütçe dolana kadar alır; en az `min`, en çok `max`. */
export function takeWithinBudget<T extends { content: string }>(
  items: readonly T[],
  budget = CHAT_PASSAGE_BUDGET,
  options: { min?: number; max?: number } = {},
): T[] {
  const min = options.min ?? 4;
  const max = options.max ?? 8;
  const out: T[] = [];
  let used = 0;
  for (const item of items) {
    if (out.length >= max) break;
    if (out.length >= min && used + item.content.length > budget) break;
    out.push(item);
    used += item.content.length;
  }
  return out;
}

/** Soru bir şekli, tabloyu ya da el notunu soruyor: o sayfanın tamamı bağlama girer. */
export const FIGURE_QUESTION =
  /(?:^|[^\p{L}])(?:şekil|şema|grafi[kğ]|tablo|diyagram|çizim|el\s+not|el\s+yazı|kenar\s+not|resim|görsel|fotoğraf|harita)/iu;

export function asksAboutFigure(question: string): boolean {
  return FIGURE_QUESTION.test(question);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeLike = (value: string) => value.replace(/[%_\\]/g, (char) => `\\${char}`);

/**
 * Kök aramasının kaçırdığı kesin belirteçler (30 Ekim 2026, Paket I #11). Kök araması 4 harften kısa kelimeyi ve
 * sayıyı aramıyordu: "AVL 15, 10, 5, 20, 25", "T(n)=3T(n/4)+n", "SMMM 95.000" el notunda vardı, öğretmen "notlarda
 * yok" dedi. Dört tür: kısaltma (2-6 büyük harf), binlik ayraçlı ya da 3+ basamaklı sayı, sayı dizisi (3+ sayı,
 * virgülle), parantezli formül parçası. Derse bağlı kelime yok.
 */
export function exactSearchTokens(question: string, max = 4): ExactToken[] {
  const out: ExactToken[] = [];
  const seen = new Set<string>();
  const push = (token: ExactToken) => {
    const key = `${token.kind}:${token.raw.toLocaleLowerCase("tr")}`;
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push(token);
  };
  for (const match of question.matchAll(/\d+(?:\s*[,;]\s*\d+){2,}/g)) {
    const numbers = match[0].split(/\s*[,;]\s*/);
    const inOrder = new RegExp(`(?<!\\d)${numbers.map(escapeRegex).join("\\D{1,4}")}(?!\\d)`);
    push({ kind: "sequence", raw: match[0], patterns: [`%${numbers.map(escapeLike).join("%")}%`], find: (text) => firstIndex(inOrder, text) });
  }
  // Rakam taşıyan parantezli parça ("3T(n/4)", "f(2)"): "T(n)" gibi her sayfada geçen yazım aranmaz.
  for (const match of question.matchAll(/[\p{L}\d]*\d[\p{L}\d]*\([^()\s]{1,12}\)|[\p{L}]\([^()\s]*\d[^()\s]*\)/gu)) {
    const compact = match[0].replace(/\s+/g, "");
    if (compact.length < 4) continue;
    const chars = [...compact];
    const spaced = new RegExp(chars.map(escapeRegex).join("\\s*"), "iu");
    push({
      kind: "formula",
      raw: compact,
      patterns: [`%${chars.map(escapeLike).join("%")}%`],
      find: (text) => firstIndex(spaced, text),
    });
  }
  for (const match of question.matchAll(/(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d])|(?<![\d.,])\d{3,}(?![\d.,]\d)/g)) {
    const raw = match[0];
    const digits = raw.replace(/\./g, "");
    const either = new RegExp(`(?<![\\d.,])(?:${escapeRegex(raw)}|${escapeRegex(digits)})(?![\\d])`);
    push({ kind: "number", raw, patterns: [...new Set([`%${escapeLike(raw)}%`, `%${escapeLike(digits)}%`])], find: (text) => firstIndex(either, text) });
  }
  for (const match of question.matchAll(/(?<![\p{L}\d])[A-ZÇĞİÖŞÜ]{2,6}(?![\p{L}\d])/gu)) {
    const raw = match[0];
    const word = new RegExp(`(?<![\\p{L}\\d])${escapeRegex(raw)}(?![\\p{L}\\d])`, "iu");
    push({ kind: "acronym", raw, patterns: [`%${escapeLike(raw)}%`], find: (text) => firstIndex(word, text) });
  }
  return out;
}

/**
 * Kelime aramasıyla gelen sayfayı puanlar ve köklerin en yoğun geçtiği
 * ~700 karakterlik pencereyi döndürür. Anlam araması "Fransa'da sendika kaç
 * kişiyle kurulur?" sorusunda "En az 7 işçi… kurulan" diyen s.40'ı
 * getirmedi; öğretmen belgede olan bilgi için "verilmemiş" dedi.
 */
export function lexicalPageHit(
  question: string,
  text: string,
): { score: number; excerpt: string } | null {
  const stems = searchStems(question);
  // Kesin belirteçler (kısaltma, sayı, dizi, formül): kök yoksa da sayfayı bulur (30 Ekim 2026, Paket I #11).
  const exact = exactSearchTokens(question)
    .map((token) => token.find(text))
    .filter((at) => at >= 0);
  if (!stems.length && !exact.length) return null;
  const hay = foldTr(text);
  const numbers = [...new Set(numbersIn(question).filter((n) => n.length >= 2))];
  const hayNumbers = new Set(numbersIn(text));
  const matched = stems.filter((stem) => hay.includes(stem.folded));
  const score = matched.length + 2 * numbers.filter((n) => hayNumbers.has(n)).length + 2 * exact.length;
  if (!matched.length) {
    if (!exact.length) return null;
    const start = Math.max(0, Math.min(...exact) - 350);
    return { score, excerpt: text.slice(start, start + 700).trim() };
  }
  // Köklerin en çok bir arada geçtiği yeri bul.
  let best = { at: hay.indexOf(matched[0].folded), count: 0 };
  for (const stem of matched) {
    for (let at = hay.indexOf(stem.folded); at >= 0; at = hay.indexOf(stem.folded, at + 1)) {
      const window = hay.slice(Math.max(0, at - 350), at + 350);
      const count = matched.filter((other) => window.includes(other.folded)).length;
      if (count > best.count) best = { at, count };
    }
  }
  const start = Math.max(0, best.at - 350);
  return { score, excerpt: text.slice(start, start + 700).trim() };
}

/**
 * Anlam benzerliğine sorudaki kelime köklerinin ve sayıların pasajda
 * geçmesini ekler. 2 Ekim 2026 altın denemesi: "200 kPa sabit basınçta 0.1
 * m³'ten 0.3 m³'e genleşen gazın işi" sorusunda aynı örneği taşıyan s.14
 * anlam aramasında 7. sıradaydı; öğretmen "belgende geçmiyor" dedi.
 */
export function rerankByOverlap<T extends { content: string; similarity: number }>(question: string, matches: T[]): T[] {
  const stems = [...new Set(contentTokens(question).map((word) => word.slice(0, 5)))];
  const numbers = [...new Set(numbersIn(question).filter((n) => n.length >= 2))];
  const total = stems.length + 2 * numbers.length;
  if (!total) return matches;
  return matches
    .map((match, index) => {
      const hay = foldTr(match.content);
      const hayNumbers = new Set(numbersIn(match.content));
      const hits = stems.filter((stem) => hay.includes(stem)).length + 2 * numbers.filter((n) => hayNumbers.has(n)).length;
      return { match, index, score: match.similarity + 0.4 * (hits / total) };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.match);
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
