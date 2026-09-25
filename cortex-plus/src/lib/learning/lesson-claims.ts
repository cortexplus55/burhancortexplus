/**
 * Ders iddialarını ve konu başlığının kapsamını kaynağa bağlar.
 *
 * Model çağrısı burada yok. Doğrulayıcı ve onarım bu saf kontrolleri
 * kullanır; uymayan kart ve cümle düşer, eksik kavram uydurulmaz.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const GENERIC = new Set([
  "kavram",
  "kavrami",
  "kavramlar",
  "kavramlari",
  "giris",
  "temel",
  "konu",
  "konular",
  "ders",
  "dersi",
  "ve",
  "ile",
  "icin",
  "veya",
]);

/**
 * En uzun kavram eşlenen sayfalarda duruyorsa kısa kalan sözcük
 * ("Prosesler") başka bölümü içeri almaz.
 * "Özgül Isılar" eksikse entalpi sayfası yine eklenir.
 */
export function conceptsWorthWidening(title: string, mappedText: string): string[] {
  const concepts = titleConcepts(title);
  if (!concepts.length) return [];
  const longest = concepts.reduce((best, item) => (item.length > best.length ? item : best));
  if (conceptInText(longest, mappedText)) return [];
  return concepts.filter((concept) => !conceptInText(concept, mappedText));
}

function topicSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
}

/**
 * İstenen konunun kendi cümleleri. İki cümleden azsa kapsam dar sayılmaz
 * ve dersin tamamı bu yüzden silinmez.
 */
export function topicSpan(source: string, topicLabel: string): string | null {
  const concepts = titleConcepts(topicLabel);
  if (!concepts.length || !source.trim()) return null;
  const longest = concepts.reduce((best, item) => (item.length > best.length ? item : best));
  const hits = topicSentences(source).filter((sentence) => conceptInText(longest, sentence));
  if (hits.length < 2) return null;
  return hits.join(" ");
}

const FOREIGN_TOPIC: { hit: (text: string) => boolean }[] = [
  {
    hit: (text) => /P\s*v\s*=\s*Z\s*R\s*T|Pv\s*=\s*ZRT|PV\s*=\s*Z\s*R\s*T|PV\s*=\s*ZRT/i.test(text),
  },
  {
    hit: (text) =>
      /gerçek gaz|sıkıştırılabilirlik/i.test(text) ||
      /gercek gaz|sikistirilabilirlik/.test(foldTr(text)),
  },
  {
    hit: (text) =>
      /\b[PT]\s+r\b/.test(text) ||
      /[PT]ᵣ/.test(text) ||
      /\b[PT]\s+cr\b/.test(text) ||
      /\b[PT]_cr\b/.test(text) ||
      /\b[PT]cr\b/.test(text),
  },
  { hit: (text) => /Z\s*=\s*1[.,]0\d/.test(text) },
];

/** Kapsamda olmayan gerçek gaz bağıntısı bu konunun cümlesi değildir. */
export function foreignToTopic(text: string, source: string, topicLabel: string): boolean {
  const span = topicSpan(source, topicLabel);
  if (!span) return false;
  return FOREIGN_TOPIC.some((item) => item.hit(text) && !item.hit(span));
}

/**
 * Pv = ZRT özgül hacimdir. Toplam hacim PV = mZRT biçimindedir.
 * Kaynak söylemiyorsa Z ≈ 1 iddiası da düşer.
 */
export function realGasPrecisionIssue(sentence: string, source: string): boolean {
  const specific = /P\s*v\s*=\s*Z\s*R\s*T|Pv\s*=\s*ZRT/i.test(sentence);
  const total = /PV\s*=\s*Z\s*R\s*T|PV\s*=\s*ZRT/.test(sentence);
  if (specific && /hacim\s+V\b/.test(sentence)) return true;
  if (total && !/(?:m|n)\s*Z\s*R\s*T|mZRT|nZRT|\bm\s*R\s*T|\bn\s*R\s*T/i.test(sentence)) return true;
  const folded = foldTr(sentence);
  if (/bozmaz/.test(folded) && /ideal gaz/.test(folded) && /z\s*=\s*1/.test(folded)) {
    return !/bozmaz/.test(foldTr(source));
  }
  return false;
}

