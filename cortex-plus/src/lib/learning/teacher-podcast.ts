import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { STUDENT_LEAK_BAN } from "@/lib/learning/teaching-rubric";
import {
  coercePodcastDraft,
  keremShare,
  podcastBelowFloor,
  podcastScriptText,
  podcastTurnCount,
  podcastWordCount,
  type PodcastEpisode,
} from "@/lib/learning/podcast-episode";
import {
  DUO_NARRATOR_SCHEMA,
  DUO_TURN_RULE,
  FABRICATED_MEMORY,
  NO_FABRICATED_MEMORY_RULE,
  KEREM_SHARE_MAX,
  KEREM_SHARE_MIN,
  SPOKEN_ONLY_RULE,
  podcastDuoBrief,
  podcastLengthSpec,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { SINGLE_NARRATOR_SCHEMA, podcastNarrationBrief } from "@/lib/learning/teacher-brain";
import { isScaffoldHeading } from "@/lib/learning/teaching-standards";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { parseIssues, sourceText, type TeacherIssue, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { examPointsBlock } from "@/lib/learning/exam-points";
import { podcastScriptSystem, scriptToDraft, usesScriptWriter } from "@/lib/learning/podcast-script-writer";

/**
 * Öğretmen podcast motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik
 * yeni motora). Ders motorunun aynası: temiz çekirdek sayfalar (ve varsa
 * aynı konunun denetlenmiş dersi) → tek öğretmen istemi → belgeyle eşleme →
 * modelin düzeltmesi. Kod metne bir şey EKLEMEZ, cümle silmez; yalnız
 * gösterim/seslendirme biçimine çevirir (H₂O → "H iki O") ve denetler.
 *
 * Eski yol (podcast-episode.ts → generatePodcastEpisode) taslağı
 * repairTurkishSurface + repairQuantitative ile değiştiriyor, tutmayan
 * satırları dropLines ile siliyordu.
 */

export type TeacherPodcastInput = {
  topicLabel: string;
  prepTitle: string;
  pages: { page: number; text: string }[];
  mode?: TeacherLessonMode;
  length: PodcastLength;
  /** Aynı konunun öğretmen motorundan geçmiş dersi (özet metni); varsa podcast onun sesli hâli. */
  lessonText?: string;
  /** Müfredat ağırlığı / kapsam satırı; yoksa boş. */
  syllabusLine?: string;
  learnerLine?: string;
  /** Öğretmen analizinin "Sınavda sorulur" maddeleri (18 Ekim 2026). */
  examPoints?: string[];
  runningHeaders?: string[];
};

/*
  Ders kitabı bilgisi etiketsiz (23 Ekim 2026, ürün sahibinin kararı: "etiketsiz bilgi eklemek öğrenci tarafından bizi o
  seviyeye taşıyacaksa onu da yapalım"). Yirmi bir kör ölçümde öğrenci gözü 58 / 73'te kaldı; yargıçların ortak cümlesi
  Astra'nın nedeni, tipik vakayı ve benzetmeyi ders kitabından katıp rahat bir sohbet kurduğuydu. Etiket (önce ağır,
  sonra hafif ve seste okunmayan) yazarı çekingen bıraktı. Sınır aynı kaldı: sayı, eşik, doz, tanı ölçütü ve
  sınıflandırma yalnız kaynaktan; kaynakla çelişen ya da aciliyeti kaynaktan yükselten cümle yok. Denetçi (A, B, F)
  eklenen her cümlenin doğruluğuna bakar. Yalnız podcast; ders, test ve sohbetin kaynak kuralı değişmedi.
*/
const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Sayı, eşik, yaş sınırı, süre, tarih, doz, formül, tanı ölçütü ve sınıflandırma yalnızca " +
  "KAYNAK'tan (ve verilmişse öğrencinin aynı konudaki DERS'inden) gelir; kaynakta yoksa söyleme. Kaynaktaki her sınav " +
  "noktası podcast'te geçer.\n" +
  "DERS KİTABI BİLGİSİ: Konuyu ders kitaplarında tartışmasız olan bilgiyle açabilirsin, etiket koymadan: bir bilginin " +
  "nedeni ve mekanizması, kuralın ders kitabındaki tipik vakası, gündelik bir benzetme, bir terimin " +
  "anlamı, neyin neyle karıştırıldığı. Sınırlar: kaynakla çelişmez; yukarıdaki türden yeni bir sayı, eşik, yaş sınırı, " +
  "doz, tanı ölçütü ya da sınıflandırma eklemez; aciliyeti ya da önemi kaynaktan yükseltmez (kaynak 'ayrıntılı " +
  "değerlendirme' diyorsa 'acil' denmez); güncel olarak tartışmalı ya da değişebilecek bilgi taşımaz. Emin olmadığın " +
  "bilgiyi söyleme.\n" +
  "Kaynaktaki bozuk ya da " +
  "yanlış yazılmış kelimeleri doğru Türkçeyle söyle; kaynakta açıkça bozuk bir cümle varsa kaynağın kendi örnekleriyle " +
  "tutarlı anlamını söyle ve bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Konuyu sınav müfredatındaki yerleşik, ders kitaplarında " +
  "tartışmasız bilgiyle anlat. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı söyleme; güncel olarak " +
  "değişebilecek bilgiyi verme. Aşağıda 'kaynak' denen her yer konunun yerleşik bilgisi anlamına gelir.\n\n";

/*
  Kulak kuralları (20 Ekim 2026, kör kıyas: podcast'imiz "robot gibi" bulundu). Gelişim basamakları
  tablosunun 21 hücresi satır satır okundu; "kendi eğrisi" beş kez söylendi; bölümler fikir değil
  liste taşıdı. Yazar (AKIŞ) ve denetçi (H, I maddeleri) TABLE_RULE ile REPEAT_RULE'u aynen okur.
*/
export const TABLE_RULE =
  "Tabloyu ya da listeyi satır satır okuma: bir konuşma sırası (tek öğretmende bir paragraf) en çok 3 liste öğesi " +
  "taşır. Tablonun bilgisini 2-3 karşılaştırmaya çevir (X'te şu, Y'de bu; fark şu, çünkü …).";
/*
  Kapsam ve derinlik (23 Ekim 2026, yedinci ölçüm). "Her satırı anlatma, 3-5 nokta seç" denendi: yazar gelişim
  basamakları tablosunu ve alarm bulgularını tümden attı, sınav gözü 62'den 45-49'a düştü (yargıç: "sınavın en çok
  sorduğu kısım yok"). Kapsam kalır, derinlik seçilir. Yalnız yazara.
*/
export const FOCUS_RULE =
  "Kaynağın sınavda sorulan bütün noktalarını kapsa: tablo satırları, eşikler ve uyarı bulguları dahil; SINAVDA " +
  "SORULUR maddelerinin hiçbiri atlanmaz. Ama hepsini aynı derinlikte anlatma: en önemli 3-4 noktayı nedeniyle, bir " +
  "örnekle ve neyle karıştırıldığıyla derinlemesine anlat; geri kalanını bu noktaların yanında karşılaştırma olarak " +
  "kısaca söyle.";
export const REPEAT_RULE =
  "Aynı ifadeyi ya da aynı noktayı son bölüm dışında bütün podcast'te en çok iki kez söyle; üçüncü kez söyleyeceğin " +
  "yerde yeni bir bilgi, neden ya da örnek söyle.";
/*
  Sahne, neden, sıra (23 Ekim 2026, üçüncü kör ölçüm: podcast öğrenci gözünde 20+ puan geride). Yargıçların ortak
  cümlesi "sesli okunan tablo": Kerem soruyor, Ada okuyor; neden-sonuç, örnek ve benzetme yok; yaşlar 9 → 2 → 6 → 12
  diye karışık. Astra her bölümü bir sahne ve bir nedenle anlatıyor, özeti öğrencinin ağzından yaptırıyordu. Yazar
  (AKIŞ) ve denetçi (J maddesi) üçünü aynen okur. J düzeltme turuna gider, kurtarmada satır silmez (I gibi).
*/
export const SCENE_RULE =
  "Her bölüm (son tekrar bölümü hariç) somut bir sahneyle açılır: bir öğrencinin, hastanın, ülkenin ya da işlemin kısa " +
  "durumu (kim, ne oluyor). Sahnedeki her ayrıntı kaynaktaki bilgiden gelir; yeni sayı, eşik ya da sonuç taşımaz. " +
  "Bölümün geri kalanı sahneyi kavramla açıklar.";
export const CAUSE_RULE =
  "Her bölümde en az bir gerçek neden-sonuç cümlesi vardır: 'çünkü'den sonra gelen kısım ilk cümleyi başka sözle " +
  "tekrar etmez, bir mekanizma söyler.";
/** Yalnız belgeli yazara (belgesiz kipte zaten konu bilgisiyle yazılır). */
const CAUSE_LABEL_NOTE = "Kaynak nedeni vermiyorsa ders kitabındaki tartışmasız nedeni söyle.";
export const ORDER_RULE =
  "Yaş, evre, sıra ya da basamak bildiren bilgiler kaynaktaki sırayla söylenir (2 ay, 6 ay, 9 ay, 12 ay); ileri geri " +
  "atlanmaz.";
/** Yalnız yazara: bölümün şekli serbest kalsın diye sıra dayatmaz ('Her bölüm: ne olduğu' kalıbı geri gelmesin). */
const CHAPTER_RULE =
  "Her bölüm (son tekrar bölümü hariç) tek bir fikir taşır: fikrin kendisi, nedeni ve onu gösteren bir somut vaka " +
  "ya da örnek; sıraları bölümden bölüme değişebilir.";

// Örnek konuşma sırası çok cümleli: model örneği kuraldan çok izliyor (16 Ekim 2026 canlı podcast'te
// "text":"tek cümle" örneği yüzünden sıraların %83'ü tek cümleydi).
// 17 Ekim 2026: örnekte Kerem yalnız "kısa soru" yazınca canlıda Kerem'in bütün sıraları tek cümle
// soruydu; örnek Kerem'in anlattığı bir sırayı da gösterir.
// Plan somut (23 Ekim 2026, yedinci ölçüm): "sahne / neden / benzetme" planı soyut kaldı ("bir çocuğun ölçümleri
// değerlendiriliyor"), yazar ders kitabı nedenini bir kez kullandı. Plan artık bir nokta, onun nedeni, örneği ve
// karıştırıldığı şey; satırlar bu dördünü söyler.
const SCHEMA_DUO =
  '{"title":"…","chapters":[{"title":"kavramın adı","plan":{"point":"bu bölümün ana sınav noktası ve yanında kısaca geçecek satırlar",' +
  '"why":"bu noktanın nedeni ya da mekanizması: kaynakta varsa kaynaktan, yoksa ders kitabından",' +
  '"example":"somut bir durum: kaynaktaki ya da ders kitabındaki tipik örnek","confusedWith":"en çok neyle karıştırılır, fark ne"},"lines":[' +
  '{"speaker":"kerem","text":"soru ya da merak"},' +
  '{"speaker":"ada","text":"konuşma sırası: 2-4 cümle — olgu, nedeni, sonucu ya da örneği"},' +
  '{"speaker":"kerem","text":"1-3 cümle: bir örnek (kaynağı anmadan), kendi sözleriyle toparlama ya da bir adım ileri"},' +
  '{"speaker":"ada","text":"tamamlar ya da yeni bilgiyi açar: 1-4 cümle"}]}]}';
const SCHEMA_SINGLE =
  '{"title":"…","chapters":[{"title":"kavramın adı","plan":{"point":"bu bölümün ana sınav noktası ve yanında kısaca geçecek satırlar",' +
  '"why":"bu noktanın nedeni ya da mekanizması: kaynakta varsa kaynaktan, yoksa ders kitabından",' +
  '"example":"somut bir durum: kaynaktaki ya da ders kitabındaki tipik örnek","confusedWith":"en çok neyle karıştırılır, fark ne"},"lines":[' +
  '{"speaker":"ada","text":"paragraf: 2-4 cümle — olgu, nedeni, sonucu ya da örneği"}]}]}';

function system(mode: TeacherLessonMode, length: PodcastLength): string {
  const spec = podcastLengthSpec(length);
  const duo = spec.speakers === "duo";
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor; konuyu kulaktan dinleyerek öğrenecek. " +
    (mode === "topic"
      ? "Belgesi yok; konuyu ondan duydun.\n\n"
      : "Sana kendi ders belgesini verdi; anlatımın bu belgeye dayanır.\n\n") +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    `BİÇİM: ${spec.brief} ${spec.style}`.trim() +
    "\n" +
    (duo ? podcastDuoBrief() : podcastNarrationBrief()) +
    "\n" +
    (duo ? DUO_NARRATOR_SCHEMA : SINGLE_NARRATOR_SCHEMA) +
    "\n\n" +
    "AKIŞ:\n" +
    // 23 Ekim 2026 (beşinci ölçüm, ürün sahibinin kararı: "konuşma önce, denetim yalnız doğruluk"): yazar her bölümün
    // planını satırlardan önce yazar; plan öğrenciye gitmez, sohbetin iskeletidir.
    "- Önce her bölümün 'plan'ını yaz (son tekrar bölümü hariç): bölümün ana sınav noktası, o noktanın nedeni ya da " +
    "mekanizması, somut bir örnek ve en çok neyle karıştırıldığı. Sonra satırları bu plana göre, iki insan konuşur gibi " +
    "yaz: bölüm örnekle açılır, nedeni bir konuşma sırasında açıkça söylenir, karıştırılan şeyle fark konuşulur. " +
    (mode === "topic"
      ? ""
      : "Kaynak nedeni vermiyorsa ders kitabındaki tartışmasız nedeni doğrudan söyle; bu, nedeni hiç söylememekten ve " +
        "'çünkü farklıdır' demekten iyidir. ") +
    // Yedinci ölçüm (23 Ekim 2026): planın "why" alanı noktayı başka sözle tekrar ediyordu ("Kilo değişimleri akut
    // dengeye duyarlıdır"). Örnek başka konudan: model konunun nedenini kopyalamasın.
    "Neden, noktayı başka sözle tekrar etmez; neyin neye yol açtığını söyler. Kötü: 'Enzim sıcaklığa duyarlıdır, " +
    "çünkü sıcaklık enzimi etkiler.' İyi: 'Enzim bir proteindir; yüksek ateşte üç boyutlu şekli bozulur ve bağlanacağı " +
    "molekülü tutamaz.' " +
    "Benzetme yeni bilgi (sayı, kural, tarih, sonuç) taşımaz.\n" +
    `- ${spec.minChapters}-${spec.maxChapters} bölüm. Bölüm başlığı o bölümde konuşulan kavramın adı; 'Giriş', 'Tanım', ` +
    "'Örnek', 'Özet', 'Yaygın hata' başlık değildir.\n" +
    "- İlk cümle dinleyeni düşündüren bir kanca; 'bu bölümde şunları öğreneceğiz' gibi boş cümle yok.\n" +
    "- Zıtlıkla anlat (X böyledir, Y ise şöyle); karıştırılan iki kavramı açıkça ayır.\n" +
    `- ${CHAPTER_RULE}\n` +
    // Dokuzuncu ölçüm: "pincer" hiç açıklanmadı. Basamakları tek tek sordurmak ve başka konudan biçim örneği de
    // denendi (onuncu ölçüm): podcast kısaldı, öğrenci ve öğrenme gözü düştü; geri alındı.
    "- Teknik ya da yabancı bir terimi ilk geçtiği yerde bir cümleyle açıkla (ne olduğu, nasıl görüldüğü).\n" +
    (length === "ozet" ? "" : `- ${FOCUS_RULE}\n`) +
    (length === "ozet" ? "" : `- ${SCENE_RULE}\n- ${CAUSE_RULE}${mode === "topic" ? "" : ` ${CAUSE_LABEL_NOTE}`}\n`) +
    `- ${ORDER_RULE}\n` +
    `- ${TABLE_RULE}\n` +
    `- ${REPEAT_RULE}\n` +
    (length === "ozet"
      ? ""
      : "- Bir ya da iki yerde dinleyene soru sor: satır 'Dur ve düşün:' ile başlar, hemen sonraki satır 'Cevap:' ile " +
        "başlar ve cevabı verir.\n" +
        (duo
          ? "- Son bölümde Kerem dinlediklerini kendi sözleriyle üç kısa satırda toparlar (her satır sınavda işe yarayan bir " +
            "kesin bilgi); bölümlerin cümlelerini aynen tekrarlamaz, en çok karıştırılan ayrımları kısa eşleşmelerle söyler " +
            // Dokuzuncu ölçüm: "Bir düzeltme:" / "Düzeltilecek bir nokta yok" satırları boşta kaldı.
            "(basamaklar ve eşikler dahil). Ada eksik kalan bir noktayı tek satırla ekleyerek kapatır; 'düzeltme' demez.\n"
          : "- Son bölüm üç kısa tekrar satırıdır; her satır sınavda işe yarayan bir kesin bilgi.\n")) +
    "- Örnek açarsan verileni, işlemi ve birimli sonucu aynı bölümde söyle; yarım bırakma. Eşitliğin iki tarafını hesapla.\n" +
    "- Formülü ve üssü simgeyle yaz (H₂O, 10²³, n = m/M); ondalık virgül kullan.\n\n" +
    // 20 Ekim 2026: Kerem bir podcast'te dört kez "Notlarındaki örnekte …" dedi. Kod da yakalar
    // (`podcastStructureIssues`, düzeltme turuna yollar); burada yazara söylenir.
    `${NO_FABRICATED_MEMORY_RULE}\n` +
    "YAZMA: 'Kaynak:', sayfa numarası, 'PDF', 'belgede yazdığı gibi', 'belgende yazan', 'notlarında', 'notlarındaki', " +
    "'notlarına göre', iç not. Bilgiyi kaynağa değil konuya bağla ('Notlarındaki örnekte 9 ayda…' değil, " +
    "'9 aylık bir bebek…'). Kuralları ve yazım notlarını konuşmaya koyma ('Evet yerine …', 'tabloyu okumadan …' gibi). " +
    SPOKEN_ONLY_RULE +
    "\n\n" +
    `${CONTENT_STYLE}\n\n` +
    `Yalnızca bu şemada JSON döndür:\n${duo ? SCHEMA_DUO : SCHEMA_SINGLE}\n\n${STUDENT_LEAK_BAN}`
  );
}

export function podcastSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return system(mode, length);
}

