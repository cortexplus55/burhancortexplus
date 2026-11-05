/*
  Koşullu önerme dönüşümlerinin adları — genel, cebirsel denetim (5 Kasım 2026).

  Bir koşullu önerme A ⇒ B için: KARŞITI B ⇒ A, TERSİ ¬A ⇒ ¬B, KARŞIT TERSİ ¬B ⇒ ¬A. Koşullu önerme yalnız
  karşıt tersine denktir; karşıtı ile tersi birbirine denktir. Model bu adları karıştırabildiği için havuz kapısı,
  ders kapısı ve soru bütünlüğü bu kuralı kodla sınar (model çağrısı yok).

  Önceki sürüm (2 Kasım 2026) yalnız p ve q harfleriyle çalışıyor, temel önermeyi varsayılan p ⇒ q sayıyordu;
  4 Kasım'da "özel kapı" diye kaldırıldı. Bu sürüm atomlardan bağımsızdır: herhangi bir harf (p, q, r, s, a, b …),
  değillenmiş atom (¬p, p′, p'), bileşik dönüşüm ("tersinin karşıtı") ve sözel biçim ("A ise B" / "A değilse B değil")
  aynı cebirle denetlenir. Temel önerme ya açıkça yazılandır ("¬p ⇒ q önermesinin karşıtı") ya da cümlede (yoksa bir
  önceki cümlede) ilk etiketten ÖNCE geçen koşulludur; hiçbiri yoksa karar verilmez (yanlış alarm yerine sessizlik).
  Disipline özgü hiçbir sözcük yok; kural mantığın kendisidir.
*/

import { turkishFold } from "@/lib/text/turkish";

export type LogicAtom = { name: string; neg: boolean };
export type Conditional = { from: LogicAtom; to: LogicAtom };
export type ConditionalTransform = "converse" | "inverse" | "contrapositive";

const TRANSFORM_NAME: Record<ConditionalTransform, string> = {
  converse: "karşıtı",
  inverse: "tersi",
  contrapositive: "karşıt tersi",
};

const ARROW = "(?:⇒|⟹|→|⟶|=>|⊃)";
const NEG_PREFIX = "(?:¬|~|∼|!)";
// Prime (′) her zaman değil imidir; ASCII kesme (' ’) yalnız ardından harf gelmiyorsa (q'nun, p'ye → ek).
const NEG_SUFFIX = "(?:′|['’](?!\\p{L}))";
const ATOM_CORE = "[A-Za-z](?:[₀-₉]|_?\\d)?";
const ATOM = `(${NEG_PREFIX}?\\s*${ATOM_CORE}\\s*${NEG_SUFFIX}?)`;
const FORMULA = `${ATOM}\\s*${ARROW}\\s*${ATOM}`;
const FORMULA_RE = new RegExp(FORMULA, "u");

const LABEL = "(karşıt\\s+ters(?:i|idir|ine|ini|inin)?|karşıt(?:ı|ıdır|ına|ını|ının)?|ters(?:i|idir|ine|ini|inin)?)";
const GENITIVE = "(?:n[ıiuü]n)";
// Bileşik zincir: "tersinin karşıtı", "karşıt tersinin tersi" — tamlayan ekli etiketler ve son etiket.
const LABEL_CHAIN = `((?:(?:karşıt\\s+ters|karşıt|ters)[ıiuü]${GENITIVE}\\s+)*)${LABEL}(?!\\p{L})`;
// Etiket → kısa bağlaç (":", "ise", "=", "olan", "şudur", virgül, "önermesi") → formül.
const LABEL_THEN_FORMULA = new RegExp(`${LABEL_CHAIN}[^.;⇒⟹→⟶\\n]{0,24}?${FORMULA}`, "giu");
// Formül → "<temel> önermesinin|’nun" → etiket ("q ⇒ p, p ⇒ q’nun tersidir").
const FORMULA_THEN_LABEL = new RegExp(
  `${FORMULA}\\s*,?\\s*(?:önermesi\\s+)?${FORMULA}\\s*(?:önermesinin|koşullu\\s+önermesinin|['’]?${GENITIVE}|için)\\s+${LABEL_CHAIN}`,
  "giu",
);
// Etiketin hemen önündeki açık temel: "¬p ⇒ q önermesinin", "(p ⇒ ¬q)'nun", "p′ ⇒ q için", "p ⇒ q koşullu önermesinin".
const BASE_BEFORE = new RegExp(
  `${FORMULA}\\s*\\)?\\s*(?:koşullu\\s+)?(?:önermesinin|önermesi\\s+için|['’]?${GENITIVE}|['’]?[ıiuü]n|için)\\s*$`,
  "iu",
);
const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/u;

