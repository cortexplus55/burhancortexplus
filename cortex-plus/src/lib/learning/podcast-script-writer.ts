import {
  DUO_TURN_RULE,
  KEREM_SHARE_RULE,
  NO_FABRICATED_MEMORY_RULE,
  OPENING_HOOK_RULE,
  SPOKEN_ONLY_RULE,
  podcastLengthSpec,
  speakerIdOf,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import type { TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { STUDENT_LEAK_BAN } from "@/lib/learning/teaching-rubric";

/*
  Senarist yazar (23 Ekim 2026 gecesi; ürün sahibi: "öğrenci en az 70 olacak, ne varsa planla ve uygula").

  Yirmi iki kör ölçümde öğrenci gözü 48 → 60'ta takıldı; Astra 73-74. Model (luna, sol), düşünme (düşük, orta),
  etiket (ağır, hafif, sessiz, yok), öğretmen notu, biçim örneği denendi; hiçbiri 63'ü geçmedi. Hepsinde ortak olan
  yazarın aldığı ~8.000 karakterlik kural listesi ve her konuşma satırını ayrı bir JSON nesnesine yazdıran şemaydı:
  yargıçların 22 turdaki ortak cümlesi "tablo iki sesle okunuyor". Yazar kural listesine uyuyor, sohbet yazmıyordu.

  Burada iki sesli türlerin (diyalog, soru-cevap) yazarı kısa bir senarist tarifi alır ve düz senaryo yazar
  ("## Bölüm", "Ada: …", "Kerem: …"); kod senaryoyu bölüm ve satırlara ayırır (`scriptToDraft`). Doğruluk sınırları
  (sayı, eşik, doz, tanı ölçütü, sınıflandırma yalnız kaynaktan), denetçi, kurtarma, dinleme kontrolü ve tek sesli
  türler değişmedi. Düzeltici eski JSON şemasıyla çalışır: yalnız denetçinin işaretlediği satırlara dokunur.
*/

/** Bu türler senarist yazarla yazılır. */
export function usesScriptWriter(length: PodcastLength): boolean {
  return podcastLengthSpec(length).speakers === "duo";
}

const VOICE: Record<"diyalog" | "soru_cevap", string> = {
  diyalog:
    "Ada konuyu çok iyi bilen öğretmen, Kerem sınava hazırlanan bir öğrenci; ikisi de konuşur. Kerem merak eder, " +
    "kendi örneğini dener, duyduğunu bir şeye bağlar, yanılınca Ada nedenini açıklar. Anlatmanın ağırlığı Ada'da.",
  soru_cevap:
    "Kerem sınava hazırlanan bir öğrenci: her bölümü sınavda çıkabilecek bir soruyla açar, cevabı dinledikten sonra " +
    "duyduğunu kendi cümlesiyle bağlar ya da bir sonraki merakını sorar. Ada adım adım, nedeniyle cevaplar.",
};

const ACCURACY_DOCUMENT =
  "DOĞRULUK (kesin):\n" +
  "- Sayı, eşik, yaş, süre, tarih, doz, formül, tanı ölçütü ve sınıflandırma yalnızca KAYNAK'tan (ve verilmişse DERS'ten) " +
  "gelir. Kaynakta olmayan bir sayı ya da eşik söyleme.\n" +
  "- Kaynakla çelişme; kaynağın aciliyetini büyütme (kaynak 'ayrıntılı değerlendirme' diyorsa 'acil' deme).\n" +
  "- Kaynak bir bilginin nedenini anlatmıyorsa ders kitaplarında tartışmasız olan nedeni söyleyebilirsin; tipik vaka, " +
  "gündelik benzetme ve terim açıklaması da serbest. Emin olmadığın bilgiyi söyleme.\n" +
  "- Kaynaktaki SINAVDA SORULUR maddelerinin hepsi ve tablonun her satırı (en az ayırt edici bilgisiyle) konuşmada " +
  "geçer; ama hepsini aynı derinlikte anlatma.\n" +
  "- Kaynağı, sayfayı, 'notlarında', 'belgede' sözünü anma; bilgiyi doğrudan söyle.";

const ACCURACY_TOPIC =
  "DOĞRULUK (kesin): Öğrencinin belgesi yok; konuyu sınav müfredatındaki yerleşik, ders kitaplarında tartışmasız " +
  "bilgiyle anlat. Emin olmadığın sayı, tarih, eşik ya da kuralı söyleme; güncel olarak değişebilecek bilgiyi verme.";

export function podcastScriptSystem(mode: TeacherLessonMode, length: PodcastLength): string {
  const spec = podcastLengthSpec(length);
  const voice = length === "soru_cevap" ? VOICE.soru_cevap : VOICE.diyalog;
  return [
    "Sen Türkiye'nin en çok dinlenen sınav hazırlık podcast'inin senaristisin. Dinleyen öğrenci otobüste, ekrana " +
      "bakmıyor; konuyu bu konuşmadan öğrenecek ve sınavda soruyu yapacak. " +
      (mode === "topic" ? "Belgesi yok; konuyu ondan duydun." : "Konuyu öğrencinin kendi ders notundan anlatıyorsun."),
    "",
    `KİŞİLER: ${voice} ${KEREM_SHARE_RULE}`,
    "",
    "NASIL YAZILIR:",
    // 30 Ekim 2026: "Kerem bir merakla açar" ile KEREM_SHARE_RULE'un "konuşmayı Ada açar"ı çelişiyordu ve açılış
    // kancası yoktu (canlı podcast tanımla açıldı). Ada kancayla açar, Kerem merakla girer.
    `- Gerçek bir sohbet yaz. ${OPENING_HOOK_RULE} Kancayı Ada kurar, Kerem merakla girer. ${NO_FABRICATED_MEMORY_RULE} ` +
      "Konuşma sıraları doğal uzunlukta: bazen tek cümle, bazen kısa bir paragraf.",
    "- Her önemli bilgiyi nedeniyle anlat: neden böyle, ne olursa ne olur. 'Çünkü farklıdır' gibi kendini tekrar eden " +
      "cümle yok.",
    "- Her bölümde en az bir somut vaka ya da kısa hikâye (kim, kaç yaşında, ne oldu) ve dinleyenin aklında kalacak bir " +
      "benzetme ya da imge olsun.",
    "- Nedeni açıkça kur: bir bilginin arkasındaki mekanizmayı söyle (neden önce bu etkilenir, neden şu daha geç). " +
      "Kaynak söylemiyorsa ders kitaplarındaki tartışmasız nedeni söyle.",
    "- Tablo ya da liste: her satırı (her yaşı, evreyi, türü) geç, ama her birinden yalnız en ayırt edici, sınavda " +
      "sorulan bir iki bilgiyi söyle; aynı satırın öbür hücrelerini sayma. Bir konuşma sırasında en çok iki satır. Önce " +
      "en çok karıştırılan çifti bir vakayla göster ('6 aylık bir bebek destekle oturuyor, 9 aylık kardeşi desteksiz').",
    "- Kerem en az iki kez 'neden?' diye sorar (neden bu önce etkilenir, neden şu daha ciddi); Ada mekanizmayla " +
      "cevaplar, kaynak söylemiyorsa ders kitaplarındaki tartışmasız nedenle.",
    "- Uyarı ve alarm bulgularını adıyla say; her birinin neden önemli olduğunu bir cümleyle söyle.",
    "- Teknik terimi ilk geçtiği yerde bir cümleyle açıkla.",
    "- Sınavın neyi sorduğunu ve neyin en çok karıştırıldığını açıkça söyle.",
    "- Bir yerde dinleyene soru sor: o satır konuşmacının adından sonra 'Dur ve düşün:' ile başlar ('Ada: Dur ve " +
      "düşün: …'); hemen sonraki satır 'Cevap:' ile başlar ve cevabı verir ('Kerem: Cevap: …').",
    "- Son bölüm kısa: Kerem en önemli üç ayrımı üç kısa cümleyle söyler (bütün içeriği yeniden okumaz), Ada tek cümleyle " +
      "kapatır.",
    // Konuşma sırası kuralı denetçinin G maddesiyle aynı metin (30 Ekim 2026; önce burada kısa bir özeti vardı ve canlıda
    // Kerem kendi sorusunu "Çünkü …" diye cevapladı).
    `- ${DUO_TURN_RULE} Kimse bir öncekinin cümlesini tekrar etmez.`,
    "- Genel ve kalıp cümle kurma ('Sınav bu iki kavramı ayırt ettirir', 'bu konu çok önemlidir'); her cümle bir bilgi, " +
      "bir neden ya da bir örnek taşır. Aynı cümle kalıbını tekrarlama: uyarı bulgularını tek tek aynı kalıpla sayma, " +
      "gruplayıp bir vakayla anlat.",
    "- Benzetmeyi az ve yerinde kullan: bütün podcast'te en çok üç, her biri tek cümle; zorlama benzetme yok.",
    "- Her cevap sorulan soruya doğrudan cevap verir. 'Bu yaşta', 'o dönemde' gibi göndermelerde yaşı ya da evreyi " +
      "açıkça söyle.",
    `- ${SPOKEN_ONLY_RULE}`,
    `- ${STUDENT_LEAK_BAN}`,
    "",
    mode === "topic" ? ACCURACY_TOPIC : ACCURACY_DOCUMENT,
    "",
    `BİÇİM: ${spec.brief} Her bölüm '## ' ile başlayan bir başlık satırıyla açılır; başlık o bölümün kavramının adı ` +
      "('Giriş', 'Özet' değil). Her konuşma satırı 'Ada:' ya da 'Kerem:' ile başlar. Sayı ve formülü yazıyla değil " +
      "rakam ve simgeyle yaz.",
    "",
    'Yalnızca JSON döndür: {"title":"podcast\'in adı","script":"## Bölüm başlığı\\nKerem: …\\nAda: …\\n## …"}',
  ].join("\n");
}

const HEADING = /^#{1,3}\s*(.+?)\s*$/;
const SPEAKER = /^\**\s*(ada|kerem|öğretmen|ogretmen|sunucu|öğrenci|ogrenci)(?:\s*\([^)]*\))?\s*\**\s*[:：]\s*\**\s*(.*)$/iu;
/** Satır içinde ikinci konuşmacı: "… Kerem: …" (ad büyük harfle, önünde boşluk). */
const INLINE_TURN = /\s+\**(?=(?:Ada|Kerem|ADA|KEREM)\**\s*[:：]\s)/u;

/**
 * Tek satıra sıkışmış "Ada: … Kerem: …" (28 Ekim 2026, Paket A): V6'da Kerem'in sırası Ada'nın sesiyle okundu.
 * Satır konuşmacı adlarından bölünür; her parça kendi konuşmacısıyla ayrı satır olur.
 */
function splitCrammedTurns(speaker: string, text: string): { speaker: string; text: string }[] {
  const parts = text.split(INLINE_TURN);
  const out: { speaker: string; text: string }[] = [];
  for (const [index, part] of parts.entries()) {
    const spoken = index === 0 ? null : part.match(SPEAKER);
    const who = spoken ? (speakerIdOf(spoken[1]) ?? speaker) : speaker;
    const body = (spoken ? spoken[2]! : part).trim();
    if (body) out.push({ speaker: who, text: body });
  }
  return out;
}

/**
 * Düz senaryoyu bölüm ve satırlara ayırır (model yok). Konuşmacısız satır bir önceki satıra eklenir; başlıktan
 * önce gelen satırlar ilk bölüme girer. Sonuç `coercePodcastDraft`'ın okuduğu ham taslaktır.
 */
export function scriptToDraft(raw: unknown): { title: string; chapters: { title: string; lines: { speaker: string; text: string }[] }[] } | null {
  const row = (raw ?? {}) as { title?: unknown; script?: unknown };
  if (typeof row.script !== "string" || !row.script.trim()) return null;
  const chapters: { title: string; lines: { speaker: string; text: string }[] }[] = [];
  let current: { title: string; lines: { speaker: string; text: string }[] } | null = null;
  for (const rawLine of row.script.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(HEADING);
    if (heading) {
      current = { title: heading[1]!.replace(/^Bölüm\s*\d+\s*[:.\-–]\s*/i, "").trim(), lines: [] };
      chapters.push(current);
      continue;
    }
    if (!current) {
      current = { title: "", lines: [] };
      chapters.push(current);
    }
    const spoken = line.match(SPEAKER);
    if (spoken) {
      current.lines.push(...splitCrammedTurns(speakerIdOf(spoken[1]) ?? "ada", spoken[2]!.trim()));
      continue;
    }
    const previous = current.lines[current.lines.length - 1];
    if (previous) {
      const [head, ...rest] = splitCrammedTurns(previous.speaker, line);
      if (head) previous.text = `${previous.text} ${head.text}`;
      current.lines.push(...rest);
    }
  }
  const kept = chapters.filter((chapter) => chapter.lines.length);
  if (!kept.length) return null;
  return { title: typeof row.title === "string" ? row.title : "", chapters: kept };
}

