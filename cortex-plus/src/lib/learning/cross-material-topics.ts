import { foldTr } from "@/lib/documents/page-analysis";
import {
  type TopicSourceRef,
  topicMatchKey,
} from "@/lib/learning/topic-merge";

/**
 * Bütün dosyalar okunduktan sonra TEK birleştirme.
 *
 * Dosya dosya çıkan başlıklar burada örtüşen konulara katlanır. Müfredat
 * bir konu kaynağı değildir: kapsam, ağırlık ve sınav tarihi oradan okunur.
 * Özet, tekrar, sık yapılan hatalar ve sınav duyurusu kendi başına konu olmaz;
 * içindeki hata ve alıştırma ilgili konuya malzeme olarak katılır.
 *
 * Model yok. Emin olunmayan çiftler `ambiguous` içinde kalır; çağıran
 * isterse tek bir küçük çağrıyla kapatır. Eşleşmeyen başlık düşmez.
 */

export type MaterialCandidate = {
  id: string;
  title: string;
  summary?: string;
  pages?: number[];
  documentId: string;
  fileName: string;
  prerequisites?: string[];
  keyTerms?: string[];
  commonMistakes?: string[];
  practiceItems?: string[];
  /**
   * Öğretmen analizindeki sınav olasılığı. Müfredat yokken öncelik buradan
   * gelir. "Sınavda ağırlıklı" rozeti üretmez.
   */
  emphasis?: "core" | "support" | "skim" | null;
};

export type MaterialDocument = {
  documentId: string;
  fileName: string;
  /** Müfredat tespiti için belgenin metni. Uzun ders notu da gelebilir. */
  text: string;
};

export type ConsolidatedSection = {
  title: string;
  pages: number[];
  sources: TopicSourceRef[];
};

export type ConsolidatedTopic = {
  title: string;
  summary: string;
  sections: ConsolidatedSection[];
  pages: number[];
  sources: TopicSourceRef[];
  sourceCount: number;
  prerequisites: string[];
  /** Müfredattaki pay. Müfredat yoksa null. */
  weightPercent: number | null;
  /** "Sınavda ağırlıklı" rozeti. Yalnızca müfredat böyle dediyse. */
  examHeavy: boolean;
  /**
   * Öğretmen analizinin önem sırası. Müfredat payı yokken süre ve rozet
   * buradan okunur. core → important ("Önemli"), support → medium, skim → less.
   */
  importance: TopicImportance | null;
  /** Dar kapsam notu: konu durur, içindeki bir parça sınav dışıdır. */
  scopeNote: string | null;
  commonMistakes: string[];
  practiceItems: string[];
  nodeIds: string[];
  /** 1 tabanlı müfredat sırası. Müfredatta yoksa null. */
  syllabusIndex: number | null;
};

export type ExcludedTopicNote = {
  title: string;
  reason: string;
};

export type MissingMaterialTopic = {
  title: string;
  weightPercent: number | null;
  examHeavy: boolean;
};

export type AmbiguousClusterPair = {
  leftId: string;
  rightId: string;
  left: string;
  right: string;
};

export type ConsolidationResult = {
  topics: ConsolidatedTopic[];
  excluded: ExcludedTopicNote[];
  missingFromMaterials: MissingMaterialTopic[];
  /** Öğrenci tarih seçmediyse önerilir. ISO gün. */
  suggestedExamDate: string | null;
  syllabusDocumentId: string | null;
  ambiguous: AmbiguousClusterPair[];
  /** Konu olmayan bölümler. Test ve iz için. */
  foldedNonTopics: string[];
};

export type TopicImportance = "important" | "medium" | "less";

export type SyllabusRow = {
  index: number;
  title: string;
  description: string;
  weightPercent: number | null;
  examHeavy: boolean;
};

const STOP = new Set([
  "ve", "ile", "veya", "icin", "bir", "bu", "su", "olan", "olarak", "gibi",
  "daha", "cok", "her", "konu", "konusu", "ders", "not", "notu", "notlar",
  "nedir", "hakkinda", "uzerine", "giris", "genel", "duzey", "duzeyde",
  "hesap", "hesabi", "hesaplar", "hesaplari", "kavram", "kavrami",
  "ornek", "ornegi", "ornekler", "sayfa", "bolum", "the", "and", "of",
  "to", "with", "for", "from", "into", "about", "using", "this", "that",
  "between", "its", "are", "was",
]);

const MONTHS = [
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
];

const MONTHS_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Başlığın kendisi bir konu değil: özet, tekrar, hata listesi, alıştırma
 * ya da sınav duyurusu. Cümlede bu kelimelerin geçmesi yetmez; başlık
 * bölümün adı olmalıdır.
 */
const NON_CONTENT: RegExp[] = [
  /^(genel\s+)?(ozet|ozeti|summary|recap)\b/,
  /\bozet ve sik yapilan\b/,
  /\bsik yapilan hata/,
  /\bcommon mistakes?\b/,
  /\byaygin hatalar\b/,
  /^genel tekrar\b/,
  /\bgenel tekrar ve karma\b/,
  /\bkarma ornekler\b/,
  /^(alistirmalar|alistirma sorulari|practice questions|exercises|soru seti)\b/,
  /^(cevap anahtari|answer key)\b/,
  /^(ara sinav|sinav bilgilendirme|sinav tarihi|exam information|midterm information|midterm exam)\b/,
  /^ara sinav\b/,
  /^cozumlu ornek\b/,
  /^worked example\b/,
  /^(chapter|unit|bolum) review\b/,
  /^review and practice\b/,
];