/** "İç Enerji, Entalpi ve Özgül Isılar" → iç enerji, entalpi, özgül ısılar. */
export function titleConcepts(title: string): string[] {
  const parts = title.split(/\s*(?:,| ve )\s*/i);
  const out: string[] = [];
  for (const part of parts) {
    const words = part
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !GENERIC.has(foldTr(word)));
    const phrase = words.join(" ").trim();
    if (phrase.length < 3) continue;
    if (out.some((item) => foldTr(item) === foldTr(phrase))) continue;
    out.push(phrase);
  }
  return out;
}

/** Kaynakta kavramın kendisi ya da ayırt edici kökü geçiyor mu. */
export function conceptInText(concept: string, text: string): boolean {
  const folded = foldTr(text);
  const phrase = foldTr(concept).replace(/\s+/g, " ").trim();
  if (!phrase) return false;
  if (folded.includes(phrase)) return true;
  const stem = phrase.replace(/(lar|ler)$/, "").trim();
  return stem.length >= 4 && folded.includes(stem);
}

export type PageCatalogItem = { pageNumber: number; text: string };

/**
 * Başlıktaki kavram eşlenen sayfalarda yoksa aynı belgenin o kavramı
 * taşıyan sayfalarını ekler. Belgede yoksa liste değişmez.
 */
export function selectPagesForTitle(
  title: string,
  mappedPages: number[],
  catalog: PageCatalogItem[],
): number[] {
  const mapped = new Set(mappedPages);
  const mappedText = catalog
    .filter((page) => mapped.has(page.pageNumber))
    .map((page) => page.text)
    .join("\n");
  const extra: number[] = [];
  for (const concept of conceptsWorthWidening(title, mappedText)) {
    let added = 0;
    for (const page of catalog) {
      if (mapped.has(page.pageNumber) || extra.includes(page.pageNumber)) continue;
      if (!conceptInText(concept, page.text)) continue;
      extra.push(page.pageNumber);
      added += 1;
      if (added >= 2 || extra.length >= 4) break;
    }
  }
  return [...mappedPages, ...extra];
}

function sourceHasFirstLaw(source: string): boolean {
  const folded = foldTr(source);
  const compact = folded.replace(/\s+/g, "").replace(/[−–]/g, "-");
  if (/du=q/.test(compact) || /q-w/.test(compact)) return true;
  return /ic enerji/.test(folded) && /isi/.test(folded) && /\bis\b/.test(folded);
}

/**
 * "Doğrusu" ısı kaybını tek etki sayıyorsa yanlıştır.
 * Yanlış inancın kendisi burada denetlenmez.
 */
export function overgeneralCorrection(correction: string, source: string): boolean {
  if (!sourceHasFirstLaw(source)) return false;
  const folded = foldTr(correction);
  if (!/(sadece|yalnizca|her zaman)/.test(folded)) return false;
  const mentionsGain = /isi kazanc|isi alim|isi giris|isi alindig|isi alir|isi alin/.test(folded);
  const mentionsLoss = /isi kayb/.test(folded);
  const onlyWorkOrLoss = /(sadece|yalnizca)/.test(folded) && /isi kayb|is yapimi/.test(folded);
  return (mentionsLoss && !mentionsGain) || (onlyWorkOrLoss && !mentionsGain);
}

/** İşaret belirtilmeden "iç enerji artar / iş yapıldığında değişir". */
export function ambiguousEnergyClaim(sentence: string, source: string): boolean {
  if (!sourceHasFirstLaw(source)) return false;
  const folded = foldTr(sentence);
  if (!/ic enerji/.test(folded)) return false;
  if (
    /(artis|azalis) goster/.test(folded) &&
    !/\d/.test(sentence) &&
    !/du\s*=|q\s*[-−]\s*w/.test(folded)
  ) {
    return true;
  }
  if (
    /is yapildiginda/.test(folded) &&
    !/(sistemin yaptigi|sisteme yapilan|sistem uzerinde|sistem tarafindan)/.test(folded)
  ) {
    return true;
  }
  return false;
}

const SIGN_SYMBOL = "[A-Za-zΔδ][A-Za-z0-9_]*";

/**
 * Q − (−W) = Q + W aynı simgeyi hem işaretli değer hem büyüklük yapar.
 * Q − (−|W|) = Q + |W|, ΔE = Q − W = Q + |W| ve −(−3) = 3 yakalanmaz.
 */