/**
 * Taslağı yazan istem (23 Ekim 2026 gecesi): iki sesli türler senarist yazarla (`podcast-script-writer.ts`), tek
 * sesliler eski şemayla. Düzeltici her türde `podcastFixSystem` (eski şema) ile çalışır.
 */
export function podcastWriterSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return usesScriptWriter(length) ? podcastScriptSystem(mode, length) : system(mode, length);
}

export function podcastUserPrompt(input: TeacherPodcastInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    examPointsBlock(input.examPoints, "podcast"),
    input.syllabusLine ? `KAPSAM: ${input.syllabusLine}` : "",
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.lessonText ? `DERS (öğrencinin aynı konuda okuduğu, belgeden hazırlanmış ders):\n${input.lessonText}` : "",
    input.mode === "topic" ? "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle anlat)" : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const VERIFY_DOCUMENT =
  "Sen titiz bir içerik denetçisisin. Bir podcast metnini, dayandığı KAYNAK (ve verilmişse DERS) ile karşılaştırıyorsun. " +
  "Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan sayı, eşik, yaş sınırı, süre, tarih, doz, formül, tanı ölçütü ya da sınıflandırma " +
  "(yeni bilgi taşımayan gündelik sahne sorun değil; ders kitabından katılan neden, mekanizma, tipik vaka, benzetme ve " +
  "terim açıklaması kaynakta olmayabilir, onları A'ya göre değil F'ye göre denetle; 'bu konu sınavda ağırlıklı' ya da " +
  "'sınav kapsamında değil' cümlesi hazırlığın konu listesinden gelir, kaynak iddiası değildir, A sayma).\n" +
  "B) Kaynakla çelişen ya da anlamı değiştiren ifade; aciliyeti ya da önemi kaynaktan yükselten ifade (kaynak " +
  "'ayrıntılı değerlendirme' derken 'acil').\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "F) Ders kitabından katılan bilgide yanlış, tartışmalı ya da güncel olarak değişebilecek bilgi; kaynaktaki kuralın " +
  "söylemediği bir sonuca varan vaka; yeni sayı, eşik, yaş sınırı, doz, tanı ölçütü ya da sınıflandırma taşıyan cümle. " +
  "Doğru ve tartışmasız ders kitabı bilgisi etiketsiz olsa da sorun değildir.\n" +
  "Kaynakta açıkça bozuk bir cümlenin kaynağın kendi örnekleriyle tutarlı anlamıyla söylenmesi sorun değildir.\n";

