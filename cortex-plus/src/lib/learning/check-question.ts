/**
 * Öğretmenin kontrol / alıştırma sorusunu öğrenciye göstermeden önce doğrular.
 *
 * Genel mekanizma: veri yeterliliği, öğretmen önce kendisi çözer, tek cevap
 * varsayan eşitlik / tam denk durumunu reddeder. Ders adına veya formül
 * listesine gömülü yama yok.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import {
  evaluateArithmetic,
  parseReaction,
  parseReactions,
} from "@/lib/learning/tutor-quant";

export type CheckExpected = {
  kind: "limiting" | "compare" | "arithmetic" | "open";
  answer: string;
  detail?: string;
};

export type CheckValidation =
  | { ok: true; question: string; expected: CheckExpected | null }
  | { ok: false; reason: string; repaired?: string };

const ASK_WHICH =
  /hangisi|hangiler|which\s+(?:is|are)|kim\s+sınırlay|en\s+(?:büyük|küçük|çok|az)/i;
const LIMITING_ASK = /sınırlayıcı|limiting\s+(?:reagent|reactant)/i;
const COMPARE_ASK = /hangisi\s+(?:büyük|küçük|fazla|az)|büyük\s+olan|küçük\s+olan|which\s+(?:is\s+)?(?:greater|larger|smaller)/i;
const INTEREST_ASK = /faiz|compound\s+interest|basit\s+faiz|gelecek\s+değer|gelecekteki\s+tutar|2\s+yıl\s+sonra/i;
const MASS_GRAM = /(\d+(?:[.,]\d+)?)\s*(?:g|gram)\b/gi;
const MOLAR_MASS = /(?:mol\s*kütle|M\s*=|=\s*\d+(?:[.,]\d+)?\s*g\s*\/?\s*mol|[A-Za-z][A-Za-z0-9₀-₉]*\s*=\s*\d+(?:[.,]\d+)?)/i;
const RATE_GIVEN = /%\s*\d|(?:\d+(?:[.,]\d+)?)\s*%|faiz\s*(?:oranı)?\s*[:=]?\s*\d|rate\s*[:=]?\s*\d/i;
const AMBIGUOUS_VERB =
  /\b(artar|azalır|çoğalır|eksir)\b(?![^.]*?(?:artakalır|artan madde|kalır|tüken))/i;

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function formatTr(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

function normSpecies(raw: string): string {
  return foldTr(raw).replace(/[^a-z0-9]/g, "");
}

function amountsFrom(text: string): Map<string, number> {
  const amounts = new Map<string, number>();
  const forward = /(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/gi;
  const reverse = /([A-Za-z][A-Za-z0-9₀-₉]*)\s+(\d+(?:[.,]\d+)?)\s*mol/gi;
  for (const match of text.matchAll(forward)) {
    amounts.set(normSpecies(match[2]), parseNumber(match[1]));
  }
  for (const match of text.matchAll(reverse)) {
    const key = normSpecies(match[1]);
    if (!amounts.has(key)) amounts.set(key, parseNumber(match[2]));
  }
  return amounts;
}

type RatioRow = { species: string; display: string; coefficient: number; moles: number; ratio: number };

function limitingRows(question: string): RatioRow[] | null {
  const reactions = parseReactions(question);
  const amounts = amountsFrom(question);
  if (!reactions.length || amounts.size < 2) return null;
  for (const reactants of reactions) {
    if (reactants.length < 2) continue;
    const rows: RatioRow[] = [];
    let ok = true;
    for (const reactant of reactants) {
      const moles = amounts.get(reactant.species);
      if (moles == null) {
        ok = false;
        break;
      }
      rows.push({
        ...reactant,
        moles,
        ratio: moles / reactant.coefficient,
      });
    }
    if (ok && rows.length >= 2) return rows;
  }
  return null;
}

function fractionPairs(text: string): Array<{ left: number; right: number; span: string }> {
  const out: Array<{ left: number; right: number; span: string }> = [];
  const re = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)[^.?]*?(?:ile|ve|vs\.?|versus|,)\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/gi;
  for (const match of text.matchAll(re)) {
    const a = parseNumber(match[1]) / parseNumber(match[2]);
    const b = parseNumber(match[3]) / parseNumber(match[4]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push({ left: a, right: b, span: match[0] });
  }
  return out;
}

function clarifyAmbiguousVerbs(question: string): string {
  return question
    .replace(/\btükenmesinin ardından artar\b/gi, "tükenmesinden sonra artakalır")
    .replace(/\bartar\b(?=[^.]*?(?:kalan|artık|fazla))/gi, "artakalır");
}

function missingMassData(question: string): boolean {
  const grams = [...question.matchAll(MASS_GRAM)];
  if (grams.length < 2) return false;
  if (!parseReaction(question) && !/→|->|⇒/.test(question)) return false;
  // Gram + tepkime var ama mol veya mol kütlesi yok → çözülemez.
  if (amountsFrom(question).size >= 2) return false;
  return !MOLAR_MASS.test(question);
}

function missingInterestRate(question: string): boolean {
  if (!INTEREST_ASK.test(question)) return false;
  return !RATE_GIVEN.test(question);
}

function solveLimiting(question: string): CheckExpected | null {
  const rows = limitingRows(question);
  if (!rows) return null;
  const min = Math.min(...rows.map((row) => row.ratio));
  const limiting = rows.filter((row) => Math.abs(row.ratio - min) <= 1e-6);
  const equal = limiting.length === rows.length;
  if (equal) {
    return {
      kind: "limiting",
      answer: "hiçbiri sınırlayıcı değil",
      detail: rows.map((row) => `${row.display}: ${formatTr(row.ratio)}`).join("; "),
    };
  }
  return {
    kind: "limiting",
    answer: limiting.map((row) => row.display).join(", "),
    detail: rows.map((row) => `${row.display}: ${formatTr(row.ratio)}`).join("; "),
  };
}

function repairEqualLimiting(question: string): string | null {
  const rows = limitingRows(question);
  if (!rows || rows.length < 2) return null;
  const min = Math.min(...rows.map((row) => row.ratio));
  const limiting = rows.filter((row) => Math.abs(row.ratio - min) <= 1e-6);
  if (limiting.length !== rows.length) return null;
  // Oranları bozmak için ilk maddenin molünü yarıya indir (genel, formüle özel değil).
  const target = rows[0];
  const newMoles = target.moles / 2;
  if (!(newMoles > 0)) return null;
  const oldSpan = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*mol\\s+${escapeReg(target.display)}|${escapeReg(target.display)}\\s+(\\d+(?:[.,]\\d+)?)\\s*mol`,
    "i",
  );
  const next = question.replace(oldSpan, (all, forward?: string, reverse?: string) => {
    if (forward != null) return `${formatTr(newMoles)} mol ${target.display}`;
    if (reverse != null) return `${target.display} ${formatTr(newMoles)} mol`;
    return all;
  });
  if (next === question) return null;
  const check = solveLimiting(next);
  if (!check || check.answer === "hiçbiri sınırlayıcı değil") return null;
  return next;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Kontrol sorusunu doğrular. Reddedilirse `reason`; sayılar değişirse `repaired`.
 */
