import { headingNamedIn } from "@/lib/documents/outline-skeleton";
import { FIGURE_APPENDIX_LABEL } from "@/lib/learning/figure-pages";
import { headingOfLine } from "@/lib/learning/lesson-backbone";

/**
 * Konu yalıtımı (6 Kasım 2026, canlı sınav) — ders bağımsız, modelsiz.
 *
 * Belgeli hazırlıkta iki konu aynı sayfayı paylaşınca (sayfada iki numaralı bölüm) ders ve konu testi sayfanın
 * tamamından yazılıyordu: bir konunun dersi sonraki konunun bölümünü ayrı kavram yaptı; ders omurgası da o bölümün
 * başlığını "her alt başlık bir ekranda" diye yazara dayatıyordu. Podcast'te bu iş yalnız istem satırıyla
 * (`prepTopicScopeLine`) yapılıyordu.
 *
 * Burada kod sayfayı konunun bölümüne daraltır: sayfadaki başlık satırları (`headingOfLine`, ders omurgasıyla aynı
 * tanım) hazırlığın konu adlarıyla eşlenir; öbür bir konunun başlığından sonraki metin, bu konunun başlığına (ya da
 * hiçbir konunun olmayan bir başlığa, aşağıda) kadar o konunundur ve kaynaktan çıkar. Hiçbir konunun adını taşımayan
 * başlık bulunduğu bölümün sahibine kalır ("sayfada kalan her şey bu konunundur"). Sayfa sonundaki şekil eki
 * (`Şekilde işaretli değerler:`) yalnız kalan metin o şekle ("Şekil N") gönderme yapıyorsa kalır.
 *
 * Kod metin yazmaz, yalnız keser; daraltma metnin çoğunu götürecekse (ya da konunun kendi metni çok kısaysa)
 * sayfalar olduğu gibi kalır. Eşleme `headingNamedIn` (konu haritası kapsamıyla aynı ölçü): konunun adı başlıkta
 * temsil ediliyor mu.
 */

/** Daraltmadan sonra konunun kendi metni en az bu kadar olmalı; yoksa sayfalar değişmez. */
export const TOPIC_SECTION_MIN_CHARS = 120;

const fold = (text: string) => text.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

/** Başlık satırı bu konunun adını taşıyor mu (konunun kelimelerinin çoğu ve en ayırt edici kelimesi başlıkta). */
export function headingNamesTopic(heading: string, topic: string): boolean {
  const title = topic.trim();
  if (!title || !heading.trim()) return false;
  return headingNamedIn(title, [heading.replace(/^\s*(?:\d{1,2}(?:\.\d{1,2})*\.?|[IVX]{1,4}[.)])\s+/u, "")]);
}

/** Hazırlığın öbür konuları (bu konunun adı ve boşlar çıkar, tekrar edenler bir kez). */
export function otherTopics(topic: string, siblings: readonly string[]): string[] {
  const own = fold(topic);
  return [...new Map(siblings.filter((other) => other.trim() && fold(other) !== own).map((other) => [fold(other), other.trim()])).values()];
}

/**
 * Yoldaki ve hazırlık sayfasındaki belgeli içerik: yalnız hazırlığın ÖBÜR konularının kısımları bölüm olmaz (30 Ekim
 * 2026, podcast; 6 Kasım 2026'dan beri ders ve konu testi de). Araçlar'da öğrenci konuyu kendisi yazdığı için dar kapsam
 * (`topicScopeLine`) doğru; hazırlıkta konu haritanın bir düğümü ve sayfasında kalan her şey onundur. Öbür konu yoksa
 * satır yok.
 */
export function prepTopicScopeLine(topic: string, siblings: readonly string[]): string {
  const title = topic.trim();
  const others = otherTopics(title, siblings).slice(0, 16);
  if (!title || !others.length) return "";
  return (
    `Öğrenci «${title}» konusunu çalışıyor. Hazırlıktaki şu konular ayrı adımlarda anlatılıyor: ` +
    `${others.map((other) => `«${other}»`).join(", ")}. KAYNAK sayfalarında onların kısımları da geçebilir: onları bölüm ` +
    "yapma, gerekirse bir cümleyle an. Sayfalarda kalan öbür bütün başlıklar bu konunun kapsamındadır; kaynağın bütün " +
    "noktalarını kapsama kuralı onlar için de geçerli."
  );
}

/**
 * Tek konulu sözlünün kapsam satırı (10 Kasım 2026). Sözlü, dersten farklı olarak sayfanın bütün noktalarını
 * kapsamak zorunda değildir; kural daha dardır: sorular yalnız seçilen konudan, hazırlığın öbür konularına geçilmez.
 * Öbür konu yoksa yalnız konunun adı söylenir.
 */
