/**
 * Eşdeğer iki şık (28 Ekim 2026, Paket A). Canlıda tek doğrulu bir soruda "örten olması" ile "tersinin fonksiyon
 * olması" birlikte şıktı (fonksiyon birebir verilmişti; ikisi de doğru). Kural yazar ve denetçide
 * (`EQUIVALENT_OPTIONS_RULE`); bu dosya yalnız tablodaki çiftleri kodla yakalar. Metne dokunmaz.
 */

/** Aynı kavramın iki adı: biri öbürüne çevrilince şıklar aynı kalıyorsa eşdeğerdir. */
const SYNONYM_TERMS: ReadonlyArray<readonly string[]> = [
  ["resesif", "çekinik"],
  ["dominant", "baskın"],
  ["homozigot", "arı döl", "saf döl"],
  ["heterozigot", "melez"],
  ["genotip", "kalıtsal yapı"],
  ["fenotip", "dış görünüş"],
  ["birebir", "bire bir", "injektif"],
  ["örten", "sürjektif"],
  ["tersinir", "ters çevrilebilir"],
  ["hipertansiyon", "yüksek tansiyon"],
  ["hipotansiyon", "düşük tansiyon"],
  ["taşikardi", "hızlı kalp atımı"],
  ["bradikardi", "yavaş kalp atımı"],
  ["eşkenar üçgen", "üç kenarı eşit üçgen"],
];

/** Aynı önermeyi söyleyen kalıplar: iki ayrı şık aynı gruptan iki farklı kalıba uyuyorsa eşdeğerdir. */
const EQUIVALENT_CLAIMS: ReadonlyArray<readonly RegExp[]> = [
  [/birebir ve örten/u, /bire bir ve örten/u, /tersi(?:nin)?\s+(?:de\s+)?(?:bir\s+)?fonksiyon/u, /tersinir/u, /ters çevrilebilir/u],
  [/ikinci dereceden denklemin (?:iki )?(?:farklı )?reel kökü/u, /diskriminant(?:ı)? (?:sıfırdan büyük|pozitif)/u, /Δ\s*>\s*0/u],
  [/çift fonksiyon/u, /y eksenine göre simetrik/u],
  [/tek fonksiyon/u, /orijine göre simetrik/u],
];

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[.!?;:,'"’()]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(text: string): string {
  let out = ` ${fold(text)} `;
  SYNONYM_TERMS.forEach((group, index) => {
    for (const term of [...group].sort((a, b) => b.length - a.length)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[\\p{L}]*(?:[^\\p{L}\\p{N}]|$))`, "gu"), `$1§${index}`);
    }
  });
  return out.replace(/\s+/g, " ").trim();
}

function claimGroup(text: string): Array<{ group: number; pattern: number }> {
  const folded = fold(text);
  const hits: Array<{ group: number; pattern: number }> = [];
  EQUIVALENT_CLAIMS.forEach((patterns, group) => {
    const pattern = patterns.findIndex((regex) => regex.test(folded));
    if (pattern >= 0) hits.push({ group, pattern });
  });
  return hits;
}

/**
 * Eşdeğer iki şık; yoksa null. `stem` "birebir" diyorsa yalnız "örten" şıkkı da tersinirlikle eşdeğer sayılır
 * (birebir bir fonksiyonun tersinin fonksiyon olması örten olmasına denktir).
 */
export function equivalentOptionPair(options: readonly string[], stem = ""): [string, string] | null {
  const forms = options.map((option) => ({ option, canon: canonical(option), claims: claimGroup(option) }));
  const injectiveGiven = /birebir|bire bir/u.test(fold(stem));
  for (let i = 0; i < forms.length; i += 1) {
    for (let j = i + 1; j < forms.length; j += 1) {
      const left = forms[i];
      const right = forms[j];
      if (fold(left.option) === fold(right.option)) continue;
      if (left.canon && left.canon === right.canon) return [left.option, right.option];
      for (const a of left.claims) {
        if (right.claims.some((b) => b.group === a.group && b.pattern !== a.pattern)) return [left.option, right.option];
      }
      if (injectiveGiven) {
        const surjective = (text: string) => /(^|\s)örten/u.test(fold(text)) && !/birebir|bire bir/u.test(fold(text));
        const invertible = (form: (typeof forms)[number]) => form.claims.some((claim) => claim.group === 0);
        if ((surjective(left.option) && invertible(right)) || (surjective(right.option) && invertible(left))) {
          return [left.option, right.option];
        }
      }
    }
  }
  return null;
}