export function validateCheckQuestion(question: string, context = ""): CheckValidation {
  const raw = question.trim();
  if (!raw || raw.length < 8) {
    return { ok: false, reason: "Soru çok kısa veya boş." };
  }

  let text = clarifyAmbiguousVerbs(raw);
  const combined = `${text}\n${context}`;

  if (missingInterestRate(combined)) {
    return { ok: false, reason: "Faiz oranı verilmeden tutar hesaplanamaz." };
  }

  if (missingMassData(combined)) {
    return {
      ok: false,
      reason: "Kütle verildi ama mol kütleleri yok; soru çözülemez.",
    };
  }

  if (AMBIGUOUS_VERB.test(text) && LIMITING_ASK.test(text)) {
    text = clarifyAmbiguousVerbs(
      text.replace(/\bartar\b/gi, "artakalır").replace(/\bazalır\b/gi, "azalır (miktarı düşer)"),
    );
  }

  // Kesir karşılaştırma: eşitse tek cevap varsayan soru geçersiz.
  if (COMPARE_ASK.test(text) || ASK_WHICH.test(text)) {
    for (const pair of fractionPairs(text)) {
      if (Math.abs(pair.left - pair.right) <= 1e-9) {
        return {
          ok: false,
          reason: "Karşılaştırılan değerler eşit; tek büyük/küçük cevap yok.",
        };
      }
    }
  }

  if (LIMITING_ASK.test(text) && ASK_WHICH.test(text)) {
    const solved = solveLimiting(text);
    if (solved?.answer === "hiçbiri sınırlayıcı değil") {
      const repaired = repairEqualLimiting(text);
      if (repaired) {
        const again = solveLimiting(repaired);
        return {
          ok: true,
          question: repaired,
          expected: again,
        };
      }
      return {
        ok: false,
        reason: "Oranlar tam denk; tek sınırlayıcı yok.",
      };
    }
    if (solved) {
      return { ok: true, question: text, expected: solved };
    }
  }

  // Saf aritmetik ifadeli soru: öğretmen çözebiliyorsa kaydet.
  const arith = text.match(
    /(\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+)/,
  );
  if (arith) {
    const value = evaluateArithmetic(arith[1]);
    if (value != null) {
      return {
        ok: true,
        question: text,
        expected: { kind: "arithmetic", answer: formatTr(value) },
      };
    }
  }

  const limiting = solveLimiting(text);
  if (limiting) {
    if (limiting.answer === "hiçbiri sınırlayıcı değil" && ASK_WHICH.test(text)) {
      return { ok: false, reason: "Oranlar tam denk; tek sınırlayıcı yok." };
    }
    return { ok: true, question: text, expected: limiting };
  }

  // Açık uçlu / nitel soru: nicelik kapısı yoksa geçir, beklenen null.
  return { ok: true, question: text, expected: { kind: "open", answer: "" } };
}

