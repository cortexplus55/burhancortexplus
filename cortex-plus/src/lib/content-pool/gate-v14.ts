import canonical from "../../../data/canonical/constants.json";
import { turkishFold } from "@/lib/text/turkish";

/*
  GATE v14 (3 Kasım 2026): beş katman.
  1) Kanonik sabit (kod): metinde adı geçen sabit/tarih, resmî değerle (ya da sınav kabulüyle) uyuşmalı.
  2) Sayısal sonuç (kod): tüm şıklar sayıysa açıklamanın vardığı son sayı başka bir şıkkı değil anahtarı vermeli.
  3) Çeldirici kanıtı (model): doğrulayıcı her yanlış şık için somut yanlışlık gösteremezse ret (VERIFY "celdirici").
  4) Üçlü mutabakat: cevap anahtarı = bağımsız çözüm (model) = açıklamanın işaret ettiği şık (kod).
  5) Yapısal kapı + canlı karantina: mevcut sıfır maliyetli kapı; yayından sonra yanıt/bildirim istatistiği (SQL).
*/

type Canonical = { id: string; kind?: "year"; names: string[]; value: number; tolerance: number; accepted: number[]; source: string };
const ENTRIES = (canonical as { entries: Canonical[] }).entries;

const NUMBER = /(-?\d+(?:[.,]\d+)*)(?:\s*(?:[x×·*]\s*10\s*(?:\^|\*\*)?\s*\(?\s*([-−–]?\d+)\s*\)?|e([-−]?\d+)))?/iu;
const ASSUMED = /(alin|kabul|varsay|yaklasik)/u; // turkishFold edilmiş metne uygulanır (alınız → aliniz)

/** "6,02 × 10^23", "1.602e-19", "299 792 458", "1923" → sayı. Türkçe ondalık virgül ve binlik nokta/boşluk okunur. */
export function parseLooseNumber(raw: string, exp?: string): number | null {
  let s = raw.replace(/\s+/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const base = Number(s);
  if (!Number.isFinite(base)) return null;
  const e = exp ? Number(exp.replace(/[−–]/g, "-")) : 0;
  return Number.isFinite(e) ? base * 10 ** e : null;
}

function close(a: number, b: number, tol: number): boolean {
  if (tol === 0) return a === b;
  return Math.abs(a - b) <= Math.abs(b) * tol;
}

/** Katman 1: metindeki kanonik sabitlerin değeri. Döner: sorun listesi (boşsa geçer). */
export function canonicalIssues(text: string): string[] {
  const folded = turkishFold(text);
  const issues: string[] = [];
  for (const entry of ENTRIES) {
    for (const name of entry.names) {
      const key = turkishFold(name);
      let at = folded.indexOf(key);
      while (at >= 0) {
        const window = text.slice(at + key.length, at + key.length + 48).replace(/(\d)\s(?=\d{3}\b)/g, "$1");
        const m = entry.kind === "year" ? /\b(1\d{3}|20\d{2})\b/u.exec(window) : NUMBER.exec(window);
        if (m && !ASSUMED.test(turkishFold(window.slice(0, m.index + m[0].length + 16)))) {
          const n = parseLooseNumber(m[1]!, entry.kind === "year" ? undefined : (m[2] ?? m[3]));
          if (n !== null && !close(n, entry.value, entry.tolerance) && !entry.accepted.some((a) => close(n, a, Math.max(entry.tolerance, 0.005)))) {
            issues.push(`kanonik değer uyuşmuyor: ${entry.id} (${m[0].trim()})`);
          }
        }
        at = folded.indexOf(key, at + key.length);
      }
    }
  }
  return [...new Set(issues)];
}

/** Şık yalnız sayı (isteğe bağlı kısa birim) ise değeri. */
export function numericChoice(choice: string): number | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)*)\s*(?:[%°]|[\p{L}/²³]{1,6})?\s*$/u.exec(choice);
  return m ? parseLooseNumber(m[1]!) : null;
}

/** Katman 2: tüm şıklar sayısal → açıklamanın son sayısı anahtar değil de başka şıksa ret. */
export function numericResultIssue(item: { choices: string[]; answer: number; explanation: string }): string | null {
  const values = item.choices.map(numericChoice);
  if (values.some((v) => v === null)) return null;
  // Yalnız "= sayı" sonuçları: açıklama çeldiricilerin sayılarını da anabilir.
  const nums = [...item.explanation.matchAll(/=\s*(-?\d+(?:[.,]\d+)*)/g)].map((m) => parseLooseNumber(m[1]!)).filter((n): n is number => n !== null);
  const last = nums.at(-1);
  if (last === undefined) return null;
  const key = values[item.answer]!;
  if (close(last, key, 1e-9)) return null;
  const other = values.findIndex((v, i) => i !== item.answer && close(last, v!, 1e-9));
  return other >= 0 ? `açıklamanın sonucu (${last}) başka şıkkı veriyor` : null;
}

const LETTER = /(?:doğru\s+(?:cevap|yanıt|seçenek|şık)|cevap|yanıt)\s*(?:[:=]|olarak|şıkkı)?\s*\(?([A-E])\)?(?![\p{L}])/iu;

/** Katman 4 (kod ayağı): açıklama "Doğru cevap C" diyorsa anahtar C olmalı. */
export function explanationAnswerIssue(item: { choices: string[]; answer: number; explanation: string }): string | null {
  const m = LETTER.exec(item.explanation);
  if (!m) return null;
  const idx = m[1]!.toUpperCase().charCodeAt(0) - 65;
  if (idx >= item.choices.length) return `açıklama olmayan şıkkı (${m[1]}) gösteriyor`;
  return idx === item.answer ? null : `açıklama başka şıkkı (${m[1]}) doğru diyor`;
}

/** Kodla yapılan v14 katmanları (1, 2, 4-kod). İlk sorun döner. */
export function v14CodeIssue(item: { stem: string; choices: string[]; answer: number; explanation: string }): string | null {
  const canon = canonicalIssues(`${item.stem}\n${item.explanation}\n${item.choices.join("\n")}`);
  if (canon.length) return canon[0]!;
  return numericResultIssue(item) ?? explanationAnswerIssue(item);
}