export function signConventionFlip(text: string): boolean {
  const normalized = text.replace(/[−–]/g, "-").replace(/\s+/g, " ");
  const re = new RegExp(`-\\s*\\(\\s*-\\s*(?!\\|)(${SIGN_SYMBOL})\\s*\\)`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const symbol = match[1];
    const tail = normalized.slice((match.index ?? 0) + match[0].length);
    const chain = (tail.split(/[.;]/)[0] ?? "").split("=");
    const bare = new RegExp(`(?:^|\\+)\\s*${symbol}\\b`, "i");
    const wrapped = new RegExp(`\\|\\s*${symbol}\\s*\\|`, "i");
    for (const piece of chain) {
      if (wrapped.test(piece)) continue;
      if (bare.test(piece)) return true;
    }
  }
  return false;
}

/** W negatifken zincir ΔE = Q − W = Q + |W| olur. Düzelmezse cümle yayımlanmaz. */
export function rewriteSignFlip(sentence: string): string | null {
  if (!signConventionFlip(sentence)) return sentence;
  const next = sentence.replace(
    /Q\s*[−–-]\s*\(\s*[−–-]\s*W\s*\)\s*=\s*Q\s*\+\s*W/gi,
    "Q − W = Q + |W|",
  );
  return signConventionFlip(next) ? null : next;
}

const QUANTITY =
  /(\d+(?:[.,]\d+)?)\s*(kJ\/kg|m3\/kg|kJ|kPa|MPa|Pa|kg|°\s*C|K)\b/gi;

function quantityNumbers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(QUANTITY)) {
    const raw = match[1];
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < 3) continue;
    out.push(raw.replace(",", "."));
  }
  return out;
}

function numberIn(text: string, normalized: string): boolean {
  if (!normalized) return false;
  const comma = normalized.replace(".", ",");
  return text.includes(normalized) || text.includes(comma);
}

/**
 * Özet, örnekte ve kaynakta olmayan bir nicelik taşıyorsa uyuşmaz.
 * 25 kJ, ders 30 kJ iken ve kaynakta 25 yokken düşer.
 */
export function summaryQuantityMismatch(line: string, example: string, source: string): boolean {
  const pool = `${example}\n${source}`;
  return quantityNumbers(line).some((value) => !numberIn(pool, value));
}

/** Öğretmen notundaki kapsam satırları. Kaynakta duranlar dersin konusudur. */
export function checklistConcepts(note: string): string[] {
  const lines = note.split("\n");
  const start = lines.findIndex((line) => foldTr(line).includes("kapsam listesi"));
  if (start < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("-")) break;
    const label = trimmed.replace(/^-\s*\([^)]*\)\s*[a-zçğıöşü]+:\s*/i, "").trim();
    if (label.length < 3 || label.length > 80) continue;
    out.push(label);
    if (out.length >= 8) break;
  }
  return out;
}

function compactRelation(text: string): string {
  return foldTr(text).replace(/[\s_]/g, "").replace(/[−–]/g, "-");
}

const NAMED_RELATIONS: { label: string; pattern: RegExp }[] = [
  { label: "c_p − c_v = R", pattern: /cp-cv=r/ },
  { label: "k = c_p/c_v", pattern: /k=cp\/cv/ },
];

/** "Formüller:" satırındaki kısa bağıntılar. Gövdedeki her eşitlik değil. */
function listedFormulas(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split("\n")) {
    const folded = foldTr(line);
    if (!/formuller\s*:/.test(folded) && !folded.includes("bu sayfadaki formuller")) continue;
    const after = line.split(":").slice(1).join(":");
    for (const part of after.split("|")) {
      const formula = part.replace(/\s+/g, " ").trim();
      if (!/=/.test(formula) || formula.length < 3 || formula.length > 80) continue;
      out.push(formula);
    }
  }
  return out;
}

/**
 * Kaynakta duran c_p − c_v = R ve k = c_p/c_v, bir de formül listesindeki
 * kısa satırlar. Sayfa gövdesindeki her eşitlik burada aranmaz.
 */
export function missingFormulaCoverage(lessonText: string, source: string): string[] {
  const sourceKey = compactRelation(source);
  const lessonKey = compactRelation(lessonText);
  const missing: string[] = [];
  for (const relation of NAMED_RELATIONS) {
    if (!relation.pattern.test(sourceKey) || relation.pattern.test(lessonKey)) continue;
    missing.push(relation.label);
  }
  for (const formula of listedFormulas(source)) {
    const key = compactRelation(formula);
    if (lessonKey.includes(key)) continue;
    if (missing.some((item) => compactRelation(item) === key)) continue;
    missing.push(formula);
  }
  return missing;
}

