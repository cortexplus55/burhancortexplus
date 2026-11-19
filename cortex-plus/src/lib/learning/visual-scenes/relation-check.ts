/**
 * Görsel sahnenin ilişki denetimi (Faz 1-B düzeltmesi, 19 Kasım 2026): sahne kaynaktaki bir hatayı ya da modelin
 * uydurduğu bir ilişkiyi öğretmesin. Saf fonksiyonlar, model çağrısı yok.
 *
 * Üç denetim:
 * 1. Kaynak düzeltmesi: sahnenin yazıları kaynağın yanlış iddiasını (`documentClaim`) taşıyıp doğrusunu taşımıyorsa red.
 * 2. Denklem: dersin doğrulanmış metnindeki çarpım/bölüm biçimli denklemlerden (ör. `X·Y = k·Z`) iki büyüklüğün
 *    öbürleri sabitken doğru mu ters mi orantılı olduğu çıkar; sahnenin oklarındaki eğilim (artar/azalır) ya da
 *    kural cümlesi bunun tersini söylüyorsa red. Kaynağın yanlış iddiasındaki denklem kullanılmaz.
 * 3. Ders metni: dersin bir cümlesi aynı iki büyüklük için ters ilişkiyi söylüyorsa red.
 * Çelişkide sahne yayımlanmaz (ders sahnesiz kalır); kayıttaki eski sahne de okunurken düşer.
 */
import { correctionKey, repeatsSourceError, type SourceCorrectionWarning } from "@/lib/learning/source-correction";
import type { VisualScene } from "./schema";
import { visualSceneStrings } from "./prompt";

export type Relation = "direct" | "inverse";
type Change = "increase" | "decrease";

/* ───────────── Denklemler ───────────── */

const EQUATION_PATTERN =
  /[\p{L}\p{N}_^]+(?:\s*[·×∙⋅*/÷∕]\s*[\p{L}\p{N}_^]+)*\s*=\s*[\p{L}\p{N}_^]+(?:\s*[·×∙⋅*/÷∕+\-−]\s*[\p{L}\p{N}_^]+)*/gu;

/** Terimin değişkenleri: "nRT" gibi bitişik tek harfler ayrılır; alt çizgili ya da uzun küçük harfli ad ("dsıvı") tek değişken. */
function termVariables(term: string): string[] {
  const clean = term.replace(/\^[\p{N}]+/gu, "").replace(/^[\p{N}.,]+/u, "");
  if (!clean || /^[\p{N}.,]+$/u.test(clean)) return [];
  if (clean.includes("_") || /\p{Ll}{3,}/u.test(clean) || /\p{N}/u.test(clean)) return [clean];
  return [...clean].filter((char) => /\p{L}/u.test(char));
}

/**
 * Yalnız çarpım ve bölümden oluşan denklemin değişken üsleri: sol pay +1, sol payda −1, sağ pay −1, sağ payda +1
 * (hepsi bir yana alınınca çarpım sabittir). Toplama/çıkarma içeren ya da eşittirsiz ifade için null.
 */
const SUPERSCRIPT = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu;

/** Üst simge rakamlar üs işaretine iner ("B²" → "B^2"); NFKC onları düz rakama çevirip adın parçası yapardı. */
function plain(text: string): string {
  return text.replace(SUPERSCRIPT, (digits) => `^${[...digits].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(d)).join("")}`).normalize("NFKC");
}

export function equationSigns(equation: string): Map<string, number> | null {
  const sides = plain(equation).split("=");
  if (sides.length !== 2) return null;
  if (/[+\-−]/.test(sides[0]!) || /[+\-−]/.test(sides[1]!)) return null;
  const signs = new Map<string, number>();
  sides.forEach((side, sideIndex) => {
    const parts = side.trim().split(/\s*([·×∙⋅*/÷∕])\s*/u);
    let denominator = false;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      if (index % 2 === 1) {
        denominator = /[/÷∕]/.test(part);
        continue;
      }
      const sign = (sideIndex === 0 ? 1 : -1) * (denominator ? -1 : 1);
      for (const variable of termVariables(part)) signs.set(variable, (signs.get(variable) ?? 0) + sign);
    }
  });
  for (const [key, value] of signs) if (value === 0) signs.delete(key);
  return signs.size >= 2 ? signs : null;
}

