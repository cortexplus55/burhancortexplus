/**
 * Konu testinin biçimi (6 Kasım 2026, Paket 2) — ders bağımsız, modelsiz.
 *
 * Canlıda bir konu testinde 5 sorunun 4'ü aynı kaynak tablosunun satırlarından geldi (satırın bir hücresi kökte, öbürü
 * doğru şıkta), konunun çekirdek kuralı hiç sorulmadı. 20 Ekim 2026'da "aynı tablodan en çok 2 soru" yalnız yazar
 * kuralı ve ölçümdü (`tableLookupLike`); ürün sahibi şimdi kodda engellenmesini istedi. Burada üç şey var:
 *
 * - `questionTableOf`: sorunun hangi kaynak tablosundan geldiği (doğru cevap bir satırın hücresinde ve kök aynı satırın
 *   başka bir hücresini taşıyor). Bir tablodan en çok `MAX_SAME_TABLE` soru: fazlası teste girmez.
 * - `topicCoreRule`: konunun çekirdek kuralı — dersin formül bloğu, konu adındaki yasa/ilke, kaynağın bir formül satırı
 *   ya da ilk "Sınavda sorulur" maddesi (bu sırayla). Testin ilk sorusu bunu yoklar.
 * - `coreFirst`: çekirdek kuralı yoklayan soru testin başına alınır (gösterilmiş soru yerinden oynamaz).
 */

/** Aynı kaynak tablosundan bir testte en çok bu kadar soru. */
export const MAX_SAME_TABLE = 2;

const NUMBER = /\d+(?:[.,]\d+)?/g;

/** Karşılaştırma anahtarları: sayılar (virgül = nokta) ve 4+ harfli sözcüklerin dört harflik kökü. */
export function cellKeys(text: string): Set<string> {
  const keys = new Set<string>();
  const lower = text.toLocaleLowerCase("tr");
  for (const match of lower.matchAll(NUMBER)) keys.add(String(Number(match[0].replace(",", "."))));
  for (const word of lower.replace(NUMBER, " ").split(/[^\p{L}]+/u)) {
    if (word.length >= 4) keys.add(word.slice(0, 4));
  }
  return keys;
}

const SEPARATOR = /^\s*\|?[\s|:-]+\|?\s*$/;
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);

/** Kaynak sayfalarındaki tablolar; her tablo gövde satırlarının (başlık satırı hariç) anahtarları. */
export function sourceTables(pages: readonly { text: string }[]): Set<string>[][] {
  const tables: Set<string>[][] = [];
  for (const page of pages) {
    let block: string[] = [];
    const flush = () => {
      if (block.length) {
        const separator = block.findIndex((line) => SEPARATOR.test(line));
        const body = (separator >= 0 ? block.slice(separator + 1) : block).filter((line) => !SEPARATOR.test(line));
        const rows = body.map((line) => cellKeys(line.replace(/\|/g, " "))).filter((keys) => keys.size >= 2);
        if (rows.length >= 2) tables.push(rows);
      }
      block = [];
    };
    for (const line of page.text.split(/\r?\n/)) {
      if (isTableLine(line)) block.push(line);
      else flush();
    }
    flush();
  }
  return tables;
}

type Asked = { text: string; correct: readonly string[] };

/**
 * Sorunun geldiği tablo: doğru cevabın bir anahtarı bir gövde satırında ve kök + cevap o satırın en az iki anahtarını
 * taşıyor (bir hücre kökte, öbürü şıkta). Bulunamazsa null.
 */
export function questionTableIndex(tables: readonly Set<string>[][], question: Asked): number | null {
  const answer = cellKeys(question.correct.join(" "));
  if (!answer.size) return null;
  const asked = cellKeys(`${question.text} ${question.correct.join(" ")}`);
  for (let table = 0; table < tables.length; table += 1) {
    for (const row of tables[table]!) {
      let fromAnswer = false;
      let hits = 0;
      for (const key of row) {
        if (!asked.has(key)) continue;
        hits += 1;
        if (answer.has(key)) fromAnswer = true;
      }
      if (fromAnswer && hits >= 2) return table;
    }
  }
  return null;
}

/** Kaynağa bağlı tablo okuyucu; tablo yoksa null (kısıt yok). */
export function questionTableOf(pages: readonly { text: string }[]): ((question: Asked) => number | null) | null {
  const tables = sourceTables(pages);
  if (!tables.length) return null;
  return (question) => questionTableIndex(tables, question);
}

/**
 * Bir tablodan en çok `MAX_SAME_TABLE` soru. İlk `keep` soru (öğrenciye gösterilmiş) yerinde kalır ama sayıma girer.
 * Sıra korunur; fazlası düşer (çağıran eksik sayıyı yeni taslakla tamamlar).
 */