function cleanName(raw: string): string {
  return raw.replace(/[¬~∼!′'’\s]/gu, "").replace(/_/g, "").toLowerCase();
}

export function parseAtom(raw: string): LogicAtom {
  const t = raw.trim();
  const neg = new RegExp(`^${NEG_PREFIX}`, "u").test(t) || /(?:′|['’])$/u.test(t);
  return { name: cleanName(t), neg };
}

function parseConditional(from: string, to: string): Conditional {
  return { from: parseAtom(from), to: parseAtom(to) };
}

const flip = (a: LogicAtom): LogicAtom => ({ name: a.name, neg: !a.neg });
const sameAtom = (a: LogicAtom, b: LogicAtom) => a.name === b.name && a.neg === b.neg;
const sameConditional = (a: Conditional, b: Conditional) => sameAtom(a.from, b.from) && sameAtom(a.to, b.to);

/** Dönüşümün cebiri: karşıtı yer değiştirir, tersi değiller, karşıt tersi ikisini birden yapar. */
export function transformConditional(base: Conditional, kind: ConditionalTransform): Conditional {
  if (kind === "converse") return { from: base.to, to: base.from };
  if (kind === "inverse") return { from: flip(base.from), to: flip(base.to) };
  return { from: flip(base.to), to: flip(base.from) };
}

export function transformKey(label: string): ConditionalTransform {
  const l = turkishFold(label).replace(/\s+/g, " ");
  if (/^karsit ters/.test(l)) return "contrapositive";
  if (/^karsit/.test(l)) return "converse";
  return "inverse";
}

/** "tersinin karşıtı" → [inverse, converse]: içten dışa uygulanır. */
function chainKinds(chain: string, last: string): ConditionalTransform[] {
  const inner = [...chain.matchAll(/(karşıt\s+ters|karşıt|ters)[ıiuü]n[ıiuü]n/giu)].map((m) => transformKey(m[1]!));
  return [...inner, transformKey(last)];
}

function applyChain(base: Conditional, kinds: ConditionalTransform[]): Conditional {
  return kinds.reduce((acc, kind) => transformConditional(acc, kind), base);
}

function showAtom(a: LogicAtom): string {
  return `${a.neg ? "¬" : ""}${a.name}`;
}

export function showConditional(c: Conditional): string {
  return `${showAtom(c.from)} ⇒ ${showAtom(c.to)}`;
}

const TRANSFORM_GENITIVE: Record<ConditionalTransform, string> = {
  converse: "karşıtının",
  inverse: "tersinin",
  contrapositive: "karşıt tersinin",
};

/** [inverse, converse] → "tersinin karşıtı". */
function chainName(kinds: ConditionalTransform[]): string {
  const last = kinds.at(-1) ?? "inverse";
  const inner = kinds.slice(0, -1).map((k) => TRANSFORM_GENITIVE[k]);
  return [...inner, TRANSFORM_NAME[last]].join(" ");
}

function sameAtomSet(a: Conditional, b: Conditional): boolean {
  const names = new Set([a.from.name, a.to.name]);
  return names.has(b.from.name) && names.has(b.to.name);
}

/** Cümlede ilk etiketten ÖNCE geçen koşullu: dönüşümlerin temelidir. Yoksa null. */
function anchorConditional(sentence: string): Conditional | null {
  const labelAt = sentence.search(new RegExp(LABEL_CHAIN, "iu"));
  const head = labelAt >= 0 ? sentence.slice(0, labelAt) : sentence;
  const m = FORMULA_RE.exec(head);
  return m ? parseConditional(m[1]!, m[2]!) : null;
}

function explicitBase(before: string): Conditional | null {
  const m = BASE_BEFORE.exec(before);
  return m ? parseConditional(m[1]!, m[2]!) : null;
}

type Judgement = { base: Conditional; kinds: ConditionalTransform[]; got: Conditional };

function judge({ base, kinds, got }: Judgement): string | null {
  if (base.from.name === base.to.name) return null;
  if (!sameAtomSet(base, got)) return null;
  if (sameConditional(got, base)) return null;
  const want = applyChain(base, kinds);
  if (sameConditional(got, want)) return null;
  const actual = (Object.keys(TRANSFORM_NAME) as ConditionalTransform[]).find((k) => sameConditional(got, transformConditional(base, k)));
  const label = chainName(kinds);
  return (
    `"${label}" ${showConditional(got)} olarak yazılmış` +
    (actual ? ` (bu, "${TRANSFORM_NAME[actual]}"; ${showConditional(base)} için ${label} ${showConditional(want)})` : ` (${showConditional(base)} için ${label} ${showConditional(want)})`)
  );
}

/* ───────────── Sözel biçim: "A ise B" ───────────── */

const NL_IF = /(?<![\p{L}\p{N}])ise(?![\p{L}])/iu;
const NL_NEG = /(?:(?<![\p{L}])değil(?:se|dir|ler|lerse)?(?![\p{L}])|(?<![\p{L}])olmayan(?![\p{L}])|(?<![\p{L}])olmaz(?:sa)?(?![\p{L}]))/iu;
const NL_STOP = new Set(["bir", "bu", "su", "o", "her", "ve", "de", "da", "ile", "icin", "ise", "olan", "olarak"]);
// turkishFold sonrası (ı→i, ü→u) ek-fiil: -dir/-dır/-dur/-dür, -ler/-lar, -dim/-diz …; sözcüğün kendisi boş kalmaz.
const COPULA = /(?:y?[dt][iu]r(?:l[ae]r)?|y?[dt][iu]|y?[iu]m|y?[iu]z)$/u;

function clauseKey(raw: string): LogicAtom | null {
  const text = raw.replace(/["“”‘’'«»]/g, " ").trim();
  if (!text) return null;
  const neg = NL_NEG.test(text);
  const words = turkishFold(text.replace(NL_NEG, " "))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((w) => w && !NL_STOP.has(w));
  if (!words.length) return null;
  // Yüklem sözcüğü atomun adıdır ("bir şekil kare" ≡ "karedir"): özne ikinci yan cümlede çoğu zaman düşer.
  const last = words.at(-1)!;
  const stem = last.replace(COPULA, "") || last;
  const name = stem.length > 5 ? stem.slice(0, 5) : stem;
  return name ? { name, neg } : null;
}

function nlConditional(text: string): Conditional | null {
  const m = NL_IF.exec(text);
  if (!m || m.index === undefined) return null;
  const from = clauseKey(text.slice(0, m.index));
  const to = clauseKey(text.slice(m.index + m[0].length));
  return from && to ? { from, to } : null;
}

const NL_LABEL_THEN_CLAUSE = new RegExp(`${LABEL_CHAIN}\\s*(?:[:=]|ise|şudur|şöyledir|olur|önermesi)?\\s*[:\\s]*["“‘]?([^."”’]+?ise[^."”’]+)["”’]?(?=[.!?\\n]|$)`, "giu");

// "değilse" / "olmazsa" / "yoksa": değillenmiş koşul tek sözcükte; "değil ise" biçimine açılır ki "ise" ayrışsın.
const NL_FUSED_IF = /(?<![\p{L}])(değil|olmaz|yok)s[ae](?![\p{L}])/giu;

function nlIssues(rawSentences: string[]): string[] {
  const issues: string[] = [];
  let carried: Conditional | null = null;
  const sentences = rawSentences.map((s) => s.replace(NL_FUSED_IF, "$1 ise"));
  for (const sentence of sentences) {
    const labelAt = sentence.search(new RegExp(LABEL_CHAIN, "iu"));
    const head = labelAt >= 0 ? sentence.slice(0, labelAt) : sentence;
    const anchor = FORMULA_RE.test(head) ? null : nlConditional(head);
    if (anchor) carried = anchor;
    if (labelAt < 0 || !carried) continue;
    for (const m of sentence.matchAll(NL_LABEL_THEN_CLAUSE)) {
      const got = nlConditional(m[3]!);
      if (!got) continue;
      const kinds = chainKinds(m[1] ?? "", m[2]!);
      const issue = judge({ base: carried, kinds, got });
      if (issue) issues.push(issue);
    }
  }
  return issues;
}

/* ───────────── Denklik iddiası ───────────── */

const EQUIVALENCE = /(?<![\p{L}])(?:denk(?:tir|dir)?|eşdeğer(?:dir)?|aynı\s+anlam)(?![\p{L}])/iu;
const EQUIVALENCE_NEGATED = /(?:denk|eşdeğer)\s+değil/iu;

/** "Koşullu önerme karşıtına denktir" yanlıştır: yalnız karşıt tersine denktir; karşıtı ile tersi birbirine denktir. */
function equivalenceIssue(sentence: string): string | null {
  if (!EQUIVALENCE.test(sentence) || EQUIVALENCE_NEGATED.test(sentence)) return null;
  const folded = turkishFold(sentence);
  if (!/onerme|kosullu/.test(folded) && !FORMULA_RE.test(sentence)) return null;
  if (/karsit\s+ters/.test(folded)) return null;
  const hasConverse = /(?<![\p{L}])karsit(?:i|idir|ina|ini|inin)?(?![\p{L}])/u.test(folded);
  const hasInverse = /(?<![\p{L}])ters(?:i|idir|ine|ini|inin)?(?![\p{L}])/u.test(folded);
  if (hasConverse === hasInverse) return null;
  const which = hasConverse ? "karşıtına" : "tersine";
  return `koşullu önerme "${which}" denk değildir; yalnız karşıt tersine denktir (karşıtı ile tersi birbirine denktir)`;
}

/* ───────────── Dışa açık giriş ───────────── */

/** Metin koşullu önerme dönüşümü içeriyor mu (kural ancak o zaman isteme girer). */
export function needsConditionalLogicRule(text: string): boolean {
  if (!text) return false;
  if (/önerme|koşullu|mantık|karşıt\s*ters/iu.test(text)) return true;
  return FORMULA_RE.test(text) && /karşıt|ters/iu.test(text);
}

/**
 * Dönüşüm adını yanlış formülle eşleştiren ifadeler. Boş dizi = sorun yok ya da karar verilemedi.
 * Örnek hata: "p ⇒ q önermesinin tersi q ⇒ p" (doğrusu: karşıtı q ⇒ p; tersi ¬p ⇒ ¬q).
 */
export function conditionalLogicIssues(text: string): string[] {
  if (!text || !/karşıt|ters/iu.test(text)) return [];
  const issues: string[] = [];
  const sentences = text.split(SENTENCE_SPLIT).filter((s) => s.trim());

  // Sembolik: cümle cümle, temel taşınır (bir önceki cümlede verilmiş olabilir).
  let carried: Conditional | null = null;
  for (const sentence of sentences) {
    const anchor = anchorConditional(sentence);
    if (anchor) carried = anchor;
    const equivalence = equivalenceIssue(sentence);
    if (equivalence) issues.push(equivalence);
    for (const m of sentence.matchAll(LABEL_THEN_FORMULA)) {
      const before = sentence.slice(Math.max(0, m.index! - 80), m.index!);
      const base = explicitBase(before) ?? carried;
      if (!base) continue;
      const got = parseConditional(m[3]!, m[4]!);
      const issue = judge({ base, kinds: chainKinds(m[1] ?? "", m[2]!), got });
      if (issue) issues.push(issue);
    }
    for (const m of sentence.matchAll(FORMULA_THEN_LABEL)) {
      const got = parseConditional(m[1]!, m[2]!);
      const base = parseConditional(m[3]!, m[4]!);
      const issue = judge({ base, kinds: chainKinds(m[5] ?? "", m[6]!), got });
      if (issue) issues.push(issue);
    }
  }
  if (!FORMULA_RE.test(text)) issues.push(...nlIssues(sentences));
  return [...new Set(issues)];
}

/** Üretim istemlerine eklenen kısa kural (yalnız önerme/mantık içeren içerikte). Sembolik; disiplin örneği yok. */
export const CONDITIONAL_LOGIC_RULE =
  "KOŞULLU ÖNERME DÖNÜŞÜMLERİ: p ⇒ q için KARŞITI q ⇒ p, TERSİ ¬p ⇒ ¬q (p′ ⇒ q′), KARŞIT TERSİ ¬q ⇒ ¬p (q′ ⇒ p′). " +
  "Koşullu önerme yalnız karşıt tersine denktir; karşıtı ile tersi birbirine denktir. Sözel biçimde aynı kural: " +
  "'A ise B' için karşıtı 'B ise A', tersi 'A değilse B değil', karşıt tersi 'B değilse A değil'. " +
  "Kural: karşıtta yer değişir, tersinde değil alınır, karşıt tersinde ikisi birden. Bu adları karıştırma.";
