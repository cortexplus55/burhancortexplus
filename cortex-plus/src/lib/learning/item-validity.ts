/**
 * Öğrenciye gitmeden önce öğe kapısı (bütün dersler).
 *
 * Boş, bozuk, yanlış dil, kaynaksız gönderme ve artık işaret elenir.
 * Elenen öğe sayıya yazılmaz; çağıran yenisini ister. Ders kelime listesi yok.
 */

import { measurableTokens } from "@/lib/learning/source-quantities";
import { inlineCarriers, unresolvedVisualReference } from "@/lib/learning/answer-consistency";

export type ItemKind = "mcq" | "multi_mcq" | "true_false" | "open" | "short_answer" | "numeric" | "card";

export type ValidityIssue =
  | "empty"
  | "short"
  | "duplicate_options"
  | "malformed"
  | "missing_correct"
  | "wrong_language"
  | "unseen_reference"
  | "markup"
  | "hint";

export type ValidityInput = {
  kind: ItemKind;
  text: string;
  options?: readonly string[];
  correct?: readonly string[];
  /** Kaynak metin. Dili bilinmiyorsa dil yüzünden elenmez. */
  material?: string;
  /** Denklem göndermesi, eşitlik bu metindeyse kabul. */
  payload?: string;
};

const TR_MARKERS = new Set(["ve", "bir", "bu", "icin", "ile", "olan", "degil"]);
const EN_MARKERS = new Set(["the", "and", "of", "is", "to", "for", "with"]);

export function foldValidity(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export type MaterialLanguage = "tr" | "en" | "unknown";

export function detectLanguage(text: string): MaterialLanguage {
  const folded = foldValidity(text);
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);
  let tr = 0;
  let en = 0;
  for (const token of tokens) {
    if (TR_MARKERS.has(token)) tr += 1;
    if (EN_MARKERS.has(token)) en += 1;
  }
  if (/[ğüşöçĞÜŞÖÇıİ]/.test(text)) tr += 2;
  if (tr === 0 && en === 0) return "unknown";
  if (tr === en) return "unknown";
  return tr > en ? "tr" : "en";
}

function hasBrokenText(text: string): boolean {
  if (text.includes("\uFFFD")) return true;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return true;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const high = code >= 0xd800 && code <= 0xdbff;
    const low = code >= 0xdc00 && code <= 0xdfff;
    if (high && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      i += 1;
      continue;
    }
    if (high || low) return true;
  }
  return false;
}

function hasMarkup(text: string): boolean {
  if (text.includes("==")) return true;
  if (text.includes("$$")) return true;
  if (text.includes("__")) return true;
  const stars = text.split("**").length - 1;
  if (stars % 2 !== 0) return true;
  return false;
}

function hasHint(text: string): boolean {
  return /(?:^|\s)(?:ipucu|hint)\s*:/i.test(foldValidity(text)) || /(?:^|\s)İpucu\s*:/.test(text);
}

/**
 * Görünmeyen şekil/grafik/harita/tablo/şema/denklem göndermesi. "aşağıdakilerden hangisi" gönderme değildir.
 * 29 Ekim 2026 (Paket H): deneme teslim kapısı ve test motoru aynı kuralı okur (`unresolvedVisualReference`);
 * kökteki ya da `payload`daki veri taşıyıcısı (eşitlik, ok, koordinat çifti, tablo satırı) atfı çözer.
 */
export function unseenReference(text: string, payload = ""): boolean {
  const hit = unresolvedVisualReference(text, inlineCarriers(text));
  if (!hit) return false;
  // Yalnız denklem atfını kökün dışındaki (şık, açıklama) eşitlik çözer; şekil/harita atfını açıklamadaki "=" çözmez.
  if (/denklem|equation/i.test(hit) && inlineCarriers(payload).includes("equation")) return false;
  return true;
}

function scriptMismatch(material: string, text: string): boolean {
  const count = (value: string) => {
    let latin = 0;
    let other = 0;
    for (const ch of value) {
      if (/\p{Script=Latin}/u.test(ch)) latin += 1;
      else if (/\p{Script=Arabic}|\p{Script=Cyrillic}|\p{Script=Han}/u.test(ch)) other += 1;
    }
    return { latin, other };
  };
  const source = count(material);
  const item = count(text);
  const sourceTotal = source.latin + source.other;
  const itemTotal = item.latin + item.other;
  if (!sourceTotal || !itemTotal) return false;
  if (source.latin / sourceTotal < 0.8) return false;
  return item.other / itemTotal > 0.15;
}

function optionKey(option: string): string {
  return foldValidity(option).replace(/\s+/g, " ").trim();
}

export function itemValidity(input: ValidityInput): { ok: boolean; issues: ValidityIssue[] } {
  const issues: ValidityIssue[] = [];
  const text = input.text ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, issues: ["empty"] };
  }
  if (hasBrokenText(trimmed)) issues.push("malformed");
  if (hasMarkup(trimmed)) issues.push("markup");
  if (hasHint(trimmed)) issues.push("hint");
  if (unseenReference(trimmed, input.payload ?? "")) issues.push("unseen_reference");

  const words = wordsOf(trimmed);
  const kind = input.kind;
  if (kind === "true_false") {
    if (trimmed.includes("?") || words.length < 6) issues.push("short");
  } else if (kind === "mcq" || kind === "multi_mcq") {
    if (trimmed.length < 8 || words.length < 3) issues.push("short");
    const options = (input.options ?? []).map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) issues.push("malformed");
    const keys = options.map(optionKey);
    if (new Set(keys).size !== keys.length) issues.push("duplicate_options");
    const correct = (input.correct ?? []).map((answer) => answer.trim()).filter(Boolean);
    const optionSet = new Set(keys);
    const matched = correct.filter((answer) => optionSet.has(optionKey(answer)));
    if (!matched.length) issues.push("missing_correct");
    if (kind === "mcq" && matched.length !== 1) issues.push("malformed");
  } else if (trimmed.length < 8 || words.length < 3) {
    issues.push("short");
  }

  const material = input.material?.trim() ?? "";
  if (material) {
    const from = detectLanguage(material);
    const item = detectLanguage(trimmed);
    if (from !== "unknown" && item !== "unknown" && from !== item) issues.push("wrong_language");
    if (scriptMismatch(material, trimmed)) issues.push("wrong_language");
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

export function validityKind(type: string): ItemKind {
  if (type === "multi_mcq") return "multi_mcq";
  if (type === "true_false") return "true_false";
  if (type === "numeric") return "numeric";
  if (type === "card" || type === "flashcard") return "card";
  if (type === "short_answer" || type === "open") return "open";
  return "mcq";
}

/** Testlerde nokta sayısının boş olup olmadığını görmek için. */
export function pointHasMeasure(text: string): boolean {
  return measurableTokens(text).length > 0;
}
