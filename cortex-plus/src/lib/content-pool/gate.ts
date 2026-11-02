import { fluencyIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { turkishFold } from "@/lib/text/turkish";
import { logicTermIssues } from "@/lib/learning/logic-terms";
import { DIFFICULTIES, type PoolItem } from "@/lib/content-pool/schema";

/*
  Sıfır maliyetli kapı (model çağrısından önce). Kural ihlali modeli hiç görmez; onarılabilen yazım yerinde onarılır.
  Model yalnız cevap anahtarını ve bilimsel/kazanım uyumunu onaylar (generate.ts verifyPrompt).
*/

/**
 * Kapı kural sürümü. Kapı yanlış ret üretecek biçimde düzeltildiğinde artırılır; toplu doldurucu yalnız bu
 * sürümle reddedilen denemeleri 2 deneme hakkına sayar. 2: matematik/fen gösterimi + ölçü birimi (1 Kasım 2026).
 * 4: koşullu önerme dönüşüm adları (karşıtı/tersi/karşıt tersi) kodla denetlenir (2 Kasım 2026).
 * 6: yazım/noktalama sorularında yalnız büyük-küçük harf, boşluk ya da noktalamayla ayrışan seçenekler ("sen de" / "sende")
 *    aynı sayılmaz (katı anahtar); yapışık kelime yalnız küçük harfle başlayan sözcükte aranır (CamelCase özel adlar
 *    yanlış ret üretmez). Kazanım × zorluk çifti başına soru sayısı sınav türüne göre (2 Kasım 2026).
 * 7: sınav iskeleti bölüm içinde istenir ve blok blok dayanıklı okunur (önceki sürüm tüm KPSS iskeletlerini yanlış reddetti).
 * 8: iskelet alanları eş adlarıyla (choices/correct) ve metin adımlarla da okunur.
 */
// v9: check bloğu dizi gövde/öncül alanı/nesne seçenek/metin cevap biçimleri okunur
// v10: sıralama/şık imleri ("A)", "1)") parantez dengesinde sayılmaz
export const GATE_VERSION = 11; // 11: matematik gösterimi maskesi genişledi (2 Kasım 2026); v10 retleri yeniden denenir

/** Katı seçenek anahtarı: yalnız Unicode biçimi ve boşluk dizileri eşitlenir; harf büyüklüğü ve noktalama korunur. */
export function strictOptionKey(option: string): string {
  return option.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function duplicateStrictOption(options: readonly string[]): boolean {
  const keys = options.map(strictOptionKey).filter(Boolean);
  return new Set(keys).size !== keys.length;
}

export type GateOutcome = { code: string; outcomeId: string; limitations: string[] };
export type GateUnit = { unitId: string; outcomes: GateOutcome[]; choices: number };
export type GatedItem = PoolItem & { unit_id: string; outcome_id: string };
export type GateRejection = { code: string; difficulty: string; reason: string; excerpt?: string };

export const STEM_LEN = { min: 20, max: 1200 } as const;
export const EXPLANATION_LEN = { min: 20, max: 1500 } as const;
export const CHOICE_MAX = 300;

/**
 * Matematik/fen gösterimini cümle denetiminden önce maskeler (1 Kasım 2026, yks-2026-matematik#3 yanlış retleri):
 * satır içi LaTeX ($…$, \(…\), \[…\]) ve yarı açık aralıklar ([a, b), (−∞, 3], ]a, b[) parantez dengesi
 * sayılmaz. Gerçek kırık parantez (kapanmayan "(" ya da yalnız ")") yine yakalanır.
 */
export function maskMathNotation(text: string): string {
  let out = text
    .replace(/\$\$[\s\S]{1,400}?\$\$|\$[^$\n]{1,200}\$|\\\([\s\S]{1,400}?\\\)|\\\[[\s\S]{1,400}?\\\]/g, " İFADE ")
    // Küme/mantık/eşitsizlik/üs/kesir gösterimleri: {x | x > 2}, x ∈ [1, 5), p ⇒ (q ∧ r), 2^(n+1), (a+b)/(c−d)
    .replace(/[∈∉⊂⊆∪∩∧∨¬⇒⇔→↔≤≥≠<>^/]/gu, " ");
  // İç içe dengeli çiftler (f(x), (a+b)) içten dışa ayıklanır; sonra karışık uçlu aralıklar
  // ([a, b), (−∞, 3], ]a, b[, [a − 1, b + 2)) maskelenir. Geriye kalan dengesizlik gerçek kırık paranteze işaret eder.
  for (let i = 0; i < 8; i += 1) {
    const next = out
      .replace(/\([^()[\]{}]*\)|\[[^()[\]{}]*\]|\{[^()[\]{}]*\}/g, " ÖBEK ")
      .replace(/[[(\]][^()[\]{}\n]{0,60}[,;][^()[\]{}\n]{0,60}[\])[]/gu, " ARALIK ");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Kapının reddettiği yerin kısa alıntısı (qa'ya yazılır; neden reddedildiği görülsün). */
export function garbledExcerpt(text: string): string {
  const masked = maskListMarkers(maskMathNotation(text));
  const at = masked.search(/[()[\]{}]/);
  const raw = at >= 0 ? text.slice(Math.max(0, at - 60), at + 60) : text.slice(0, 120);
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Sıralama/şık imleri ("A) …", "1) …", "iv) …") tek kapanan parantezdir; parantez dengesi sayılmaz
 * (2 Kasım 2026, ALES/DGS/YDS iskelet adımları ve seçenek listeleri yanlış ret). Gerçek açık kalan "(" yine yakalanır.
 */
export function maskListMarkers(text: string): string {
  return text.replace(/(^|[\s:;,.])((?:[A-EÇa-eç]|\d{1,2}|[IVXivx]{1,4}))\)(?=\s)/gu, "$1$2.");
}

/** Yapışık ya da bozuk metin: kodlama bozulması, küçük harfe yapışık büyük harf, boşluksuz uzun dizi, kırık parantez. */
export function garbledReason(text: string): string | null {
  if (/\uFFFD|Ã.|Ä.|Å./u.test(text)) return "bozuk karakter kodlaması";
  // Sözcük küçük harfle başlayıp içinde büyük harf varsa yapışıktır ("ünitesiKonu"); büyük harfle başlayan özel
  // adlar ve kısaltmalar (CamelCase ürün/gen adları: "CRISPR-Cas9", "GenBank") ret nedeni değildir.
  if (/(?<![\p{L}\p{N}])\p{Ll}+\p{Ll}{1}\p{Lu}\p{Ll}{2}/u.test(text)) return "yapışık kelime";
  const masked = maskListMarkers(maskMathNotation(text));
  if (/[^\s]{45,}/u.test(masked.replace(/https?:\/\/\S+/g, ""))) return "boşluksuz uzun dizi";
  if (/(.)\1{5,}/u.test(text)) return "tekrarlanan karakter";
  const issues = [
    ...fluencyIssues(masked).filter((i) => i === "unbalanced"),
    ...fluencyIssues(text).filter((i) => i === "spliced"),
  ];
  return issues.length ? "kırık cümle yapısı" : null;
}

const NEGATION = /(girilmez|değinilmez|verilmez|yer verilmez|ele alınmaz|kapsam dışı|ayrıntısına girilmeden)/u;

/**
 * Sınırlama cümlesinde açıkça dışlanan terimler: yalnız olumsuz hükümlü cümledeki parantez içi listeler
 * ("... (a, b, c) girilmez"). Serbest metinden terim uydurulmaz; daha ince kapsam denetimi modelde.
 */
/** Ölçü birimi ya da kısaltması (km/sa., m/sn., kg, cm³, °C, mol/L): dışlanan terim sayılmaz. */
export function isUnitOfMeasure(term: string): boolean {
  const t = term.trim().replace(/\.$/, "");
  return /\//.test(t) || /^[a-zA-Zµμ°ÅΩ]{1,4}[²³0-9]*\.?$/u.test(t);
}

/**
 * Hüküm cümlecikleri: ";" ve cümle sonu (". " + büyük harf) ayırır; "km/sa." gibi kısaltmadaki nokta bölmez.
 * Parantez içindeki ";" bölmez.
 */
function clauses(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    const sentenceEnd = ch === "." && depth === 0 && /^\s+\p{Lu}/u.test(line.slice(i + 1));
    if (depth === 0 && (ch === ";" || sentenceEnd)) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function excludedTerms(limitations: string[]): string[] {
  const out: string[] = [];
  for (const line of limitations) {
    // Olumsuz hüküm yalnız kendi cümleciğindeki parantez listesini dışlar: "(… km/sa. …) yer verilir; faiz … girilmez"
    // içinde km/sa. dahil edilen bir örnektir, dışlanan değil.
    for (const clause of clauses(line)) {
      if (!NEGATION.test(clause)) continue;
      for (const match of clause.matchAll(/\(([^()]{3,200})\)/g)) {
        for (const term of match[1]!.split(/[,;]| ve /)) {
          const t = term.trim();
          if (t.length >= 4 && !isUnitOfMeasure(t) && !/^(örneğin|ör\.|vb\.?|gibi)$/iu.test(t)) out.push(turkishFold(t));
        }
      }
    }
  }
  return out;
}

function lengthReason(label: string, text: string, range: { min: number; max: number }): string | null {
  const n = text.trim().length;
  return n < range.min ? `${label} çok kısa` : n > range.max ? `${label} çok uzun` : null;
}

/** Tek soru: onarılmış soru ya da ret gerekçesi. */
export function gateItem(item: PoolItem, unit: GateUnit): { item: GatedItem } | { reason: string; excerpt?: string } {
  const code = item.outcome_code.trim();
  const outcome = unit.outcomes.find((o) => o.code === code);
  if (!outcome) return { reason: "kayıtta olmayan kazanım" };
  if (!outcome.outcomeId || !unit.unitId) return { reason: "unit_id/outcome_id yok" };
  if (!DIFFICULTIES.includes(item.difficulty)) return { reason: "bilinmeyen zorluk" };
  const stem = repairTurkishSurface(item.stem.trim());
  const explanation = repairTurkishSurface(item.explanation.trim());
  const choices = item.choices.map((c) => repairTurkishSurface(c.trim().replace(/^[A-Ea-e][).]\s+/, "")));
  if (choices.length !== unit.choices) return { reason: `seçenek sayısı ${choices.length} (beklenen ${unit.choices})` };
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= choices.length) return { reason: "cevap seçeneklerin dışında" };
  if (choices.some((c) => !c)) return { reason: "boş seçenek" };
  if (choices.some((c) => c.length > CHOICE_MAX)) return { reason: "seçenek çok uzun" };
  if (duplicateStrictOption(choices)) return { reason: "aynı seçenek iki kez" };
  const length = lengthReason("kök", stem, STEM_LEN) ?? lengthReason("açıklama", explanation, EXPLANATION_LEN);
  if (length) return { reason: length };
  for (const text of [stem, explanation, ...choices]) {
    const garbled = garbledReason(text);
    if (garbled) return { reason: garbled, excerpt: garbledExcerpt(text) };
  }
  const logic = logicTermIssues(`${stem} ${explanation}`);
  if (logic.length) return { reason: `mantık terimi hatası: ${logic[0]}` };
  const folded = turkishFold(`${stem} ${choices.join(" ")}`);
  const excluded = excludedTerms(outcome.limitations).find((t) => folded.includes(t));
  if (excluded) return { reason: `kazanım sınırı dışında (${excluded})` };
  return { item: { ...item, outcome_code: code, stem, explanation, choices, unit_id: unit.unitId, outcome_id: outcome.outcomeId } };
}

/**
 * Soru seti: her soru kapıdan geçer; aynı kazanım × zorluk çifti bir kez kalır (zorluk dağılımı: kazanım başına
 * kolay/orta/zor birer soru). `distribution` raporlanır.
 */
export function gateItems(items: PoolItem[], unit: GateUnit, perPair = 1): {
  passed: GatedItem[];
  rejected: GateRejection[];
  distribution: Record<(typeof DIFFICULTIES)[number], number>;
} {
  const passed: GatedItem[] = [];
  const rejected: GateRejection[] = [];
  const seen = new Map<string, number>();
  const stems = new Set<string>();
  for (const raw of items) {
    const result = gateItem(raw, unit);
    if ("reason" in result) {
      rejected.push({ code: raw.outcome_code, difficulty: raw.difficulty, reason: result.reason, ...(result.excerpt ? { excerpt: result.excerpt } : {}) });
      continue;
    }
    const key = `${result.item.outcome_code}|${result.item.difficulty}`;
    if ((seen.get(key) ?? 0) >= perPair) {
      rejected.push({ code: raw.outcome_code, difficulty: raw.difficulty, reason: "aynı kazanım × zorluk ikinci kez" });
      continue;
    }
    const stemKey = strictOptionKey(result.item.stem).toLocaleLowerCase("tr");
    if (stems.has(stemKey)) {
      rejected.push({ code: raw.outcome_code, difficulty: raw.difficulty, reason: "aynı soru kökü iki kez" });
      continue;
    }
    stems.add(stemKey);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    passed.push(result.item);
  }
  const distribution = { easy: 0, medium: 0, hard: 0 };
  for (const item of passed) distribution[item.difficulty] += 1;
  return { passed, rejected, distribution };
}