const VERIFY_TOPIC =
  "Sen titiz bir içerik denetçisisin. Belgesi olmayan bir podcast metnini doğruluk açısından denetliyorsun. Şunları bul:\n" +
  "A) Yanlış ya da tartışmalı olgu, tanım, sayı, formül; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n" +
  "B) Ders içinde çelişki.\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n";

/*
  Kulak maddeleri (20 Ekim 2026, kör kıyas). Yazarın okuduğu kuralların aynısı (`DUO_TURN_RULE`,
  `REPEAT_RULE`, `TABLE_RULE`). Kurtarmada G ve H satırı çıkar, I (tablo okuma) yalnız düzeltme
  turuna gider ve kurtarmada korunur: okunan satırları silmek bütün bir bölümü düşürebiliyordu.
  Üçü de ikinci taslak sebebi olmaz (`salvagePodcast`).
*/
const EAR_ITEMS =
  `G) (İki konuşmacılı metinde) Konuşma kuralı çiğnenmiş: «${DUO_TURN_RULE}» where: cevapsız ya da başka bir şeyle ` +
  "cevaplanmış sorunun satırı; doğruyu kendisi söyledikten sonra yanılgı itiraf eden satır (ve ona bağlı 'şimdi " +
  "anlıyorum' satırı); kendi önceki cümlesiyle çelişen satır.\n" +
  `H) Tekrar kuralı çiğnenmiş: «${REPEAT_RULE}» where: üçüncü ve sonraki geçişlerin satırları, ilk ikisi değil.\n` +
  `I) Kulak yükü kuralı çiğnenmiş: «${TABLE_RULE}» where: o konuşma sırasının ilk satırı.\n` +
  "G, H ve I'da where her zaman tek satırdır: chapters[i].lines[j].\n" +
  `J) Sahne, neden ya da sıra kuralı çiğnenmiş (son tekrar bölümü ve 1 dakikalık özet hariç): «${SCENE_RULE}» ` +
  `«${CAUSE_RULE}» «${ORDER_RULE}» where: bölüm, chapters[i].\n`;

