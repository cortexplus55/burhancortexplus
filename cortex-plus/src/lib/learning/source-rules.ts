import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notun özel sayısal kuralları (6 Kasım 2026, canlı telefon denetiminde bulundu). Ders, notun "bir sabit şu değerle
 * alınacak" kuralını uyguladı; test ekranındaki eğitmen aynı soruda genel bilgideki yaklaşık değeri söyledi. Eğitmen
 * hazırlığın belgelerini hiç görmüyordu; ana hazırlık sohbeti görüyordu ama kural satırı aramada çıkmazsa o da
 * kaçırabiliyordu.
 *
 * Kod, öğrencinin belgelerinde bir değeri sınav için SABİTLEYEN satırları modelsiz çıkarır: satırda bir sayı ve
 * belirleme sözü ("… alınacak", "… alınız", "… kabul edilir", "… olarak kullanılır", "… yuvarlanır") birlikte geçer.
 * Satırlar eğitmenin ve sohbetin istemine "NOTUN ÖZEL KURALLARI" olarak, `SOURCE_NUMBER_PRIORITY` ile birlikte gider.
 * Kod satırı yeniden yazmaz; yalnız boşlukları toplar ve uzun satırdan kuralı taşıyan cümleyi alır.
 */

/** Belirleme sözü: Türkçe ekleriyle, ASCII'ye düşmüş OCR yazımı da (alin, kabul edil). */
const SETTING_WORD =
  /(?<![\p{L}])(?:al[ıi]n(?:acak(?:t[ıi]r)?|[ıi]z|s[ıi]n|[ıi]r|mal[ıi](?:d[ıi]r)?)?|kabul\s+edil\p{L}*|kabul\s+edin\p{L}*|olarak\s+kullan\p{L}*|kullan[ıi]lacak\p{L}*|yuvarla\p{L}*|esas\s+al\p{L}*)(?![\p{L}])/iu;
const HAS_NUMBER = /\d/;
/** Satın alma, yer ayırma gibi sayı taşıyan ama kural olmayan kullanım ("satın alınacak 3 paket"). */
const NOT_A_RULE = /(?<![\p{L}])sat[ıi]n\s+al/iu;

export const SOURCE_RULE_MAX = 6;
export const SOURCE_RULE_MAX_CHARS = 220;

function sentences(line: string): string[] {
  return line.split(/(?<=[.!?;])\s+(?=\p{Lu}|\d)/u).map((part) => part.trim()).filter(Boolean);
}

function isRule(text: string): boolean {
  return HAS_NUMBER.test(text) && SETTING_WORD.test(text) && !NOT_A_RULE.test(text);
}

/** Metindeki kural satırları, belge sırasıyla, tekrarsız. */
export function extractSourceRules(text: string, max = SOURCE_RULE_MAX): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (text ?? "").split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").replace(/^[\s\-–•*>#]+/, "").trim();
    if (!line || !isRule(line)) continue;
    const picked = line.length <= SOURCE_RULE_MAX_CHARS ? [line] : sentences(line).filter(isRule);
    for (const item of picked) {
      const rule = item.length > SOURCE_RULE_MAX_CHARS ? `${item.slice(0, SOURCE_RULE_MAX_CHARS - 1)}…` : item;
      const key = rule
        .toLocaleLowerCase("tr")
        .replace(/[.!?;:…\s]+$/u, "")
        .replace(/[^\p{L}\d=,.]+/gu, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(rule);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** İstem bloğu; kural yoksa boş. */
export function sourceRulesBlock(rules: readonly string[]): string {
  if (!rules.length) return "";
  return (
    "NOTUN ÖZEL KURALLARI (öğrencinin kendi notundan, aynen geçerli; cevaptaki her hesap, sayı ve sonuç bunlara uyar, " +
    "genel bilgideki farklı değeri kullanma):\n" +
    rules.map((rule) => `- ${rule}`).join("\n")
  );
}

/**
 * Sayfa ön süzgeci veritabanında (`imatch`, büyük-küçük harf duyarsız POSIX düzenli ifade): belirleme sözü ile bir
 * rakam 120 karakter içinde. Büyük kitapta "alın" yüzlerce sayfada geçer; rakam şartı olmadan sınırlı okuma not
 * sayfasını kaçırırdı. Düzenli ifade okunamazsa (sağlayıcı reddederse) kaba `ilike` süzgecine düşülür.
 */
const SETTING_SQL = "(al[ıi]n|kabul +edil|kabul +edin|olarak +kullan|kullan[ıi]lacak|yuvarla|esas +al)";
export const SOURCE_RULE_PAGE_REGEX = `[0-9].{0,120}${SETTING_SQL}|${SETTING_SQL}.{0,120}[0-9]`;
const PAGE_PATTERNS = ["%alın%", "%alin%", "%kabul%edil%", "%olarak%kullan%", "%kullanılacak%", "%yuvarla%", "%esas%al%"];
const ID_CHUNK = 150;

/**
 * Hazırlığın belgelerindeki kural satırları. Okuma düşerse boş liste (eğitmen ve sohbet yine cevap verir).
 * Belge kimlikleri çağırandan gelir (`loadPrepDocumentIds`: yalnız hazırlık sahibinin belgeleri).
 */
export async function loadSourceRules(
  service: SupabaseClient,
  documentIds: readonly string[],
  max = SOURCE_RULE_MAX,
): Promise<string[]> {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  try {
    const reads = await Promise.all(
      chunks.map(async (chunk) => {
        const base = () => service.from("document_pages").select("document_id, page_number, text_content").in("document_id", chunk);
        let { data, error } = await base().filter("text_content", "imatch", SOURCE_RULE_PAGE_REGEX).limit(40);
        if (error) {
          ({ data, error } = await base()
            .or(PAGE_PATTERNS.map((pattern) => `text_content.ilike.${pattern}`).join(","))
            .limit(40));
        }
        return error ? [] : ((data ?? []) as { document_id: string; page_number: number | null; text_content: string | null }[]);
      }),
    );
    const order = new Map(ids.map((id, index) => [id, index]));
    const pages = reads
      .flat()
      .sort(
        (a, b) =>
          (order.get(a.document_id) ?? 0) - (order.get(b.document_id) ?? 0) || (a.page_number ?? 0) - (b.page_number ?? 0),
      );
    return extractSourceRules(pages.map((page) => page.text_content ?? "").join("\n"), max);
  } catch {
    return [];
  }
}
