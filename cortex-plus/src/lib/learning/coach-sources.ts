import { capPassages } from "@/lib/ai/teacher-tutor";
import { sourceRulesBlock } from "@/lib/learning/source-rules";
import { SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";

/**
 * Test içi eğitmen kaynağı (6 Kasım 2026, canlı telefon denetiminde bulundu). Eğitmen hazırlığın belgelerini hiç
 * görmüyordu: ders notun "bir sabit şu değerle alınacak" kuralını uyguladı, aynı konunun testindeki eğitmen genel
 * bilgideki yaklaşık değeri söyledi. Artık ana hazırlık sohbetiyle aynı okuyucudan (`loadPrepChatGrounding`) gelen
 * pasajlar, notun özel kuralları (`loadSourceRules`) ve kaynak sayı önceliği (`SOURCE_NUMBER_PRIORITY`) istemde.
 */
export const COACH_PASSAGE_CHARS = 4_000;

/** Eğitmenin sistem iletisine eklenen sabit kural (belgeli hazırlıkta). */
export const COACH_SOURCE_RULE =
  `${SOURCE_NUMBER_PRIORITY} Öğrencinin hazırlığına yüklenmiş not, el notu ve belge pasajları istemde; cevaptaki ` +
  "tanım, sayı, sabit ve kural önce onlardan gelir. Notta olmayan bilgiyi genel bilgiyle tamamlayabilirsin ama notla çelişme.";

/** Eğitmenin istemindeki kaynak bloğu: notun kuralları, sonra pasajlar (bütçeyle). */
export function coachSourceBlock(input: {
  rules: readonly string[];
  passages: { label: string; text: string }[];
  curriculum?: boolean;
}): string {
  const passages = capPassages(input.passages, COACH_PASSAGE_CHARS);
  return [
    input.curriculum ? "" : sourceRulesBlock(input.rules),
    passages.length
      ? `${input.curriculum ? "MÜFREDAT DERSİ PASAJLARI" : "ÖĞRENCİNİN NOTLARINDAN PASAJLAR"}:\n${passages
          .map((item) => `[${item.label}]\n${item.text.trim()}`)
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