function verifyJson(mode: TeacherLessonMode): string {
  return (
    (mode === "topic" ? "A-E 'high'; G-J 'low'." : "A-F 'high'; G-J 'low'.") +
    " G-J konuşma akışıdır: yanlış bir şey öğretmez, düzeltme turu açmaz, satır sildirmez; yine de yaz, kayda geçer. " +
    "Şunlar da 'low': tekdüze anlatım, uzunluk, bilgi taşımayan cümle.\n" +
    'JSON döndür: {"issues":[{"where":"chapters[1].lines[3]","rule":"G","severity":"high","problem":"…","fix":"…"}]}. ' +
    "rule: maddenin harfi. Sorun yoksa issues boş dizi."
  );
}

export function podcastVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (mode === "topic" ? VERIFY_TOPIC : VERIFY_DOCUMENT) + EAR_ITEMS + verifyJson(mode);
}

export type PodcastIssue = TeacherIssue & { rule?: string };

/**
 * Denetçinin sorunları ve madde harfi (20 Ekim 2026). Harf kurtarmada önemli: G/H/I satırı ikinci
 * taslak sebebi olmaz, I hiç silinmez. Ortak `parseIssues` bilinmeyen alanı atıyor; harf burada
 * eklenir. Harf yoksa (eski davranış) sorun A-F gibi işlenir.
 */
export function parsePodcastIssues(raw: unknown): PodcastIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const parsed = parseIssues({ issues: [item] });
    if (!parsed.length) return [];
    const rule = (item as { rule?: unknown } | null)?.rule;
    const letter = typeof rule === "string" && /^[A-J]$/i.test(rule.trim()) ? rule.trim().toUpperCase() : undefined;
    return parsed.map((issue) => (letter ? { ...issue, rule: letter } : issue));
  });
}

/** Döngünün sorun satırı: `[where] (G) sorun → düzeltme`. Kurtarma harfi bu biçimden okur. */
export function podcastIssueLine(issue: PodcastIssue): string {
  return `[${issue.where}]${issue.rule ? ` (${issue.rule})` : ""} ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`;
}

export function podcastVerifyUserPrompt(episode: PodcastEpisode, input: TeacherPodcastInput): string {
  if (input.mode === "topic") {
    return `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz podcast.)\n\nPODCAST (JSON):\n${JSON.stringify(publicShape(episode))}`;
  }
  const source = [input.lessonText ? `DERS:\n${input.lessonText}` : "", `KAYNAK:\n${sourceText(input.pages)}`]
    .filter(Boolean)
    .join("\n\n");
  // Termodinamik denemesi: "300 K, m = 1 kg, R = 0,287 → 59,7 kJ" örneği
  // belgede yoktu ve denetçi kaçırdı. Karar yine denetçinin: kaynaktaki
  // sayılardan hesaplanmış ara sonuç sorun değil.
  const stray = podcastNumbersOutsideLesson(podcastScriptText(episode), source);
  const hint = stray.length
    ? `\n\nKAYNAKTA GEÇMEYEN SAYILAR: ${stray.join(", ")}. Her biri kaynaktaki sayılardan hesaplanmış değilse dayanaksızdır (A).`
    : "";
  return `${source}\n\nPODCAST (JSON):\n${JSON.stringify(publicShape(episode))}${hint}`;
}

