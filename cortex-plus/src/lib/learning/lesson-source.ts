/**
 * Ders gövdesinin sonuna eklenmiş "Kaynak: dosya, s.N" künyesini ayırma.
 *
 * Küçük ve bağımsız tutuluyor: hem sunucudaki ders üretim/onarım hattı
 * (lesson-teach.ts) hem de istemcideki ders ekranı (exam-lesson-steps.tsx)
 * bunu kullanıyor. İkincisi "use client" olduğu için burada
 * lesson-teach.ts'in geri kalanını (kaynak doğrulama, akıcılık onarımı vb.)
 * pakete taşımamak için ayrı dosyada duruyor.
 */

// Global (değil yalnızca sonda-çapalı): attachCitations() bir bölüme künye
// ekler, weaveUnusedSources() AYNI (son) bölümün sonuna ikinci bir cümle +
// ikinci bir künye daha ekleyebilir — o zaman ilk künye artık gövdenin
// ORTASINDA kalır. Yalnızca sona bakan bir desen bu ikinci durumda ilk
// künyeyi gövdede bırakırdı.
const INLINE_SOURCE_RE = /\s*Kaynak\s*:\s*([^,\n]+?)\s*,\s*s\.?\s*(\d+)(?:\s*[-–]\s*\d+)?\.?/gi;

export type InlineSource = { file: string; page?: number };

/**
 * Ekranda öğrenci konuyu okurken teknik künyeyi görmemeli — o bilgi küçük
 * bir "Kaynak" rozetine taşınır. Bu, hem yeni üretimin gövdeye künye
 * yazmasına karşı bir güvenlik ağı hem de bu değişiklikten önce üretilip
 * künyesi gövdeye gömülü kaydedilmiş eski derslerin aynı rozeti göstermesini
 * sağlayan tek mekanizma — geriye dönük veri taşıması yapılmıyor, künye
 * render/hazırlama anında ayrıştırılıyor.
 *
 * Gövdede birden fazla künye varsa hepsi metinden çıkarılır; rozet en
 * sonuncusunu (bölümün en güncel/atıfta bulunulan sayfası) gösterir.
 */
export function stripInlineSourceLine(
  body: string,
): { body: string; source: InlineSource | null } {
  let source: InlineSource | null = null;
  const cleaned = body.replace(INLINE_SOURCE_RE, (_full, rawFile: string, rawPage: string) => {
    const file = rawFile.trim().replace(/["'.]+$/, "");
    if (!file) return " ";
    const page = Number(rawPage);
    source = { file, page: Number.isFinite(page) ? page : undefined };
    return " ";
  });
  if (!source) return { body, source: null };
  return { body: cleaned.replace(/\s{2,}/g, " ").trim(), source };
}
