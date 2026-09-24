/**
 * Bir sınav hazırlığının içeriği NEREYE dayanacak?
 *
 * Üç hâl var ve aralarındaki fark ürün kararı:
 *
 *   "documents_only"   — yalnızca öğrencinin seçtiği belge. Belgede olmayan
 *                        bilgi derse girmez.
 *   "allow_supporting" — önce belge; belgenin yetmediği yeri genel bilgi
 *                        tamamlar, ama belgeyle çelişemez.
 *   "topic_only"       — belge yok. İçerik modelin genel bilgisinden gelir ve
 *                        öğrenciye bunun kendi belgesinden GELMEDİĞİ açıkça
 *                        söylenir.
 *
 * Değişmez kural: **"yalnızca belgeye dayan" demek için ortada BELİRLİ bir
 * belge olmalı.**
 *
 * Bu kural boşuna yazılmadı. Belgesiz kurulan hazırlıkta kaynak sınırı
 * `documents_only`de kalıyor, arama ise belge seçili olmadığı için öğrencinin
 * BÜTÜN belgelerinde yapılıyordu. Sonuç: geçen ay biyoloji notu yüklemiş bir
 * öğrenci belgesiz "Trigonometri" hazırlığı kurduğunda, o biyoloji notundan
 * benzerlik eşiğini geçen bir parça yakalanırsa derse "YALNIZCA bu alıntılara
 * dayan" talimatı gidiyordu. Hiçbir şey çökmüyor — ders sessizce yanlış
 * kaynağa bağlanıyor.
 *
 * Bu yüzden belge seçili değilse kaynak araması hiç yapılmaz: konudan
 * çalışılır ve öğrenci bunu bilir.
 */

export type PrepSourceMode = "documents_only" | "allow_supporting" | "topic_only";

export function resolvePrepSourceMode(input: {
  documentId: string | null | undefined;
  /** Belgenin kendi ayarı; belge yoksa dikkate alınmaz. */
  documentBoundary?: "documents_only" | "allow_supporting" | null;
}): PrepSourceMode {
  if (!input.documentId) return "topic_only";
  return input.documentBoundary === "allow_supporting"
    ? "allow_supporting"
    : "documents_only";
}

/** Belge seçili olmayan hazırlıkta kaynak araması yapılmaz. */
export function shouldSearchSources(
  mode: PrepSourceMode,
): mode is "documents_only" | "allow_supporting" {
  return mode !== "topic_only";
}

/**
 * Belgesiz dersin çiti.
 *
 * Sohbete "belgede yoksa cevap verme" kuralını koyduk; o kural belgeye bağlı.
 * Belgesiz derste içinde kalınacak bir belge yok, yani o çit boşa düşüyor.
 * Yerine geçen çit daha dar üç şeye bağlanıyor: konu başlığı, sınav türü ve
 * hazırlığın adı. Model bu üçünün dışına çıkamaz.
 *
 * Etiket ayrıca öğrenciye dönük: içeriğin kendi belgesinden gelmediğini
 * gizlemek, "notumda bu varmış" yanılgısının ta kendisi olurdu.
 */
export function topicFence(input: {
  topic: string;
  examTitle?: string | null;
  examType?: string | null;
}): string {
  const scope = [input.examTitle?.trim(), input.examType?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    "\n\nKAYNAK: Bu hazırlıkta öğrencinin yüklediği bir belge YOK. " +
    "İçerik senin genel bilginden gelecek; bu yüzden çit konunun kendisi.\n" +
    `1) Kapsam tam olarak şu: "${input.topic}"` +
    (scope ? ` (${scope}).` : ".") +
    " Bu başlığın dışına çıkma: yan konuya, ileri seviyeye ya da ilgisiz " +
    "örneğe kayma. Konuya girmeyen bir şey aklına gelirse yazma.\n" +
    "2) Seviyeyi hazırlığın sınav türüne göre tut. Emin değilsen lise " +
    "seviyesinde kal; üniversite düzeyi türetme ve ispat ekleme.\n" +
    "3) Tartışmalı, kaynaktan kaynağa değişen ya da emin olmadığın bir " +
    "iddiayı YAZMA. Yerine konunun herkesçe kabul edilen çekirdeğinde kal.\n" +
    "4) Sayı, tarih, formül ve eşik uyduma. Bir değeri kesin bilmiyorsan " +
    "o değeri vermek yerine bağıntıyı anlat.\n" +
    "5) Belgeye atıf yapma: [Sayfa N] ya da \"notunda geçtiği gibi\" gibi " +
    "ifadeler kullanma — ortada belge yok, öğrenciyi yanıltır.\n"
  );
}

/** Öğrenciye gösterilen etiket — içeriğin nereden geldiğini saklamıyoruz. */
export const TOPIC_ONLY_NOTICE =
  "Bu içerik yüklediğin bir belgeden değil, konunun genel bilgisinden hazırlandı.";

/**
 * Hazırlığın belgelerini tek listeye indirger.
 * `source_document_ids` doluysa o liste geçerlidir; boşsa eski tek belge.
 */
export function prepSourceDocumentIds(input: {
  documentId?: string | null;
  sourceDocumentIds?: readonly string[] | null;
}): string[] {
  const listed = (input.sourceDocumentIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  const unique = [...new Set(listed)];
  if (unique.length) return unique;
  return input.documentId ? [input.documentId] : [];
}

/** Materyaller sekmesindeki tür satırı. Sayfa sayısı yoksa yalnızca tür. */
export function materialKindLabel(input: {
  mimeType?: string | null;
  pageCount?: number | null;
}): string {
  const mime = (input.mimeType ?? "").toLowerCase();
  const kind =
    mime.includes("pdf")
      ? "PDF"
      : mime.includes("word") || mime.includes("officedocument.word")
        ? "Word"
        : mime.includes("presentation") || mime.includes("powerpoint")
          ? "Sunum"
          : mime.startsWith("image/")
            ? "Görsel"
            : "Belge";
  if (typeof input.pageCount === "number" && input.pageCount > 0) {
    return `${kind} · ${input.pageCount} sayfa`;
  }
  return kind;
}