export function podcastFixSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return (
    "Sen aynı podcast'i yazan öğretmensin. Denetçinin bulduğu sorunları düzelt: dayanaksız bilgiyi çıkar ya da " +
    "kaynaktaki doğrusuyla değiştir, hesabı düzelt, yarım örneği tamamla ya da çıkar, bozuk cümleyi yeniden yaz. " +
    "Cevapsız soruyu cevaplat ya da çıkar, tablo okumasını karşılaştırmaya çevir, üçüncü tekrarı yeni bilgiyle " +
    "değiştir, kaynağa göndermeyi kaldır. Önerilen " +
    "düzeltme ('→' sonrası) varsa uygula. Listedeki her yeri mutlaka değiştir; metni aynen geri döndürme. Sorunsuz " +
    // 23 Ekim 2026: yalnız eksik 'Dur ve düşün' istenen düzeltici podcast'i baştan yazıp etiketli neden cümlesini sildi.
    "kısımları değiştirme: listede adı geçmeyen bölüm ve satırlar, plan ve etiketli neden cümleleri olduğu gibi kalır; " +
    "eksik bir şey isteniyorsa yalnız onu ekle. Kurallar ve şema aynı:\n\n" +
    system(mode, length)
  );
}

export function podcastFixUserPrompt(episode: PodcastEpisode, problems: string[], input: TeacherPodcastInput): string {
  return [
    podcastUserPrompt(input),
    `ŞU ANKİ PODCAST (JSON):\n${JSON.stringify(publicShape(episode))}`,
    `DÜZELTİLECEK SORUNLAR:\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join("\n")}`,
    "Düzeltilmiş podcast'in tamamını aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

/*
  Tamamlama turu (28 Ekim 2026, Paket A). V6'da Diyalog 0:50'ye çöktü; eski süre turu bütün JSON'u yeniden yazdırıyordu
  ve 22 sn'de hep zaman aşımına düşüyordu. Tamamlama yalnız eksik bölümleri yazar; var olan, denetlenmiş satırlara
  dokunmaz. Yeni bölümler son tekrar bölümünden önce girer ve aynı denetçiden geçer.
*/
export function podcastCompletionSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return (
    "Sen aynı podcast'i yazan öğretmensin. Podcast tabanın altında kaldı. Var olan bölümleri yeniden yazma, " +
    "tekrar etme; yalnız EK bölümler yaz: konunun henüz konuşulmamış noktaları, ikinci bir vaka, en çok karıştırılan " +
    "ayrım, bir neden ya da mekanizma. Son tekrar bölümünü yazma; o zaten var. Ek bölümler var olan konuşmanın " +
    "devamı gibi akar. Kurallar ve şema aynı (yalnız ek bölümleri döndür):\n\n" +
    system(mode, length)
  );
}

export function podcastCompletionUserPrompt(episode: PodcastEpisode, input: TeacherPodcastInput): string {
  const spec = podcastLengthSpec(input.length);
  const words = podcastWordCount(episode);
  const turns = podcastTurnCount(episode);
  const room = Math.max(1, spec.maxChapters - episode.chapters.length);
  return [
    podcastUserPrompt(input),
    `ŞU ANKİ PODCAST (JSON):\n${JSON.stringify(publicShape(episode))}`,
    `TAMAMLAMA: Şu an ${words} kelime ve ${turns} konuşma sırası; taban ${spec.words.min} kelime ve ${spec.minTurns} ` +
      `sıra. En az ${Math.max(spec.words.min - words, 60)} kelime ve en az ${Math.max(spec.minTurns - turns, 2)} ` +
      `konuşma sırası ekle (toplam ${spec.words.max} kelimeyi geçme). En çok ${Math.min(room, 3)} yeni bölüm.`,
    'Yalnız ek bölümleri aynı şemayla JSON olarak döndür: {"title":"…","chapters":[…]}.',
  ].join("\n\n");
}

/** Tamamlama turunun bölümleri (taban bölüm sayısı istenmez). */
export function parsePodcastAddition(
  raw: unknown,
  input: Pick<TeacherPodcastInput, "length" | "topicLabel">,
): PodcastEpisode | null {
  return coercePodcastDraft(scriptToDraft(raw) ?? raw, { length: input.length, topicLabel: input.topicLabel, minChapters: 1 });
}

/** Ek bölümler son tekrar bölümünden önce girer; bölüm tavanı aşılmaz. Kod satır yazmaz. */
export function insertPodcastChapters(episode: PodcastEpisode, addition: PodcastEpisode): PodcastEpisode {
  const spec = podcastLengthSpec(episode.length);
  const room = Math.max(1, spec.maxChapters - episode.chapters.length);
  const known = new Set(episode.chapters.map((chapter) => chapter.title.toLocaleLowerCase("tr-TR")));
  const fresh = addition.chapters
    .filter((chapter) => !known.has(chapter.title.toLocaleLowerCase("tr-TR")))
    .slice(0, room);
  if (!fresh.length) return episode;
  const recapAt = episode.chapters.length > 1 ? episode.chapters.length - 1 : episode.chapters.length;
  return {
    ...episode,
    chapters: [...episode.chapters.slice(0, recapAt), ...fresh, ...episode.chapters.slice(recapAt)],
  };
}

/** Model ve denetçi "Dur ve düşün:" / "Cevap:" işaretli düz metni görür. */
function publicShape(episode: PodcastEpisode) {
  return {
    title: episode.title,
    chapters: episode.chapters.map((chapter) => ({
      title: chapter.title,
      lines: chapter.lines.map((line) => ({
        speaker: line.speaker,
        text: line.beat === "ask" ? `Dur ve düşün: ${line.text}` : line.beat === "reveal" ? `Cevap: ${line.text}` : line.text,
      })),
    })),
  };
}

/** Taslağı bölüm/satır yapısına oturtur (cümlelere böler, gösterim/seslendirme biçimi). */
export function parseTeacherPodcast(raw: unknown, input: Pick<TeacherPodcastInput, "length" | "topicLabel">): PodcastEpisode | null {
  // Senarist yazarın düz senaryosu (`script`) ya da eski şemanın bölümleri (`chapters`).
  return coercePodcastDraft(scriptToDraft(raw) ?? raw, { length: input.length, topicLabel: input.topicLabel });
}

/**
 * Yapı denetimi (saf). Düzeltmez; düzeltme turuna yollar. Hesap denetimi
 * (auditQuantitative) yalnız tutmayan eşitliği söyler, metne dokunmaz.
 */
export function podcastStructureIssues(episode: PodcastEpisode): string[] {
  const issues: string[] = [];
  const spec = podcastLengthSpec(episode.length);
  if (episode.chapters.length < spec.minChapters || episode.chapters.length > spec.maxChapters) {
    issues.push(`Bölüm sayısı ${episode.chapters.length}; ${spec.minChapters}-${spec.maxChapters} olmalı.`);
  }
  episode.chapters.forEach((chapter, index) => {
    if (isScaffoldHeading(chapter.title)) issues.push(`chapters[${index}].title: şablon başlık; kavramın adını yaz.`);
  });
  const lines = episode.chapters.flatMap((chapter) => chapter.lines);
  if (lines.some((line) => /kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(line.text))) {
    issues.push("Metinde kaynak/sayfa notu var; çıkar.");
  }
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      if (FABRICATED_MEMORY.test(line.text)) {
        issues.push(
          `chapters[${chapterIndex}].lines[${lineIndex}]: uydurma kişisel anı; konuşmacının hayatı değil, konunun kuralı.`,
        );
      }
      if (incompleteSentence(line.text)) {
        issues.push(`chapters[${chapterIndex}].lines[${lineIndex}]: yarım cümle; cümleyi tamamla ya da çıkar.`);
      }
    });
  });
  // Satır numarası bilerek yok: kurtarma satır numarasını silme sayar, bu cümle çoğu zaman gerçek
  // bir bilgi taşıyor ("Notlarındaki örnekte 9 ayda desteksiz oturur"). Yalnız düzeltme turuna gider.
  const attributed = lines.filter((line) => ATTRIBUTION.test(line.text)).slice(0, 3);
  if (attributed.length) {
    const quotes = attributed.map((line) => `"${line.text.slice(0, 60)}…"`).join(", ");
    issues.push(`Kaynağa gönderme var (${quotes}); bilgiyi kaynağı anmadan söyle.`);
  }
  if (episode.length !== "ozet") {
    const asks = lines.filter((line) => line.beat === "ask").length;
    const reveals = lines.filter((line) => line.beat === "reveal").length;
    if (asks < 1) issues.push("En az bir 'Dur ve düşün:' sorusu ve hemen ardından 'Cevap:' satırı olmalı.");
    else if (reveals < asks) issues.push("Her 'Dur ve düşün:' sorusunun hemen ardından 'Cevap:' satırı gelmeli.");
    const last = episode.chapters[episode.chapters.length - 1];
    if (last && last.lines.length < 3) issues.push("Son bölüm üç kısa tekrar satırı olmalı.");
  }
  const arithmetic = auditQuantitative(podcastScriptText(episode), "").issues.filter((issue) => issue.kind === "arithmetic");
  for (const issue of arithmetic) issues.push(`Tutmayan hesap: ${issue.detail}`);
  // Taban her türde (Özet hariç; 28 Ekim 2026, Paket A). Satırsız: kurtarma silmez, tamamlama turu ekler.
  if (podcastBelowFloor(episode)) {
    issues.push(
      `Metin kısa: ${podcastWordCount(episode)} kelime, ${podcastTurnCount(episode)} konuşma sırası; taban ` +
        `${spec.words.min} kelime ve ${spec.minTurns} sıra (tavan ${spec.words.max}). Yeni bir vaka, neden ya da ` +
        "karşılaştırma ekle; var olan cümleleri tekrar etme.",
    );
  }
  if (spec.speakers === "duo") {
    const share = keremShare(episode);
    if (share < KEREM_SHARE_MIN || share > KEREM_SHARE_MAX) {
      issues.push(
        `Konuşma payı: Kerem cümlelerin %${Math.round(share * 100)}'ini söylüyor; %${KEREM_SHARE_MIN * 100}-${KEREM_SHARE_MAX * 100} olmalı. ` +
          "Kerem'e örnek, toparlama ya da karşılaştırma taşıyan sıralar ver; açılış ve kapanış Ada'da kalsın.",
      );
    }
  }
  // Satır başındaki etiket oynatıcıdaki adla aynı değil. Cümle içindeki rol sözü etiket değildir.
  if (lines.some((line) => /^(?:öğretmen|ogretmen|öğrenci|ogrenci|sunucu)\s*:/iu.test(line.text.trim()))) {
    issues.push("Konuşmacı adı oynatıcıdaki adla uyuşmuyor; satır başındaki etiket kalkmalı.");
  }
  return issues;
}