/** Asistan mesajındaki `[[cek:...]]` beklenen cevabı okur. */
export function parseCheckExpected(content: string): CheckExpected | null {
  const match = content.match(/\[\[cek:([^\]]+)\]\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as CheckExpected;
    if (!parsed || typeof parsed.answer !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function checkExpectedMarker(expected: CheckExpected | null): string {
  if (!expected || expected.kind === "open" && !expected.answer) return "";
  return `[[cek:${JSON.stringify(expected)}]]`;
}

/** Öğrenci cevabını saklanan beklenenle karşılaştırır (model tahmin etmez). */
export function gradeAgainstExpected(
  student: string,
  expected: CheckExpected,
): "dogru" | "kismen" | "yanlis" {
  const foldStudent = foldTr(student);
  const foldAnswer = foldTr(expected.answer);
  if (!foldAnswer) return "yanlis";
  if (foldAnswer.length <= 2) {
    // Tek harf/kısa sembol: kelime sınırı şart (a ∈ sınırlayıcı olmasın).
    const bounded = new RegExp(`(?:^|[^a-z0-9])${escapeReg(foldAnswer)}(?:[^a-z0-9]|$)`);
    if (bounded.test(foldStudent)) return "dogru";
    return "yanlis";
  }
  if (foldStudent.includes(foldAnswer) || foldAnswer.includes(foldStudent.slice(0, 40))) {
    return "dogru";
  }
  if (expected.kind === "limiting" && /hicbiri|neither|eşit oran|tam denk/.test(foldStudent)) {
    return foldAnswer.includes("hicbiri") ? "dogru" : "yanlis";
  }
  if (expected.kind === "arithmetic") {
    const num = student.match(/(\d+(?:[.,]\d+)?)/);
    if (num && foldTr(num[1].replace(".", ",")) === foldAnswer) return "dogru";
  }
  const parts = foldAnswer.split(/[,\s]+/).filter((part) => part.length > 2);
  if (parts.some((part) => foldStudent.includes(part)) && parts.length > 1) {
    return "kismen";
  }
  return "yanlis";
}

export function stripCheckMarker(content: string): string {
  return content.replace(/\[\[cek:[^\]]+\]\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
