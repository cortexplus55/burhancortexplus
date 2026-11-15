/*
  Şık ayrılabilirliği (H2, 15 Kasım 2026; Burhan D2 onayı, sınırlarıyla: yalnız doğrulama, hatalı soru sessizce
  değiştirilmez, elenir ve sayaçlanır; salt kod; bayrak arkasında `quiz.option_check`).

  Canlı G8: "Enerjinin Korunumu" sorusunda C şıkkı "… ne yoktan var edilebilir ne de yok edilemez" idi: "ne … ne de"
  yapısında olumsuz fiil, dil bilgisi bozuk ve E şıkkıyla aynı anlama kayıyor. Bugünkü denetimler (aynı şık, eşdeğer şık,
  eşik ikizi) bunu yakalamıyordu.

  Bilerek YAPILMAYAN: kök benzerliğiyle "neredeyse aynı şık" ölçüsü. "edilebilir / edilemez" gibi yalnız olumsuzlukla
  ayrılan şıklar doğru çeldiricidir ve aynı kökleri paylaşır; benzerlik ölçüsü sağlam soruyu elerdi. Anlamca eşdeğer şıkkı
  yakalamak model ister (D2'nin sınırı dışında, ayrı durak).

  Burada yalnız kesin, ders-bağımsız iki kural var. Ders ya da konu sözcüğü yok; yalnız Türkçe yapı.
*/

/** Bayrak: açıkken test motorunun kod kapısı bu denetimi de uygular (`teacher-quiz-run.ts`). */
export const QUIZ_OPTION_CHECK_FLAG = "quiz.option_check";

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase("tr");

/** Listeyi ayıran bağlaçlar (sıralama anlam taşımaz): "A ve B", "A, B ile C", "A veya B". */
const LIST_SPLIT = /\s*(?:,|;|\/|\bve\b|\bile\b|\bveya\b|\bya da\b)\s*/u;
/** Liste öğesi kısa bir ad öbeğidir; cümle değildir. */
const MAX_ITEM_WORDS = 2;

/**
 * Şık bir öğe listesi mi: en az iki öğe, her biri en çok iki sözcük. Cümle şıkları ("A edilemez, ancak B edilebilir")
 * liste değildir: orada sıra anlamı değiştirir ve aynı sözcüklerle zıt iki doğru çeldirici kurulur.
 */
function listItems(option: string): string[] | null {
  const items = fold(option)
    .replace(/[.!?]+$/u, "")
    .split(LIST_SPLIT)
    .map((item) => item.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" "))
    .filter(Boolean);
  if (items.length < 2) return null;
  return items.every((item) => item.split(" ").length <= MAX_ITEM_WORDS) ? items : null;
}

/**
 * Aynı öğeler, yalnız sırası farklı iki liste şıkkı ("Osmanlı ve Safevi" / "Safevi ile Osmanlı"): tek doğrulu soruda
 * ikisi de doğru ya da ikisi de yanlış olur. Birebir aynı şık `duplicateOptionPair`'ın işi; burada metin farklı olmalı.
 */
export function reorderedOptionPair(options: readonly string[]): [string, string] | null {
  const keyed = options.map((option) => {
    const items = listItems(option);
    return { option, sorted: items ? [...items].sort().join("|") : null, joined: items?.join("|") ?? null };
  });
  for (let i = 0; i < keyed.length; i += 1) {
    const left = keyed[i]!;
    if (!left.sorted) continue;
    for (let j = i + 1; j < keyed.length; j += 1) {
      const right = keyed[j]!;
      if (right.sorted && left.sorted === right.sorted && left.joined !== right.joined) return [left.option, right.option];
    }
  }
  return null;
}

/** Olumsuz fiil ya da olumsuzluk sözcüğü (Türkçe yapı: -mez/-maz, -me/-ma + zaman eki, "değil"). */
const NEGATIVE_WORD =
  /^(?:değil\p{L}*|\p{L}+m[ae]z\p{L}*|\p{L}+m[ıiuü]yor\p{L}*|\p{L}+m[ae]d[ıiuü]\p{L}*|\p{L}+m[ae]m[ıiuü]ş\p{L}*|\p{L}+m[ae]y[ae]c[ae]k\p{L}*)$/u;

/**
 * "ne … ne (de) …" yapısı zaten olumsuzdur; fiil olumlu kalır ("ne gelir ne de gider"). Olumsuz fiille ("ne gelmez ne de
 * gider") cümle bozuk olur ve anlamı belirsizleşir. Yalnız iki "ne" birden geçen şıkta bakılır.
 */
export function brokenNeitherNor(option: string): boolean {
  const words = fold(option).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const neAt = words.flatMap((word, index) => (word === "ne" ? [index] : []));
  if (neAt.length < 2) return false;
  return words.slice(neAt[0]! + 1).some((word) => word !== "ne" && NEGATIVE_WORD.test(word));
}

export const OPTION_SEPARABILITY_PREFIX = "Şıklar ayrılmıyor";

/** Tek doğrulu sorunun şık ayrılabilirliği sorunları (yalnız `quiz.option_check` açıkken çağrılır). */
export function optionSeparabilityIssues(options: readonly string[]): string[] {
  const issues: string[] = [];
  const reordered = reorderedOptionPair(options);
  if (reordered) {
    issues.push(`${OPTION_SEPARABILITY_PREFIX}: iki şık aynı öğeleri başka sırayla sayıyor ('${reordered[0]}' / '${reordered[1]}').`);
  }
  const broken = options.find(brokenNeitherNor);
  if (broken) {
    issues.push(`${OPTION_SEPARABILITY_PREFIX}: "ne … ne de" yapısında olumsuz fiil var, şık dil bilgisi bozuk ('${broken}').`);
  }
  return issues;
}
