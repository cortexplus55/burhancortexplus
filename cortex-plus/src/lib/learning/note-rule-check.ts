/**
 * Akıllı hoca uyarısının GENEL katmanı (31 Ekim 2026, Paket J denetimi #13).
 *
 * `formula-typos.ts` elle yazılmış bir katalogla çalışır (E = mc², F = m·a …): yalnız katalogdaki formülleri yakalar
 * ve konuya özgü terim taşır. Kural "kod her ders için genel olsun" diyor; bu modül aynı uyarıyı her derste üretebilen
 * modelli bir denetimdir. Model notun metnini okur ve YALNIZ evrensel kabul görmüş bir eşitliğin (formül, özdeşlik,
 * tanım bağıntısı) açık yazım hatasını bildirir. Kod yanlış alarmı şu kurallarla keser:
 * - `found` notta birebir geçmeli (boşluk farkı hariç); model notta olmayan bir şey uyduramaz.
 * - `found` ve `standard` ikisi de "=" taşıyan kısa eşitlik olmalı; farklı olmalı.
 * - Model kesinliği "yuksek" demeli; eşik, aralık, tarih, sınıflandırma, yönetmelik, tıbbi değer ve hukuk kuralı
 *   istemde açıkça dışarıda (Paket A kaynak sayı önceliği: onlarda not haklıdır).
 * - Katalogun zaten bulduğu satır tekrar edilmez; toplam `NOTE_WARNING_CAP`.
 * Saf modül: istem, okuyucu ve birleştirme. Model çağrısı `note-rule-check-run.ts`'te.
 */
import { NOTE_WARNING_CAP, type FormulaTypo } from "@/lib/learning/formula-typos";

export const NOTE_RULE_SYSTEM =
  "Bir öğrencinin ders notunu okuyorsun. Görevin dar: notta EVRENSEL kabul görmüş bir eşitlik (formül, özdeşlik, " +
  "tanım bağıntısı) AÇIKÇA yanlış yazılmışsa bildir (ör. üs, işaret, işlem ya da kesir ters yazılmış). Eşik, aralık, " +
  "sınır değer, tarih, sınıflandırma, yönetmelik, tıbbi değer, hukuk kuralı, kurum ya da kitaba özgü gösterim ve " +
  "notun kendi tanımladığı semboller ASLA bildirilmez: onlarda not haklıdır. Yarım kalmış satır, soru, şık, örnek " +
  "çözüm ara adımı ya da notun kendisinin 'yanlış' dediği ifade bildirilmez. Emin değilsen bildirme; yanlış alarm, " +
  "kaçırılan uyarıdan kötüdür.\n" +
  'Yalnız JSON döndür: {"items": [{"found": "notta geçen eşitlik, harfi harfine", "standard": "doğru eşitlik", ' +
  '"confidence": "yuksek" | "orta" | "dusuk"}]}. Hata yoksa {"items": []}. En çok 3 öğe.';

/** Modele giden not metni sınırı (karakter). */
export const NOTE_RULE_TEXT_CAP = 12_000;

export function noteRuleUserPrompt(text: string): string {
  return `NOT:\n${text.slice(0, NOTE_RULE_TEXT_CAP)}`;
}

function squash(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−–]/g, "-")
    .replace(/[·×*]/g, "*")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("tr-TR");
}

function isEquation(value: string): boolean {
  const parts = value.split("=");
  return parts.length === 2 && parts.every((part) => part.trim().length > 0);
}

/** Modelin yanıtını okur ve sıkı denetler; geçmeyen öğe atılır. */
export function readNoteRuleWarnings(raw: unknown, noteText: string): FormulaTypo[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const haystack = squash(noteText);
  const out: FormulaTypo[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { found, standard, confidence } = item as Record<string, unknown>;
    if (typeof found !== "string" || typeof standard !== "string") continue;
    if (typeof confidence !== "string" || !/^y[uü]ksek$/i.test(confidence.trim())) continue;
    const f = found.trim();
    const s = standard.trim();
    if (!f || !s || f.length > 120 || s.length > 120) continue;
    if (!isEquation(f) || !isEquation(s)) continue;
    const key = squash(f);
    if (key === squash(s) || key.length < 3) continue;
    if (!haystack.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: "model", found: f, standard: s });
    if (out.length >= NOTE_WARNING_CAP) break;
  }
  return out;
}

/** Katalog uyarıları önce; modelin bulduğu aynı satır tekrar edilmez; toplam tavan. */
export function mergeNoteWarnings(catalog: readonly FormulaTypo[], model: readonly FormulaTypo[]): FormulaTypo[] {
  const out = [...catalog].slice(0, NOTE_WARNING_CAP);
  const seen = new Set(out.map((warning) => squash(warning.found)));
  for (const warning of model) {
    if (out.length >= NOTE_WARNING_CAP) break;
    const key = squash(warning.found);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(warning);
  }
  return out;
}

/** Not metninde eşitlik yoksa model çağrısına gerek yok. */
export function noteNeedsRuleCheck(text: string): boolean {
  return /[^\s=<>!]\s*=\s*[^\s=]/.test(text);
}