export function oralTopicScopeLine(topic: string, siblings: readonly string[]): string {
  const title = topic.trim();
  if (!title) return "";
  const others = otherTopics(title, siblings).slice(0, 16);
  return (
    `Öğrenci sözlü için YALNIZ «${title}» konusunu seçti. Bütün soruları, beklenen noktaları ve örnek cevapları yalnız bu ` +
    "konunun kapsamından yaz; kaynaktaki öbür ünite ya da alt başlıklara geçme." +
    (others.length
      ? ` Hazırlığın şu konuları bu sözlünün DIŞINDADIR, onlardan soru sorma: ${others.map((other) => `«${other}»`).join(", ")}.`
      : "")
  );
}

/** Ders omurgasından öbür konuların başlıkları çıkar (her alt başlık bir ekranda kuralı onları yazara dayatmasın). */
export function backboneWithoutSiblings(backbone: readonly string[], topic: string, siblings: readonly string[]): string[] {
  const others = otherTopics(topic, siblings);
  if (!others.length) return [...backbone];
  return backbone.filter((heading) => headingNamesTopic(heading, topic) || !others.some((other) => headingNamesTopic(heading, other)));
}

type Owner = "self" | "other";
type Page = { page: number; text: string; label?: string };

const FIGURE_NUMBER = /(?:şekil|sekil|figure|fig\.)\s*(\d{1,3})/giu;

function figureNumbers(text: string): Set<string> {
  return new Set([...text.matchAll(FIGURE_NUMBER)].map((match) => match[1]!));
}

/** Şekil eki: etiket satırından sayfa sonuna; "Şekil N:" satırları ayrı parça. */
function splitAppendix(text: string): { body: string; appendix: string[][] } {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trim() === FIGURE_APPENDIX_LABEL);
  if (at < 0) return { body: text, appendix: [] };
  const parts: string[][] = [];
  for (const line of lines.slice(at + 1)) {
    if (!parts.length || /^\s*(?:şekil|sekil|figure)\s*\d{1,3}\b/iu.test(line)) parts.push([line]);
    else parts[parts.length - 1]!.push(line);
  }
  return { body: lines.slice(0, at).join("\n"), appendix: parts };
}

/**
 * Konunun kendi bölümleri. Yardımcı (etiketli) sayfalara dokunulmaz. Sayfalarda öbür bir konunun başlığı yoksa ya da
 * daraltma konunun metnini {@link TOPIC_SECTION_MIN_CHARS} altına indirecekse sayfalar olduğu gibi döner.
 */
export function narrowPagesToTopic<T extends Page>(
  pages: readonly T[],
  topic: string,
  siblings: readonly string[],
): { pages: T[]; narrowed: boolean; dropped: string[] } {
  const unchanged = { pages: [...pages], narrowed: false, dropped: [] as string[] };
  const others = otherTopics(topic, siblings);
  if (!others.length || !topic.trim()) return unchanged;
  const own = pages.filter((page) => !page.label);
  const classify = (line: string): Owner | "neutral" | null => {
    const heading = headingOfLine(line, { allowShort: true });
    if (!heading) return null;
    if (headingNamesTopic(heading, topic)) return "self";
    return others.some((other) => headingNamesTopic(heading, other)) ? "other" : "neutral";
  };
  const lines = own.flatMap((page) => splitAppendix(page.text).body.split("\n"));
  const kinds = lines.map(classify);
  if (!kinds.includes("other")) return unchanged;
  // Konunun kendi başlığı hiç yoksa (harita konuya başlıktan başka bir ad vermiş), hiçbir konunun olmayan başlık
  // bu konunundur; varsa adsız başlık bulunduğu bölümün sahibine kalır (alt bölüm).
  const selfNamed = kinds.includes("self");
  let owner: Owner = "self";
  const dropped: string[] = [];
  let keptChars = 0;
  let totalChars = 0;
  const narrowed = pages.map((page) => {
    if (page.label) return page;
    const { body, appendix } = splitAppendix(page.text);
    const kept: string[] = [];
    for (const line of body.split("\n")) {
      const kind = classify(line);
      if (kind === "self" || kind === "other") owner = kind;
      else if (kind === "neutral" && !selfNamed) owner = "self";
      if (kind === "other") dropped.push(headingOfLine(line, { allowShort: true }) ?? line.trim());
      totalChars += line.trim().length;
      if (owner === "self") {
        kept.push(line);
        keptChars += line.trim().length;
      }
    }
    const keptText = kept.join("\n").trim();
    const cited = figureNumbers(keptText);
    const figures = appendix.filter((part) => {
      const numbers = figureNumbers(part[0] ?? "");
      return !numbers.size || [...numbers].some((number) => cited.has(number));
    });
    const text = [keptText, figures.length ? [FIGURE_APPENDIX_LABEL, ...figures.flat()].join("\n") : ""]
      .filter(Boolean)
      .join("\n\n");
    return { ...page, text };
  });
  if (keptChars < TOPIC_SECTION_MIN_CHARS || keptChars === totalChars) return unchanged;
  return { pages: narrowed.filter((page) => page.label || page.text.trim()), narrowed: true, dropped };
}
