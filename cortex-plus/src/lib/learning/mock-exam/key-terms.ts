/**
 * "🎯 Sınavda Hocanın Puan Verdiği Anahtar Terimler & Birimler" (31 Ekim 2026, Paket J3 #11).
 *
 * Açık uçlu deneme sorusunun inceleme ekranında, öğrencinin kâğıdında mutlaka geçmesi gereken 3-4 kilit terim ve
 * birim. Modelsiz ve yalnız sorunun kendi notlandırma verisinden: her ölçüt bir puandır; her ölçütten o puanı getiren
 * en belirgin parça alınır ve örnek cevapta da geçmesi şarttır. Parça türleri, güven sırasıyla:
 *   1. eşitlik / formül ("IA = IB > i", "Net satışlar 500 TL − 35 TL = 465 TL"),
 *   2. oran ("1 AA : 2 Aa : 1 aa", "3 baskın : 1 çekinik"),
 *   3. sayı + birim ("105.000 TL", "6 ay-5 yaş"; tek harfli birim yalnız bir hesabın sonucunda),
 *   4. kısaltma ve simge ("VSD, ASD, PDA", "DNA", "IAIB"),
 *   5. örnek cevabın **koyu** terimi,
 *   6. iki sözcüklü teknik terim ("aort koarktasyonu", "Fallot tetralojisi"): iki sözcük de içerik sözcüğü, fiil değil,
 *      ilki soruda geçmiyor.
 * Canlı ilk sürüm (31 Ekim 2026) ölçüt ile cevaptaki en uzun ortak sözcük dizisini alıyordu: "ayrılır ve her gamet",
 * "kalıtsal bir özelliği belirleyen" gibi cümle parçaları ve genetikteki "3 A_bb"den "3 A" (amper) çıkıyordu. Kod terim
 * uydurmaz; güvenilir parça yoksa şerit gösterilmez (tek sağlam terim, parçalı dörtten iyidir).
 */

export const KEY_TERMS_TITLE = "🎯 Sınavda Hocanın Puan Verdiği Anahtar Terimler & Birimler";
const MAX_TERMS = 4;
const MAX_TERM_CHARS = 90;

const STOP = new Set(
  (
    "olarak nedeni sonucu açıklama açıklar belirtir belirtilir yazar doğru şekilde arasındaki ilişkisi ilişki kavramı " +
    "kavram tanımı tanım örnek örneği verir gösterir cevap öğrenci ifade ifadesi olan olduğu olduğunu için gibi daha " +
    "kadar sonra önce sebebi etkisi vurgular değinir söyler bahseder tanımlar kullanır hesaplar bulur eksik doğruluğu " +
    "yanlış gerekir gereken hangi neden nasıl şunu bunu bunun onun bunlar şunlar ayrıca ancak çünkü yani veya ile ise " +
    "her bir iki üç çok ama hem yok var kim aynı farklı genellikle uzun kısa büyük küçük sık erken geç yüksek düşük tüm " +
    "bütün ilk son süre zaman durum durumu durumda üzerindeki içindeki arasında birbirinden birlikte yalnızca sadece " +
    "değer değeri sonucunu hesabı birimi özellikleri özelliği türü biçimi biçimidir tarafı tarafındadır taşır oranı sayısı miktarı toplamı"
  ).split(" "),
);

/** Fiil, ortaç ve ek-fiil sonları: "belirleyen", "ayrılır", "yeridir", "edebildiğinden", "bulunmaz". */
const VERBISH =
  /(?:[dt][ıiuü]r|[dt][ıiuü]rl[ae]r|yor|m[ae]z|m[ıi]ş|[ae]bil[ıi]r|l[ae]y[ae]n|y[ae]n|[dt][ıiuü]ğ[ıiuü]n?[dt]?[ae]n?|[ıiuü]l[ıiuü]r|[ıiuü]n[ıiuü]r|[ae]r|[ıiuü]r)$/;

const UNITS =
  "m\\/s²|m\\/s2|m\\/s|km\\/sa|km\\/h|kg|mg|g|mol\\/L|mol|mL|L|kN|N|kJ|J|kW|W|kPa|Pa|atm|°C|K|mV|V|mA|A|Ω|Hz|cm³|cm²|cm|mm|km|m²|m³|m|sn|s|dk|saat|gün|hafta|ay|yaş|yıl|TL|%";