/**
 * Konuşma akışı gözlemleri (23 Ekim 2026, ürün sahibinin kararı: "konuşma önce, denetim yalnız doğruluk").
 * Beşinci ölçümde bu kurallar düzeltme turu açıp satır sildiriyordu; Soru-Cevap'ta 10 satır çıktı, sohbet koptu
 * ("Aynen." tek başına kaldı), podcast yavaşladı ve dinleme kontrolü süreye takıldı. Artık yalnız kayda geçer;
 * yazar aynı kuralları istemde okur.
 */
export function podcastFlowNotes(episode: PodcastEpisode): string[] {
  const notes: string[] = [];
  const lines = episode.chapters.flatMap((chapter) => chapter.lines);
  const yesNo = lines.filter((line) => YES_NO_OPENER.test(line.text)).length;
  if (yesNo >= 3) notes.push(`Evet/Hayır kalıbı ${yesNo} satırda`);
  const keremLines = lines.filter((line) => line.speaker === "kerem");
  const keremAsks = keremLines.filter((line) => QUESTION_END.test(line.text)).length;
  if (episode.length === "diyalog" && keremLines.length >= 4 && keremAsks / keremLines.length > 0.6) {
    notes.push(`Kerem'in sıralarının ${keremAsks}/${keremLines.length}'i soru`);
  }
  for (const item of duoTurnProblems(episode)) notes.push(`chapters[${item.chapter}].lines[${item.line}]: ${item.reason}`);
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      const previous = chapter.lines[lineIndex - 1];
      if (previous && nearDuplicate(previous.text, line.text)) notes.push(`chapters[${chapterIndex}].lines[${lineIndex}]: bir önceki cümlenin tekrarı`);
      if (BARE_WEIGHT_LINE.test(line.text.trim())) notes.push(`chapters[${chapterIndex}].lines[${lineIndex}]: bağlamsız 'sınavda ağırlıklı' satırı`);
    });
  });
  return notes;
}

function wordSet(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2));
}

function nearDuplicate(a: string, b: string): boolean {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size < 4 || right.size < 4) return false;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size) >= 0.8;
}

/**
 * Kaynağa gönderme (20 Ekim 2026): "Notlarındaki örnekte …", "belgende yazan …". Etiketli genel
 * bilgi ("Belgende geçmiyor ama bilmen iyi olur:") bunun dışında.
 */
