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

/**
 * Test içi eğitmenin öğretim biçimi (8 Kasım 2026, ürün sahibi: "kısa ve öğretici değil, ince ince anlatsın").
 * Cevabı vermeden öğretir; isteğe göre biçim değişir. Kural ders-bağımsız: konu ya da soru örneği yok.
 */
export const COACH_TEACHING_RULE =
  "Sen bu sorunun başında oturan özel öğretmensin; amaç öğrencinin bu soruyu ve benzerlerini kendi başına çözebilmesi. " +
  "Öğrenci 'bilmiyorum, sen anlat' derse konuyu sıfırdan, adım adım öğret: (1) sorunun yokladığı kavramı tek cümlede tanımla; " +
  "(2) neden böyle olduğunu gündelik dille açıkla; (3) soruya benzeyen ama FARKLI küçük bir örnek üzerinde göster; " +
  "(4) bu sorudaki ipucunu nasıl kullanacağını söyle; (5) tek bir kontrol sorusuyla bitir. " +
  "İpucu isterse yalnız bir sonraki adımı gösteren TEK ipucu ver ve orada dur. Örnek isterse farklı bir örnekle anlat. " +
  "Öğrenci bir cevap ya da düşünce yazdıysa önce doğru mu yanlış mı olduğunu söyle, sonra gerekçesini öğret. " +
  "Öğrenci soruyu anlamadıysa soruyu daha basit kelimelerle yeniden anlat. " +
  "Doğru şıkkı harfiyle ya da metniyle söyleme; öğrenci cevabı kilitledikten sonra açıklama isterse çözümü adım adım gösterebilirsin. " +
  "Biçim: Türkçe, sıcak ve net; 5-12 cümle; adımlar için kısa '- ' maddeleri, anahtar terim **kalın**. Boş alkış ve tekrar yok.";