const NUMBER_UNIT = new RegExp(
  `(\\d+(?:[.,]\\d+)*)\\s*(${UNITS})(?:\\s*[-–]\\s*(\\d+(?:[.,]\\d+)*)\\s*(${UNITS}))?(?![A-Za-zÇĞİÖŞÜçğıöşü_])`,
  "g",
);
const SINGLE_LETTER_UNIT = /^(?:g|L|N|J|W|K|V|A|m|s)$/;
const NUM = `\\d+(?:[.,]\\d+)*(?:\\s*(?:${UNITS}))?`;
/** İşlem zinciri: en az bir işleçle bağlanmış sayılar (birimli ya da birimsiz). */
const CHAIN = new RegExp(`${NUM}(?:\\s*[+−×÷/=-]\\s*${NUM})+(?![A-Za-zÇĞİÖŞÜçğıöşü_])`, "g");
const RATIO = /\d+\s*[A-Za-zÇĞİÖŞÜçğıöşü_]+(?:\s*:\s*\d+\s*[A-Za-zÇĞİÖŞÜçğıöşü_]+)+/g;

function fold(word: string): string {
  return word.toLocaleLowerCase("tr-TR");
}

function words(text: string): string[] {
  return text.match(/[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'’-]*/g) ?? [];
}

function bare(word: string): string {
  return word.replace(/['’].*$/, "");
}

/** Sözcük kökü: ilk 5 harf; kısa sözcük tümüyle. */
function stem(word: string): string {
  return fold(bare(word)).slice(0, 5);
}

function sameStem(a: string, b: string): boolean {
  return a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
}

function contentWord(word: string): boolean {
  const clean = bare(word);
  if (clean.length < 4) return false;
  const lower = fold(clean);
  if (STOP.has(lower)) return false;
  return !VERBISH.test(lower);
}

/** Kısaltma ya da simge: "DNA", "VSD", "IAIB", "mRNA". Tek büyük harf ("A'da", "Aa") değil. */
function technical(word: string): boolean {
  const clean = bare(word);
  if (clean.length < 2 || clean.length > 6) return false;
  return /^[A-ZÇĞİÖŞÜ]{2,}$/.test(clean) || /^[a-zçğıöşü]?[A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü]*[A-ZÇĞİÖŞÜ]/.test(clean);
}

function trimTail(text: string): string {
  return text
    .replace(/['’](?:d[ıiuü]r|t[ıiuü]r|d[ıiuü]|t[ıiuü])\b.*$/u, "")
    .replace(/\s+(?:olur|bulunur|bulur|vardır|dır|dir|tir|tır|kurar|yazılır)\.?$/u, "")
    .replace(/[\s.,;:]+$/u, "")
    .trim();
}

function normalize(text: string): string {
  return fold(text).replace(/['’]/g, "").replace(/\s+/g, " ");
}

/** Yan yana iki sözcükten ikincisinin biçimi: "kromozomların" → "kromozom"; durum ekli ("gametlere") terim değil. */
function termHead(word: string): string | null {
  const clean = bare(word);
  const plural = clean.replace(/l[ae]r[ıi]n$/u, "");
  if (plural !== clean) return plural.length >= 3 ? plural : null;
  if (/(?:n[ıiuü]n|l[ae]r[ae]|[yn][ae]|[dt][ae]n?|[dt][ae]ki)$/u.test(fold(clean))) return null;
  return clean;
}

/** Bir ölçütün aday parçaları, güven sırasıyla. */
function criterionCandidates(criterion: string, answer: string, question: string, questionStems: string[]): string[] {
  const out: string[] = [];
  const inAnswer = (text: string) => normalize(answer).includes(normalize(text));
  const covered = (text: string) => out.some((item) => normalize(item).includes(normalize(text)));
  const answerStems = words(answer).map(stem);
  const clauses = criterion.split(/[;.](?:\s|$)/).map((clause) => clause.trim()).filter(Boolean);

  // 0) İşlem zinciri: "40.000 TL + 90.000 TL − 25.000 TL", "500 TL − 35 TL = 465 TL".
  for (const match of criterion.matchAll(CHAIN)) {
    const text = trimTail(match[0]).replace(/\s+/g, " ");
    if (inAnswer(text)) out.push(text);
  }

  // 1) Eşitlik / formül.
  for (const clause of clauses) {
    if (!/[=]/.test(clause) || out.some((item) => clause.includes(item))) continue;
    const tokens = clause.split(/\s+/);
    const symbolic = tokens.filter((token) => token.length <= 3 || /[=<>≤≥+−×·/]/.test(token)).length / tokens.length;
    let span = trimTail(clause);
    if (symbolic < 0.6) {
      // Sözlü formül: bütün yan cümle (kısa kaldıkça).
      if (span.length > MAX_TERM_CHARS) continue;
    } else {
      const match = /[^\s=<>]{1,4}(?:\s*[=<>≤≥]\s*[^\s=<>]{1,4})+/.exec(clause);
      if (match) span = match[0];
    }
    const head = span.split(/\s*=\s*/)[0];
    if (inAnswer(head) || inAnswer(span)) out.push(span);
  }

  // 2) Oran.
  for (const match of criterion.matchAll(RATIO)) {
    if (inAnswer(match[0]) && !covered(match[0])) out.push(match[0].trim());
  }

  // 3) Sayı + birim (tek harfli birim yalnız hesap sonucunda: "I = 2 A"; genetikteki "3 A_bb" amper değil).
  for (const match of criterion.matchAll(NUMBER_UNIT)) {
    const before = criterion.slice(Math.max(0, (match.index ?? 0) - 6), match.index ?? 0);
    if (SINGLE_LETTER_UNIT.test(match[2]) && !/[=≈]/.test(before)) continue;
    const text = match[0].replace(/\s+/g, " ").trim();
    // Soruda verilen sayı öğrencinin yazacağı sonuç değildir.
    if (normalize(question).includes(normalize(text))) continue;
    if (inAnswer(text) && !covered(text)) out.push(text);
  }

  // 4) Kısaltma ve simgeler (aynı ölçütteki en çok üçü birlikte; önceki parçada geçenler sayılmaz).
  const techs = [...new Set(words(criterion).map(bare).filter(technical))].filter(
    (token) => answer.includes(token) && !questionStems.includes(stem(token)) && !out.some((item) => item.includes(token)),
  );
  if (techs.length) out.push(techs.slice(0, 3).join(", "));

  // 5) İki sözcüklü teknik terim: aralarında yalnız boşluk, ikisi de içerik sözcüğü, ilki soruda yok, ilki niteleyici
  //    ("kromozomlardaki") değil, ikincisi durum eki taşımıyor; cevapta da yan yana.
  for (const clause of clauses) {
    for (const part of clause.split(/[,():;]/)) {
      const tokens = part.trim().split(/\s+/);
      for (let index = 0; index + 1 < tokens.length; index += 1) {
        const [first, second] = [tokens[index], tokens[index + 1]];
        if (!/^[A-Za-zÇĞİÖŞÜçğıöşü'’-]+$/.test(first) || !/^[A-Za-zÇĞİÖŞÜçğıöşü'’-]+$/.test(second)) continue;
        if (!contentWord(first) || !contentWord(second) || technical(first) || technical(second)) continue;
        if (/[dt][ae]ki$/u.test(fold(bare(first)))) continue;
        if (questionStems.some((word) => sameStem(word, stem(first)))) continue;
        const head = termHead(second);
        if (!head) continue;
        const a = stem(first);
        const b = stem(second);
        const found = answerStems.some((value, at) => sameStem(value, a) && sameStem(answerStems[at + 1] ?? "", b));
        if (!found) continue;
        const phrase = `${bare(first)} ${head}`;
        if (!covered(phrase)) out.push(phrase);
        break;
      }
    }
  }
  return out;
}

export function scoringKeyTerms(input: { rubric: string[]; modelAnswer: string | null; questionText?: string }): string[] {
  const answer = input.modelAnswer ?? "";
  if (!answer.trim()) return [];
  const questionStems = words(input.questionText ?? "").map(stem);
  const picked: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const clean = term.replace(/[*_`]{2,}/g, "").replace(/\s+/g, " ").trim();
    if (clean.length < 2 || clean.length > MAX_TERM_CHARS || picked.length >= MAX_TERMS) return;
    const key = normalize(clean);
    if (seen.has(key) || picked.some((item) => normalize(item).includes(key))) return;
    seen.add(key);
    picked.push(clean);
  };

  // Yazarın koyu yazdığı terim her zaman kilit sözcüktür.
  for (const match of answer.matchAll(/\*\*([^*]{2,40})\*\*/g)) add(match[1]);

  const criteria = input.rubric.map((item) => item.trim()).filter(Boolean);
  const pools = (criteria.length ? criteria : [answer]).map((criterion) => criterionCandidates(criterion, answer, input.questionText ?? "", questionStems));
  // Her ölçütten önce en güvenilir parça (puan ölçüt başına), sonra ikinciler.
  for (let round = 0; round < 3 && picked.length < MAX_TERMS; round += 1) {
    for (const pool of pools) if (pool[round]) add(pool[round]);
  }
  // Hesap sorusunda ölçüt sonucu sayıyla yazmamış olabilir ("İvme birimiyle verilir"): örnek cevabın son eşitliğindeki
  // sayı + birim, birimsiz sonuç puan kaybettirdiği için.
  if (!picked.some((item) => /\d/.test(item))) {
    const tail = answer.slice(answer.lastIndexOf("=") + 1);
    const result = answer.includes("=") ? [...tail.matchAll(NUMBER_UNIT)][0] : undefined;
    if (result) add(result[0].replace(/\s+/g, " ").trim());
  }
  return picked;
}
