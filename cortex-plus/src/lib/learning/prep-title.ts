import { topicTitleIssues } from "@/lib/documents/topic-title";
import { calmHeading } from "@/lib/learning/teacher-lesson";

/**
 * Hazırlığın adı içerikten (3 Ekim 2026). Astra aynı KPSS kitabına
 * "Vatandaşlık ve Hukukun Temel Kavramları" diyor; biz dosya adına düşüp
 * "KPSS Vatandaslik Konu Anlatimi" yazıyorduk (Türkçe harfsiz). Ad, ana
 * konuların listesinden tek bir kısa model çağrısıyla yazılır; geçmezse
 * kapak / ortak baş / dosya adı yedeği kalır.
 */
export const PREP_TITLE_SYSTEM =
  "Bir öğrencinin sınav hazırlığına ad veriyorsun. Sana hazırlığın ana konuları verilir. Hazırlığın kapsamını " +
  "3-7 kelimeyle söyleyen, Türkçe yazımı doğru bir başlık yaz (ör. 'Üslü Sayılar ve Uygulamaları', " +
  "'Vatandaşlık ve Hukukun Temel Kavramları', 'Zemin Mekaniği Temelleri'). Normal yazım; BÜYÜK HARF değil. " +
  "Üniteler verildiyse başlık hepsini kapsar, ilk birkaçını değil (on sistemi anlatan not 'İnsan Fizyolojisi' " +
  "olur, 'Sinir ve Endokrin Sistemleri' değil). " +
  "Dosya adı, sınav kodu, 'Konu Anlatımı', 'Ders Notu', 'PDF', sayfa ya da ünite numarası yazma. " +
  'Yalnızca JSON döndür: {"title":"…"}';

/** İstemdeki en çok konu sayısı. */
const TITLE_TOPIC_MAX = 15;

/**
 * Listenin tamamına yayılan en çok `max` konu (baştan, sondan ve aradan eşit aralıkla). 24 Ekim 2026 lansman
 * testi: beş belgeli 10 sistemlik hazırlık (32 konu) "Sinir, Endokrin ve Duyu Sistemleri" adını aldı; istem
 * yalnız ilk 15 konuyu taşıyordu ve onlar ilk üç sistemdi.
 */
export function spreadTopics(topics: readonly string[], max = TITLE_TOPIC_MAX): string[] {
  if (topics.length <= max) return [...topics];
  return Array.from({ length: max }, (_, i) => topics[Math.round((i * (topics.length - 1)) / (max - 1))]!);
}

export function prepTitleUserPrompt(input: { subject?: string | null; topics: string[]; units?: string[] }): string {
  const units = (input.units ?? []).map((unit) => unit.trim()).filter(Boolean);
  const byUnit = units.length >= 2;
  return [
    input.subject ? `Ders: ${input.subject}` : "",
    byUnit ? "Üniteler (hazırlığın bütün kapsamı):" : "",
    ...(byUnit ? units.slice(0, 20).map((unit, index) => `${index + 1}. ${unit}`) : []),
    byUnit ? "Örnek konular:" : "Ana konular:",
    ...spreadTopics(input.topics).map((topic, index) => `${index + 1}. ${topic}`),
  ]
    .filter(Boolean)
    .join("\n");
}

const FILE_LIKE = /\.(pdf|docx?|pptx?)\b|konu anlat[ıi]m|ders not|\bsayfa\b|\büniteler?\b|\bpdf\b/i;

/** Modelin önerdiği ad; geçersizse null (çağıran yedeğe döner). */
export function prepTitleFromModel(raw: unknown): string | null {
  const title = typeof (raw as { title?: unknown } | null)?.title === "string" ? (raw as { title: string }).title : "";
  const clean = calmHeading(title.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”.]+$/g, "").trim());
  const words = clean.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 9 || clean.length > 70) return null;
  if (FILE_LIKE.test(clean) || topicTitleIssues(clean).length) return null;
  return clean;
}
