/**
 * "Sırada ne var" listesi (2 Kasım 2026): her satırda yinelenen "9. Sınıf · " gibi ortak ön ek bir kez
 * yazılır, aynı satır iki kez görünmez. Ön ek tüm satırlarda aynıysa `prefix` olarak döner.
 */
export function dedupePathLabels(items: readonly string[]): { prefix: string | null; items: string[] } {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  if (unique.length < 2) return { prefix: null, items: unique };
  const heads = unique.map((item) => {
    const at = item.indexOf(" · ");
    return at > 0 ? item.slice(0, at) : null;
  });
  const first = heads[0];
  if (!first || heads.some((head) => head !== first)) return { prefix: null, items: unique };
  const rest = unique.map((item) => item.slice(first.length + 3).trim()).filter(Boolean);
  return { prefix: first, items: [...new Set(rest)] };
}

/** "9. Sınıf" gibi yalnız sınıf düzeyi olan parça: kart başlığında konunun yerine geçmez. */
export function isGradeOnlyLabel(part: string): boolean {
  return /^\d{1,2}\.\s?sınıf$/i.test(part.trim().replace(/İ/g, "i").replace(/I/g, "ı"));
}

/** "9. Sınıf · Konu" → ["Konu"]; sınıf parçası atılır (hepsi sınıfsa olduğu gibi kalır). */
export function withoutGradeParts(parts: readonly string[]): string[] {
  const kept = parts.filter((part) => !isGradeOnlyLabel(part));
  return kept.length ? kept : [...parts];
}

/**
 * Başındaki MEB kazanım kodu ("T.O.5.5 Metinde geçen …" → "Metinde geçen …"). 8 Kasım 2026: hazır müfredattan kurulan
 * hazırlıkta yol başlıkları ve "Sıradaki" kartı ham kodla başlıyordu; kod öğrenciye bir şey anlatmıyor. Yalnız
 * harf ve noktalarla başlayıp sayıyla biten kod silinir ("9. Sınıf", "T.C. Anayasası", "M.Ö. 3000" dokunulmaz);
 * koddan sonra metin yoksa olduğu gibi kalır.
 */
export function withoutOutcomeCode(label: string): string {
  const stripped = label.replace(/^[A-ZÇĞİÖŞÜ]{1,4}(?:\.[A-ZÇĞİÖŞÜ0-9]{1,4})*\.\d+(?:\.\d+)*\.?\s+(?=\S)/u, "");
  return stripped.trim() ? stripped : label;
}

/** "9. Sınıf · Konu" → "Konu": sınıf düzeyi bağlam olarak bir kez yazılır, etiket yalnız konudur. */
export function topicOnlyLabel(label: string): string {
  return withoutGradeParts(label.split(" · ").map((part) => withoutOutcomeCode(part.trim()))).join(" · ");
}

/** "9. Sınıf · Konu" → "9. Sınıf"; sınıf parçası yoksa null. */
export function gradeOfLabel(label: string): string | null {
  return label.split(" · ").map((part) => part.trim()).find((part) => isGradeOnlyLabel(part)) ?? null;
}