export function capSameTable<T extends Asked>(
  questions: readonly T[],
  tableOf: ((question: Asked) => number | null) | null,
  keep = 0,
): T[] {
  if (!tableOf) return [...questions];
  const used = new Map<number, number>();
  const out: T[] = [];
  questions.forEach((question, index) => {
    const table = tableOf(question);
    const seen = table === null ? 0 : (used.get(table) ?? 0);
    if (table !== null && seen >= MAX_SAME_TABLE && index >= keep) return;
    if (table !== null) used.set(table, seen + 1);
    out.push(question);
  });
  return out;
}

/** Konu adında kural adı: yasa, kanun, ilke, prensip, teorem, kural, bağıntı, denklem (Türkçe genel sözcükler). */
const LAW_WORD = /(?:^|[^\p{L}])(yasa|kanun|ilke|prensip|teorem|kural|bağıntı|denklem|formül)/iu;

/** Kaynakta tek başına duran sembolik formül satırı ("A = B·C", "y = ax + b"): eşittirin iki yanında harf var. */
function formulaLine(line: string): string | null {
  const text = line.replace(/\*\*/g, "").trim();
  if (!text || text.length > 120 || isTableLine(text) || !text.includes("=")) return null;
  const [left, ...rest] = text.split("=");
  const right = rest.join("=");
  const leftTail = left!.trim().split(/\s+/).slice(-3).join(" ");
  if (!/\p{L}/u.test(leftTail) || leftTail.length > 40) return null;
  if (!/\p{L}/u.test(right) || !/[\p{L}\p{N}]\s*[·×*/+−-]|\p{L}\s*\p{L}|[\p{L}][₀-₉²³]/u.test(right)) return null;
  // Cümle değil: kısa satır (en çok 14 parça).
  if (text.split(/\s+/).length > 14) return null;
  return text;
}

export type CoreRuleInput = {
  topicLabel?: string;
  pages: readonly { text: string; label?: string }[];
  lesson?: { formulas?: readonly string[] } | null;
  /** Konu testinin madde listesi (`topicTestPoints`); ilk madde son seçenek. */
  points?: readonly string[];
};

/**
 * Konunun çekirdek kuralı: dersin ilk formül bloğu → konu adındaki yasa/ilke → kaynağın ilk formül satırı → ilk
 * "Sınavda sorulur" maddesi. Hiçbiri yoksa null (testin ilk sorusu serbest).
 */
export function topicCoreRule(input: CoreRuleInput): string | null {
  const formula = input.lesson?.formulas?.map((item) => item.trim()).find(Boolean);
  if (formula) return formula.slice(0, 200);
  const label = input.topicLabel?.trim() ?? "";
  if (label && LAW_WORD.test(label)) return label.slice(0, 200);
  for (const page of input.pages) {
    if (page.label) continue;
    for (const line of page.text.split(/\r?\n/)) {
      const found = formulaLine(line);
      if (found) return found;
    }
  }
  const point = input.points?.map((item) => item.replace(/\s*\(derste işlendi\)\s*$/u, "").trim()).find(Boolean);
  return point ? point.slice(0, 200) : null;
}

const compact = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/[\s*·×]/g, "")
    .replace(/−/g, "-");

type CoreQuestion = Asked & { explanation?: string; steps?: string[]; options?: readonly string[]; multi?: boolean };

/** Soru çekirdek kuralı yokluyor mu: formülün sağ yanı soruda (kök, şık, açıklama, adım) geçiyor ya da kuralın anahtarlarının yarısı. */
export function testsCore(question: CoreQuestion, core: string): boolean {
  const blob = [question.text, ...(question.options ?? []), ...question.correct, question.explanation ?? "", ...(question.steps ?? [])].join(" ");
  if (core.includes("=")) {
    const right = compact(core.split("=").slice(1).join("="));
    if (right.length >= 3 && compact(blob).includes(right)) return true;
  }
  const keys = [...cellKeys(core)].filter((key) => !/^\d/.test(key));
  if (!keys.length) return false;
  const have = cellKeys(blob);
  return keys.filter((key) => have.has(key)).length / keys.length >= 0.5;
}

/** Çekirdek kuralı yoklayan ilk tek cevaplı soru başa alınır; `keep` > 0 ise (soru gösterildi) sıra değişmez. */
export function coreFirst<T extends CoreQuestion>(questions: readonly T[], core: string | null, keep = 0): T[] {
  if (!core || keep > 0 || questions.length < 2) return [...questions];
  const index = questions.findIndex((question) => !question.multi && testsCore(question, core));
  if (index <= 0) return [...questions];
  return [questions[index]!, ...questions.slice(0, index), ...questions.slice(index + 1)];
}