const ATTRIBUTION =
  /(?<!\p{L})not(?:lar)?(?:ın|ınız|un|unuz)(?:da|daki|dan|a\s+göre)(?!\p{L})|(?<!\p{L})belge(?:n)?de(?:ki)?\s+(?:yazan|yazdığı|yazıldığı|geçtiği\s+gibi|anlatıl\p{L}*|belirtil\p{L}*|örne\p{L}*)/iu;
const CONFESSION = /(?<!\p{L})(?:sanmışım|varsaymışım|zannetmişim)(?!\p{L})/iu;
const QUESTION_END = /\?\s*$/;
/** "Evet; …", "Hayır, …": cevabın onayla açılması. */
const YES_NO_OPENER = /^(?:evet|hayır)\s*[;,.:!—-]/iu;
/** Bağlamsız tek satır: "Bu konu sınavda ağırlıklı." */
const BARE_WEIGHT_LINE = /^bu konu sınavda (?:çok )?ağırlıklı\.?$/iu;
/** Soruya yalnız onay veren çıplak cevap: soru düşünce anlamsız kalır. */
const BARE_REPLY = /^(?:evet|hayır|doğru|aynen|kesinlikle)[.!]?$/iu;
/** Bağlaçla biten cümle: devamı kesilmiş ("… çünkü.", "… ve"). */
const DANGLING_CONNECTOR =
  /(?<!\p{L})(?:ve|ama|çünkü|yani|ancak|fakat|veya|ya\s+da|ile|bu\s+yüzden|bu\s+nedenle|dolayısıyla|örneğin|mesela)[\s,;:—–-]*[.…]?\s*$/iu;

/**
 * Cümle kapısı (28 Ekim 2026, Paket A): V6'da yarım cümleler sese gitti. Satır `.`, `?`, `!` ya da `…` ile bitmeli ve
 * bağlaçla bitmemeli; soruyla biten kısa "Yani?" serbest. Sorunlu satır düzeltme turuna, olmazsa kurtarmada çıkar.
 */
export function incompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.?!…]["'”’»)]*$/u.test(trimmed)) return true;
  if (/\?["'”’»)]*$/u.test(trimmed)) return false;
  return DANGLING_CONNECTOR.test(trimmed);
}

/**
 * İki sunuculu metinde kodun kesin görebildiği konuşma sorunları (20 Ekim 2026, `DUO_TURN_RULE`):
 * bütün podcast'te ikinci ve sonraki "… sanmışım" itirafı (kural en çok bir kez diyor) ve kimsenin
 * cevaplamadığı soru (bölümün son satırı; ardından ya podcast bitiyor ya da sonraki bölümü aynı
 * konuşmacı açıyor). Kod yalnız işaretler; düzeltme turu ve kurtarma bu satırları çıkarır.
 */
function duoTurnProblems(episode: PodcastEpisode): { chapter: number; line: number; reason: string }[] {
  const duo = episode.chapters.some((chapter) => chapter.lines.some((line) => line.speaker === "kerem"));
  if (!duo) return [];
  const out: { chapter: number; line: number; reason: string }[] = [];
  let confessions = 0;
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      if (CONFESSION.test(line.text)) {
        confessions += 1;
        if (confessions > 1) out.push({ chapter: chapterIndex, line: lineIndex, reason: "ikinci yanılgı itirafı" });
        return;
      }
      if (line.beat === "ask" || lineIndex !== chapter.lines.length - 1 || !QUESTION_END.test(line.text)) return;
      const opener = episode.chapters[chapterIndex + 1]?.lines[0];
      if (!opener || opener.speaker === line.speaker) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "cevapsız soru" });
      }
    });
  });
  return out;
}

/**
 * Satır düzeyinde düşürülebilir sorunlar. Kod burada da cümle yazmaz; yalnız hangi satırın
 * çıkacağını söyler: kaynak/sayfa notu, tek satır içinde tutmayan eşitlik, bir öncekinin tekrarı,
 * iki sunuculu metinde ikinci yanılgı itirafı ve cevapsız soru.
 */
export function podcastLineProblems(episode: PodcastEpisode): { chapter: number; line: number; reason: string }[] {
  const out: { chapter: number; line: number; reason: string }[] = [];
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(line.text)) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "kaynak/sayfa notu" });
        return;
      }
      if (auditQuantitative(line.text, "").issues.some((issue) => issue.kind === "arithmetic")) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "tutmayan hesap" });
      }
      if (FABRICATED_MEMORY.test(line.text)) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "uydurma kişisel anı" });
      }
      if (incompleteSentence(line.text)) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "yarım cümle" });
      }
    });
  });
  // Akış sorunları (tekrar, cevapsız soru, ikinci itiraf, bağlamsız sınav satırı) 23 Ekim 2026'dan beri satır
  // sildirmez: `podcastFlowNotes`.
  return out;
}

/**
 * Yayını durdurmayan biçim sorunları: bölüm sayısı, şablon başlık, soru-cevap sayısı, son bölüm
 * uzunluğu, kaynağa gönderme (cümle çoğu zaman gerçek bilgi taşır; yalnız düzeltme turuna gider).
 */
const COSMETIC_PROBLEM =
  /^Bölüm sayısı|şablon başlık|^En az bir 'Dur ve düşün:'|^Her 'Dur ve düşün:'|^Son bölüm üç kısa tekrar|^Kaynağa gönderme|^Evet\/Hayır kalıbı|^Kerem'in sıralarının|^Metin kısa|^Konuşma payı|^Konuşmacı adı/;
/** Satır taramasının karşıladığı yapı sorunları (`podcastLineProblems`). */
const LINE_HANDLED_PROBLEM =
  /^Metinde kaynak\/sayfa notu var|^Tutmayan hesap:|bir önceki cümlenin tekrarı|cevapsız soru|ikinci yanılgı itirafı/;
const LINE_REF = /chapters\[(\d+)\]\.lines\[(\d+)\]/g;
const CHAPTER_ONLY_REF = /chapters\[(\d+)\](?!\.lines)/g;
/** Denetçinin madde harfi (`podcastIssueLine` biçimi: `[where] (G) …`). */
const ISSUE_RULE = /^\[.*?\] \(([A-J])\) /;
/** Bu kadar satırın altındaki podcast yayınlanmaz; ikinci taslak denenir. */
const MIN_SALVAGED_LINES = 4;

