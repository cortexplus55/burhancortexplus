import { foldTr } from "@/lib/documents/page-analysis";

/**
 * Klasik birim tanımlarının ters çevrilmesi.
 *
 * Canlı ders "kJ/kg toplam enerji, kJ özgül enerji" diye geçti. Bu cümle
 * matematik denetçisine hiç girmedi: `assertionTexts` claim, prompt ve
 * şıkları atlıyor; kaynak taraması da yalnızca bazı gövdelere bakıyordu.
 * Anlamsal denetçi bunu kaynak ihlali diye alıntılamadı, notlar üslup
 * olarak kaldı. Tanım hatası burada, alan adından bağımsız, kesilir.
 */

export type InversionHit = { message: string; snippet: string };

type Sense = {
  id: string;
  intensiveUnit: (text: string) => boolean;
  extensiveUnit: (text: string) => boolean;
  intensiveLabel: RegExp;
  extensiveLabel: RegExp;
};

function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function bareEnergyUnit(text: string): boolean {
  const stripped = text.replace(/k(?:j|cal)\s*\/\s*kg/gi, " ").replace(/j\s*\/\s*kg/gi, " ");
  return /(?<![\w/])(?:kJ|kcal|MJ)(?!\s*\/)(?![\w/])/i.test(stripped);
}

const SENSES: Sense[] = [
  {
    id: "enerji",
    intensiveUnit: (text) => /k(?:j|cal)\s*\/\s*kg|j\s*\/\s*kg/i.test(text),
    extensiveUnit: bareEnergyUnit,
    intensiveLabel: /özgül\s+enerji|ozgul\s+enerji|specific\s+energy/i,
    extensiveLabel: /toplam\s+enerji|total\s+energy/i,
  },
  {
    id: "güç",
    intensiveUnit: (text) => /(?<![\w/])(?:kW|MW)(?![\w/])/i.test(text),
    extensiveUnit: bareEnergyUnit,
    intensiveLabel: /(?<![\w])(?:güç|guc|power)(?![\w])/i,
    extensiveLabel: /(?<![\w])(?:enerji|energy)(?![\w])/i,
  },
  {
    id: "kütle",
    intensiveUnit: (text) => /kg\s*\/\s*s/i.test(text),
    extensiveUnit: (text) => /(?<![\w/])kg(?!\s*\/)/i.test(text.replace(/kg\s*\/\s*s/gi, " ")),
    intensiveLabel: /kütle\s+debisi|kutle\s+debisi|mass\s+flow|debi/i,
    extensiveLabel: /(?<![\w])(?:kütle|kutle|mass)(?![\w])/i,
  },
  {
    id: "hacim",
    intensiveUnit: (text) => /m[³3]\s*\/\s*kg/i.test(text),
    extensiveUnit: (text) => /m[³3](?!\s*\/)/i.test(text.replace(/m[³3]\s*\/\s*kg/gi, " ")),
    intensiveLabel: /özgül\s+hacim|ozgul\s+hacim|specific\s+volume/i,
    extensiveLabel: /(?<![\w])(?:hacim|volume)(?![\w])/i,
  },
];