export function missingCoverage(
  lessonText: string,
  source: string,
  topicLabel: string,
): string[] {
  const wanted = [...titleConcepts(topicLabel), ...checklistConcepts(source)];
  const missing: string[] = [];
  for (const concept of wanted) {
    if (!conceptInText(concept, source)) continue;
    if (conceptInText(concept, lessonText)) continue;
    if (missing.some((item) => foldTr(item) === foldTr(concept))) continue;
    missing.push(concept);
  }
  for (const formula of missingFormulaCoverage(lessonText, source)) {
    if (missing.some((item) => foldTr(item) === foldTr(formula))) continue;
    missing.push(formula);
  }
  return missing;
}

function lessonBlob(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading}\n${section.body}`),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
}

/** Doğrulayıcıya giden iddia listesi. Yanlış inanç olgu diye yazılmaz. */
export function claimVerifyPrompt(lesson: LessonV2, source: string): string {
  const claims = [
    lesson.commonMistake?.correction
      ? `Doğrusu: ${lesson.commonMistake.correction}`
      : "",
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.solution ?? "",
    ...(lesson.summary ?? []),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .slice(0, 24);
  return [
    "İddiaları kaynağa karşı denetle.",
    "Yalnızca yanlış, kaynakta desteği olmayan veya işareti belirsiz cümleleri döndür.",
    "Sık yapılan hatanın yanlış inancı yanlış kalabilir; onun düzeltmesi doğru olmalıdır.",
    "Isı alımı da iç enerjiyi değiştirir. ΔU = Q − W bağıntısında işareti söylemeyen cümle belirsizdir.",
    "Formülün içindeki işaret ve cebir hatasını da wrong say. Q − (−W) = Q + W aynı simgeyi hem negatif değer hem büyüklük yapar. Doğru zincir ΔE = Q − W = Q + |W| biçimidir.",
    "Pv = ZRT bağıntısında v özgül hacimdir. Toplam hacim için PV = mZRT yazılır. Kaynak söylemiyorsa Z = 1.03 ideal gaz varsayımını bozmaz deme.",
    'JSON: {"bad":[{"quote":"dersteki aynen cümle","reason":"wrong"}]}',
    "reason yalnız wrong, unsupported veya ambiguous olsun. Uyan iddia yoksa bad boş dizi olsun.",
    `Kaynak:\n${source.slice(0, 4000)}`,
    `İddialar:\n${claims.join("\n")}`,
  ].join("\n\n");
}

const CLAIM_REASONS = new Set(["wrong", "unsupported", "ambiguous"]);

/** Modelin döndürdüğü alıntı derste yoksa yok sayılır. */
export function claimsFromVerify(raw: unknown, lesson: LessonV2): string[] {
  const row = raw && typeof raw === "object" ? (raw as { bad?: unknown }).bad : null;
  if (!Array.isArray(row)) return [];
  const visible = lessonBlob(lesson);
  const foldedVisible = foldTr(visible);
  const claim = foldTr(lesson.commonMistake?.claim ?? "");
  const quotes: string[] = [];
  for (const item of row) {
    if (!item || typeof item !== "object") continue;
    const quote = String((item as { quote?: unknown }).quote ?? "").trim();
    const reason = String((item as { reason?: unknown }).reason ?? "");
    if (quote.length < 12 || !CLAIM_REASONS.has(reason)) continue;
    if (claim && foldTr(quote) === claim) continue;
    if (!visible.includes(quote) && !foldedVisible.includes(foldTr(quote))) continue;
    if (quotes.some((have) => foldTr(have) === foldTr(quote))) continue;
    quotes.push(quote);
    if (quotes.length >= 8) break;
  }
  return quotes;
}

/**
 * Ders skoru ilk denemedeki kontrol sorularıdır.
 * Tekrar doğru olsa bile kaçan soru doğruya yazılmaz.
 */
export function scoreLessonChecks(
  lesson: { sections?: { check?: unknown }[] } | null | undefined,
  answers: Record<string, unknown>,
): { score: number; total: number; retried: number } {
  const sections = lesson?.sections ?? [];
  const checked = sections
    .map((section, index) => (section.check ? index : -1))
    .filter((index) => index >= 0);
  if (!checked.length) return { score: 1, total: 1, retried: 0 };
  const raw = answers.lessonMisses;
  const missed = new Set<number>();
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === "number" && Number.isInteger(value) && checked.includes(value)) {
        missed.add(value);
      }
    }
  }
  return {
    score: checked.length - missed.size,
    total: checked.length,
    retried: missed.size,
  };
}