/**
 * Son çare (19 Ekim 2026, ürün sahibi: "podcast istendiyse üretilsin; 'üretilemedi' olmasın").
 * Düzeltme turlarından sonra hâlâ sorunlu satır kaldıysa podcast'in tamamı atılmaz, yalnız o
 * satırlar çıkarılır. 18 Ekim'de iki podcast tek bir "bu konu sınavda ağırlıklı" cümlesi ve
 * tutmayan bir eşitlik yüzünden tümden düşmüş, öğrenci "oluşturulamadı" görmüştü.
 *
 * Kod cümle yazmaz, yalnız siler: denetçinin `chapters[i].lines[j]` ile gösterdiği satırlar,
 * `chapters[i]` ile gösterdiği bölümler ve satır taramasının bulduklarını. "Dur ve düşün"
 * sorusu giderse cevabı da gider (ve tersi); iki satırın altına inen bölüm düşer. Biçim
 * sorunları (bölüm sayısı, şablon başlık) yayını durdurmaz. Satıra bağlanamayan bir sorun
 * kaldıysa (ör. satırlar arası tutmayan hesap) kurtarma yok: null → ikinci taslak.
 */
export function salvagePodcast(
  episode: PodcastEpisode,
  problems: string[],
): { episode: PodcastEpisode; removed: number; belowFloor: boolean } | null {
  const result = salvageLines(episode, problems);
  if (!result) return null;
  // Taban (28 Ekim 2026, Paket A): silme podcast'i tabanın altına indirdiyse çağıran ikinci taslağı dener;
  // bu sonuç yalnız son çare adayıdır (`teacherPodcastLoop`).
  const belowFloor = result.removed > 0 && podcastBelowFloor(result.episode) && !podcastBelowFloor(episode);
  return { ...result, belowFloor };
}

function salvageLines(
  episode: PodcastEpisode,
  problems: string[],
): { episode: PodcastEpisode; removed: number } | null {
  const dropLines = new Set<string>();
  const dropChapters = new Set<number>();
  for (const problem of problems) {
    // Kulak maddeleri (20 Ekim 2026): I (tablo okuma) silinmez, yalnız düzeltme turuna gider;
    // G ve H satırı çıkar. Satır numarası yoksa ikisi de yayını durdurmaz, bölüm de düşürmez.
    const ear = ISSUE_RULE.exec(problem)?.[1];
    // J (sahne, neden, sıra; 23 Ekim 2026) da I gibi: düzeltme turuna gider, satır ya da bölüm silmez.
    if (ear === "I" || ear === "J") continue;
    if (ear === "G" || ear === "H") {
      for (const match of problem.matchAll(LINE_REF)) dropLines.add(`${match[1]}:${match[2]}`);
      continue;
    }
    let attributed = false;
    for (const match of problem.matchAll(LINE_REF)) {
      dropLines.add(`${match[1]}:${match[2]}`);
      attributed = true;
    }
    if (!attributed) {
      for (const match of problem.matchAll(CHAPTER_ONLY_REF)) {
        dropChapters.add(Number(match[1]));
        attributed = true;
      }
    }
    if (!attributed && !COSMETIC_PROBLEM.test(problem) && !LINE_HANDLED_PROBLEM.test(problem)) return null;
  }
  for (const item of podcastLineProblems(episode)) dropLines.add(`${item.chapter}:${item.line}`);
  for (const key of [...dropLines]) {
    const [chapterIndex, lineIndex] = key.split(":").map(Number);
    const lines = episode.chapters[chapterIndex]?.lines ?? [];
    const line = lines[lineIndex];
    if (!line) continue;
    if (line.beat === "ask" && lines[lineIndex + 1]?.beat === "reveal") dropLines.add(`${chapterIndex}:${lineIndex + 1}`);
    if (line.beat === "reveal" && lines[lineIndex - 1]?.beat === "ask") dropLines.add(`${chapterIndex}:${lineIndex - 1}`);
    // Konuşmacıdan konuşmacıya soru (20 Ekim 2026): cevabın ilk satırı giderse soru cevapsız kalır;
    // soru giderse ardındaki çıplak "Evet." da anlamsız kalır.
    const previous = lines[lineIndex - 1];
    if (previous && previous.speaker !== line.speaker && previous.beat !== "ask" && QUESTION_END.test(previous.text)) {
      dropLines.add(`${chapterIndex}:${lineIndex - 1}`);
    }
    const next = lines[lineIndex + 1];
    if (line.beat !== "ask" && QUESTION_END.test(line.text) && next && next.speaker !== line.speaker && BARE_REPLY.test(next.text.trim())) {
      dropLines.add(`${chapterIndex}:${lineIndex + 1}`);
    }
  }

  let removed = 0;
  const chapters = episode.chapters
    .map((chapter, chapterIndex) => {
      if (dropChapters.has(chapterIndex)) {
        removed += chapter.lines.length;
        return null;
      }
      // Hemen önceki satırı çıkan çıplak onay da gider (23 Ekim 2026, beşinci ölçüm: "Bu iki durumu aynı şey
      // sanmışım" çıkınca Ada'nın "Aynen." satırı tek başına kaldı). Bilgi taşıyan satır kalır.
      const orphan = (lineIndex: number) =>
        lineIndex > 0 &&
        dropLines.has(`${chapterIndex}:${lineIndex - 1}`) &&
        BARE_REPLY.test(chapter.lines[lineIndex]!.text.trim());
      const lines = chapter.lines.filter((_, lineIndex) => {
        const drop = dropLines.has(`${chapterIndex}:${lineIndex}`) || orphan(lineIndex);
        if (drop) removed += 1;
        return !drop;
      });
      if (lines.length < 2) {
        removed += lines.length;
        return null;
      }
      return lines.length === chapter.lines.length ? chapter : { ...chapter, lines };
    })
    .filter((chapter): chapter is PodcastEpisode["chapters"][number] => chapter !== null);
  const total = chapters.reduce((sum, chapter) => sum + chapter.lines.length, 0);
  if (!chapters.length || total < MIN_SALVAGED_LINES) return null;
  const next: PodcastEpisode = removed ? { ...episode, chapters } : episode;

  // Çıkarma yeni bir ardışık tekrar doğurabilir: satıra bağlı sorun kaldıysa bir tur daha.
  const leftover = podcastLineProblems(next);
  if (leftover.length) {
    if (!removed) return null;
    const again = salvageLines(
      next,
      leftover.map((item) => `chapters[${item.chapter}].lines[${item.line}]: ${item.reason}`),
    );
    return again ? { episode: again.episode, removed: removed + again.removed } : null;
  }
  // Satıra bağlanamayan sert sorun (satırlar arası tutmayan hesap) kaldıysa kurtarma yok.
  if (podcastStructureIssues(next).some((issue) => !COSMETIC_PROBLEM.test(issue))) return null;
  return { episode: next, removed };
}