function clausesOf(text: string): string[] {
  return text
    .split(/[,;]|\s+ve\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function withoutIntensiveNames(text: string): string {
  return text
    .replace(/özgül\s+enerji/gi, " ")
    .replace(/ozgul\s+enerji/gi, " ")
    .replace(/specific\s+energy/gi, " ")
    .replace(/özgül\s+hacim/gi, " ")
    .replace(/ozgul\s+hacim/gi, " ")
    .replace(/specific\s+volume/gi, " ")
    .replace(/kütle\s+debisi/gi, " ")
    .replace(/kutle\s+debisi/gi, " ")
    .replace(/mass\s+flow/gi, " ");
}

function senseHits(text: string): InversionHit[] {
  const hits: InversionHit[] = [];
  for (const clause of clausesOf(text)) {
    const extensiveSide = withoutIntensiveNames(clause);
    for (const sense of SENSES) {
      const intensiveUnit = sense.intensiveUnit(clause);
      const extensiveUnit = sense.extensiveUnit(clause);
      const intensiveLabel = has(clause, sense.intensiveLabel);
      const extensiveLabel = has(extensiveSide, sense.extensiveLabel);
      const intensiveCalledExtensive = intensiveUnit && extensiveLabel && !intensiveLabel;
      const extensiveCalledIntensive =
        extensiveUnit && intensiveLabel && !extensiveLabel && !intensiveUnit;
      if (!intensiveCalledExtensive && !extensiveCalledIntensive) continue;
      const snippet = clause.replace(/\s+/g, " ").slice(0, 180);
      hits.push({
        message: `Birim tanımı ters çevrilmiş (${sense.id}): "${snippet}"`,
        snippet,
      });
    }
  }
  return hits;
}

type PressureRole = "abs" | "gauge" | "atm" | "vacuum" | "other";

function pressureRole(token: string): PressureRole {
  const name = foldTr(token).replace(/[^a-z]/g, "");
  if (/vakum|vacuum/.test(name)) return "vacuum";
  if (/mutlak|absolute|pabs|^abs$/.test(name)) return "abs";
  if (/gosterge|gage|gauge|manometre|pman|^man$/.test(name)) return "gauge";
  if (/atmosfer|patm|^atm$/.test(name)) return "atm";
  return "other";
}

function pressureEquationHits(text: string): InversionHit[] {
  const hits: InversionHit[] = [];
  const folded = text.replace(/[–—−]/g, "-");
  const equation =
    /([A-Za-z][A-Za-z0-9_]{0,16})\s*=\s*([A-Za-z][A-Za-z0-9_]{0,16})\s*([+\-])\s*([A-Za-z][A-Za-z0-9_]{0,16})/g;
  for (const match of folded.matchAll(equation)) {
    const left = pressureRole(match[1]);
    const op = match[3] === "+" ? "+" : "-";
    const a = pressureRole(match[2]);
    const b = pressureRole(match[4]);
    if ([left, a, b].includes("other")) continue;
    const gaugeIsSum =
      left === "gauge" && op === "+" && new Set([a, b]).has("abs") && new Set([a, b]).has("atm");
    const absoluteDropsGauge =
      left === "abs" &&
      op === "-" &&
      ((a === "atm" && b === "gauge") || (a === "gauge" && b === "atm"));
    if (!gaugeIsSum && !absoluteDropsGauge) continue;
    const snippet = match[0].replace(/\s+/g, " ").slice(0, 180);
    hits.push({
      message: `Birim tanımı ters çevrilmiş (basınç): "${snippet}"`,
      snippet,
    });
  }
  const prose = foldTr(text);
  if (
    /gosterge basinc\w{0,4}.{0,50}(mutlak|atmosfer).{0,40}toplam/.test(prose) &&
    !/mutlak basinc\w{0,4}.{0,50}(gosterge|manometre|atmosfer).{0,30}toplam/.test(prose)
  ) {
    hits.push({
      message: 'Birim tanımı ters çevrilmiş (basınç): "gösterge basıncı toplam sanılmış"',
      snippet: "gösterge basıncı toplam sanılmış",
    });
  }
  return hits;
}

export function definitionalInversionHits(text: string): InversionHit[] {
  if (!text.trim()) return [];
  const hits = [...senseHits(text), ...pressureEquationHits(text)];
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.snippet)) return false;
    seen.add(hit.snippet);
    return true;
  });
}

export function definitionalInversionIssues(text: string): string[] {
  return definitionalInversionHits(text).map((hit) => hit.message);
}

function correctionRepairs(claim: string, correction: string): boolean {
  if (definitionalInversionIssues(correction).length) return false;
  if (/k(?:j|cal)\s*\/\s*kg/i.test(claim) && /toplam\s+enerji/i.test(claim)) {
    return /k(?:j|cal)\s*\/\s*kg/i.test(correction) && /özgül\s+enerji|specific\s+energy/i.test(correction);
  }
  if (bareEnergyUnit(claim) && /özgül\s+enerji/i.test(claim)) {
    return bareEnergyUnit(correction) && /toplam\s+enerji|total\s+energy/i.test(correction);
  }
  if (/(?<![\w/])(?:kW|MW)(?![\w/])/i.test(claim) && /enerji/i.test(claim)) {
    return /(?:kW|MW)/i.test(correction) && /güç|guc|power/i.test(correction);
  }
  return definitionalInversionIssues(claim).length > 0 && definitionalInversionIssues(correction).length === 0
    ? false
    : definitionalInversionIssues(claim).length === 0;
}

/** Yanlış inanç claim'de durabilir; düzeltme onu onarmıyorsa ikisi de düşer. */
export function mistakeTeachesInversion(claim: string, correction: string): boolean {
  if (definitionalInversionIssues(correction).length) return true;
  if (!definitionalInversionIssues(claim).length) return false;
  return !correctionRepairs(claim, correction);
}

function walk(value: unknown, key: string | null, sibling: Record<string, unknown> | null): string[] {
  if (typeof value === "string") {
    if (key === "claim" && sibling && typeof sibling.correction === "string") {
      return mistakeTeachesInversion(value, sibling.correction) ? definitionalInversionIssues(value) : [];
    }
    if (key === "prompt" && sibling && typeof sibling.explanation === "string") {
      const hits = definitionalInversionIssues(value);
      if (!hits.length) return [];
      // Soru yanlış inancı soruyor, açıklama onu düzeltiyorsa ders düşmez.
      if (!definitionalInversionIssues(sibling.explanation).length) return [];
      return hits;
    }
    if (key === "options" || key === "answerIndex") return [];
    return definitionalInversionIssues(value);
  }
  if (Array.isArray(value)) return value.flatMap((item) => walk(item, key, null));
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  return Object.entries(row).flatMap(([childKey, child]) => walk(child, childKey, row));
}

/** Nesne ya da düz metin. Onarılmış yanılgı iddiası dersi düşürmez. */
export function inversionIssuesInValue(value: unknown): string[] {
  return [...new Set(walk(value, null, null))];
}