export function equationsIn(text: string): string[] {
  return [...plain(text).matchAll(EQUATION_PATTERN)].map((match) => match[0].trim());
}

/** Denklemlerden iki değişkenin ilişkisi (öbürleri sabit). Denklemler birbiriyle çelişirse ya da yoksa null. */
export function equationRelation(equations: readonly string[], a: string, b: string): Relation | null {
  const found = new Set<Relation>();
  for (const equation of equations) {
    const signs = equationSigns(equation);
    const sa = signs?.get(a);
    const sb = signs?.get(b);
    if (!sa || !sb) continue;
    found.add(Math.sign(sa) === Math.sign(sb) ? "inverse" : "direct");
  }
  return found.size === 1 ? [...found][0]! : null;
}

/* ───────────── Cümledeki ilişki ───────────── */

const INCREASE_STEM = /(?<![\p{L}])(?:art(?:ar|arsa|ınca|tıkça|tığında|ış|an|ıyor|ırılırsa|ırılınca)|(?:iki|üç|dört|\p{N}+) katına çık|katına çık|büyü|yüksel|çoğal)/giu;
const DECREASE_STEM = /(?<![\p{L}])(?:azal|yarıya|küçül|düş(?:er|erse|ünce|tükçe|tüğünde)|üçte bir|dörtte bir)/giu;
const DIRECT_PHRASE = /doğru orantı/iu;
const INVERSE_PHRASE = /ters orantı/iu;

export type Quantity = { key: string; names: string[] };

function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("tr-TR");
}

/** Adın Türkçe çekimleri de eşleşsin diye kökü ("hacim" → "hac", "basınç" → "bası"). */
function nameStem(name: string): string {
  const word = fold(name).trim().split(/\s+/)[0] ?? "";
  return word.length <= 4 ? word : word.slice(0, Math.max(3, word.length - 2));
}

