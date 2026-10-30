import { CONTENT_STYLE } from "@/lib/ai/content-style";
import {
  EQUIVALENT_OPTIONS_RULE,
  KEY_CONSISTENCY_RULE,
  MULTI_POLARITY_RULE,
  SAME_KIND_DISTRACTOR_RULE,
  SELF_CONTAINED_STEM_RULE,
  SOURCE_NUMBER_PRIORITY,
  STUDENT_LEAK_BAN,
  TEST_SET_RULE,
  THRESHOLD_OPTIONS_RULE,
} from "@/lib/learning/teaching-rubric";
import { contentTokens, rootCoverage, stemPhraseInAnswer } from "@/lib/learning/lexical-overlap";
import { offKindDistractors } from "@/lib/learning/distractor-kind";
import {
  affirmedWrongOptions,
  explanationAnswerMismatch,
  inlineCarriers,
  refutedCorrectOptions,
  unresolvedVisualReference,
} from "@/lib/learning/answer-consistency";
import { DEFAULT_OPTION_COUNT, type OptionCount } from "@/lib/learning/student-pedagogy";
import { normalizeGeneratedQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import {
  answerCountIssue,
  duplicateOptionPair,
  enumeratedCountIssue,
  optionKey,
  singleAnswerIntegrityIssues,
  THRESHOLD_TWIN_PREFIX,
} from "@/lib/learning/question-integrity";
import { OPTION_ORDER_RULE, refersToOptionOrder } from "@/lib/learning/option-reference";
import { FUNCTION_NOTATION_ISSUE, FUNCTION_NOTATION_RULE, reversedFunctionNotation } from "@/lib/learning/function-notation";
import { sourceText, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { EXAM_POINTS_MAX, examPointsBlock } from "@/lib/learning/exam-points";
import { avoidListBlock, dropNearDuplicates } from "@/lib/learning/item-dedup";
import {
  LESSON_CHECKS_MAX,
  LESSON_TERMS_MAX,
  pointTaught,
  withoutMissingPoints,
  wordKeys,
  type LessonQuizContext,
} from "@/lib/learning/lesson-quiz-context";

/**
 * Öğretmen test motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik yeni
 * motora). Ders motorunun aynası: temiz çekirdek sayfalar → tek öğretmen
 * istemi → soruları bağımsız çözen model denetimi → sorunlu soruyu modelin
 * düzeltmesi. Kod soru metnine hiçbir şey eklemez; yalnız denetler ve
 * denetimden geçmeyen soruyu göstermez.
 *
 * Eski yol (exam-quiz-generate.ts) taslağın üstünde metni değiştiren
 * onarımlar (repairTurkishSurface, repairQuizPedagogy) ve birkaç katman
 * kelime örtüşmeli doğrulayıcı çalıştırıyordu.
 */

export type TeacherQuizInput = {
  topicLabel: string;
  prepTitle: string;
  /** Temiz kaynak sayfaları; belgesiz hazırlıkta boş. */
  pages: { page: number; text: string }[];
  mode?: TeacherLessonMode;
  /** Öğrenciye gidecek soru sayısı. */
  count: number;
  /** "gaps": tuzak / zayıf nokta soruları. */
  focus?: "practice" | "gaps";
  /** Aşinalık ve ruh hali satırı. */
  learnerLine?: string;
  /** Öğretmen analizinin "Sınavda sorulur" maddeleri (18 Ekim 2026). */
  examPoints?: string[];
  /**
   * Sayfa listesi yerine hazır kaynak bloğu (deneme sınavı, düello, tanışma
   * testi gibi eski çağıranların kaynağı). Varsa KAYNAK budur.
   */
  sourceBlock?: string;
  /**
   * Yazılı deneme (26 Ekim 2026): soru kaynak cümlesini aynen taşımak zorunda değildir.
   * Yanlış olgu, bozuk öğe, kopya ve konu dışı yine düşer.
   */
  rephrase?: boolean;
  /** Çağıranın isteği: soru türü planı, konu kodları, kapsam. */
  brief?: string;
  runningHeaders?: string[];
  /**
   * Öğrencinin seçtiği zorluk. 16 Ekim 2026'ya kadar kuruluştaki kaydırıcı
   * yazara hiç ulaşmıyordu; "Orta" seçilen Pediatri testi tanım sorularıyla geldi.
   */
  difficulty?: QuizDifficulty;
  /**
   * Testte tam bir soru çok cevaplı (17 Ekim 2026, ürün sahibinin kararı; Astra'nın konu
   * testinde 7 sorudan biri, kısmi puanla). Yalnız hazırlığın konu testi açar.
   */
  multi?: boolean;
  /**
   * "topic_test": yoldaki konu testi (20 Ekim 2026). KONU TESTİ kuralları (kapsam, kök kalıbı, tablo
   * satırı, vaka, uyarı, ders) ve H-K denetimi yalnız burada. Motoru paylaşan öbür yüzeyler (zayıf
   * nokta, test aracı, soru-cevap, odaklı pratik, son kontrol, düello, tanı, tanışma, yazılı deneme)
   * bugünkü gibi kalır.
   */
  scope?: "topic_test";
  /** Konunun kaydedilmiş ders(ler)i (`lessonQuizContext`). Yoksa test dersi bilmeden yazılır. */
  lesson?: LessonQuizContext | null;
  /** İkinci geçiş: testte zaten olan sorular; kalıpları ve maddeleri tekrar edilmez. Yalnız konu testinde. */
  avoid?: QuizQuestion[];
  /**
   * Öğrenci ekranda bekliyor (24 Ekim 2026). Konu testinde yalnız pedagojik sorun (H-K, kapsam) için düzeltme
   * turu açılmaz; o sorular yumuşak kurtarmayla teslim edilir, doğruluk sorunu (A-G, yapı) yine düzeltilir.
   * Canlıda ücretsiz öğrencinin soğuk konu testi 150-230 sn sürdü: her tur bir düzeltme + bir denetim çağrısı
   * (~35 sn'lik iki çağrı) ekliyordu. Önceden yazım (öğrenci beklemiyor) bütün turları koşar.
   */
  urgent?: boolean;
  /**
   * Aynı hazırlıkta daha önce üretilmiş soru kökleri (aynı konunun önceki testleri, önceki konuların testleri;
   * 25 Ekim 2026, canlı test P1-2). Yazara "tekrarlama" listesi olarak gider; üretimden sonra aynı bilgiyi
   * soran soru deterministik olarak elenir (`dropNearDuplicates`).
   */
  previousStems?: string[];
  /** Bu testin kapsamı: kaçıncı test olduğu ve konunun hangi alt başlıkları (`practiceCoverageBlock`). */
  coverage?: string;
  /**
   * Şık sayısı (28 Ekim 2026, Paket A): ortaokul/LGS 4, lise/YKS/KPSS/TUS/üniversite 5 (`resolveOptionCount`).
   * Verilmezse `runTeacherQuiz` öğrencinin profilinden bulur.
   */
  optionCount?: OptionCount;
};

const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

function optionLetters(count: OptionCount): string {
  return OPTION_LETTERS.slice(0, count).join(", ");
}

export type QuizDifficulty = "kolay" | "orta" | "ileri";

/** Kurulumdan gelen değer; tanınmayan değer yazara zorluk satırı göndermez. */
export function quizDifficulty(value: string | null | undefined): QuizDifficulty | undefined {
  if (value === "kolay" || value === "orta" || value === "ileri") return value;
  if (value === "easy") return "kolay";
  if (value === "medium") return "orta";
  if (value === "hard") return "ileri";
  return undefined;
}

const DIFFICULTY_LINE: Record<QuizDifficulty, string> = {
  kolay: "kolay — tanıma ve temel ayrım; tanım sorusu olabilir ama çeldiriciler yine aynı aileden.",
  orta:
    "orta — soruların yarısından çoğu kısa bir vakayla açılır (kim, hangi bulgu ya da durum) ve kavramı buldurur ya da " +
    "iki kardeş kavramı ayırt ettirir; en fazla bir tanım sorusu.",
  ileri:
    "ileri — her soru bir vakayla açılır ve uygulama ya da çıkarım ister: koşul, istisna, iki bilginin birleşimi, " +
    "sıradaki doğru adım; tanım sorusu yok.",
};

function schema(optionCount: OptionCount): string {
  const options = Array.from({ length: optionCount }, () => '"…"').join(",");
  const why = Array.from({ length: optionCount }, (_, index) => (index === 0 ? '"şık 1 için tek cümle"' : `"şık ${index + 1}"`)).join(", ");
  return `{
  "questions": [
    {
      "text": "soru kökü; cevabı içinde vermez",
      "options": [${options}],
      "correct": "doğru şıkkın metni, options içinden aynen",
      "multi": false,
      "explanation": "doğru cevabın nedeni + her çeldiricinin gerçekte ne olduğu, 1-3 cümle",
      "optionWhy": [${why}],
      "misconceptionTag": "bu sorunun yakaladığı yanılgının adı",
      "learningObjective": "bu soru neyi ölçüyor, tek cümle",
      "steps": ["yalnız hesap sorusunda 2-5 kısa adım; son adım doğru şıkka varır"]
    }
  ]
}`;
}

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her soru, her şık ve her gerekçe yalnızca KAYNAK metnindeki bilgiye dayanır. Kaynakta yoksa " +
  "sorma; genel kültürden ekleme. Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz. Kaynakta " +
  "açıkça bozuk bir cümle varsa (olumsuzluk eki düşmüş, kendi örnekleriyle çelişiyor) kaynağın kendi açıklama ve " +
  `örneklerinden anlaşılan anlamı kullan; bundan söz etme.\n${SOURCE_NUMBER_PRIORITY}\n\n`;

const RULE_EXAM =
  "KONU KURALI (yazılı deneme): Sorular belgenin konularını kapsar ve doğrudur. Cümleyi aynen kopyalamak " +
  "zorunda değilsin; aynı noktayı başka bağlamda, başka sayıyla ya da başka açıdan sorabilirsin. Yanlış olgu, " +
  "konunun dışına çıkan soru, boş kök ve anahtarı şıklarda olmayan soru yazma. Kaynak bir iddiayı açıkça " +
  `söylüyorsa onunla çelişme.\n${SOURCE_NUMBER_PRIORITY}\n\n`;

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Soruları sınav müfredatındaki yerleşik, ders kitaplarında " +
  "tartışmasız bilgiden yaz. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı sorma; güncel olarak " +
  "değişebilecek bilgiyi sorma. Aşağıda 'kaynak' denen her yer bu testte konunun yerleşik bilgisi anlamına gelir.\n\n";

/**
 * Kökün cevabı vermesi (30 Ekim 2026, canlı tur, yazılı deneme S4): kök "tarımsal verimsizlik sürerken …" diye
 * durumu kurdu, doğru şık aynı durumu yeniden söyledi ("Tarımsal verimsizliğin … sürmesi"). Yazar ve denetçi bu
 * metni aynen okur; kod (`stemPhraseInAnswer`) kökün art arda üç sözcüğünü doğru şıkta arar.
 */
export const STEM_ECHO_RULE =
  "Kök cevabı vermez; doğru şıkkın kelimeleri kökte geçmez ve doğru şık kökün kurduğu durumu yeniden söylemez " +
  "('kan şekeri yükselirken' diye açılan kökün doğru şıkkı 'kan şekerinin yükselmesi' olamaz): kökün ifadesini taşıyan " +
  "tek şık doğru şıksa öğrenci onu eşleştirerek bulur.";

const design = (optionCount: OptionCount) =>
  "SORU TASARIMI:\n" +
  "- Sınavdaki gibi, düşündüren sorular yaz; ezber cümlesini kopyalayıp boşluk açma.\n" +
  "- Türleri karıştır: bir durumdan (olaydan) kavramı buldurma; birbirine karıştırılan iki kardeş kavramı ayırt " +
  "ettirme; bir özelliğin hangi kavrama ait olduğunu sorma; kaynakta sayı ya da bağıntı varsa hesap.\n" +
  "- Her soru tek kavramı ölçer. Kolaydan zora sırala.\n" +
  `- ŞIK SAYISI: her soruda tam ${optionCount} şık (${optionLetters(optionCount)}); öğrencinin sınavı bu biçimde. ` +
  "Tek doğru şık (multi false); aşağıda ÇOK CEVAPLI SORU kuralı varsa yalnız o soru istisna. Çeldiriciler aynı ailedeki kardeş terimler ya da öğrencinin gerçekten " +
  "yaptığı hata; şıklar aynı türden ve benzer uzunlukta. 'Hepsi', 'hiçbiri', 'yukarıdakilerin' şıkkı yok.\n" +
  // 30 Ekim 2026 (canlı tur): ders ve test yazarı aynı çeldirici türü kuralını okur.
  `- ${SAME_KIND_DISTRACTOR_RULE}\n` +
  "- Kök, doğru şıkkı ötekilerden ayıran ipucunu vermez ('kilo akut etkilenir' deyip 'kronik olanı hangisi' diye sorup " +
  "şıklara kiloyu koymak gibi).\n" +
  "- Şıkların biçimi cevabı ele vermez: doğru şık en uzun ya da tek ayrıntılı şık olmaz; çeldirici doğru şıkkın " +
  "olumsuz kopyası olmaz ('uygun oranlı ORS' karşısında 'uygun oranı gözetilmeyen karışım'); bulgu kümesi sorusunda " +
  "tek 'ağır' şık 'hafif' şıkların arasında durmaz — yanlış kümeler de karışık ve gerçekçi olur.\n" +
  `- ${STEM_ECHO_RULE} Sayma sorusu ('kaç tür vardır') yok. Olumsuz kök ` +
  "('hangisi değildir') en fazla bir soruda ve olumsuz ek **koyu** yazılır.\n" +
  "- explanation doğrunun nedenini söyler VE her çeldiricinin gerçekte ne olduğunu söyler. optionWhy her şık için bir " +
  "cümle, options ile aynı sırada. Hesap sorusunda steps: her adım tek işlem, kendi içinde doğru.\n" +
  `- ${OPTION_ORDER_RULE}\n` +
  `- ${FUNCTION_NOTATION_RULE}\n` +
  "- Yanlış şıkkın optionWhy'ı o şıkkın gerçekte neye karşılık geldiğini söyler ('(√2/2, √2/2) 45°'nin noktasıdır; " +
  "90°'nin noktası (0, 1)'dir'). Şıkkı tekrar edip yalnız 'olamaz / değildir' demek gerekçe değildir.\n" +
  "- İki şık aynı şeyi söylemez: aynı noktaları ya da öğeleri farklı sırayla ('(1, 0) ve (0, 1)' ile '(0, 1) ve " +
  "(1, 0)'), aynı değeri farklı yazımla ('1/2' ile '0,5').\n" +
  `- ${EQUIVALENT_OPTIONS_RULE}\n` +
  "- 'Hangisi doğrudur / hangisi özelliğidir' diye soruyorsan iki doğru kuralı yan yana şık yapma; kural bir koşula " +
  "bağlıysa (aynı taban, aynı üs gibi) koşulu kökte ya da şıkta yaz.\n" +
  "- Açı ya da sayı aralığı veriyorsan uç noktaların dahil olup olmadığını açıkça yaz (0° ≤ x < 360° gibi); " +
  "'0° ile 360° arasında' uçları belirsiz bırakır ve iki cevabı doğru yapar.\n" +
  `- ${THRESHOLD_OPTIONS_RULE}\n` +
  `- ${TEST_SET_RULE}\n` +
  "- Yazmadan önce her soruyu kendin çöz: tek doğru cevap var mı, anahtar doğru mu, diğer şıkların her biri kesin " +
  "yanlış mı? Adım adım çözümü `steps` alanına, doğru şıkkın sağlamasını `explanation` alanına aynı çağrıda yaz.\n" +
  // 29 Ekim 2026 (Paket H): kök tamlığı ve anahtar–açıklama kuralı ders, test ve deneme yazarında aynı metin.
  `- ${SELF_CONTAINED_STEM_RULE}\n` +
  `- ${KEY_CONSISTENCY_RULE}\n\n` +
  "YAZMA: 'Kaynak:', sayfa numarası, 'metne göre', 'belgede', 'PDF', 'belirtilmiştir', 'belirtildiği gibi' — soru " +
  "bilgiyi kaynağa değil konuya sorar ('hangi gerekçe belirtilmiştir' değil 'neden uygun değildir').\n\n";

/**
 * Yoldaki konu testinin kuralları (20 Ekim 2026). Kör kıyasta Pediatri solunum testimiz kaynak
 * tablosunun dört satırını aynı kalıpla sordu ("En olası tanı hangisidir?"; kök satırın "Bulgular"
 * hücresiydi), uyarı ve tedavi cümlelerini hiç sormadı; KPSS testinde 5 sorudan 4'ü aynı bloktandı.
 * Yazar, denetçi ve düzeltme aynı metni okur (denetçide "aynen"); denetçinin H-K maddeleri bunun
 * aynası. "Vaka" tanımı da burada: zorluk satırı vaka istiyor ama P4'ün vakaları tablo satırıydı.
 * Yalnız `scope: "topic_test"`; öbür yüzeyler bu metni görmez.
 */
export const TOPIC_TEST_RULE =
  "KONU TESTİ (öğrenci bu testi konunun dersinden sonra çözer; sınavda bu konudan gelecek soruya hazırlar):\n" +
  "- KAPSAM: Her soru tek bir SINAVDA SORULUR maddesini (madde yoksa kaynağın bir bölümünü) yoklar; \"point\" alanına " +
  "maddenin numarasını (\"3\") ya da bölümün başlığını yaz. Sıra: önce '(derste işlendi)' yazan maddeler, sonra " +
  "öbürleri; ders bilgisi yoksa bütün maddeler eşit. Sorulmamış madde varken hiçbir madde ikinci kez sorulmaz; aynı " +
  "tablodan en çok 2 soru.\n" +
  "- KÖK KALIBI: Aynı soru kalıbı ('En olası tanı hangisidir?', 'Bu yönetim biçimi hangisidir?') en çok 2 soruda. " +
  "Ötekiler başka bir iş ister: sıradaki doğru adım, yapılmaması gereken, ağırlık ya da uyarı bulgusu, iki kardeş " +
  "kavramı ayıran bulgu, istisna, koşul.\n" +
  "- TABLO SATIRI SORU DEĞİLDİR: Kök, kaynaktaki bir tablo satırını ya da cümleyi aynen (ya da eş anlamlı " +
  "kelimelerle birebir) verip satırın öteki hücresini sordurmaz. Bulguyu bir vakanın içinde ver; en az bir ayrıntı " +
  "yorumlanmadan doğru şıkka gidilemesin.\n" +
  "- VAKA: Vaka, kaynaktaki bilginin somut hâlidir (kaynak 'küçük bebek' diyorsa '5 aylık bebek'; 'tetikleyici: " +
  "egzersiz' ise 'koşudan sonra başlayan hışıltı'). Tablo satırını ya da kaynak cümlesini kopyalamak vaka değildir. " +
  "Vakaya kaynakta olmayan bulgu, eşik, sayı, yaş sınırı, etken ya da tedavi eklenmez; doğru cevap yalnız kaynaktaki " +
  "bilgiyle bulunur.\n" +
  "- UYARI: Kaynakta uyarı, yasak ya da yönetim cümlesi varsa ('… doğru değildir', '… kaçınılır', 'ciddi uyarı " +
  "bulguları', SINAV İPUCU / DİKKAT / ALARM kutusu) en az bir soru bunlardan birini yoklar.\n" +
  "- DERS: DERSTE SORULANLAR'daki soruları aynen ya da aynı kalıpla tekrar etme; aynı bilgiyi bir üst düzeyde " +
  "(uygulama, ayırt etme) sor. Bir kavramın DERSTE GEÇEN TERİMLER'de adı varsa o adı kullan; kaynaktaki başka adını " +
  "kullanırsan dersteki adı parantezde ver ('eş yönlü (koterminal)').\n" +
  // 22 Ekim 2026 kör kıyas (2. tur): testte iki sorunun aynısı (S3/S4), "Bir öğrenci … yorumluyor" kurgusu,
  // "kaynakta verilen uyarı" kökü, kökün cevabı vermesi ve kök-şık uyumsuzluğu.
  "- YUVA: 5 soruluk testte sorular 1'den 5'e ayrı yuvalardır. Her yuva konunun ayrı bir alt kavramını veya ayrı bir " +
  "soru tipini yoklar. Aynı formülü yalnız sayıları değiştirerek ikinci kez sorma.\n" +
  "- TEKRAR VE KURGU: Testte iki soru aynı bilgiyi aynı yoldan sormaz. 'Bir öğrenci … diyor / savunuyor / " +
  "yorumluyor' kalıbı vaka değildir; vakayı olayın kendisiyle kur. Kök kaynağı anmaz ('kaynakta verilen', 'notlarda " +
  "belirtilen'). Kök cevabın sözcüklerini taşımaz; şıklar kökün sorduğu türden olur (kök bir yaklaşım soruyorsa " +
  "şıklar yaklaşımdır).\n";

const POINT_FIELD_NOTE =
  'Bu testte her soruya "point" alanı ekle (string): yokladığı SINAVDA SORULUR maddesinin numarası ("3") ya da ' +
  "madde yoksa kaynak bölümünün başlığı.";

/**
 * Çok cevaplı sorunun çeldiricisi (20 Ekim 2026). P4'ün çok cevaplı sorusunda 4 şıktan 3'ü doğruydu,
 * tek yanlış şık başka hastalığın (krup) bulgusuydu: konuyu bilmeyen eler. Yazar ve denetçi aynı metni okur.
 */
export const MULTI_DISTRACTOR_RULE =
  "Çok cevaplı soruda yanlış şıklar sorulan durumla aynı bağlamdandır: aynı konuda geçen ama sorulan özelliği " +
  "taşımayan öğeler (bronşiolitte görülen ama yatışı artırmayan bir bulgu gibi). Başka bir kavramın ya da hastalığın " +
  "tipik özelliği çeldirici değildir; soru tahminle çözülür. Kaynak bir listeyi sayıyorsa doğrular o listeden, " +
  "çeldiriciler aynı konunun öteki öğelerinden seçilir.";

const multiQuestion = (optionCount: OptionCount) =>
  `ÇOK CEVAPLI SORU: Bu testte tam bir soru çok cevaplıdır (multi true) ve testin son sorularından biridir. ${optionCount} şık, ` +
  "2 ya da 3'ü doğru; correct doğru şıkların metinlerinden oluşan dizidir. Kök 'hangileri' diye sorar ('Aşağıdakilerden " +
  "hangileri … ?'). Doğru şıkların her biri kendi başına kesin doğru, yanlış şıkların her biri kesin yanlıştır; " +
  `yarı doğru şık yok. ${MULTI_DISTRACTOR_RULE} explanation hangi şıkların neden doğru, ötekilerin neden yanlış ` +
  `olduğunu söyler. ${MULTI_POLARITY_RULE} Öteki bütün sorular tek doğru şıklıdır (multi false).\n\n`;

const GAPS_FOCUS =
  "BU TEST TUZAK SORULARI: her soru, kaynağın uyardığı ya da öğrencinin sık karıştırdığı bir ayrımı yoklar " +
  "(yakın iki kavram, istisna, koşul). misconceptionTag o tuzağın adıdır.\n\n";

type QuizScope = TeacherQuizInput["scope"];

function system(
  mode: TeacherLessonMode,
  focus: TeacherQuizInput["focus"],
  multi = false,
  scope?: QuizScope,
  rephrase = false,
  optionCount: OptionCount = DEFAULT_OPTION_COUNT,
): string {
  const intro = rephrase
    ? "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor. Belgesindeki konulardan, sınavdaki " +
      "gibi kısa bir test hazırlıyorsun.\n\n"
    : mode === "topic"
      ? "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ama belge yüklemedi. Bu konudan, sınavdaki " +
        "gibi kısa bir test hazırlıyorsun.\n\n"
      : "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ve sana kendi ders belgesini verdi. Bu " +
        "belgeden, sınavdaki gibi kısa bir test hazırlıyorsun.\n\n";
  const topicTest = scope === "topic_test";
  return (
    intro +
    (rephrase ? RULE_EXAM : mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    design(optionCount) +
    (topicTest ? `${TOPIC_TEST_RULE}\n` : "") +
    (multi ? multiQuestion(optionCount) : "") +
    (focus === "gaps" ? GAPS_FOCUS : "") +
    `${CONTENT_STYLE}\n\nYalnızca bu şemada JSON döndür:\n${schema(optionCount)}` +
    (topicTest ? `\n${POINT_FIELD_NOTE}` : "") +
    `\n\n${STUDENT_LEAK_BAN}`
  );
}

export function quizSystem(
  mode: TeacherLessonMode = "document",
  focus: TeacherQuizInput["focus"] = "practice",
  multi = false,
  scope?: QuizScope,
  rephrase = false,
  optionCount: OptionCount = DEFAULT_OPTION_COUNT,
): string {
  return system(mode, focus, multi, scope, rephrase, optionCount);
}

/**
 * Konu testinin madde listesi: önce derste işlenenler ("(derste işlendi)"), sonra öbürleri
 * (20 Ekim 2026, ürün sahibinin kararı: önce dersin öğrettiği, sonra konunun öbür maddeleri; ders
 * yoksa hepsi eşit). Yazar, denetçi ve kodun kapsam sayımı aynı sırayı ve numarayı okur.
 */
export function topicTestPoints(input: Pick<TeacherQuizInput, "examPoints" | "lesson" | "scope">): string[] {
  const lessonText = input.lesson?.text ?? "";
  const all = (input.examPoints ?? []).map((point) => point.trim()).filter(Boolean);
  // Dersin hazırlanamayan bölümü sorulmaz (25 Ekim 2026).
  const list = (input.scope === "topic_test" ? withoutMissingPoints(all, input.lesson?.missing ?? [], lessonText) : all).slice(
    0,
    EXAM_POINTS_MAX,
  );
  if (input.scope !== "topic_test" || !lessonText) return list;
  const taught = list.filter((point) => pointTaught(point, lessonText));
  if (!taught.length) return list;
  return [...taught.map((point) => `${point} (derste işlendi)`), ...list.filter((point) => !taught.includes(point))];
}

function quizPointsBlock(input: TeacherQuizInput): string {
  return examPointsBlock(input.scope === "topic_test" ? topicTestPoints(input) : input.examPoints, "quiz");
}

/** Dersin sorduğu sorular ve terimleri; ders yoksa boş (istem bugünkü gibi). */
function lessonBlock(input: TeacherQuizInput): string {
  if (input.scope !== "topic_test" || !input.lesson) return "";
  const checks = input.lesson.checks.slice(0, LESSON_CHECKS_MAX);
  const terms = input.lesson.terms.slice(0, LESSON_TERMS_MAX);
  return [
    checks.length
      ? `DERSTE SORULANLAR (öğrenci bunları derste çözdü; aynen ya da aynı kalıpla sorma):\n${checks.map((check) => `- ${check}`).join("\n")}`
      : "",
    terms.length ? `DERSTE GEÇEN TERİMLER: ${terms.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const stemLine = (question: QuizQuestion) => `- ${question.text}${question.point ? ` (madde: ${question.point})` : ""}`;

function avoidBlock(input: TeacherQuizInput): string {
  if (input.scope !== "topic_test" || !input.avoid?.length) return "";
  return `TESTTE ZATEN OLAN SORULAR (bunları, maddelerini ve kalıplarını tekrar etme):\n${input.avoid.map(stemLine).join("\n")}`;
}

function quizSource(input: TeacherQuizInput): string {
  if (input.mode === "topic") return "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle yaz)";
  return `KAYNAK:\n${input.sourceBlock?.trim() || sourceText(input.pages)}`;
}

export function quizUserPrompt(input: TeacherQuizInput, ask = input.count): string {
  return [
    input.prepTitle ? `SINAV: ${input.prepTitle}` : "",
    input.topicLabel ? `KONU: ${input.topicLabel}` : "",
    `SORU SAYISI: ${ask}`,
    input.difficulty ? `ZORLUK: ${DIFFICULTY_LINE[input.difficulty]}` : "",
    input.brief ? `İSTEK (kurallarla çelişirse kurallar geçerli):\n${input.brief}` : "",
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    quizPointsBlock(input),
    // Kaynak sonda kalır: model en son okuduğu talimata daha sadık.
    lessonBlock(input),
    avoidBlock(input),
    input.coverage?.trim() ? `BU TESTİN KAPSAMI:\n${input.coverage.trim()}` : "",
    avoidListBlock(
      "DAHA ÖNCE SORULAN VE TEKRARLANMASI YASAK SORULAR (aynı bilgiyi başka kalıpla da sorma; konunun henüz sorulmamış noktalarına git):",
      input.previousStems ?? [],
    ),
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    quizSource(input),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Çok cevaplı soruda "birden fazla doğru" sorun değil, şartı; anahtarın her parçası ayrı ayrı denetlenir.
const MULTI_VERIFY =
  "multi true olan soruda (çok cevaplı) birden fazla doğru şık olması B değildir: işaretli doğruların her biri kesin " +
  "doğru, işaretsiz şıkların her biri kesin yanlış olmalı; değilse A. Yarı doğru şık B'dir. Yazarın çok cevaplı soru " +
  `kuralı: ${MULTI_DISTRACTOR_RULE} Buna uymayan yanlış şık G'dir. Yazarın kutupluluk kuralı (aynen): ` +
  `${MULTI_POLARITY_RULE} Gerekçesi kendisini çürüten doğru şık ya da onaylayan yanlış şık D'dir.\n`;

/** Denetçinin B, E ve G maddelerine eklenen yazar kuralları (aynen; 30 Ekim 2026). */
const VERIFY_B_RULES = ` Yazarın eşik kuralı (aynen): ${THRESHOLD_OPTIONS_RULE}`;
const VERIFY_E_RULES = ` Yazarın kök kuralı (aynen): ${STEM_ECHO_RULE}`;
const VERIFY_G_RULES = ` Yazarın çeldirici kuralı (aynen): ${SAME_KIND_DISTRACTOR_RULE}`;
const VERIFY_SET =
  `Testin bütünü (yazarın kuralı, aynen): ${TEST_SET_RULE} Buna uymayan sonraki soru G'dir.\n`;

const VERIFY_DOCUMENT =
  "Sen titiz bir sınav sorusu denetçisisin. Testi yazıldığı KAYNAK ile karşılaştırıyorsun. HER SORUYU ÖNCE KENDİN " +
  "ÇÖZ (anahtara bakmadan), sonra anahtarla karşılaştır. Şunları bul:\n" +
  "A) Anahtar yanlış: senin çözümün farklı bir şık.\n" +
  "B) Birden fazla savunulabilir doğru şık ya da hiç doğru şık yok; kök belirsiz. İki doğru kural yan yana şık " +
  "olmuş; aralığın uç noktaları yazılmamış ve bu yüzden cevap değişiyor; iki şık aynı şeyi farklı sırayla ya da " +
  `farklı yazımla söylüyor. Yazarın okuduğu kural (aynen): ${EQUIVALENT_OPTIONS_RULE}${VERIFY_B_RULES}\n` +
  "C) Kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi (kök, şık ya da gerekçede).\n" +
  `Sayı önceliği (yazarın kuralı, aynen): ${SOURCE_NUMBER_PRIORITY} Notun sayısıyla, aralığıyla ya da adıyla çelişen anahtar, ` +
  "şık ya da gerekçe C'dir ('high').\n" +
  "D) explanation, optionWhy ya da steps'te yanlış bilgi; optionWhy satırının yanlış şıkka ait olması; yanlış şıkkın " +
  "optionWhy'ının şıkkı tekrar edip yalnız 'olamaz / değildir' demesi; explanation'ın şıklara sırasıyla ya da harfiyle " +
  "gönderme yapması (şıklar karıştırılıyor); açıklamanın, adımların ya da ipucunun vardığı sonucun anahtardan başka " +
  "bir şıkta yazması. Yazarın okuduğu kurallar (aynen): " +
  `${OPTION_ORDER_RULE} ${FUNCTION_NOTATION_RULE} ${KEY_CONSISTENCY_RULE}\n` +
  "E) Kökün cevabı vermesi; kökün ekranda ya da kâğıtta olmayan bir şekle, grafiğe, haritaya, tabloya, şemaya ya da " +
  `denkleme gönderme yapıp veriyi kendi içinde taşımaması. Yazarın okuduğu kural (aynen): ${SELF_CONTAINED_STEM_RULE}${VERIFY_E_RULES}\n` +
  "F) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "G) Çeldiricinin sorulan kategoriden olmaması: konuyu bilmeyen birinin eleyebileceği şık; kökün doğru şıkkı " +
  "ötekilerden ayıran ipucunu vermesi; doğru şıkkın en uzun ya da tek farklı tonda (tek 'ağır' küme) olması; " +
  "çeldiricinin doğru şıkkın olumsuz kopyası olması; çok cevaplı soruda yanlış şıkkın sorulan bağlamdan değil başka " +
  `bir kavramdan ya da hastalıktan gelmesi (soru tahminle çözülüyor).${VERIFY_G_RULES}\n` +
  VERIFY_SET +
  "Kaynakta açıkça bozuk bir cümlenin kaynağın kendi örnekleriyle tutarlı anlamıyla kullanılması sorun değildir.\n" +
  MULTI_VERIFY +
  "A-G 'high'. Şunlar 'low': kolay soru, uzun gerekçe.\n";

const VERIFY_TOPIC =
  "Sen titiz bir sınav sorusu denetçisisin. Belgesi olmayan bir testi doğruluk açısından denetliyorsun. HER SORUYU ÖNCE " +
  "KENDİN ÇÖZ (anahtara bakmadan), sonra anahtarla karşılaştır. Şunları bul:\n" +
  "A) Anahtar yanlış: senin çözümün farklı bir şık.\n" +
  "B) Birden fazla savunulabilir doğru şık ya da hiç doğru şık yok; kök belirsiz. İki doğru kural yan yana şık " +
  "olmuş; aralığın uç noktaları yazılmamış ve bu yüzden cevap değişiyor; iki şık aynı şeyi farklı sırayla ya da " +
  `farklı yazımla söylüyor. Yazarın okuduğu kural (aynen): ${EQUIVALENT_OPTIONS_RULE}${VERIFY_B_RULES}\n` +
  "C) Yanlış ya da tartışmalı bilgi; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n" +
  "D) explanation, optionWhy ya da steps'te yanlış bilgi ya da hesap hatası; optionWhy satırının yanlış şıkka ait " +
  "olması; yanlış şıkkın optionWhy'ının şıkkı tekrar edip yalnız 'olamaz / değildir' demesi; explanation'ın şıklara " +
  "sırasıyla ya da harfiyle gönderme yapması (şıklar karıştırılıyor); açıklamanın, adımların ya da ipucunun vardığı " +
  "sonucun anahtardan başka bir şıkta yazması. Yazarın okuduğu kurallar (aynen): " +
  `${OPTION_ORDER_RULE} ${FUNCTION_NOTATION_RULE} ${KEY_CONSISTENCY_RULE}\n` +
  "E) Kökün cevabı vermesi; kökün ekranda ya da kâğıtta olmayan bir şekle, grafiğe, haritaya, tabloya, şemaya ya da " +
  `denkleme gönderme yapıp veriyi kendi içinde taşımaması. Yazarın okuduğu kural (aynen): ${SELF_CONTAINED_STEM_RULE}${VERIFY_E_RULES}\n` +
  "F) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "G) Çeldiricinin sorulan kategoriden olmaması: konuyu bilmeyen birinin eleyebileceği şık; kökün doğru şıkkı " +
  "ötekilerden ayıran ipucunu vermesi; doğru şıkkın en uzun ya da tek farklı tonda (tek 'ağır' küme) olması; " +
  "çeldiricinin doğru şıkkın olumsuz kopyası olması; çok cevaplı soruda yanlış şıkkın sorulan bağlamdan değil başka " +
  `bir kavramdan ya da hastalıktan gelmesi (soru tahminle çözülüyor).${VERIFY_G_RULES}\n` +
  VERIFY_SET +
  MULTI_VERIFY +
  "A-G 'high'. Şunlar 'low': kolay soru, uzun gerekçe.\n";

const VERIFY_EXAM = VERIFY_DOCUMENT.replace(
  "C) Kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi (kök, şık ya da gerekçede).\n",
  "C) Yanlış olgu ya da konunun dışında kalan bilgi (kök, şık ya da gerekçede); kaynağın açık iddiasıyla çelişen bilgi. " +
    "Kaynak cümlesini aynen taşımamak, aynı noktayı başka sayı, bağlam ya da açıyla sormak C değildir.\n",
);

const VERIFY_JSON =
  'JSON döndür: {"issues":[{"question":0,"severity":"high","problem":"…","fix":"…"}]} — question, 0\'dan başlayan ' +
  "soru sırasıdır. Sorun yoksa issues boş dizi.";

/**
 * Konu testi denetimi (20 Ekim 2026): yazarın KONU TESTİ kuralları aynen + aynası H-K. H-K pedagojik;
 * kod bunları yumuşak sayar (düzeltilir ya da yedekle değişir; düzelmezse testi düşürmez), J kapsam
 * eksiği bir düzeltme turu açar. Her sorunun harfi "code" alanında; harfsiz sorun bugünkü gibi engeller.
 */
function topicTestVerify(mode: TeacherLessonMode): string {
  return (
    (mode === "topic" ? "Belgesiz testte aşağıda 'kaynak' denen her yer konunun yerleşik bilgisidir.\n" : "") +
    "Yazarın uyduğu KONU TESTİ kuralları (aynen):\n" +
    TOPIC_TEST_RULE +
    "Bunlara göre ayrıca şunları bul:\n" +
    "H) Tablo/cümle tekrarı: kök kaynaktaki bir tablo satırını ya da cümleyi neredeyse aynen verip satırın öteki " +
    "hücresini soruyor; yorumlanacak ayrıntı yok. Bulguları bir vakanın içinde verip ayırt ettiren ayrıntıyı yorumlatan " +
    "soru H değildir.\n" +
    "I) Tekrar: aynı kök kalıbı üçüncü kez geçiyor ya da aynı madde (point) sorulmamış madde varken ikinci kez " +
    "soruluyor. Tekrarlayan (sonraki) soruyu yaz; fix: hangi madde ya da kalıp.\n" +
    "J) Kapsam: kaynakta uyarı/yasak/yönetim cümlesi var ama hiçbir soru bunlardan birini yoklamıyor; ya da '(derste " +
    "işlendi)' yazan bir madde hiç sorulmamışken işlenmemiş bir madde sorulmuş. TEST'te en çok tekrar eden soruyu yaz; " +
    "fix: sorulması gereken uyarı ya da madde.\n" +
    "K) Ders: soru DERSTE SORULANLAR'daki bir soruyu aynen ya da aynı kalıpla tekrar ediyor; ya da kavramın DERSTE " +
    "GEÇEN TERİMLER'deki adı kullanılmamış ve parantezde de verilmemiş.\n" +
    "C notu: Vakadaki ayrıntı kaynaktaki bilginin somut hâliyse (kaynak \"küçük bebek\", soru \"5 aylık bebek\") C " +
    "değildir; doğru cevap kaynakta olmayan bir bilgiye (bulgu, eşik, sayı, tedavi) dayanıyorsa C'dir.\n" +
    "TESTİN KABUL EDİLEN SORULARI verildiyse onları denetleme; yalnız tekrar ve kapsam için bak, sorunu TEST'teki " +
    "soruya yaz.\n" +
    "H-K 'high'. Her sorunun \"code\" alanına maddenin harfini yaz (A-K).\n"
  );
}

const VERIFY_JSON_CODED =
  'JSON döndür: {"issues":[{"question":0,"code":"A","severity":"high","problem":"…","fix":"…"}]} — question, ' +
  "TEST'te 0'dan başlayan soru sırasıdır. Sorun yoksa issues boş dizi.";

export function quizVerifySystem(mode: TeacherLessonMode = "document", scope?: QuizScope, rephrase = false): string {
  const base = rephrase ? VERIFY_EXAM : mode === "topic" ? VERIFY_TOPIC : VERIFY_DOCUMENT;
  return scope === "topic_test" ? base + topicTestVerify(mode) + VERIFY_JSON_CODED : base + VERIFY_JSON;
}

/**
 * `accepted`: konu testinde testte kalan sorular (önceki geçiş ve kabul edilenler). Denetçi tekrar ve
 * kapsamı bütün teste bakarak görür; sorun indeksleri yine yalnız TEST'e göre.
 */
export function quizVerifyUserPrompt(questions: QuizQuestion[], input: TeacherQuizInput, accepted: QuizQuestion[] = []): string {
  const head =
    input.mode === "topic"
      ? `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n${input.brief ? `İSTEK: ${input.brief.slice(0, 600)}\n` : ""}(Belgesiz test.)`
      : // Belgeli kipte de denetçi İSTEK'i görür (20 Ekim 2026): podcast dinleme kontrolünün kuralları
        // ("Ada/Kerem geçmez", itiraf doğru şık olamaz) yalnız yazara gidiyordu.
        `${quizSource(input)}${input.brief ? `
İSTEK: ${input.brief.slice(0, 600)}` : ""}`;
  const context =
    input.scope === "topic_test"
      ? [
          quizPointsBlock(input),
          lessonBlock(input),
          accepted.length
            ? `TESTİN KABUL EDİLEN SORULARI (bunları denetleme; yalnız tekrar ve kapsam için bak):\n${JSON.stringify({ questions: accepted.map(publicShape) })}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "";
  return `${head}${context ? `\n\n${context}` : ""}\n\nTEST (JSON):\n${JSON.stringify({ questions: questions.map(publicShape) })}`;
}

/**
 * Anahtarı görmeden çözen ikinci geçiş (25 Ekim 2026). Asıl denetçi açıklamayı
 * da okuduğu için anahtarı görür ve onu onaylayabilir. Bu çağrıya yalnız kök ve
 * şıklar gider; kod, dönen şıkkı anahtarla karşılaştırır.
 */
export function quizAdvocateSystem(): string {
  return (
    "Sen titiz bir sınav sorusu denetçisisin ve anahtarı görmeden çözen bağımsız bir çözücüsün. " +
    "Sana yalnız kök ve şıklar verilir; doğru şık, gerekçe ve adım yoktur. Her soruyu kendin çöz. " +
    "Çok cevaplı soruda doğru olan bütün şıkları seç. Şık metnini listedeki yazımla birebir yaz. " +
    "Emin değilsen o sorunun choice alanını boş dizi bırak; tahmin etme. " +
    'Yalnız JSON: {"solved":[{"question":0,"choice":["şık metni"]}]}'
  );
}

export function quizAdvocateUserPrompt(questions: QuizQuestion[]): string {
  const blind = questions.map((question) => ({
    text: question.text,
    options: question.options,
    multi: Boolean(question.multi),
  }));
  return `SORULAR (anahtar yok):\n${JSON.stringify({ questions: blind })}`;
}

function foldOption(text: string): string {
  return text.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

/** Bağımsız çözümün anahtarla uyuşmadığı sorular. Emin olunmayan satır sorun yazmaz. */
export function blindKeyMismatches(questions: QuizQuestion[], raw: unknown): QuizIssue[] {
  const solved = (raw as { solved?: unknown } | null)?.solved;
  if (!Array.isArray(solved)) return [];
  const issues: QuizIssue[] = [];
  for (const item of solved) {
    if (!item || typeof item !== "object") continue;
    const row = item as { question?: unknown; choice?: unknown };
    const index = typeof row.question === "number" ? row.question : Number(row.question);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) continue;
    const choice = Array.isArray(row.choice)
      ? row.choice.map((part) => String(part))
      : typeof row.choice === "string"
        ? [row.choice]
        : [];
    const picked = [...new Set(choice.map(foldOption).filter(Boolean))];
    if (!picked.length) continue;
    const question = questions[index];
    const options = new Set(question.options.map(foldOption));
    if (!picked.every((option) => options.has(option))) continue;
    const key = new Set(question.correct.map(foldOption));
    const same = picked.length === key.size && picked.every((option) => key.has(option));
    if (same) continue;
    issues.push({
      question: index,
      severity: "high",
      code: "A",
      problem: `Bağımsız çözüm farklı şık verdi (${choice.join(" · ")}). Anahtar bu çözümle uyuşmuyor.`,
      fix: "Anahtarı bağımsız çözümle aynı yap ya da kökü tek doğruya indir.",
    });
  }
  return issues;
}

export function quizFixSystem(
  mode: TeacherLessonMode = "document",
  focus: TeacherQuizInput["focus"] = "practice",
  multi = false,
  scope?: QuizScope,
  rephrase = false,
  optionCount: OptionCount = DEFAULT_OPTION_COUNT,
): string {
  const lead = rephrase
    ? "Sen aynı testi yazan öğretmensin. Denetçinin sorun bulduğu soruları düzelt: anahtarı düzelt, tek doğru şık kalacak " +
      "biçimde şıkları değiştir (multi true soruda işaretli doğrular kesin doğru, ötekiler kesin yanlış kalacak biçimde), " +
      "yanlış ya da konu dışı bilgiyi çıkar, gerekçeyi düzelt. Kaynak cümlesini aynen taşımayan doğru soruyu silme. " +
      "Bir soru düzeltilemiyorsa aynı kavramı ölçen yeni bir soru yaz."
    : "Sen aynı testi yazan öğretmensin. Denetçinin sorun bulduğu soruları düzelt: anahtarı düzelt, tek doğru şık kalacak " +
      "biçimde şıkları değiştir (multi true soruda işaretli doğrular kesin doğru, ötekiler kesin yanlış kalacak biçimde), " +
      "kaynakta dayanağı olmayan bilgiyi çıkar, gerekçeyi düzelt. Bir soru düzeltilemiyorsa aynı " +
      "kavramı ölçen yeni bir soru yaz.";
  return (
    lead +
    (scope === "topic_test"
      ? " Sorun [H] ise aynı maddeyi bir vakanın içinde, ayırt ettiren ayrıntıyı yorumlatarak sor. Sorun [I] ya da [J] " +
        "ise fix'te adı geçen maddeyi ya da uyarıyı ölçen yeni bir soru yaz; KALAN SORULAR'ın kalıbını ve maddesini " +
        "tekrar etme. Sorun [K] ise dersteki soruyu tekrar etmeden aynı bilgiyi bir üst düzeyde sor."
      : "") +
    " Önerilen düzeltme ('→' sonrası) varsa uygula. Yalnız verilen soruları, aynı " +
    "sayıda ve aynı sırayla döndür. Kurallar ve şema aynı:\n\n" +
    system(mode, focus, multi, scope, rephrase, optionCount)
  );
}

/** `accepted`: konu testinde testte kalan sorular; düzeltme onların kalıbını ve maddesini tekrar etmesin. */
export function quizFixUserPrompt(
  failing: { question: QuizQuestion; problems: string[] }[],
  input: TeacherQuizInput,
  accepted: QuizQuestion[] = [],
): string {
  return [
    quizUserPrompt(input, failing.length),
    accepted.length && input.scope === "topic_test"
      ? `KALAN SORULAR (testte kalıyor; bunların kalıbını ve maddesini tekrar etme):\n${accepted.map(stemLine).join("\n")}`
      : "",
    `DÜZELTİLECEK SORULAR (JSON):\n${JSON.stringify({ questions: failing.map((item) => publicShape(item.question)) })}`,
    `SORUNLAR:\n${failing
      .map((item, index) => `Soru ${index}: ${item.problems.map((problem) => problem).join(" | ")}`)
      .join("\n")}`,
    "Düzeltilmiş soruları aynı şemayla JSON olarak döndür.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function publicShape(question: QuizQuestion) {
  return {
    text: question.text,
    options: question.options,
    correct: question.multi ? question.correct : question.correct[0],
    multi: question.multi,
    explanation: question.explanation,
    optionWhy: question.optionWhy,
    misconceptionTag: question.misconceptionTag,
    learningObjective: question.learningObjective,
    ...(question.steps?.length ? { steps: question.steps } : {}),
    ...(question.topic ? { topic: question.topic } : {}),
    ...(question.point ? { point: question.point } : {}),
  };
}

/** Model çıktısını soru tipine oturtur. Metne bir şey eklemez; yalnız boşluk kırpar. */
export function parseTeacherQuiz(raw: unknown): QuizQuestion[] | null {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const questions = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.text !== "string" || !Array.isArray(row.options)) return [];
    const normalized = normalizeGeneratedQuizQuestion({
      text: row.text,
      options: row.options.map((option) => String(option)),
      correct: (row.correct ?? "") as string | string[],
      multi: row.multi === true,
      explanation: typeof row.explanation === "string" ? row.explanation : undefined,
      learningObjective: typeof row.learningObjective === "string" ? row.learningObjective : undefined,
      misconceptionTag: typeof row.misconceptionTag === "string" ? row.misconceptionTag : undefined,
      optionWhy: Array.isArray(row.optionWhy) ? row.optionWhy.map((line) => String(line)) : undefined,
      steps: Array.isArray(row.steps) ? row.steps.map((line) => String(line)) : undefined,
      // Tanı testi soruya konu kodu (definition/concept/application) yazdırıyor.
      topic: typeof row.topic === "string" ? row.topic : undefined,
      // Konu testinin kapsam alanı (20 Ekim 2026): madde numarası ya da bölüm başlığı.
      point: typeof row.point === "string" || typeof row.point === "number" ? String(row.point) : undefined,
    }, typeof row.multi === "boolean" ? row.multi : undefined);
    return normalized ? [normalized] : [];
  });
  return questions.length ? questions : null;
}

function textSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Şıkları gerekçeleriyle birlikte, soru metnine bağlı sabit bir sırayla
 * karıştırır (metin değişmez, yalnız sıra). 2 Ekim 2026 altın denemelerinde
 * model doğru cevabı neredeyse hep ilk şıkka yazıyordu (KPSS 5/5, deneme
 * sınavı 4/4); öğrenci "cevap hep A" diye öğrenirdi.
 */
export function shuffleOptions(question: QuizQuestion): QuizQuestion {
  if (question.options.length < 2) return question;
  let state = textSeed(question.text) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const order = question.options.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  const whyAligned = question.optionWhy?.length === question.options.length;
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    ...(whyAligned ? { optionWhy: order.map((index) => question.optionWhy![index]) } : {}),
  };
}

/** `code`: denetçi maddesinin harfi (A-K). Yalnız konu testi denetçisi yazar; harfsiz sorun engeller. */
export type QuizIssue = { question: number; severity: "high" | "low"; problem: string; fix?: string; code?: string };

/**
 * Konu testinde yumuşak sorunlar (20 Ekim 2026): pedagojik (H tablo satırı, I tekrar, J kapsam, K ders).
 * Soru düzeltilir ya da yedekle değişir; düzelmezse sayıyı tamamlamak için geri konur. A-G (doğruluk,
 * soru yazımı), yapı sorunları ve harfsiz sorunlar engeller: o soru öğrenciye hiç gitmez.
 */
export const SOFT_CODES: ReadonlySet<string> = new Set(["H", "I", "J", "K", "L"]);
/** Kapsam eksiği: yeterli soru olsa da bir düzeltme turu açar. */
export const FORCE_FIX_CODES: ReadonlySet<string> = new Set(["J"]);

function issueCode(row: Record<string, unknown>, problem: string): string | undefined {
  const raw = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (/^[A-K]$/.test(raw)) return raw;
  if (typeof row.code === "string" && raw) return undefined;
  // Harf alanını unutan denetçi sorunu çoğu kez maddeyle başlatıyor ("H) …", "J: …").
  return /^\s*\(?([A-K])(?:\)|:|\.)\s/.exec(problem)?.[1];
}

export function parseQuizIssues(raw: unknown): QuizIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    const question = typeof row.question === "number" ? row.question : Number(row.question);
    if (!problem || !Number.isInteger(question) || question < 0) return [];
    return [
      {
        question,
        severity: row.severity === "low" ? ("low" as const) : ("high" as const),
        problem: problem.slice(0, 400),
        fix: typeof row.fix === "string" ? row.fix.slice(0, 400) : undefined,
        code: issueCode(row, problem),
      },
    ];
  });
}

/** Aynı kök kalıbı en çok bu kadar soruda (KONU TESTİ kuralı). */
export const MAX_SAME_FRAME = 2;

/**
 * Sorunun kök kalıbı: son soru cümlesinin son üç kelimesi ("En olası tanı hangisidir?" →
 * "olası tanı hangisidir"). P4'ün dört sorusu aynı kalıptaydı; denetçi tek tek bakınca görmedi.
 */
export function stemFrame(text: string): string {
  const sentences = text
    .split(/(?<=[.;:!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const asked = [...sentences].reverse().find((sentence) => sentence.endsWith("?")) ?? sentences[sentences.length - 1] ?? "";
  const words = asked
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.slice(-3).join(" ");
}

export type QuizSetIssue = { index: number; code: "I" | "J" | "K" | "L"; problem: string; forceFix: boolean };

function pointNumber(question: QuizQuestion, available: number): number | null {
  const match = /^\s*(?:madde\s*)?(\d{1,2})(?!\d)/i.exec(question.point ?? "");
  const value = match ? Number(match[1]) : NaN;
  return value >= 1 && value <= available ? value : null;
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size < 3 || right.size < 3) return 0;
  let shared = 0;
  for (const key of left) if (right.has(key)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function smallerFirst(left: string[], right: string[]): [string[], string[]] {
  return new Set(left).size <= new Set(right).size ? [left, right] : [right, left];
}

/** Cevabın karşılaştırılabilir sözcükleri; rakamlı ya da yalnız harf/romen rakamı taşıyan cevap karşılaştırılmaz. */
function answerTokens(answer: string): string[] {
  if (/\d/u.test(answer)) return [];
  return contentTokens(answer).filter((word) => !/^[ivx]+$/u.test(word));
}

/**
 * İki sorunun testte birlikte durup duramayacağı (30 Ekim 2026, canlı tur: Araçlar testinde S5'in cevabı S2 ve
 * S4'ün doğru şıkkında yazıyordu, S1 ile S3 aynı kalıpla aynı şeyi soruyordu). Sonraki soru için sorun metni ya da
 * null. Bütün testler (konu testi, Araçlar, düello, deneme) aynı ölçüyü kullanır; ders adı yok, yalnız metin:
 * - neredeyse aynı kök (kök anahtarlarında Jaccard ≥ 0,8);
 * - aynı kök kalıbı ve aynı konu (kalıp aynı, kök anahtarlarında Jaccard ≥ 0,5);
 * - aynı doğru cevap (birebir ya da kısa cevabın sözcüklerinin %75'i aynı kökle);
 * - birinin doğru şıkkı (en az dört içerik sözcüğü) öbürünün kök + cevabının %75'ini kapsıyor: öğrenci birinden
 *   öbürünün cevabını okur.
 */
export function questionConflict(earlier: QuizQuestion, later: QuizQuestion, earlierNumber = 0): string | null {
  const at = earlierNumber > 0 ? `${earlierNumber}. soru` : "testteki başka bir soru";
  const leftKeys = wordKeys(earlier.text);
  const rightKeys = wordKeys(later.text);
  if (overlap(leftKeys, rightKeys) >= 0.8) {
    return `${at} ile neredeyse aynı; aynı bilgiyi ikinci kez sorma, sorulmamış bir noktayı yokla.`;
  }
  const frame = stemFrame(later.text);
  if (frame && frame === stemFrame(earlier.text) && overlap(leftKeys, rightKeys) >= 0.5) {
    return `${at} ile aynı kök kalıbı ("${frame}") ve aynı konu; başka bir iş isteyen soru yaz.`;
  }
  if (earlier.multi || later.multi) return null;
  const leftAnswer = earlier.correct?.[0] ?? "";
  const rightAnswer = later.correct?.[0] ?? "";
  const leftTokens = answerTokens(leftAnswer);
  const rightTokens = answerTokens(rightAnswer);
  if (leftTokens.length && rightTokens.length) {
    const short = leftTokens.length <= 5 && rightTokens.length <= 5;
    const [small, large] = leftTokens.length <= rightTokens.length ? [leftTokens, rightTokens] : [rightTokens, leftTokens];
    const sameAnswer =
      optionKey(leftAnswer) === optionKey(rightAnswer) || (short && small.length >= 2 && rootCoverage(small, large) >= 0.75);
    // Aynı sınıfın iki ayrı durumu ("hangi enflasyon türüdür?" iki farklı olayla) aynı bilgi değildir: kökler de aynı
    // şeyden söz etmeli (küçük kökün içerik sözcüklerinin yarısı öbüründe).
    const [stemSmall, stemLarge] = smallerFirst(contentTokens(earlier.text), contentTokens(later.text));
    if (sameAnswer && rootCoverage(stemSmall, stemLarge) >= 0.5) {
      return `${at} ile aynı doğru cevap ('${rightAnswer}') ve aynı konu; iki soru aynı bilgiyi soruyor.`;
    }
  }
  const leftFact = contentTokens(`${earlier.text} ${leftAnswer}`);
  const rightFact = contentTokens(`${later.text} ${rightAnswer}`);
  if (leftTokens.length >= 4 && rootCoverage(leftTokens, rightFact) >= 0.75) {
    return `Bu sorunun bilgisi ${at}nun doğru şıkkında yazıyor ('${leftAnswer}'); öğrenci birinden öbürünün cevabını okur.`;
  }
  if (rightTokens.length >= 4 && rootCoverage(rightTokens, leftFact) >= 0.75) {
    return `Bu sorunun doğru şıkkı ${at}nun bilgisini söylüyor ('${rightAnswer}'); öğrenci birinden öbürünün cevabını okur.`;
  }
  return null;
}

/** `incoming` soruları, `current` ile çakışmayanlar sırayla eklenerek (ikinci geçiş, yumuşak kurtarma). */
export function appendWithoutConflicts(current: readonly QuizQuestion[], incoming: readonly QuizQuestion[]): QuizQuestion[] {
  const out = [...current];
  for (const question of incoming) {
    if (out.some((other) => questionConflict(other, question) !== null)) continue;
    out.push(question);
  }
  return out;
}

/**
 * Sayıyı tamamlamak için de geri konmayan sorunlar (30 Ekim 2026): soru iki cevaplı (eşdeğer, aynı ya da ikiz eşik
 * şıkkı), cevabı kökte (kök doğru şıkkı içeriyor ya da doğru şıkkın ifadesini kuruyor) ya da anahtarı yanlış
 * (hesap, açıklama ya da adımlar başka şıkka varıyor; hiçbir şık tutmuyor). Paket A'da yalnız eşdeğer şıklar buradaydı;
 * canlıda kökü cevabı veren deneme sorusu "sayı eksik" diye geri konup öğrenciye gitti. Tek sözcüklük ipucu
 * ("ele veren kelime") burada değil: genel bir sözcüğün tesadüfi eşleşmesi de onu tetikler.
 */
export const UNSALVAGEABLE_PROBLEM = new RegExp(
  [
    "İki şık eşdeğer",
    "Aynı şık iki kez",
    "İki şık aynı cevap",
    THRESHOLD_TWIN_PREFIX,
    "Kök doğru şıkkı içeriyor",
    "Kök doğru şıkkın ifadesini kuruyor",
    "Cevap anahtarı hesapla çelişiyor",
    "Hiçbir şık kökteki",
    "sonucuna varıyor; doğru şık",
  ].join("|"),
  "u",
);

/**
 * Sayı eksikken elenen sorulardan geri konabilenler (`runTeacherQuiz`, 26 Ekim 2026 "soru silinmez"): geri
 * konmayan sorun taşımayan, şık sayısı tutan, anahtarı şıklarda olan ve testteki sorularla çakışmayan sorular, sırayla.
 */
export function salvageRejected(
  rejected: readonly { question: QuizQuestion; problems: readonly string[] }[],
  current: readonly QuizQuestion[],
  options: { optionCount?: number; previousStems?: readonly string[] } = {},
): QuizQuestion[] {
  const playable = rejected
    .filter((item) => !item.problems.some((problem) => UNSALVAGEABLE_PROBLEM.test(problem)))
    .map((item) => item.question)
    .filter(
      (question) =>
        question.text.trim().length > 0 &&
        (options.optionCount === undefined || question.options.length === options.optionCount) &&
        question.correct.some((answer) => question.options.includes(answer)),
    );
  const spare = dropNearDuplicates(playable, (question) => question.text, [
    ...(options.previousStems ?? []),
    ...current.map((question) => question.text),
  ]);
  return appendWithoutConflicts(current, spare);
}

/**
 * Konu testinin bütününe bakan kod denetimi (saf; metne dokunmaz, yalnız işaretler). Sıra testteki
 * sıradır; hep sonraki soru işaretlenir.
 * - I: aynı kök kalıbı üçüncü kez.
 * - J: madde ikinci kez sorulmuş ama hiç sorulmamış madde var (kapsam; düzeltme turu açar).
 * - K: derste sorulan soruyla neredeyse aynı (kelime köklerinde Jaccard ≥ 0,75).
 * Tablo satırı tekrarı (H) burada yok: iyi bir tanı vakası da satırın bulgularını taşır; onu denetçi yargılar.
 */
export function quizSetIssues(
  ordered: readonly QuizQuestion[],
  opts: { pointsAvailable: number; lessonChecks?: readonly string[] },
): QuizSetIssue[] {
  const issues: QuizSetIssue[] = [];
  const frames = new Map<string, number>();
  const used = new Set(ordered.map((question) => pointNumber(question, opts.pointsAvailable)).filter((n): n is number => n !== null));
  const unused = Array.from({ length: opts.pointsAvailable }, (_, i) => i + 1).filter((n) => !used.has(n));
  const seenPoints = new Set<number>();
  const checks = (opts.lessonChecks ?? []).map((check) => ({ check, keys: wordKeys(check) }));
  ordered.forEach((question, index) => {
    const frame = stemFrame(question.text);
    if (frame) {
      const seen = frames.get(frame) ?? 0;
      frames.set(frame, seen + 1);
      if (seen >= MAX_SAME_FRAME) {
        issues.push({
          index,
          code: "I",
          problem: `Aynı kök kalıbı ${seen + 1}. kez ("${frame}"); başka bir iş isteyen kalıp yaz (sıradaki adım, yapılmaması gereken, uyarı bulgusu, ayırt ettiren bulgu).`,
          forceFix: false,
        });
      }
    }
    const point = pointNumber(question, opts.pointsAvailable);
    if (point !== null) {
      if (seenPoints.has(point) && unused.length) {
        issues.push({
          index,
          code: "J",
          problem: `Madde ${point} ikinci kez soruluyor; sorulmamış madde(ler): ${unused.join(", ")}. Bunlardan birini yokla.`,
          forceFix: true,
        });
      }
      seenPoints.add(point);
    }
    const keys = wordKeys(question.text);
    // Aynı testte iki soru neredeyse aynı (22 Ekim 2026 kör kıyas: KPSS testinde S3 ve S4); aynı kalıp ve konu, aynı
    // cevap, birinin doğru şıkkında öbürünün bilgisi (30 Ekim 2026, canlı tur). Bütün testler.
    for (let earlier = 0; earlier < index; earlier += 1) {
      const conflict = questionConflict(ordered[earlier]!, question, earlier + 1);
      if (!conflict) continue;
      issues.push({ index, code: "I", problem: conflict, forceFix: false });
      break;
    }
    const twin = checks.find((item) => overlap(keys, item.keys) >= 0.75);
    if (twin) {
      issues.push({
        index,
        code: "K",
        problem: `Derste sorulan soruyla neredeyse aynı ("${twin.check.slice(0, 120)}"); aynı bilgiyi bir üst düzeyde sor.`,
        forceFix: false,
      });
    }
  });
  const formulaSeen = new Map<string, number>();
  ordered.forEach((question, index) => {
    if (!/\d/.test(question.text) || !/[=+×*/]/.test(question.text)) return;
    const key = question.text
      .toLocaleLowerCase("tr")
      .replace(/\d+(?:[.,]\d+)?/g, "#")
      .replace(/\s+/g, " ")
      .trim();
    if (key.length < 24) return;
    const prior = formulaSeen.get(key);
    formulaSeen.set(key, index);
    if (prior === undefined) return;
    issues.push({
      index,
      code: "L",
      problem: `${prior + 1}. soruyla aynı formül, yalnız sayılar değişmiş. Başka bir alt kavram ya da soru tipi yaz.`,
      forceFix: false,
    });
  });
  return issues;
}

/**
 * Yalnız ölçüm (günlüğe yazılır, kapı değil): kökü bir kaynak tablosu satırının ilk hücresini
 * neredeyse aynen taşıyan (köklerinin %80'i) soru sayısı. P4'te 5 sorudan 3'ü; dördüncüsü
 * "tetikleyici"yi egzersiz/alerjen diye açtığı için sayılmıyor.
 */
export function tableLookupLike(questions: readonly QuizQuestion[], pages: readonly { text: string }[]): number {
  const firstCells = pages
    .flatMap((page) => page.text.split(/\r?\n/))
    .filter((line) => /^\s*\|/.test(line) && !/^\s*\|[\s|:-]+\|?\s*$/.test(line))
    .map((line) => wordKeys(line.split("|")[1] ?? ""))
    .filter((keys) => keys.size >= 2);
  if (!firstCells.length) return 0;
  return questions.filter((question) => {
    const stem = wordKeys(question.text);
    return firstCells.some((cell) => [...cell].filter((key) => stem.has(key)).length / cell.size >= 0.8);
  }).length;
}

const BANNED_OPTION = /^(hepsi|hiçbiri|yukarıdaki|tümü|hiç biri)/i;
// \b Türkçe harfi tanımıyor ("kaç" ç ile biter); boşlukla sınırla.
const COUNTING = /(?:^|\s)kaç\s+(?:\S+\s+){0,2}(tür|çeşit|başlık|madde|unsur|aşama|basamak)/i;

/**
 * Yapı denetimi (saf). Sorunu düzeltmez; soruyu düzeltme turuna yollar.
 * Hesap anahtarı denetimi (exponentKeyWrong, mathKeyWrong) metne dokunmaz,
 * yalnız anahtarın hesapla çeliştiğini söyler.
 */
/**
 * Doğru şıkta olup çeldiricilerin hiçbirinde olmayan bir kelime kökte geçiyorsa
 * soru ele veriyor (16 Ekim 2026 Pediatri testi: "annede B12 eksikliği" deyip
 * "hangi mikrobesin" diye sordu; şıklarda yalnız doğru olanda "B12" vardı).
 * Türkçe ek için 5 harflik kök; rakamlı kelime (B12, D3, 6) bütün olarak. Tek rakam da sayılır (23 Ekim 2026
 * podcast kontrolü: "6 aylıkken … hangi yaş basamağıyla uyumludur?" doğrusu "6 ay" idi, çeldiriciler 2, 9, 12 ay).
 */
function answerOnlyWordInStem(stem: string, answer: string, options: string[]): string | null {
  const keys = (text: string) =>
    new Map(
      text
        .toLocaleLowerCase("tr")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => (/\d/.test(word) ? word.length >= 1 : word.length >= 5))
        .map((word) => [/\d/.test(word) ? word : word.slice(0, 5), word] as const),
    );
  const others = new Set(options.filter((option) => option !== answer).flatMap((option) => [...keys(option).keys()]));
  const inStem = keys(stem);
  for (const [key, word] of keys(answer)) {
    if (!others.has(key) && inStem.has(key)) return word;
  }
  return null;
}

/**
 * Ekranda durmayan şekil, grafik, harita, tablo, şema, denklem ya da "derste verilen" göndermesi; kökteki veri
 * taşıyıcısı (eşitlik, ok, koordinat çifti, tablo satırı) atfı çözer. "Bu şekilde" (tarz) sayılmaz.
 * 29 Ekim 2026 (Paket H): gövde `unresolvedVisualReference`; deneme teslim kapısı ve ders aynı kuralı okur.
 */
export function unseenStemReference(text: string): boolean {
  return unresolvedVisualReference(text, inlineCarriers(text)) != null;
}

function visualReferenceIssue(text: string): string | null {
  const hit = unresolvedVisualReference(text, inlineCarriers(text));
  return hit ? `Kök '${hit}' diye ekranda olmayan bir görsele gönderme yapıyor; çözmek için gereken veriyi kökün içine yaz.` : null;
}

function keyMismatchIssue(question: QuizQuestion, keyed: number[]): string | null {
  const mismatch = explanationAnswerMismatch({
    options: question.options,
    keyed,
    steps: question.steps,
    optionWhy: question.optionWhy,
    explanation: question.explanation,
  });
  if (!mismatch) return null;
  return `Açıklama ${formatValue(mismatch.value)} sonucuna varıyor; doğru şık '${mismatch.keyed.join("', '")}' değil '${mismatch.expected}' olmalı ya da açıklama yanlış.`;
}

const formatValue = (value: number) => String(Number(value.toFixed(6))).replace(".", ",");

/**
 * Şık sayısı sorunu. `optionCount` verilmezse sınav biçimlerinden biri (4 ya da 5) kabul edilir; motor her zaman
 * öğrencinin sayısını verir.
 */
export function optionCountIssue(question: QuizQuestion, optionCount?: OptionCount): string | null {
  const n = question.options.length;
  if (optionCount) return n === optionCount ? null : `Şık sayısı ${n}; ${optionCount} olmalı (${optionLetters(optionCount)}).`;
  return n === 4 || n === 5 ? null : `Şık sayısı ${n}; 4 ya da 5 olmalı.`;
}


const NUMBER_TOKEN = /-?\d+(?:[.,]\d+)?/g;

function numbersIn(text: string): number[] {
  return (text.match(NUMBER_TOKEN) ?? [])
    .map((token) => Number(token.replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
}

/**
 * Çözüm adımlarının vardığı sayı doğru şıkta olmalı (29 Ekim 2026). Yazar "son adım doğru şıkka varır"
 * kuralını okur ama adımlar 12'ye varıp anahtar 15'i gösterebiliyordu. Son adımın (varsa eşittirden
 * sonraki) son sayısı doğru şıkta yoksa ve BAŞKA bir şıkta varsa anahtar yanlıştır. Birimi ya da
 * ölçeği farklı yazılmış sonuç (0,5 m / 50 cm) başka şıkka düşmedikçe işaretlenmez: yanlış alarm yok.
 */
export function stepsAnswerMismatch(question: Pick<QuizQuestion, "options" | "correct" | "steps">): string | null {
  const steps = (question.steps ?? []).map((line) => line.trim()).filter(Boolean);
  if (!steps.length) return null;
  const last = steps[steps.length - 1]!;
  const tail = last.includes("=") ? last.slice(last.lastIndexOf("=") + 1) : last;
  const finals = numbersIn(tail);
  const final = finals[finals.length - 1];
  if (final == null) return null;
  const answer = Array.isArray(question.correct) ? question.correct[0] : question.correct;
  if (!answer) return null;
  const answerNumbers = numbersIn(answer);
  if (!answerNumbers.length || answerNumbers.some((value) => sameNumber(value, final))) return null;
  const elsewhere = question.options.find(
    (option) => option !== answer && numbersIn(option).some((value) => sameNumber(value, final)),
  );
  if (!elsewhere) return null;
  return `Çözüm adımları ${tail.trim()} sonucuna varıyor; doğru şık '${answer}' değil '${elsewhere}' olmalı ya da adımlar yanlış.`;
}

/** Kökün doğru şıkkı kurduğu sorunun metni; `UNSALVAGEABLE_PROBLEM` bu başlangıcı tanır. */
export const STEM_ECHO_PREFIX = "Kök doğru şıkkın ifadesini kuruyor";

function stemEchoIssue(stem: string, answer: string, distractors: readonly string[]): string | null {
  const echo = stemPhraseInAnswer(stem, answer, distractors);
  return echo
    ? `${STEM_ECHO_PREFIX} ('${echo}'): bu ifade yalnız doğru şıkta var, öğrenci eşleştirerek bulur; kökü ya da şıkkı yeniden kur.`
    : null;
}

/** Sorulan türden olmayan çeldiricinin sorun metni (30 Ekim 2026). */
export const OFF_KIND_PREFIX = "Çeldirici sorulan türden değil";

/**
 * `context`: kaynak metni (belgeli testte). Çeldirici türü yalnız kaynakta tanımı olan şıklar için ölçülür
 * (`offKindDistractors`); belgesiz testte ölçülmez.
 */
export function quizStructureIssues(
  question: QuizQuestion,
  options: { multi?: boolean; optionCount?: OptionCount; context?: string } = {},
): string[] {
  const issues: string[] = [];
  const countIssue = optionCountIssue(question, options.optionCount);
  if (countIssue) issues.push(countIssue);
  const mismatch = stepsAnswerMismatch(question);
  if (mismatch) issues.push(mismatch);
  // Açıklamanın vardığı değer anahtardan başka bir şıkta (29 Ekim 2026, Paket H): soru düşer, yedek doldurur; kod
  // test anahtarını DEĞİŞTİRMEZ. Adım çelişkisi zaten yazıldıysa ikinci kez yazılmaz.
  if (!mismatch && !question.multi) {
    const keyIssue = keyMismatchIssue(question, [question.options.indexOf(question.correct[0] ?? "")].filter((index) => index >= 0));
    if (keyIssue) issues.push(keyIssue);
  }
  const said =[question.text, question.explanation ?? "", ...question.options, ...(question.optionWhy ?? []), ...(question.steps ?? [])];
  if (reversedFunctionNotation(said.join("\n")).length) issues.push(FUNCTION_NOTATION_ISSUE);
  if (question.multi && options.multi) {
    return [...issues, ...multiQuestionIssues(question)];
  }
  if (question.multi || question.correct.length !== 1) issues.push("Tek doğru şık olmalı (multi false).");
  if (!question.explanation?.trim()) issues.push("explanation yok.");
  if ((question.optionWhy?.length ?? 0) !== question.options.length) {
    issues.push("optionWhy her şık için bir cümle olmalı, şık sayısı kadar ve aynı sırada.");
  }
  if (question.options.some((option) => BANNED_OPTION.test(option.trim()))) {
    issues.push("'Hepsi / hiçbiri / yukarıdakiler' şıkkı kullanılmış.");
  }
  if (COUNTING.test(question.text)) issues.push("Sayma sorusu ('kaç tür'); kavramı ölçen soru yaz.");
  // Şıklar karıştırılıyor: "ilk seçenek …" karıştırmadan sonra başka şıkkı gösterir (18 Ekim 2026).
  if (refersToOptionOrder(question.explanation) || (question.optionWhy ?? []).some(refersToOptionOrder)) {
    issues.push("Açıklama şıklara sırasıyla gönderme yapıyor; şıklar karışık gösteriliyor, her şıkkı içeriğiyle an.");
  }
  const answer = question.correct[0] ?? "";
  if (answer.length >= 6 && question.text.toLocaleLowerCase("tr").includes(answer.toLocaleLowerCase("tr"))) {
    issues.push("Kök doğru şıkkı içeriyor; cevabı veriyor.");
  } else {
    const giveaway = answerOnlyWordInStem(question.text, answer, question.options);
    if (giveaway) issues.push(`Kök doğru şıkkı ele veren kelimeyi içeriyor ('${giveaway}'); kökten çıkar.`);
    // Çok sözcüklü öncül (30 Ekim 2026, canlı tur, yazılı deneme S4): tek sözcük denetimi, öncülün sözcüklerini
    // taşıyan bir çeldirici olunca susuyordu; eşleşen tek sözcük ise genel bir sözcüktü ("ekonomideki").
    const echo = stemEchoIssue(question.text, answer, question.options.filter((option) => option !== answer));
    if (echo) issues.push(echo);
  }
  const offKind = options.context
    ? offKindDistractors({
        stem: question.text,
        options: question.options,
        correctIndex: question.options.indexOf(answer),
        context: options.context,
      })
    : [];
  if (offKind.length) {
    issues.push(
      `${OFF_KIND_PREFIX} ('${offKind.join("', '")}'): kaynak onu başka türden tanımlıyor; doğru cevabın kardeşi olan, aynı türden bir öğe yaz.`,
    );
  }
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede|belirtil(?:miştir|mektedir|diği|en)/i.test(question.text)) {
    issues.push("Kökte kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  const visual = visualReferenceIssue(question.text);
  if (visual) issues.push(visual);
  // Aynı/eşdeğer şık, hesapla çelişen anahtar, hiçbir şıkkın tutmaması, sayı tutarsızlığı: ders içi soruyla aynı
  // liste (30 Ekim 2026, Paket I #6; `question-integrity.ts`).
  issues.push(
    ...singleAnswerIntegrityIssues({
      type: "mcq",
      prompt: question.text,
      options: question.options,
      answerIndex: question.options.indexOf(answer),
      explanation: question.explanation,
    }),
  );
  return issues;
}

/** Çok cevaplı sorunun yapısı: 2-3 doğru, her biri şıklarda; kök hiçbir doğruyu ele vermez. */
function multiQuestionIssues(question: QuizQuestion): string[] {
  const issues: string[] = [];
  const correct = [...new Set(question.correct)];
  if (correct.length < 2 || correct.length > 3) {
    issues.push(`Çok cevaplı soruda ${correct.length} doğru var; 2 ya da 3 olmalı.`);
  }
  // Kök "hangisidir" deyip iki doğru işaretli soru öğrenciye tek cevaplı görünür (30 Ekim 2026, Paket I #6).
  const countIssue = answerCountIssue(question.text, correct.length);
  if (countIssue) issues.push(countIssue);
  const twin = duplicateOptionPair(question.options);
  if (twin) issues.push(`Aynı şık iki kez yazılmış ('${twin[0]}' = '${twin[1]}').`);
  const counted = enumeratedCountIssue(question.text) ?? enumeratedCountIssue(question.explanation ?? "");
  if (counted) issues.push(counted);
  if (correct.some((answer) => !question.options.includes(answer))) {
    issues.push("correct dizisindeki her doğru, options içinden aynen olmalı.");
  }
  if (!question.explanation?.trim()) issues.push("explanation yok.");
  if ((question.optionWhy?.length ?? 0) !== question.options.length) {
    issues.push("optionWhy her şık için bir cümle olmalı, şık sayısı kadar ve aynı sırada.");
  }
  if (question.options.some((option) => BANNED_OPTION.test(option.trim()))) {
    issues.push("'Hepsi / hiçbiri / yukarıdakiler' şıkkı kullanılmış.");
  }
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede|belirtil(?:miştir|mektedir|diği|en)/i.test(question.text)) {
    issues.push("Kökte kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  const visual = visualReferenceIssue(question.text);
  if (visual) issues.push(visual);
  const wrong = question.options.filter((option) => !correct.includes(option));
  for (const answer of correct) {
    const giveaway = answerOnlyWordInStem(question.text, answer, wrong.concat(answer));
    if (giveaway) {
      issues.push(`Kök doğru şıkkı ele veren kelimeyi içeriyor ('${giveaway}'); kökten çıkar.`);
      break;
    }
  }
  for (const answer of correct) {
    const echo = stemEchoIssue(question.text, answer, wrong);
    if (echo) {
      issues.push(echo);
      break;
    }
  }
  // Anahtar kümesi ile gerekçelerin yönü (29 Ekim 2026, Paket H): açıklamanın sonucu correct dışında bir şıkta;
  // doğru işaretli şıkkın gerekçesi onu çürütüyor; yanlış bırakılan şıkkın gerekçesi onu onaylıyor.
  const keyIssue = keyMismatchIssue(question, correct.map((answer) => question.options.indexOf(answer)).filter((index) => index >= 0));
  if (keyIssue) issues.push(keyIssue);
  for (const option of refutedCorrectOptions(question)) {
    issues.push(`Doğru işaretli '${option}' şıkkını gerekçesi çürütüyor ('…değildir'); şık doğru listesinde olamaz ya da gerekçe yanlış.`);
  }
  for (const option of affirmedWrongOptions(question)) {
    issues.push(`Yanlış bırakılan '${option}' şıkkını gerekçesi onaylıyor; şık doğru listesine girmeli ya da gerekçe yanlış.`);
  }
  return issues;
}
