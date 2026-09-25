/**
 * Kırık Türkçe kapısı. Ders, podcast, quiz, soru doğrulayıcı ve sözlü
 * aynı fonksiyonu kullanır. Yazım listesi de buradadır; ikinci bir
 * sözlük yoktur. Ders hattının geri kalanını içeri almaz.
 */

import { foldTr } from "@/lib/documents/page-analysis";

const COMMON_CAPITAL = new Set([
  "kutle",
  "kutlesi",
  "kutlesinin",
  "sayi",
  "sayisi",
  "atomu",
  "atomun",
  "molekul",
  "formul",
  "tanecik",
  "tanecigi",
  "enerji",
  "basinc",
  "hacim",
  "sicaklik",
  "kuvvet",
  "yogunluk",
  "derisim",
  "cozelti",
  "hucre",
  "cekirdek",
  "protein",
  "kanun",
  "kabahat",
  "belge",
  "antlasma",
]);

export function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8);
}

function bracketsBalanced(text: string): boolean {
  const open = "([{";
  const close = ")]}";
  const stack: string[] = [];
  for (const char of text) {
    const openAt = open.indexOf(char);
    if (openAt >= 0) {
      stack.push(close[openAt] ?? "");
      continue;
    }
    const closeAt = close.indexOf(char);
    if (closeAt >= 0 && stack.pop() !== char) return false;
  }
  return stack.length === 0;
}

function brokenProduct(text: string): boolean {
  return /[×*]\s+(?:toplam[ıi]?|olan|kadar|kullanarak|ederek)\b/i.test(text);
}

function midSentenceCapital(text: string): boolean {
  for (const sentence of sentences(text)) {
    const words = sentence.split(/\s+/);
    for (const word of words.slice(1)) {
      const bare = word.replace(/^[“"'(]+|[)”"',.:;]+$/g, "");
      if (!/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{3,}$/.test(bare)) continue;
      if (!COMMON_CAPITAL.has(foldTr(bare))) continue;
      const previous = words[words.indexOf(word) - 1]?.replace(/^[“"'(]+|[)”"',.:;]+$/g, "") ?? "";
      if (/^[A-ZÇĞİÖŞÜ]/.test(previous)) continue;
      return true;
    }
  }
  return false;
}

function hasPredicate(sentence: string): boolean {
  if (sentence.split(/\s+/).length < 6) return true;
  if (/kaynak\s*:/i.test(sentence) || /=/.test(sentence)) return true;
  const last = foldTr(sentence)
    .replace(/[.…!?'"]+$/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .pop();
  if (!last || last.length < 4) return true;
  return /(?:d[iuü]r|dir|t[iuü]r|tir|yor|m[iuü]s|mis|ecek|acak|meli|mali|maz|mez|en|an|ar|er|ir|ur|di|du|ti|tu)$/.test(last);
}

const TYPO_RULES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\btepkimde\b/gi, replacement: "tepkimede" },
  { pattern: /\bbelirleyiz\b/gi, replacement: "belirleriz" },
  { pattern: /\boranı küçüğüne\b/gi, replacement: "oranın en küçüğüne" },
  { pattern: /\bherşey\b/gi, replacement: "her şey" },
  { pattern: /\bbirşey\b/gi, replacement: "bir şey" },
  { pattern: /\bhiçbirşey\b/gi, replacement: "hiçbir şey" },
  { pattern: /\bdeğilmi\b/gi, replacement: "değil mi" },
  {
    pattern: /konu ağırlıklı(?!\s*(?:dır|dir|dur|dür|bir\b))(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi,
    replacement: "konu ağırlıklıdır",
  },
];

function applyCase(sample: string, replacement: string): string {
  const first = sample.charAt(0);
  const upper = first.toLocaleUpperCase("tr-TR");
  if (first === upper && first !== first.toLocaleLowerCase("tr-TR")) {
    return replacement.charAt(0).toLocaleUpperCase("tr-TR") + replacement.slice(1);
  }
  return replacement;
}

/** Canlıda tekrarlayan yazım. Ders, podcast, quiz ve sözlü bu işlevi çağırır. */
export function repairTurkishSurface(text: string): string {
  let next = text;
  for (const rule of TYPO_RULES) {
    next = next.replace(rule.pattern, (match) => applyCase(match, rule.replacement));
  }
  return next;
}

/** Yayınlanmayacak kırık Türkçe. Sağlam cümle boş dizi döner. */
export function fluencyIssues(text: string): string[] {
  const issues: string[] = [];
  if (!text.trim()) return issues;
  if (!bracketsBalanced(text)) issues.push("unbalanced");
  if (brokenProduct(text)) issues.push("broken_arithmetic");
  if (midSentenceCapital(text)) issues.push("mid_capital");
  if (sentences(text).some((sentence) => !hasPredicate(sentence))) issues.push("no_predicate");
  if (repairTurkishSurface(text) !== text) issues.push("typo");
  return issues;
}
