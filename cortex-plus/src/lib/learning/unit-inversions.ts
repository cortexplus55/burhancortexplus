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

/** `22,4` tek sayıdır; virgül cümle veya yan cümle ayıracı sayılmaz. */
function splitClauses(text: string): string[] {
  return text
    .replace(/(\d),(\d)/g, "$1\uE000$2")
    .split(/[,;]|\s+ve\s+/i)
    .map((part) => part.replace(/\uE000/g, ",").trim())
    .filter((part) => part.length >= 8);
}

function clausesOf(text: string): string[] {
  return splitClauses(text);
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

function statementsOf(text: string): string[] {
  const parts = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
  return parts.length ? parts : text.trim() ? [text.trim()] : [];
}

function clausesOfStatement(folded: string): string[] {
  const parts = splitClauses(folded);
  return parts.length ? parts : [folded];
}

function hit(kind: string, snippet: string): InversionHit {
  const compact = snippet.replace(/\s+/g, " ").trim().slice(0, 180);
  return { message: `${kind}: "${compact}"`, snippet: compact };
}

function mentionsState(folded: string): boolean {
  return /hal fonksiyon|state function|hal ozellik/.test(folded);
}

function mentionsPath(folded: string): boolean {
  return /yol fonksiyon|path function/.test(folded);
}

function mentionsCycle(folded: string): boolean {
  return /(?<![a-z])(?:cevrim|cycle)/.test(folded);
}

function mentionsProcess(folded: string): boolean {
  return /(?<![a-z])(?:proses|surec|process)/.test(folded);
}

function heatOrWork(folded: string): boolean {
  if (/(?<![a-z])(?:isi|heat|work)(?![a-z])/.test(folded)) return true;
  // "iş" katlanmış hâli "is". İngilizce fiil "is" tek başına iş sayılmaz.
  return /(?<![a-z])is(?![a-z])/.test(folded) && /(?<![a-z])(?:isi|hal|yol)(?![a-z])/.test(folded);
}

function endStatesIndependent(folded: string): boolean {
  return /baslangic ve son hal\w{0,12}\s+bagimsiz/.test(folded) && !/bagimsiz\w{0,8}\s+degil/.test(folded);
}

function pathDependent(folded: string): boolean {
  return /(?<![a-z])yola bagli/.test(folded) && !/yola bagli\w{0,8}\s+degil/.test(folded);
}

function pathIndependent(folded: string): boolean {
  return /yoldan bagimsiz/.test(folded) && !/yoldan bagimsiz\w{0,8}\s+degil/.test(folded);
}

/** Proses için söylenen sıfır değişim. Çevrim cümlesi buraya girmez. */
function processClaimsZero(folded: string, original: string): boolean {
  if (mentionsCycle(folded)) return false;
  if (!mentionsProcess(folded)) return false;
  if (/(?:net )?enerji degisimi sifir(?!\w*\s+degil)/.test(folded)) return true;
  if (/net degisim sifir(?!\w*\s+degil)/.test(folded)) return true;
  if (/degildir|yalnizca cevrim/.test(folded)) return false;
  return /Δ\s*[UHEuhe]\s*=\s*0/.test(original);
}

function conceptPairHits(text: string): InversionHit[] {
  const hits: InversionHit[] = [];
  for (const statement of statementsOf(text)) {
    const folded = foldTr(statement);
    if (mentionsState(folded) && endStatesIndependent(folded)) {
      hits.push(hit("Tanım ters çevrilmiş (hal fonksiyonu)", statement));
    }
    if (
      mentionsState(folded) &&
      pathDependent(folded) &&
      !heatOrWork(folded) &&
      !mentionsPath(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (hal fonksiyonu)", statement));
    }
    if (mentionsPath(folded) && pathIndependent(folded) && !pathDependent(folded)) {
      hits.push(hit("Tanım ters çevrilmiş (yol fonksiyonu)", statement));
    }
    if (
      mentionsPath(folded) &&
      /yalnizca baslangic ve son hal/.test(folded) &&
      !/degil/.test(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (yol fonksiyonu)", statement));
    }
    if (
      heatOrWork(folded) &&
      /hal fonksiyon|state function/.test(folded) &&
      !/hal fonksiyon\w{0,6}\s+degil|not a state function|state function is not/.test(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (yol fonksiyonu)", statement));
    }
    if (
      /hal fonksiyon\w{0,4} olarak adlandir/.test(folded) &&
      (/degisim/.test(folded) || /sistem yalnizca baslangic/.test(folded))
    ) {
      hits.push(hit("Tanım ters çevrilmiş (hal fonksiyonu)", statement));
    }
    if (processClaimsZero(folded, statement) && !/degildir|yalnizca cevrim/.test(folded)) {
      hits.push(hit("Tanım ters çevrilmiş (çevrim)", statement));
    }
    if (
      mentionsCycle(folded) &&
      !mentionsProcess(folded) &&
      /enerji degisimi sifir degil|net degisim sifir degil|sifirdan farkli/.test(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (çevrim)", statement));
    }

    for (const clause of clausesOfStatement(folded)) {
      const intensiveThing =
        /(?<![a-z])(?:sicaklik|basinc|yogunluk|temperature|pressure|density)(?![a-z])/.test(clause) ||
        /ozgul hacim|specific volume|ozgul entalpi|specific enthalpy/.test(clause);
      const extensiveSide = clause
        .replace(/ozgul hacim|specific volume|ozgul entalpi|specific enthalpy|ozgul enerji|specific energy/g, " ");
      const extensiveThing =
        /(?<![a-z])(?:kutle|hacim|entalpi|mass|volume|enthalpy)(?![a-z])/.test(extensiveSide) ||
        /toplam enerji|total energy/.test(clause);
      const calledExtensive = /yaygin (?:bir )?ozellik|extensive/.test(clause);
      const calledIntensive = /yegin (?:bir )?ozellik|intensive/.test(clause);
      if (intensiveThing && calledExtensive && !calledIntensive) {
        hits.push(hit("Tanım ters çevrilmiş (yeğin/yaygın)", statement));
      }
      if (extensiveThing && calledIntensive && !calledExtensive) {
        hits.push(hit("Tanım ters çevrilmiş (yeğin/yaygın)", statement));
      }

      const closed = /kapali sistem|closed system/.test(clause);
      const open = /(?<![a-z])acik sistem|open system/.test(clause);
      const mass = /kutle gec|mass (?:cross|transfer|exchang)/.test(clause);
      const none = /olmaz|yoktur|gecmez|gecirmez|gecirilmez|does not|no mass/.test(clause);
      const some = /(?<![a-z])olur|gecer|gecirir|gecebilir|exchanges mass|mass crosses/.test(clause);
      if (mass && closed && some && !none) {
        hits.push(hit("Tanım ters çevrilmiş (kapalı sistem)", statement));
      }
      if (mass && open && none && !some) {
        hits.push(hit("Tanım ters çevrilmiş (açık sistem)", statement));
      }

      const adiabatic = /adyabatik|adiabatic/.test(clause);
      const isothermal = /izotermal|isothermal/.test(clause);
      const tempFixed = /sicaklik sabit/.test(clause);
      const noHeat = /isi gec\w{0,8}\s+(?:yoktur|yok|olmaz|sifirdir|sifir)|q\s*=\s*0/.test(clause);
      const excused = /degil|zorunda degil/.test(clause);
      if (adiabatic && tempFixed && !excused) {
        hits.push(hit("Tanım ters çevrilmiş (adyabatik)", statement));
      }
      if (isothermal && noHeat && !excused) {
        hits.push(hit("Tanım ters çevrilmiş (izotermal)", statement));
      }
    }

    if (/yari deng|quasi-equilibrium|quasi equilibrium|kuasi/.test(folded)) {
      if (/dengeden uzak(?:tir|dir)/.test(folded) || /sonlu fark/.test(folded) || /surtunmeli/.test(folded)) {
        hits.push(hit("Tanım ters çevrilmiş (yarı dengeli)", statement));
      }
    }
  }
  return hits;
}

function comparesSaturation(clause: string, variable: "t" | "p", direction: "gt" | "lt"): boolean {
  const op = direction === "gt" ? ">" : "<";
  const pattern =
    variable === "t"
      ? new RegExp(`(?<![a-z])t\\s*${op}=?\\s*t[_ ]?sat`)
      : new RegExp(`(?<![a-z])p\\s*${op}=?\\s*p[_ ]?sat`);
  return pattern.test(clause);
}

function phaseChangeHits(text: string): InversionHit[] {
  const hits: InversionHit[] = [];
  for (const statement of statementsOf(text)) {
    const folded = foldTr(statement);
    if (
      /doymus sivi/.test(folded) &&
      /doymus buhar/.test(folded) &&
      /karisim\w{0,8}\s+(?:belirler|belirlenir|tanimlar|tanimlanir)/.test(folded) &&
      !/kuruluk|(?<![a-z])x(?![a-z])/.test(folded)
    ) {
      hits.push(hit("Belirsiz fizik", statement));
    }
    if (
      (/sicaklik ve basinc arasinda/.test(folded) ||
        /sicaklik ile basinc\w{0,4}\s+karsilastir/.test(folded) ||
        /basinc ile sicaklik\w{0,4}\s+karsilastir/.test(folded)) &&
      !/t[_ ]?sat|p[_ ]?sat|doyma sicak|doyma basinc/.test(folded)
    ) {
      hits.push(hit("Belirsiz fizik", statement));
    }
    if (
      /doymus sivi/.test(folded) &&
      /yogus/.test(folded) &&
      !/kayna/.test(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (faz)", statement));
    }
    if (
      /doymus buhar/.test(folded) &&
      /kaynama basla|kaynamak uzere|kaynamaya basla/.test(folded) &&
      !/yogus/.test(folded)
    ) {
      hits.push(hit("Tanım ters çevrilmiş (faz)", statement));
    }

    for (const clause of clausesOfStatement(folded)) {
      const compressed = /sikistirilmis sivi|sogutulmus sivi|compressed liquid/.test(clause);
      const superheated = /kizgin buhar|superheated/.test(clause);
      if (compressed && (comparesSaturation(clause, "t", "gt") || comparesSaturation(clause, "p", "lt"))) {
        hits.push(hit("Tanım ters çevrilmiş (faz)", statement));
      }
      if (superheated && (comparesSaturation(clause, "t", "lt") || comparesSaturation(clause, "p", "gt"))) {
        hits.push(hit("Tanım ters çevrilmiş (faz)", statement));
      }
      const namesQuality = /kuruluk|(?<![a-z])x\s*=/.test(clause);
      if (
        namesQuality &&
        (compressed || superheated) &&
        !/tanimsiz|kullanilmaz|yoktur|gecerli degil/.test(clause)
      ) {
        hits.push(hit("Tanım ters çevrilmiş (faz)", statement));
      }
    }
  }
  return hits;
}

function vaguePhysicsHits(text: string): InversionHit[] {
  const hits: InversionHit[] = [];
  for (const statement of statementsOf(text)) {
    const folded = foldTr(statement);
    if (
      /ortam kosullarina gore degisebilir|cevre kosullarina gore degisebilir|kosullara gore degisebilir/.test(
        folded,
      )
    ) {
      hits.push(hit("Belirsiz fizik", statement));
    }
  }
  return hits;
}

export function definitionalInversionHits(text: string): InversionHit[] {
  if (!text.trim()) return [];
  const hits = [
    ...senseHits(text),
    ...pressureEquationHits(text),
    ...conceptPairHits(text),
    ...phaseChangeHits(text),
    ...vaguePhysicsHits(text),
  ];
  const seen = new Set<string>();
  return hits.filter((item) => {
    if (seen.has(item.message)) return false;
    seen.add(item.message);
    return true;
  });
}

export function definitionalInversionIssues(text: string): string[] {
  return definitionalInversionHits(text).map((hit) => hit.message);
}

function repairsConcept(claim: string, correction: string): boolean {
  const claimFold = foldTr(claim);
  const corrFold = foldTr(correction);
  if (processClaimsZero(claimFold, claim)) {
    const cycleZero = mentionsCycle(corrFold) && /sifir/.test(corrFold);
    const endState =
      /baslangic ve son|uc hal/.test(corrFold) &&
      /bagli/.test(corrFold) &&
      !/baslangic ve son hal\w{0,12}\s+bagimsiz/.test(corrFold);
    if (cycleZero || endState) return true;
  }
  if (/hal fonksiyon|state function/.test(claimFold) && endStatesIndependent(claimFold)) {
    return (
      /hal fonksiyon|state function|uc hal|baslangic ve son/.test(corrFold) &&
      /bagli/.test(corrFold) &&
      !endStatesIndependent(corrFold)
    );
  }
  if (
    (/sicaklik ve basinc arasinda/.test(claimFold) || /sicaklik ile basinc/.test(claimFold)) &&
    /t[_ ]?sat|tsat|p[_ ]?sat|psat|doyma sicak|doyma basinc/.test(corrFold)
  ) {
    return true;
  }
  if (
    /karisim/.test(claimFold) &&
    /belirler|belirlenir|tanimlar/.test(claimFold) &&
    /kuruluk|(?<![a-z])x(?![a-z])/.test(corrFold)
  ) {
    return true;
  }
  return false;
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
  if (repairsConcept(claim, correction)) return true;
  return definitionalInversionIssues(claim).length === 0;
}

/** Yanlış inanç claim'de durabilir; düzeltme onu onarmıyorsa ikisi de düşer. */
export function mistakeTeachesInversion(claim: string, correction: string): boolean {
  if (definitionalInversionIssues(correction).length) return true;
  if (!definitionalInversionIssues(claim).length) return false;
  return !correctionRepairs(claim, correction);
}

function keyedOption(sibling: Record<string, unknown> | null): string {
  if (!sibling || !Array.isArray(sibling.options) || typeof sibling.answerIndex !== "number") return "";
  return foldTr(String(sibling.options[sibling.answerIndex] ?? "")).replace(/[^a-z]/g, "");
}

function walk(value: unknown, key: string | null, sibling: Record<string, unknown> | null): string[] {
  if (typeof value === "string") {
    if (key === "claim" && sibling && typeof sibling.correction === "string") {
      return mistakeTeachesInversion(value, sibling.correction) ? definitionalInversionIssues(value) : [];
    }
    if (key === "prompt" && sibling && typeof sibling.explanation === "string") {
      const hits = definitionalInversionIssues(value);
      if (!hits.length) return [];
      // Doğru diye işaretlenen önerme dersin kendisidir.
      if (keyedOption(sibling) === "dogru") return hits;
      // Yanlış inanç soruluyorsa ve açıklama onu düzeltiyorsa ders düşmez.
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