function fold(text: string): string {
  return foldTr(text).replace(/[^a-z0-9%\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stem(token: string): string {
  let value = token;
  value = value.replace(/(leri|lari|ler|lar)$/, "");
  value = value.replace(/(si|su)$/, "");
  if (value.length >= 6) value = value.replace(/[iu]$/, "");
  return value.length >= 3 ? value : token;
}

function tokensOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const folded = foldTr(raw).replace(/[^a-z0-9]/g, "");
    // pH, CO2, Na gibi kısa simgeler kelime sayılır. "ve", "in" sayılmaz.
    const abbrev =
      raw.length >= 2 &&
      raw.length <= 5 &&
      (/\d/.test(raw) || /[A-Z]/.test(raw.slice(1)));
    if (!abbrev && (folded.length < 3 || STOP.has(folded))) continue;
    const token = abbrev && folded.length < 3 ? folded : stem(folded);
    if (token.length < (abbrev ? 2 : 3) || STOP.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function sameStem(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  return left.startsWith(right) || right.startsWith(left);
}

function sharedStems(left: string[], right: string[]): string[] {
  return left.filter((token) => right.some((other) => sameStem(token, other)));
}

function uniquePages(pages: number[]): number[] {
  return [...new Set(pages.filter((page) => Number.isInteger(page) && page > 0))].sort(
    (a, b) => a - b,
  );
}

function uniqueLines(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item.trim();
    const key = fold(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 240));
  }
  return out;
}

const NOTE_TRAILING =
  /(?:\s+(?:kanunu|yasasi|ilkesi|kurali|kurami|konusu|kavrami|kavram))+$/;

/** Karşılaştırma anahtarı: büyük/küçük harf, noktalama ve sonda kalan ek. */
function noteCompareKey(text: string): string {
  const folded = fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subject = folded.includes(":") ? folded.slice(folded.lastIndexOf(":") + 1).trim() : folded;
  return subject.replace(NOTE_TRAILING, "").trim();
}

/**
 * Aynı notu iki kez gösterme.
 * "Katlı oranlar kanunu" ile "katlı oranlar" aynı uyarıdır; kısa olan düşer.
 */
export function dedupeStudentNotes(items: string[]): string[] {
  const notes = uniqueLines(items).map((text) => ({ text, key: noteCompareKey(text) }));
  const drop = new Set<number>();
  for (let i = 0; i < notes.length; i += 1) {
    if (!notes[i].key) drop.add(i);
  }
  for (let i = 0; i < notes.length; i += 1) {
    if (drop.has(i)) continue;
    for (let j = i + 1; j < notes.length; j += 1) {
      if (drop.has(j)) continue;
      const a = notes[i].key;
      const b = notes[j].key;
      if (!a || !b) continue;
      if (a === b) {
        drop.add(notes[i].text.length >= notes[j].text.length ? j : i);
        continue;
      }
      if (a.length >= 6 && b.includes(a)) drop.add(i);
      else if (b.length >= 6 && a.includes(b)) drop.add(j);
    }
  }
  return notes.filter((_, index) => !drop.has(index)).map((note) => note.text);
}

export function isNonContentSection(title: string): boolean {
  const folded = fold(title).replace(/^\d+\s+/, "");
  if (!folded) return false;
  return NON_CONTENT.some((pattern) => pattern.test(folded));
}

function percentValue(line: string): number | null {
  const trimmed = line.trim();
  const exact = trimmed.match(/^(?:%\s*(\d{1,3})|(\d{1,3})\s*%)$/);
  const inline = exact ? null : trimmed.match(/(?:%\s*(\d{1,3})|(\d{1,3})\s*%)/);
  const match = exact ?? inline;
  if (!match) return null;
  const value = Number(match[1] || match[2]);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value;
}

function heavyStatus(status: string): boolean {
  const folded = fold(status);
  return /agirlikli|heavily weighted|high priority|oncelikli|agirlik ver/.test(folded);
}

/**
 * Müfredat / ders izlencesi. Konu listesi, ağırlık, kapsam ya da sınav
 * tarihi birlikte duruyorsa belgedir. Yüzde içeren bir ders notu
 * (kütlece yüzde gibi) tek başına müfredat sayılmaz.
 */
export function isSyllabusText(text: string): boolean {
  const folded = fold(text);
  if (folded.length < 40) return false;
  const percents = folded.match(/(?:%\s*\d{1,3}|\d{1,3}\s*%)/g) ?? [];
  const outline =
    /syllabus|course outline|mufredat|ders konulari|konu listesi|ogrenme cikti|sinav konulari|exam topics|learning outcomes|scope of the exam/.test(
      folded,
    );
  const scope =
    /kapsam disi|out of scope|not be examined|will not be examined|will not be tested|sinav kapsam|excluded from the exam|not examinable/.test(
      folded,
    );
  const examDate = /sinav tarihi|exam date|date of the exam|date of exam/.test(folded);
  if (percents.length >= 3 && (outline || scope || examDate)) return true;
  if (outline && scope) return true;
  return false;
}

export function parseExamDate(text: string): string | null {
  const folded = foldTr(text);
  const month = [...MONTHS, ...MONTHS_EN].join("|");
  const pattern = new RegExp(`(\\d{1,2})\\s+(${month})\\s+(\\d{4})`, "g");
  const hits: { iso: string; at: number }[] = [];
  for (const match of folded.matchAll(pattern)) {
    const day = Number(match[1]);
    const monthIndex = MONTHS.indexOf(match[2]) + 1 || MONTHS_EN.indexOf(match[2]) + 1;
    const year = Number(match[3]);
    if (day < 1 || day > 31 || monthIndex < 1) continue;
    const iso = `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    hits.push({ iso, at: match.index ?? 0 });
  }
  const isoHit = folded.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoHit) {
    hits.push({ iso: `${isoHit[1]}-${isoHit[2]}-${isoHit[3]}`, at: isoHit.index ?? 0 });
  }
  if (!hits.length) return null;
  const cue = folded.search(/sinav tarihi|exam date|date of the exam|date of exam/);
  if (cue >= 0) {
    hits.sort((a, b) => Math.abs(a.at - cue) - Math.abs(b.at - cue));
  }
  return hits[0]?.iso ?? null;
}

function exclusionPhrases(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);
  const phrases: string[] = [];
  const cues =
    /sinav kapsam[ıi] disindadir|kapsam disi(?:dir|nda)?|out of scope|will not be examined|will not be tested|not examinable|excluded from the exam|bu sinavin kapsaminda degildir|kapsaminda degildir/i;
  for (const line of lines) {
    const folded = foldTr(line);
    if (!cues.test(folded)) continue;
    const cut = line.split(
      /sınav kapsam[ıi] dışındadır|kapsam dışı(?:dır|nda)?|out of scope|will not be examined|will not be tested|not examinable|excluded from the exam|bu sınavın kapsamında değildir|kapsamında değildir/i,
    )[0];
    const phrase = (cut ?? line)
      .replace(/^[\s•\-*]+/, "")
      .replace(/[.:;\-–—]+$/g, "")
      .trim();
    if (phrase.length >= 6) phrases.push(phrase.slice(0, 180));
  }
  for (const line of lines) {
    const except = line.match(/^(.{6,80}?)\s+(?:hariç|haric|except|excluding)\b/i);
    if (except?.[1]) phrases.push(except[1].trim());
    const inline = line.match(/\(([^)]{6,80}?)\s+hariç\)/i);
    if (inline?.[1]) phrases.push(inline[1].trim());
  }
  return uniqueLines(phrases);
}

export function parseSyllabusRows(text: string): SyllabusRow[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: SyllabusRow[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const inline = lines[index].match(
      /^(\d{1,2})[.)]\s+(.{4,120}?)\s+[—–\-|:]\s+.*?(%?\s*\d{1,3}\s*%|\d{1,3}\s*%)/,
    );
    if (inline) {
      const number = Number(inline[1]);
      const weight = percentValue(inline[3]);
      if (number >= 1 && number <= 40 && !seen.has(number)) {
        seen.add(number);
        const rest = lines[index].slice(inline[0].length).trim();
        rows.push({
          index: number,
          title: inline[2].trim(),
          description: rest,
          weightPercent: weight,
          examHeavy: heavyStatus(`${lines[index]} ${rest}`),
        });
      }
      continue;
    }

    if (!/^\d{1,2}$/.test(lines[index])) continue;
    const number = Number(lines[index]);
    if (number < 1 || number > 40 || seen.has(number)) continue;
    let percentAt = -1;
    for (let look = index + 1; look < Math.min(lines.length, index + 7); look += 1) {
      if (percentValue(lines[look]) != null && /%/.test(lines[look]) && lines[look].length < 8) {
        percentAt = look;
        break;
      }
    }
    if (percentAt < 0 || percentAt === index + 1) continue;
    const title = lines[index + 1]?.replace(/^\d+[.)]\s+/, "").trim() ?? "";
    if (title.length < 4 || percentValue(title) != null) continue;
    const description = lines.slice(index + 2, percentAt).join(" ");
    const status = lines[percentAt + 1] ?? "";
    seen.add(number);
    rows.push({
      index: number,
      title,
      description,
      weightPercent: percentValue(lines[percentAt]),
      examHeavy: heavyStatus(status),
    });
    index = percentAt;
  }

  return rows.sort((a, b) => a.index - b.index);
}

type ExclusionHit = "drop" | "narrow" | "none";

function matchExclusion(exclusion: string, title: string): ExclusionHit {
  const excluded = tokensOf(exclusion);
  const titled = tokensOf(title);
  if (!excluded.length || !titled.length) return "none";
  const shared = sharedStems(titled, excluded);
  if (!shared.length) return "none";
  const extra = excluded.filter((token) => !titled.some((item) => sameStem(item, token)));
  const longExtra = extra.filter((token) => token.length >= 5);
  const coverage = shared.length / titled.length;
  const longSharedList = shared.filter((token) => token.length >= 5);
  const longShared = longSharedList.length > 0;
  if (coverage >= 0.67 && longExtra.length === 0) return "drop";
  if (coverage >= 0.5 && longExtra.length === 0 && longShared) return "drop";
  // Başlık, kapsam dışı bırakılan tam o parça: "geçici maddeler" gibi.
  if (longSharedList.length >= 2 && coverage >= 0.4) return "drop";
  if (longShared && longExtra.length > 0 && coverage < 0.67) return "narrow";
  if (coverage >= 0.67 && longExtra.length > 0) return "narrow";
  return "none";
}

function sourceOf(candidate: MaterialCandidate, nodeId: string | null): TopicSourceRef {
  return {
    documentId: candidate.documentId,
    fileName: candidate.fileName,
    pages: uniquePages(candidate.pages ?? []),
    nodeId,
  };
}

function nodeIdOf(candidate: MaterialCandidate): string | null {
  if (!candidate.id || candidate.id.startsWith("added:")) return null;
  return candidate.id;
}

type Bucket = {
  title: string;
  summaryParts: string[];
  sections: ConsolidatedSection[];
  sources: TopicSourceRef[];
  pages: number[];
  prerequisites: string[];
  mistakes: string[];
  practice: string[];
  nodeIds: string[];
  weightPercent: number | null;
  examHeavy: boolean;
  scopeNotes: string[];
  syllabusIndex: number | null;
  memberIds: string[];
  emphasis: "core" | "support" | "skim" | null;
};

function blankBucket(title: string): Bucket {
  return {
    title,
    summaryParts: [],
    sections: [],
    sources: [],
    pages: [],
    prerequisites: [],
    mistakes: [],
    practice: [],
    nodeIds: [],
    weightPercent: null,
    examHeavy: false,
    scopeNotes: [],
    syllabusIndex: null,
    memberIds: [],
    emphasis: null,
  };
}

const EMPHASIS_RANK = { skim: 1, support: 2, core: 3 } as const;

function strongerEmphasis(
  left: "core" | "support" | "skim" | null,
  right: "core" | "support" | "skim" | null,
): "core" | "support" | "skim" | null {
  if (!left) return right;
  if (!right) return left;
  return EMPHASIS_RANK[left] >= EMPHASIS_RANK[right] ? left : right;
}

function importanceFromEmphasis(
  emphasis: "core" | "support" | "skim" | null,
): TopicImportance | null {
  if (emphasis === "core") return "important";
  if (emphasis === "support") return "medium";
  if (emphasis === "skim") return "less";
  return null;
}

const IMPORTANCE_RANK: Record<TopicImportance, number> = { less: 1, medium: 2, important: 3 };

export function strongerImportance(
  left: TopicImportance | null | undefined,
  right: TopicImportance | null | undefined,
): TopicImportance | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return IMPORTANCE_RANK[left] >= IMPORTANCE_RANK[right] ? left : right;
}

function absorbCandidate(bucket: Bucket, candidate: MaterialCandidate, asSection: boolean) {
  const nodeId = nodeIdOf(candidate);
  const source = sourceOf(candidate, nodeId);
  const have = bucket.sources.find(
    (item) => item.documentId && item.documentId === source.documentId,
  );
  if (!have) bucket.sources.push({ ...source, pages: [...source.pages] });
  else {
    have.pages = uniquePages([...have.pages, ...source.pages]);
    if (!have.fileName && source.fileName) have.fileName = source.fileName;
    if (!have.nodeId && source.nodeId) have.nodeId = source.nodeId;
  }
  bucket.pages = uniquePages([...bucket.pages, ...(candidate.pages ?? [])]);
  bucket.prerequisites.push(...(candidate.prerequisites ?? []));
  bucket.mistakes.push(...(candidate.commonMistakes ?? []));
  bucket.practice.push(...(candidate.practiceItems ?? []));
  if (nodeId) bucket.nodeIds.push(nodeId);
  bucket.memberIds.push(candidate.id);
  if (candidate.summary?.trim()) bucket.summaryParts.push(candidate.summary.trim());
  bucket.emphasis = strongerEmphasis(bucket.emphasis, candidate.emphasis ?? null);
  if (!asSection) return;
  const key = topicMatchKey(candidate.title);
  const existing = bucket.sections.find((section) => topicMatchKey(section.title) === key);
  if (existing) {
    existing.pages = uniquePages([...existing.pages, ...(candidate.pages ?? [])]);
    const sectionSource = existing.sources.find(
      (item) => item.documentId && item.documentId === candidate.documentId,
    );
    if (!sectionSource) existing.sources.push({ ...source, pages: [...source.pages] });
    else sectionSource.pages = uniquePages([...sectionSource.pages, ...source.pages]);
    return;
  }
  bucket.sections.push({
    title: candidate.title.trim(),
    pages: uniquePages(candidate.pages ?? []),
    sources: [{ ...source, pages: [...source.pages] }],
  });
}

function finishBucket(bucket: Bucket): ConsolidatedTopic {
  const sources = bucket.sources.filter(
    (source) => source.documentId || source.fileName || source.pages.length,
  );
  return {
    title: bucket.title.trim(),
    summary: uniqueLines(bucket.summaryParts).join(" ").slice(0, 500),
    sections: bucket.sections,
    pages: uniquePages(bucket.pages),
    sources,
    sourceCount: new Set(sources.map((source) => source.documentId || source.fileName)).size,
    prerequisites: uniqueLines(bucket.prerequisites),
    weightPercent: bucket.weightPercent,
    examHeavy: bucket.examHeavy,
    importance: importanceFromEmphasis(bucket.emphasis),
    scopeNote: dedupeStudentNotes(bucket.scopeNotes).join(" ") || null,
    commonMistakes: uniqueLines(bucket.mistakes),
    practiceItems: uniqueLines(bucket.practice),
    nodeIds: [...new Set(bucket.nodeIds)],
    syllabusIndex: bucket.syllabusIndex,
  };
}

function assignmentScore(
  candidate: MaterialCandidate,
  row: SyllabusRow,
  rows: SyllabusRow[],
): number {
  const titleShared = sharedStems(tokensOf(candidate.title), tokensOf(row.title));
  const blob = `${candidate.title} ${candidate.summary ?? ""} ${(candidate.keyTerms ?? []).join(" ")}`;
  const rowBlob = `${row.title} ${row.description}`;
  const shared = sharedStems(tokensOf(blob), tokensOf(rowBlob));
  const titleInRow = sharedStems(tokensOf(candidate.title), tokensOf(rowBlob)).filter(
    (token) => token.length >= 6,
  );
  if (!shared.length && !titleShared.length && !titleInRow.length) return 0;
  const long = titleShared.filter((token) => token.length >= 5).length;
  // Başlığın kendisi satırın açıklamasında geçiyorsa o satırındır.
  const phrase = fold(candidate.title);
  const phraseHit = phrase.length >= 8 && fold(rowBlob).includes(phrase) ? 8 : 0;
  // Yalnızca bu satırda geçen başlık kelimesi (pH, nötralleşme) o satıra aittir.
  const rowTokens = tokensOf(rowBlob);
  const distinctive = tokensOf(candidate.title).filter((token) => {
    if (!rowTokens.some((item) => sameStem(item, token))) return false;
    const owners = rows.filter((item) =>
      tokensOf(`${item.title} ${item.description}`).some((piece) => sameStem(piece, token)),
    );
    return owners.length === 1;
  });
  const distinctiveBonus = distinctive.reduce((sum, token) => sum + token.length * 2, 0);
  return titleShared.length * 3 + long * 2 + shared.length + titleInRow.length * 3 + phraseHit + distinctiveBonus;
}

function bestRow(
  candidate: MaterialCandidate,
  rows: SyllabusRow[],
): { row: SyllabusRow; score: number } | null {
  let best: { row: SyllabusRow; score: number } | null = null;
  for (const row of rows) {
    const score = assignmentScore(candidate, row, rows);
    if (!best || score > best.score || (score === best.score && row.index < best.row.index)) {
      best = { row, score };
    }
  }
  if (!best || best.score < 3) return null;
  return best;
}

function exclusionReason(phrase: string): string {
  return `Müfredat bunu sınav kapsamı dışında bırakıyor: ${phrase.trim()}.`;
}

function foldIntoBest(bucket: Bucket[], candidate: MaterialCandidate) {
  if (!bucket.length) return;
  let best = 0;
  let bestScore = -1;
  const folded = tokensOf(`${candidate.title} ${candidate.summary ?? ""}`);
  bucket.forEach((item, index) => {
    const score = sharedStems(folded, tokensOf(`${item.title} ${item.summaryParts.join(" ")}`)).length;
    const sameFile = item.sources.some((source) => source.documentId === candidate.documentId);
    // Aynı dosyanın konusu, kelime denkliği başka dosyayı seçmesin.
    const weighted = score + (sameFile ? 5 : 0);
    if (weighted > bestScore) {
      best = index;
      bestScore = weighted;
    }
  });
  const target = bucket[best];
  target.mistakes.push(...(candidate.commonMistakes ?? []));
  target.practice.push(...(candidate.practiceItems ?? []));
  if (candidate.summary?.trim()) target.practice.push(candidate.summary.trim());
  const title = candidate.title.trim();
  if (!title) return;
  const key = topicMatchKey(title);
  if (target.sections.some((section) => topicMatchKey(section.title) === key)) return;
  const nodeId = nodeIdOf(candidate);
  target.sections.push({
    title,
    pages: uniquePages(candidate.pages ?? []),
    sources: [sourceOf(candidate, nodeId)],
  });
}

function jaccard(left: string[], right: string[]): number {
  const shared = sharedStems(left, right).length;
  const union = new Set([...left, ...right]).size;
  return union ? shared / union : 0;
}

function shouldCluster(left: MaterialCandidate, right: MaterialCandidate, multiFile: boolean): boolean {
  if (topicMatchKey(left.title) && topicMatchKey(left.title) === topicMatchKey(right.title)) {
    return true;
  }
  const leftTitle = tokensOf(left.title);
  const rightTitle = tokensOf(right.title);
  const titleScore = jaccard(leftTitle, rightTitle);
  const shorter = fold(left.title).length <= fold(right.title).length ? fold(left.title) : fold(right.title);
  const longer = fold(left.title).length <= fold(right.title).length ? fold(right.title) : fold(left.title);
  if (shorter.length >= 12 && (longer === shorter || longer.startsWith(`${shorter} `))) return true;
  if (titleScore >= 0.5 && sharedStems(leftTitle, rightTitle).some((token) => token.length >= 4)) {
    return true;
  }
  if (!multiFile) return false;
  const shared = sharedStems(
    tokensOf(`${left.title} ${left.summary ?? ""} ${(left.keyTerms ?? []).join(" ")}`),
    tokensOf(`${right.title} ${right.summary ?? ""} ${(right.keyTerms ?? []).join(" ")}`),
  ).filter((token) => token.length >= 5);
  return shared.length >= 2;
}

function clusterCandidates(candidates: MaterialCandidate[], multiFile: boolean): MaterialCandidate[][] {
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (!shouldCluster(candidates[left], candidates[right], multiFile)) continue;
      const rootLeft = find(left);
      const rootRight = find(right);
      if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
    }
  }
  const groups = new Map<number, MaterialCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(candidate);
    groups.set(root, list);
  });
  return [...groups.values()];
}

function leadOf(title: string): string | null {
  return tokensOf(title)[0] ?? null;
}

function leadsMatch(left: string, right: string): boolean {
  if (left === right && left.length >= 3) return true;
  return sameStem(left, right);
}

function tokenFrequency(candidates: MaterialCandidate[]): Map<string, number> {
  const freq = new Map<string, number>();
  const add = (token: string) => {
    for (const key of freq.keys()) {
      if (!sameStem(key, token)) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      return;
    }
    freq.set(token, 1);
  };
  for (const candidate of candidates) {
    for (const token of new Set(tokensOf(candidate.title))) add(token);
  }
  return freq;
}

function frequencyOf(freq: Map<string, number>, token: string): number {
  let best = 0;
  for (const [key, count] of freq) {
    if (sameStem(key, token)) best = Math.max(best, count);
  }
  return best;
}

/**
 * Aynı ilk kelime, iki ayrı konunun adıysa birleştirme.
 * "Osmanlı kuruluş" ile "Osmanlı yükselme" ikisi de "Osmanlı" ile başlar;
 * devamı başka bir başlığın konusuysa aynı konu değildir.
 */
function equalLeadConflict(
  left: MaterialCandidate,
  right: MaterialCandidate,
  knownLeads: string[],
): boolean {
  const lead = leadOf(left.title);
  if (!lead || !leadsMatch(lead, leadOf(right.title) ?? "")) return true;
  const rivals = (title: string) =>
    tokensOf(title).filter(
      (token) =>
        token.length >= 5 &&
        !sameStem(token, lead) &&
        knownLeads.some((item) => sameStem(item, token)),
    );
  const leftRivals = rivals(left.title);
  const rightRivals = rivals(right.title);
  if (!leftRivals.length || !rightRivals.length) return false;
  const disjoint = (one: string[], other: string[]) =>
    one.every((token) => !other.some((item) => sameStem(item, token)));
  return disjoint(leftRivals, rightRivals) && disjoint(rightRivals, leftRivals);
}

function sharesBesidesLead(left: MaterialCandidate, right: MaterialCandidate): boolean {
  const lead = leadOf(left.title);
  return sharedStems(tokensOf(left.title), tokensOf(right.title)).some(
    (token) => token.length >= 4 && (!lead || !sameStem(token, lead)),
  );
}

/**
 * Müfredat yokken dosyalar arası ön birleştirme.
 *
 * Aynı dosyadaki ayrı bölümler durur. Dosyalar arasında aynı konunun
 * tekrarı (aynı ilk kelime, ya da iki uzun ortak kelime) katlanır.
 * Köprü başlık ("Kuruluş ve yükselme") yalnızca kendi ilk kelimesinin
 * kümesine girer; iki dönemi birbirine yapıştırmaz.
 */
function clusterWithoutSyllabus(candidates: MaterialCandidate[]): MaterialCandidate[][] {
  if (!candidates.length) return [];
  const multiFile = new Set(candidates.map((item) => item.documentId).filter(Boolean)).size > 1;
  const freq = tokenFrequency(candidates);
  const knownLeads = candidates
    .map((item) => leadOf(item.title))
    .filter((token): token is string => Boolean(token));
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const unite = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };
  const cap = Math.max(4, Math.ceil(candidates.length * 0.34));

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left];
      const b = candidates[right];
      if (topicMatchKey(a.title) && topicMatchKey(a.title) === topicMatchKey(b.title)) {
        unite(left, right);
        continue;
      }
      const leftTitle = tokensOf(a.title);
      const rightTitle = tokensOf(b.title);
      const shorter = fold(a.title).length <= fold(b.title).length ? fold(a.title) : fold(b.title);
      const longer = fold(a.title).length <= fold(b.title).length ? fold(b.title) : fold(a.title);
      if (shorter.length >= 12 && (longer === shorter || longer.startsWith(`${shorter} `))) {
        unite(left, right);
        continue;
      }
      if (
        jaccard(leftTitle, rightTitle) >= 0.5 &&
        sharedStems(leftTitle, rightTitle).some((token) => token.length >= 4)
      ) {
        unite(left, right);
        continue;
      }
      const leftLead = leadOf(a.title);
      const rightLead = leadOf(b.title);
      const crossFile = Boolean(a.documentId && b.documentId && a.documentId !== b.documentId);
      if (
        leftLead &&
        rightLead &&
        leadsMatch(leftLead, rightLead) &&
        !equalLeadConflict(a, b, knownLeads) &&
        (crossFile || sharesBesidesLead(a, b))
      ) {
        unite(left, right);
        continue;
      }
      if (!multiFile) continue;
      const shared = sharedStems(leftTitle, rightTitle).filter((token) => {
        const leadsOne =
          (leftLead && sameStem(token, leftLead)) || (rightLead && sameStem(token, rightLead));
        return token.length >= 5 || (token.length >= 3 && Boolean(leadsOne));
      });
      if (shared.length < 2) continue;
      if (!shared.some((token) => frequencyOf(freq, token) <= cap)) continue;
      unite(left, right);
    }
  }

  const grouped = new Map<number, MaterialCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const list = grouped.get(root) ?? [];
    list.push(candidate);
    grouped.set(root, list);
  });
  let groups = [...grouped.values()];
  groups = mergeByContainedLead(groups);
  groups = absorbSatellites(groups, freq);
  return orderGroups(groups, candidates);
}

function clusterLead(group: MaterialCandidate[]): string | null {
  return leadOf(titleForCluster(group));
}

function leadCoverage(group: MaterialCandidate[], token: string): number {
  if (!group.length) return 0;
  const hits = group.filter((item) => tokensOf(item.title).some((piece) => sameStem(piece, token))).length;
  return hits / group.length;
}

/**
 * Kümenin ilk kelimesi başka kümenin başlıklarının çoğunda geçiyorsa
 * o küme alt başlıktır. Köprü başlık azınlıkta kaldığı için iki dönemi
 * birleştirmez.
 */
function mergeByContainedLead(groups: MaterialCandidate[][]): MaterialCandidate[][] {
  const current = groups.map((group) => [...group]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let guest = 0; guest < current.length; guest += 1) {
      const lead = clusterLead(current[guest]);
      if (!lead || lead.length < 4) continue;
      let host = -1;
      let best = 0;
      for (let other = 0; other < current.length; other += 1) {
        if (other === guest) continue;
        const coverage = leadCoverage(current[other], lead);
        if (coverage < 0.5 || coverage <= best) continue;
        const back = clusterLead(current[other]);
        if (back && leadCoverage(current[guest], back) >= 0.5) continue;
        host = other;
        best = coverage;
      }
      if (host < 0) continue;
      current[host] = [...current[host], ...current[guest]];
      current.splice(guest, 1);
      changed = true;
      break;
    }
  }
  return current;
}

/**
 * Tek kalan başlık, aynı dosyadaki büyük kümeyle bir uzun kelime paylaşıyorsa
 * oraya katılır. Kendi adı başka dosyada da geçen ayrı bir kavramsa durur
 * ("Nötralleşme" tepkime kümesine yapışmaz).
 */
function absorbSatellites(
  groups: MaterialCandidate[][],
  freq: Map<string, number>,
): MaterialCandidate[][] {
  const hosts = groups.filter((group) => group.length > 1);
  const singles = groups.filter((group) => group.length === 1);
  const left: MaterialCandidate[][] = [];
  for (const single of singles) {
    const candidate = single[0];
    const lead = leadOf(candidate.title);
    let bestHost: MaterialCandidate[] | null = null;
    let bestScore = 0;
    for (const host of hosts) {
      if (!host.some((item) => item.documentId === candidate.documentId)) continue;
      const shared = sharedStems(
        tokensOf(candidate.title),
        host.flatMap((item) => tokensOf(item.title)),
      ).filter((token) => token.length >= 5);
      if (!shared.length) continue;
      const blocked =
        Boolean(lead) &&
        (lead?.length ?? 0) >= 8 &&
        frequencyOf(freq, lead ?? "") >= 2 &&
        !shared.some((token) => sameStem(token, lead ?? ""));
      if (blocked) continue;
      const score = shared.reduce((sum, token) => sum + token.length, 0);
      if (score <= bestScore) continue;
      bestScore = score;
      bestHost = host;
    }
    if (bestHost) bestHost.push(candidate);
    else left.push(single);
  }
  return [...hosts, ...left];
}

function orderGroups(
  groups: MaterialCandidate[][],
  original: MaterialCandidate[],
): MaterialCandidate[][] {
  const index = new Map(original.map((candidate, position) => [candidate.id, position]));
  return [...groups].sort((left, right) => {
    const leftAt = Math.min(...left.map((item) => index.get(item.id) ?? 0));
    const rightAt = Math.min(...right.map((item) => index.get(item.id) ?? 0));
    return leftAt - rightAt;
  });
}

function titleForCluster(group: MaterialCandidate[]): string {
  const counts = new Map<string, { title: string; count: number; order: number }>();
  for (const candidate of group) {
    const key = topicMatchKey(candidate.title) || fold(candidate.title);
    const have = counts.get(key);
    if (have) have.count += 1;
    else counts.set(key, { title: candidate.title.trim(), count: 1, order: counts.size });
  }
  // Beraberlikte belgenin kendi sırası. En uzun başlık kartın adı olmaz.
  return [...counts.values()].sort((a, b) => b.count - a.count || a.order - b.order)[0]?.title ??
    group[0].title;
}

function headOf(group: MaterialCandidate[]): MaterialCandidate {
  const title = titleForCluster(group);
  return group.find((item) => item.title.trim() === title) ?? group[0];
}

/**
 * Deterministik birleştirmenin emin olamadığı çiftler. Tek model çağrısı
 * bunlara bakar. Özet, başlıkta olmayan bir kelimeyle iki kümeyi
 * yaklaştırıyorsa çift listeye girer; aynı dosyanın ilgisiz bölümleri girmez.
 */
function ambiguousPairs(groups: MaterialCandidate[][]): AmbiguousClusterPair[] {
  const heads = groups.map(headOf);
  const pairs: AmbiguousClusterPair[] = [];
  for (let left = 0; left < heads.length; left += 1) {
    for (let right = left + 1; right < heads.length; right += 1) {
      const leftTitle = tokensOf(heads[left].title);
      const rightTitle = tokensOf(heads[right].title);
      const score = jaccard(leftTitle, rightTitle);
      const shared = sharedStems(leftTitle, rightTitle);
      const summaryShared = sharedStems(
        tokensOf(heads[left].summary ?? ""),
        tokensOf(`${heads[right].title} ${heads[right].summary ?? ""}`),
      ).filter((token) => token.length >= 6);
      const summaryHint =
        score < 0.34 &&
        summaryShared.length >= 1 &&
        Boolean(heads[left].summary?.trim()) &&
        fold(heads[left].summary ?? "") !== fold(heads[left].title);
      if ((score >= 0.34 && score < 0.5 && shared.length >= 1) || summaryHint) {
        pairs.push({
          leftId: heads[left].id,
          rightId: heads[right].id,
          left: heads[left].title,
          right: heads[right].title,
        });
      }
    }
  }
  return pairs.slice(0, 12);
}

function inferPrerequisites(topics: ConsolidatedTopic[]): ConsolidatedTopic[] {
  const titleTokens = topics.map((topic) => tokensOf(topic.title));
  const frequency = new Map<string, number>();
  for (const list of titleTokens) {
    for (const token of new Set(list)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  const cap = Math.max(2, Math.ceil(topics.length * 0.6));
  return topics.map((topic, index) => {
    const blob = tokensOf(`${topic.summary} ${topic.sections.map((section) => section.title).join(" ")}`);
    const prerequisites = [...topic.prerequisites];
    topics.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (
        topic.syllabusIndex != null &&
        other.syllabusIndex != null &&
        other.syllabusIndex >= topic.syllabusIndex
      ) {
        return;
      }
      if (topic.syllabusIndex == null && other.syllabusIndex == null && otherIndex > index) return;
      const useful = titleTokens[otherIndex].filter(
        (token) =>
          token.length >= 3 &&
          (frequency.get(token) ?? 0) <= cap &&
          !titleTokens[index].some((item) => sameStem(item, token)) &&
          blob.some((item) => sameStem(item, token)),
      );
      if (useful.length) prerequisites.push(other.title);
    });
    const self = topicMatchKey(topic.title);
    return {
      ...topic,
      prerequisites: uniqueLines(prerequisites).filter((item) => topicMatchKey(item) !== self),
    };
  });
}

/**
 * Aday konuları tek listeye indirir.
 *
 * Tek dosyada yalnızca yazımı örtüşen başlıklar birleşir; ayrı bölümler durur.
 * Müfredat varsa konu iskeleti odur: parçalar ilgili satıra bağlanır, listede
 * olup materyalde olmayan satır sessizce uydurulmaz.
 */
export function consolidateMaterials(input: {
  candidates: MaterialCandidate[];
  documents?: MaterialDocument[];
}): ConsolidationResult {
  const documents = input.documents ?? [];
  const syllabusDocs = documents.filter((document) => isSyllabusText(document.text));
  const syllabusIds = new Set(syllabusDocs.map((document) => document.documentId));
  const syllabusText = syllabusDocs.map((document) => document.text).join("\n");
  const rows = syllabusText ? parseSyllabusRows(syllabusText) : [];
  const phrases = syllabusText ? exclusionPhrases(syllabusText) : [];
  const suggestedExamDate = syllabusText ? parseExamDate(syllabusText) : null;

  const content: MaterialCandidate[] = [];
  const nonContent: MaterialCandidate[] = [];
  for (const candidate of input.candidates) {
    const title = candidate.title.trim();
    if (!title) continue;
    if (syllabusIds.has(candidate.documentId)) continue;
    if (isNonContentSection(title)) nonContent.push(candidate);
    else content.push(candidate);
  }

  const excluded: ExcludedTopicNote[] = [];
  const kept: MaterialCandidate[] = [];
  for (const candidate of content) {
    const hit = phrases
      .map((phrase) => ({ phrase, kind: matchExclusion(phrase, candidate.title) }))
      .find((item) => item.kind === "drop");
    if (hit) {
      excluded.push({ title: candidate.title.trim(), reason: exclusionReason(hit.phrase) });
      continue;
    }
    kept.push(candidate);
  }

  const buckets: Bucket[] = [];
  const multiFile =
    new Set(kept.map((candidate) => candidate.documentId).filter(Boolean)).size > 1;

  if (rows.length) {
    for (const row of rows) {
      const dropped = phrases.find((phrase) => matchExclusion(phrase, row.title) === "drop");
      if (dropped) {
        excluded.push({ title: row.title, reason: exclusionReason(dropped) });
        continue;
      }
      const bucket = blankBucket(row.title);
      bucket.weightPercent = row.weightPercent;
      bucket.examHeavy = row.examHeavy;
      bucket.syllabusIndex = row.index;
      if (row.description.trim()) bucket.summaryParts.push(row.description.trim());
      for (const phrase of phrases) {
        const hit = matchExclusion(phrase, row.title);
        const namedInRow = fold(phrase).length >= 6 && fold(row.description).includes(fold(phrase));
        if (hit === "narrow" || (namedInRow && hit !== "drop")) {
          bucket.scopeNotes.push(exclusionReason(phrase));
        }
      }
      buckets.push(bucket);
    }
    const unassigned: MaterialCandidate[] = [];
    for (const candidate of kept) {
      const match = bestRow(candidate, rows);
      const bucket = match
        ? buckets.find((item) => item.syllabusIndex === match.row.index)
        : undefined;
      if (!bucket) {
        unassigned.push(candidate);
        continue;
      }
      const same =
        topicMatchKey(candidate.title) &&
        topicMatchKey(candidate.title) === topicMatchKey(bucket.title);
      absorbCandidate(bucket, candidate, !same);
    }
    for (const group of clusterCandidates(unassigned, multiFile)) {
      const bucket = blankBucket(titleForCluster(group));
      group.forEach((candidate, index) => absorbCandidate(bucket, candidate, index > 0));
      buckets.push(bucket);
    }
  } else {
    for (const group of clusterWithoutSyllabus(kept)) {
      const bucket = blankBucket(titleForCluster(group));
      group.forEach((candidate) => {
        const same =
          topicMatchKey(candidate.title) &&
          topicMatchKey(candidate.title) === topicMatchKey(bucket.title);
        absorbCandidate(bucket, candidate, !same);
      });
      buckets.push(bucket);
    }
  }

  for (const candidate of nonContent) {
    foldIntoBest(buckets, candidate);
  }

  const missingFromMaterials: MissingMaterialTopic[] = [];
  const populated = buckets.filter((bucket) => {
    if (bucket.memberIds.length || bucket.syllabusIndex == null) return true;
    missingFromMaterials.push({
      title: bucket.title,
      weightPercent: bucket.weightPercent,
      examHeavy: bucket.examHeavy,
    });
    return false;
  });

  let topics = inferPrerequisites(populated.map(finishBucket));
  topics = topics.map((topic) => ({
    ...topic,
    prerequisites: topic.prerequisites.filter((item) =>
      topics.some((other) => topicMatchKey(other.title) === topicMatchKey(item)),
    ),
  }));

  const ambiguous = rows.length ? [] : ambiguousPairs(clusterWithoutSyllabus(kept));

  return {
    topics,
    excluded: uniqueExclusion(excluded),
    missingFromMaterials,
    suggestedExamDate,
    syllabusDocumentId: syllabusDocs[0]?.documentId ?? null,
    ambiguous,
    foldedNonTopics: nonContent.map((candidate) => candidate.title.trim()),
  };
}

function uniqueExclusion(notes: ExcludedTopicNote[]): ExcludedTopicNote[] {
  const seen = new Set<string>();
  const out: ExcludedTopicNote[] = [];
  for (const note of notes) {
    const key = fold(note.title) || fold(note.reason);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

/**
 * Model "aynı küme" dediyse o kümeleri birleştirir.
 * Karar yoksa liste olduğu gibi kalır.
 */
export function applyClusterMerges(
  topics: ConsolidatedTopic[],
  groups: string[][],
): ConsolidatedTopic[] {
  if (!groups.length) return topics;
  const parent = topics.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const indexOf = (title: string) =>
    topics.findIndex((topic) => topicMatchKey(topic.title) === topicMatchKey(title));
  for (const group of groups) {
    const indexes = group.map(indexOf).filter((index) => index >= 0);
    if (indexes.length < 2) continue;
    const root = find(indexes[0]);
    for (const index of indexes.slice(1)) {
      const other = find(index);
      if (other !== root) parent[other] = root;
    }
  }
  const merged = new Map<number, ConsolidatedTopic>();
  topics.forEach((topic, index) => {
    const root = find(index);
    const have = merged.get(root);
    if (!have) {
      merged.set(root, {
        ...topic,
        sections: topic.sections.map((section) => ({
          ...section,
          pages: [...section.pages],
          sources: section.sources.map((source) => ({ ...source, pages: [...source.pages] })),
        })),
        sources: topic.sources.map((source) => ({ ...source, pages: [...source.pages] })),
        pages: [...topic.pages],
        prerequisites: [...topic.prerequisites],
        commonMistakes: [...topic.commonMistakes],
        practiceItems: [...topic.practiceItems],
        nodeIds: [...topic.nodeIds],
      });
      return;
    }
    have.sections.push({
      title: topic.title,
      pages: [...topic.pages],
      sources: topic.sources.map((source) => ({ ...source, pages: [...source.pages] })),
    });
    have.sections.push(...topic.sections);
    have.pages = uniquePages([...have.pages, ...topic.pages]);
    have.commonMistakes = uniqueLines([...have.commonMistakes, ...topic.commonMistakes]);
    have.practiceItems = uniqueLines([...have.practiceItems, ...topic.practiceItems]);
    have.nodeIds = [...new Set([...have.nodeIds, ...topic.nodeIds])];
    have.prerequisites = uniqueLines([...have.prerequisites, ...topic.prerequisites]).filter(
      (item) => topicMatchKey(item) !== topicMatchKey(have.title),
    );
    for (const source of topic.sources) {
      const existing = have.sources.find(
        (item) => item.documentId && item.documentId === source.documentId,
      );
      if (!existing) have.sources.push({ ...source, pages: [...source.pages] });
      else existing.pages = uniquePages([...existing.pages, ...source.pages]);
    }
    have.sourceCount = new Set(
      have.sources.map((source) => source.documentId || source.fileName),
    ).size;
    if ((topic.weightPercent ?? 0) > (have.weightPercent ?? 0)) {
      have.weightPercent = topic.weightPercent;
    }
    have.examHeavy = have.examHeavy || topic.examHeavy;
    have.importance = strongerImportance(have.importance, topic.importance);
  });
  return [...merged.values()];
}

/** Ağır konu daha çok pratik alır. Kısa sürede ekstra pratik eklenmez. */
export function extraPracticeForTopic(
  topic: {
    weightPercent?: number | null;
    examHeavy?: boolean;
    importance?: TopicImportance | null;
  },
  daysToExam: number,
): number {
  if (daysToExam < 10) return 0;
  const heavy =
    Boolean(topic.examHeavy) ||
    (topic.weightPercent ?? 0) >= 20 ||
    topic.importance === "important";
  const medium = (topic.weightPercent ?? 0) >= 15;
  if (!heavy && !medium) return 0;
  if (daysToExam >= 21 && heavy) return 2;
  return 1;
}

/**
 * Rozet kaynağı. Müfredat "sınavda ağırlıklı" demediyse o yazılmaz.
 * Öğretmen analizi core dediyse "Önemli". Kaynak yoksa rozet yok.
 */
export function topicBadge(
  topic: { examHeavy?: boolean; importance?: TopicImportance | null },
): "exam-heavy" | "important" | null {
  if (topic.examHeavy) return "exam-heavy";
  if (topic.importance === "important") return "important";
  return null;
}

/** 1 en yüksek. Öğretmen analizi yoksa null. */
export function priorityFromImportance(
  importance: TopicImportance | null | undefined,
): number | null {
  if (importance === "important") return 1;
  if (importance === "medium") return 3;
  if (importance === "less") return 5;
  return null;
}

/** 1 en yüksek öncelik. Müfredat payı yoksa null — çağıran kendi önceliğini korur. */
export function priorityFromWeight(
  topic: { weightPercent?: number | null; examHeavy?: boolean },
): number | null {
  if (topic.examHeavy || (topic.weightPercent ?? 0) >= 20) return 1;
  if ((topic.weightPercent ?? 0) >= 12) return 2;
  if (topic.weightPercent != null && topic.weightPercent >= 8) return 3;
  if (topic.weightPercent != null) return 4;
  return null;
}