function firstMention(text: string, quantity: Quantity): number {
  let best = -1;
  for (const name of quantity.names) {
    if (!name.trim()) continue;
    // Simge (ör. "X") büyük/küçük harf duyarlı, tek başına; ad ise kökten, çekimli halleriyle.
    const symbolLike = name.length <= 3 && !/\s/.test(name);
    const pattern = symbolLike
      ? new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u")
      : new RegExp(`(?<![\\p{L}])${nameStem(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu");
    const source = symbolLike ? text : fold(text);
    const index = source.search(pattern);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

function changeIn(segment: string): Change | null {
  const inc = [...segment.matchAll(INCREASE_STEM)].map((m) => m.index ?? 0);
  const dec = [...segment.matchAll(DECREASE_STEM)].map((m) => m.index ?? 0);
  if (!inc.length && !dec.length) return null;
  if (!dec.length) return "increase";
  if (!inc.length) return "decrease";
  return Math.min(...inc) < Math.min(...dec) ? "increase" : "decrease";
}

/** Cümle iki büyüklük arasında hangi ilişkiyi söylüyor ("X artarsa Y azalır", "X ile Y ters orantılı"). */
export function sentenceRelation(sentence: string, a: Quantity, b: Quantity): Relation | null {
  const pa = firstMention(sentence, a);
  const pb = firstMention(sentence, b);
  if (pa < 0 || pb < 0 || pa === pb) return null;
  if (INVERSE_PHRASE.test(sentence) && !DIRECT_PHRASE.test(sentence)) return "inverse";
  if (DIRECT_PHRASE.test(sentence) && !INVERSE_PHRASE.test(sentence)) return "direct";
  const [first, second] = pa < pb ? [pa, pb] : [pb, pa];
  const c1 = changeIn(sentence.slice(first, second));
  const c2 = changeIn(sentence.slice(second));
  if (!c1 || !c2) return null;
  return c1 === c2 ? "direct" : "inverse";
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/* ───────────── Sahne ───────────── */

export type SceneRelationClaim = { a: Quantity; b: Quantity; relation: Relation; where: string };

/** Sahnenin iki büyüklük arasında öne sürdüğü ilişkiler: eğilimli oklar ve kural cümlesi. */
export function sceneRelationClaims(scene: VisualScene): SceneRelationClaim[] {
  if (scene.archetype !== "ENGINEERING_PHYSICS_MECHANICS") return [];
  const claims: SceneRelationClaim[] = [];
  const quantities = new Map<string, Quantity & { trend?: Change }>();
  for (const vector of scene.vectors) {
    const key = vector.symbol.replace(/_/g, "");
    const own = quantities.get(key);
    const names = [vector.symbol, key, vector.label.replace(/:\s*(artar|azalır)\s*$/iu, "")];
    if (own) own.names.push(...names);
    else quantities.set(key, { key, names, ...(vector.trend ? { trend: vector.trend } : {}) });
    if (own && vector.trend && own.trend && own.trend !== vector.trend) own.trend = undefined;
  }
  const list = [...quantities.values()];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.trend && b.trend) claims.push({ a, b, relation: a.trend === b.trend ? "direct" : "inverse", where: "oklar" });
      const said = sentenceRelation(scene.logic.formula, a, b);
      if (said) claims.push({ a, b, relation: said, where: "kural cümlesi" });
    }
  }
  return claims;
}

export type RelationContext = {
  /** Dersin doğrulanmış metni (ekranlar, formül kartları, özet). Kaynak belge değil. */
  lessonText: string;
  sourceCorrection?: SourceCorrectionWarning | null;
};

export type RelationVerdict = { ok: true } | { ok: false; reason: string };

/** Sahne dersin doğrulanmış içeriği ve kaynak düzeltmesiyle tutarlı mı. */
export function checkSceneRelations(scene: VisualScene, context: RelationContext): RelationVerdict {
  const { labels, prose, symbols } = visualSceneStrings(scene);
  const sceneText = [...labels, ...prose, ...symbols].join("\n");
  const correction = context.sourceCorrection ?? null;
  if (correction && repeatsSourceError(sceneText, correction)) return { ok: false, reason: "kaynağın düzeltilen hatasını taşıyor" };

  // Kaynağın yanlış denklemi doğrulanmış metinde alıntı olarak geçse bile ölçüt olmaz; doğrusu eklenir.
  const wrong = new Set(correction ? equationsIn(correction.documentClaim).map(correctionKey) : []);
  const equations = [...equationsIn(context.lessonText), ...(correction ? equationsIn(correction.verifiedTruth) : [])].filter(
    (equation) => !wrong.has(correctionKey(equation)),
  );
  const lessonSentences = sentences(context.lessonText);
  for (const claim of sceneRelationClaims(scene)) {
    const expected = equationRelation(equations, claim.a.key, claim.b.key);
    if (expected && expected !== claim.relation) {
      return { ok: false, reason: `${claim.where}: ${claim.a.key}–${claim.b.key} ${claim.relation === "direct" ? "doğru" : "ters"} orantılı gösteriliyor, denklem tersini söylüyor` };
    }
    for (const sentence of lessonSentences) {
      if (correction && repeatsSourceError(sentence, correction)) continue;
      const said = sentenceRelation(sentence, claim.a, claim.b);
      if (said && said !== claim.relation) {
        return { ok: false, reason: `${claim.where}: ${claim.a.key}–${claim.b.key} ilişkisi ders metniyle çelişiyor` };
      }
    }
  }
  return { ok: true };
}
