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
  "Dosya adı, sınav kodu, 'Konu Anlatımı', 'Ders Notu', 'PDF', sayfa ya da ünite numarası yazma. " +
  'Yalnızca JSON döndür: {"title":"…"}';

export function prepTitleUserPrompt(input: { subject?: string | null; topics: string[] }): string {
  return [
    input.subject ? `Ders: ${input.subject}` : "",
    "Ana konular:",
    ...input.topics.slice(0, 15).map((topic, index) => `${index + 1}. ${topic}`),
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
