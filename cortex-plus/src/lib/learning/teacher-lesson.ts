import {
  LESSON_SCREEN_HARD_CAP,
  LESSON_V3_FORMAT,
  conceptGroups,
  lessonScreenSchema,
  readLessonV3,
  screenCheck,
  screenChecksFirst,
  screenText,
  type LessonBlock,
  type LessonScreen,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { OPTION_ORDER_RULE, refersToOptionOrder } from "@/lib/learning/option-reference";
import { examPointsBlock, examPointsVerifyBlock } from "@/lib/learning/exam-points";
import { studentTextParts } from "@/lib/learning/lesson-board";
import { nearSameQuestion, reviewItemProblems, stemOverlap } from "@/lib/learning/teacher-brain";
import { SOURCE_LINK_EXEMPTION, TEACHING_RUBRIC, WHY_NOTE_RULE } from "@/lib/learning/teaching-rubric";
import { backboneBlock, lessonBackbone, uncoveredBackbone } from "@/lib/learning/lesson-backbone";
import {
  keyFactsBlock,
  lessonKeyFacts,
  lessonScreenCap,
  missingStructures,
  sourceHasWorkedProblem,
  sourceStructures,
  uncoveredKeyFacts,
} from "@/lib/learning/lesson-key-facts";

/**
 * Öğretmen ders motoru (2 Ekim 2026, ürün sahibinin kararı).
 *
 * Eski yol: model dersi yazıyor, sonra ~16 bin satırlık onarım katmanı
 * metni değiştiriyordu — "Kaynak:" ekliyor, kalıp özet uyduruyor, kaynaktan
 * cümle yapıştırıyordu. Öğrenci "sıradan yapay zekâ" sesini buradan duydu.
 *
 * Yeni yol: tek, güçlü bir öğretmen istemi (aynı belgeyle okunan Astra
 * dersinin akışı, docs/delivery/ICERIK-KALITE-YOL-HARITASI.md), ardından
 * belgeyle eşleme yapan ikinci bir model çağrısı ve gerekirse modelin kendi
 * düzeltmesi. Kod metne hiçbir şey EKLEMEZ; yalnız denetler.
 */

export type TeacherLessonInput = {
  topicLabel: string;
  prepTitle: string;
  /**
   * Temiz kaynak sayfaları, sırayla. label: konunun kendi dosyası dışından gelen yardımcı
   * sayfa ("Ek kaynak · Test-14.jpg · parça 2"; topic-support-pages.ts).
   */
  pages: { page: number; text: string; label?: string }[];
  /** Sıradaki gerçek konular; nextFocus yalnız bunlardan. */
  upcomingTopics: string[];
  /** Hazırlıktaki bir önceki konu; varsa derse bağlanılır. */
  previousTopic?: string | null;
  /** Aşinalık ve ruh hali satırı (session-signals). */
  learnerLine?: string;
  /** Öğretmen analizinin "Sınavda sorulur" maddeleri (18 Ekim 2026). */
  examPoints?: string[];
  /** Sayfa kenarında tekrar eden satırlar: başlık olamaz. */
  runningHeaders?: string[];
  /**
   * "document": belgeli ders, kaynak kuralı. "topic": belgesiz hazırlık
   * (2 Ekim 2026, ürün sahibinin kararı) — aynı öğretmen akışı, kaynak kuralı
   * yerine doğruluk kuralı; denetçi doğruluğa bakar.
   */
  mode?: TeacherLessonMode;
  /** Önceden yazımda kapsam turu bir kez daha açılabilir. Öğrenci yolunda bir tur. */
  coverageBudget?: "student" | "prefetch";
};

export type TeacherLessonMode = "document" | "topic";

/**
 * Yardımcı sayfaların önündeki açıklama. Yazar ve denetçi aynı kaynak metnini gördüğü için kural
 * ikisine birden gider (19 Ekim 2026, 7 dosyalık sınav seti).
 */
export const SUPPORT_SOURCE_NOTE =
  "--- Ek kaynaklar: öğrencinin bu konuya ait başka dosyaları (defter, tahta, test, kart fotoğrafı, kısa not). Bunlar da kaynaktır. Test parçasında şıkkın sonundaki (işaretli) öğrencinin seçtiği şıktır; seçim yanlışsa ya da kâğıtta düzeltme notu varsa, o yanılgıyı ilgili yerde doğrusuyla açıkça ele al.";

export function sourceText(pages: TeacherLessonInput["pages"]): string {
  const block = (items: TeacherLessonInput["pages"]) =>
    items.map((item) => `[${item.label ?? `s.${item.page}`}]\n${item.text.trim()}`).join("\n\n");
  const own = pages.filter((item) => !item.label);
  const support = pages.filter((item) => item.label);
  if (!support.length) return block(own);
  return [block(own), SUPPORT_SOURCE_NOTE, block(support)].filter(Boolean).join("\n\n");
}

const SCHEMA = `{
  "format": 3,
  "title": "konunun içerikten adı, en fazla 9 kelime",
  "overview": "kanca: 1-2 cümle; konunun neden önemli olduğunu kaynaktaki bir gerçekle söyler",
  "objective": "bu dersten sonra öğrencinin YAPABİLECEĞİ tek şey",
  "screens": [
    {
      "heading": "ekranın odağı: kavramın adı",
      "concept": "kavramın adı (aynı kavramın bütün ekranlarında aynı)",
      "lead": "içerik listesinde kavramın altında durur: bu kavramda ne var; tek cümle, en çok 12 kelime",
      "blocks": [
        {"type": "check", "check": {"type": "trueFalse", "prompt": "öğrencinin gerçekten inandığı yanılgı, bir ifade olarak", "options": ["Doğru", "Yanlış"], "answerIndex": 1, "explanation": "neden yanlış (ya da doğru) olduğu", "corrected": "ifade yanlışsa doğru hâli, tek cümle", "review": {"prompt": "aynı yanılgıyı başka bir durumda ölçen ifade", "options": ["Doğru", "Yanlış"], "answerIndex": 1, "explanation": "neden yanlış (ya da doğru) olduğu", "corrected": "ifade yanlışsa doğru hâli"}}},
        {"type": "text", "text": "60-140 kelime; anahtar terimler **koyu**; soruyu tekrar sormaz, doğrudan anlatır"}
      ]
    },
    {
      "heading": "ikinci kavramın adı",
      "concept": "ikinci kavramın adı (bu kavramın bütün ekranlarında aynı)",
      "lead": "…",
      "blocks": [
        {"type": "text", "text": "…"},
        {"type": "note", "note": {"title": "Neden böyle?: kaynağın nedenini vermediği kilit bilgi, soru olarak", "body": "1-2 cümle mekanizma; yeni sayı, eşik ya da kural yok (kaynak nedeni kendisi veriyorsa bu kutu yok)", "tone": "general"}},
        {"type": "formula", "formula": {"title": "…", "expression": "kaynaktaki bağıntı", "symbols": [{"symbol": "v", "meaning": "hız (m/s)"}], "note": "harflerin anlamı"}},
        {"type": "exam_trap_card", "trap": {"title": "Sınavın vurduğu karışıklık", "wrong": "öğrencinin sık inandığı yanlış", "right": "doğrusu, kaynaktaki hâliyle", "tell": "ayırt ettiren ipucu"}},
        {"type": "memory_hook_card", "hook": {"kind": "analogy", "title": "Hafıza çivisi", "body": "5 saniyelik benzetme veya kısa yol; yeni sayı yok"}},
        {"type": "comparison_carousel", "carousel": {"title": "İki kavram", "mode": "compare", "slides": [{"title": "A", "body": "…", "points": ["…"]}, {"title": "B", "body": "…", "points": ["…"]}]}},
        {"type": "check", "check": {"type": "mcq", "prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "doğru cevabın nedeni + her çeldiricinin gerçekte ne olduğu", "optionWhy": ["şık 1 için tek cümle", "şık 2", "şık 3", "şık 4"], "review": {"prompt": "en olası yanlış seçimi ölçen YENİ bir durum; doğru cevabı bu sorununkiyle aynı", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "doğru cevabın nedeni + en olası yanlışın neden uymadığı"}}}
      ]
    },
    {
      "heading": "aynı kavram: hesap",
      "concept": "ikinci kavramın adı (bir önceki ekranla aynı)",
      "blocks": [
        {"type": "text", "text": "formülün nasıl uygulanacağı, kısa"},
        {"type": "procedure", "procedure": {"title": "…", "steps": [{"label": "…", "detail": "kaynaktaki sayıyla"}]}},
        {"type": "example", "example": {"prompt": "…", "givens": ["…"], "unknown": "…", "steps": ["…"], "result": "birimli sonuç", "solution": "…"}},
        {"type": "check", "check": {"type": "mcq", "prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "…", "optionWhy": ["…","…","…","…"], "review": {"prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "…"}}}
      ]
    },
    {
      "heading": "üçüncü kavramın adı",
      "concept": "üçüncü kavramın adı",
      "lead": "…",
      "blocks": [
        {"type": "text", "text": "…"},
        {"type": "cards", "cards": [{"title": "kardeş kavram", "body": "tek cümle tanım"}, {"title": "kardeş kavram", "body": "tek cümle tanım"}]},
        {"type": "table", "table": {"caption": "…", "columns": ["…","…"], "rows": [["…","…"], ["…","…"]]}},
        {"type": "note", "note": {"title": "<karıştırılan kavram> ile <öteki kavram> farkı (iki kavramın gerçek adıyla)", "body": "…", "tone": "warn"}},
        {"type": "check", "check": {"type": "mcq", "prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "…", "optionWhy": ["…","…","…","…"], "review": {"prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "…"}}}
      ]
    }
  ],
  "commonMistake": {"claim": "öğrencinin gerçekten yaptığı hata", "correction": "…"},
  "summary": ["sınavda işe yarayan kesin bilgi", "…", "…"],
  "nextFocus": ["SIRADAKİ KONULAR listesinden aynen"]
}`;

const INTRO_DOCUMENT =
  "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ve sana yalnızca kendi ders belgesini verdi. " +
  "Bu belgeyi, iyi bir öğretmenin tahtada anlatacağı gibi, kendi cümlelerinle, kısa ve net bir derse dönüştürüyorsun.\n\n";

const INTRO_TOPIC =
  "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ama belge yüklemedi; konuyu ondan duydun. " +
  "Bu konuyu, iyi bir öğretmenin tahtada anlatacağı gibi, kendi cümlelerinle, kısa ve net bir derse dönüştürüyorsun.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz ders, kesin): Konuyu sınav müfredatındaki yerleşik, ders kitaplarında tartışmasız bilgiyle " +
  "anlat. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı yazma; güncel olarak değişebilecek bilgiyi " +
  "(son düzenleme, güncel rakam, yürürlükteki oran) verme. Tartışmalı bir konuda tek görüşü kesin doğru gibi sunma. " +
  "Aşağıda 'kaynak' denen her yer bu derste konunun yerleşik bilgisi anlamına gelir.\n\n";

const EXAMPLE_DOCUMENT =
  "5) 'example' bloğu yalnız kaynakta çözümlü bir örnek ya da hesap varsa, ait olduğu kavramın ekranında; verilen, " +
  "istenen, adımlar ve birimli sonuç kaynaktan.\n" +
  "6) commonMistake: kaynağa göre öğrencinin yapacağı somut hata ve düzeltmesi (öğüt değil, hata).\n";

const EXAMPLE_TOPIC =
  "5) 'example' bloğu: konu hesap ya da uygulama içeriyorsa kendin kurduğun basit, adım adım doğrulanabilir bir " +
  "çözümlü örnek (verilen, istenen, adımlar, birimli sonuç), ait olduğu kavramın ekranında; değilse yazma.\n" +
  "6) commonMistake: öğrencilerin bu konuda gerçekten yaptığı somut hata ve düzeltmesi (öğüt değil, hata).\n";

/**
 * Renkli vurgu, sınav kutuları ve ezber kodu (18 Ekim 2026, ürün sahibinin kararı; Pediatri
 * belgesi öğrenci gözüyle incelendi). Belge önemli yerleri kutularla işaretliyordu ("TUS / SINAV
 * İPUCU", "AKILDA TUT", "ALARM BULGULARI"); ders bunları ayrıca öne çıkarmıyordu. Terimler koyu
 * kalır (paragraf alacalı olmasın); renk yalnız sınavda soru olacak kesin bilgi ve kutular için.
 * Denetçi I maddesiyle aynı kuralı denetler.
 */
/**
 * Ezber kodunun ortak tanımı (19 Ekim 2026): yazar ve denetçi aynı örnekleri görür. Kötü örnekler
 * canlı kayıttan (`/admin/ders-hatalari`): denetçi bunları reddetti, yazar 5-7 turda düzeltemedi.
 * Harf kuralı "Çalış" ↔ Cumhuriyet (C) itirazından.
 *
 * 20 Ekim 2026 kör kıyas (ürün sahibinin kararı): kodların çoğu yalnız sırayı ya da baş harfleri
 * taşıyordu ("ÜB-FK", "Soylu sınıf dine…"); sınav sırayı değil ayrımı soruyordu. Kod artık zorunlu
 * değil: ya sınavın sorduğu ayrımı (kategori ↔ ayırt ettiren ipucu) ya da sınav listenin tamamını
 * soruyorsa listeyi kodlar; yoksa hiç yazılmaz.
 */
export const MNEMONIC_EXAMPLES =
  "Ayrım kodu örneği (sınav kategorileri ve her birini ayırt ettiren ipucunu soruyorsa): 'Soyda Mon, zümrede Oli, " +
  "din adamında Teo, toplumda Cum' = egemenlik soya bağlıysa monarşi, bir zümredeyse oligarşi, din adamlarındaysa " +
  "teokrasi, toplumdaysa cumhuriyet (her parça bir ipucunu kendi kategorisine bağlar; kısa ve söylenebilir). Liste " +
  "kodu örneği (yalnız sınav listenin tamamını ya da sırasını soruyorsa): 'İpek Ceza Taktı, Cebir Hükmetti' = İptal, " +
  "Ceza, Tazminat, Cebri icra, Hükümsüzlük (her sözcük bir öğenin ilk harfiyle başlar; cümlenin anlamlı olması " +
  "gerekmez, söylenebilir olması yeter; öğeleri kaynaktaki sırayla yaz, her birinin ilk harfiyle başlayan gerçek " +
  "Türkçe sözcüklerden kısa bir cümle kur). Kod sayılmayanlar: 'ÜB-FK', 'ÜİE' ve 'Ün-Bö-Fed-Kon' (yalnız sırayı ya da " +
  "baş harfleri taşıyan kısaltma), 'Ülke İnsan Otorite' (öğe adlarının kendisi), 'Soylu sınıf dine, toplum " +
  "cumhuriyete' (soy ile sınıfı karıştırıyor, ipucunu kategorisine bağlamıyor). Harf eşleşmesi Türkçe harfle " +
  "birebirdir: C ile Ç, G ile Ğ, I ile İ, O ile Ö, S ile Ş, U ile Ü ayrı harflerdir.";

/**
 * Görsel kartlar (25 Ekim 2026): kavramın zaten anlatılan bilgisini sınavın vurduğu yerden gösterir.
 * Yeni sayı, kural, sonuç taşımazlar. Canlıdaki son 40 dersin 36'sında bu kartlar yoktu; ikisi yalnız
 * formüldü, tuzak / çivi / kaydırma hiç yazılmamıştı. Kota artık zorunlu: ders düşmez, kapanış bir
 * öğretim turu açar. Yazar ve denetçi aynı metni okur.
 */
/**
 * Yapılandırılmış şema (P2-5). Yazar ve denetçi aynı metni okur.
 * Düzen konunun yapısından seçilir; ders adına göre dal yoktur.
 * Koordinat yok. Etiket kaynaktaki terimdir; yeni sayı ya da kural eklenmez.
 */
export const DIAGRAM_LAYOUT_RULE =
  "YAPILANDIRILMIŞ ŞEMA (zorunlu, her derste en az bir): Konunun yapısına uyan bir diagram bloğu yaz " +
  "(type diagram_card de olur). layout yalnız flow (süreç, evre, kronoloji, adım; düğümler sırayla), " +
  "cycle (döngü; son düğüm başa döner), matrix (satır ve sütun başlıklı ilişki; hücre etiketi) ya da " +
  "tree (kökten dallanan sınıflandırma ya da ilişki ağacı). Kaynakta sıralı adım ya da süreç varsa flow, " +
  "döngü varsa cycle, kısa hücreli çapraz tablo varsa matrix, dallanan liste ya da ilişki ağacı varsa tree yaz; " +
  "birden çok yapı varsa her biri ayrı şema. İlişki ağacında düğüm shape 'square' ya da 'circle' ve filled " +
  "true (dolu) ya da false (boş) olabilir; etiket kaynaktaki addır. Koordinat yazma. Etiketler kaynaktaki terimler; " +
  "kaynakta olmayan sayı, kural ya da sonuç ekleme. İlk ekranı şişirme; şemayı sonraki kavrama koy.\n\n";

/**
 * Sayı doğrusu, terazi, eğri, zaman çizgisi ve süreç ağı (27 Ekim 2026).
 * Yazar ve denetçi aynı metni okur. Ders adı `DIAGRAM_LAYOUT_RULE` içinde yoktur;
 * konu doğası bu kuraldadır.
 */
export const PARAMETRIC_DIAGRAM_RULE =
  "PARAMETRİK ŞEMA (zorunlu, her derste en az bir diagram_card): Konunun doğasına uyan bir kart yaz. " +
  "diagramKind yalnız number_line (sayı doğrusu: nokta ve sıçrama; sayı, eşitsizlik, tam sayı, matematik), " +
  "balance_scale (terazi: ilk öğe sol kefe, ikinci öğe sağ kefe; denklem), " +
  "function_curve (koordinat ekseni, eğri ve kritik nokta; fonksiyon, istatistik, iktisat veya fizik grafiği), " +
  "timeline (tarih, edebiyat, kronoloji, neden-sonuç) ya da " +
  "process_network (bileşen veya evre kutuları ve aralarında yönlü bağ; devre, biyoloji, kimya, hukuk, sistem). " +
  "Alanlar: title, isteğe bağlı caption, items (2-8). Her öğede label, isteğe bağlı value, detail ve highlight. " +
  "Koordinat yazma. Etiket kaynaktaki terimdir; kaynakta olmayan sayı, kural ya da sonuç ekleme. " +
  "İlk ekranı şişirme; kartı sonraki kavrama koy. Kart yoksa medium yaz; problem 'Parametrik şema eksik' diye başlar. " +
  "Dersi düşürme, kavramı atma.\n\n";

export const VISUAL_BLOCK_RULE =
  "GÖRSEL KARTLAR (zorunlu; yeni bilgi taşımaz): Her ders en az 2, hedef 3 görsel kart üretir. Düz paragraf " +
  "kartın yerine geçmez. İlk kavram tek ekran ve kısa kalır; kartları sonraki kavramlara dağıt, ilk ekranı " +
  "kartla şişirme. Türleri karıştır ve şemadaki ikinci kavramdaki kartlar örnektir:\n" +
  "(1) Hesaplanabilir bağıntı varsa 'formula' (type 'formula_card' de olur): expression kaynaktaki bağıntı, " +
  "symbols en az 2 simgenin anlamı (en çok 6).\n" +
  "(2) 'exam_trap_card' her derste en az bir: title, wrong (öğrencinin sık inandığı yanlışın kendisi; " +
  "'Sakın karıştırma' cümlesi değil), right (doğrusu, kaynaktaki hâliyle), tell (ayırt ettiren ipucu, bir cümle). " +
  "Kaynak karışıklığı açık yazmıyorsa bile bu konunun en sık düşülen tek yanılgısını göster; yeni sayı, eşik " +
  "ya da kural uydurma.\n" +
  "(3) 'memory_hook_card': kind analogy|image|shortcut, title, body — 5 saniyelik sahne (benzetme, zihin resmi " +
  "ya da kısa yol). Ezber kodu (tone mnemonic) ayrıdır ve çivinin yerine geçmez. Kavram başına en çok bir çivi.\n" +
  "(4) 'comparison_carousel': mode compare|steps, 2-4 slides; her slaytta title, body ve en az bir point. İki " +
  "kavramı ya da bir çözümün adımlarını kaydır. Kaynağın tablosu 'table' kalır; kaydırılan kart tabloyu satır " +
  "satır kopyalamaz.\n" +
  "Formül yoksa tuzak + çivi + kaydırma ile 3 karta çık. İki kart yetmezse üçüncüyü eksik türden yaz. En az " +
  "biri tuzak, çivi ya da kaydırma olsun; yalnız formül kotayı doldurmaz. Belge dışı tamamlayıcı bilgi yalnız " +
  "'note' tone 'general' (type 'general_knowledge_box' de olur); başlık 'Genel bilgi: …'. Tuzak kartındaki " +
  "wrong alanı bilerek yanlış inançtır, olgu değildir.\n\n" +
  DIAGRAM_LAYOUT_RULE +
  PARAMETRIC_DIAGRAM_RULE;

export const EMPHASIS_RULE =
  "VURGU VE AKILDA TUTMA: Sınavda doğrudan soru olacak KESİN bilgiyi (eşik, yaş, süre, ayırıcı ipucu, 'aksi " +
  "kanıtlanana kadar' türü kural, SINAVDA SORULUR maddesi) metinde ==çift eşittir== arasına al; ekranda turuncu " +
  "işaretlenir. Ekran başına en çok 2 vurgu, her biri tam cümle değil kilit ifade (en çok 12 kelime); kaynaktaki sayı ve " +
  "terimle. Anahtar terimler yine **koyu**. KAYNAK'ta kavramına ait bir 'SINAV İPUCU' / 'TUS / SINAV İPUCU', 'AKILDA " +
  "TUT' / 'PRATİK NOKTA' ya da 'ALARM BULGULARI' kutusu varsa atlama, 'note' bloğu olarak ver: sınav ipucu tone 'exam' " +
  "(başlık 'Sınav ipucu: …'), akılda tut ve pratik nokta tone 'remember' (başlık 'Akılda tut: …'), alarm bulguları " +
  "tone 'warn' (başlık 'Alarm bulguları'); gövde kutunun bilgisini kendi cümlelerinle ve eksiksiz verir. " +
  "EZBER KODU (isteğe bağlı): yalnız iki durumda yazılır — (a) sınav kategorileri ve her birini ayırt ettiren " +
  "ipucunu soruyorsa kod her kategoriyi kendi ipucuyla eşler (soy → monarşi, zümre → oligarşi, din adamları → " +
  "teokrasi, toplum → cumhuriyet); (b) sınav listenin tamamını ya da sırasını soruyorsa (bir sendromun bileşenleri, " +
  "tanı kriterleri, bir yaklaşımın basamakları) kod öğelerin baş harflerinden kurulur. İkisi de değilse kutu YAZMA: " +
  "yalnız sırayı ya da baş harfleri taşıyan kod ezber değildir. Kutu: 'note' bloğu, tone 'mnemonic', başlık 'Ezber " +
  "kodu: <kod>', kavram başına en çok bir. Kod Türkçe ve söylenebilir; gövde kodun her parçasının ya da harfinin " +
  "kaynaktaki hangi öğeye (ve ipucuna) karşılık geldiğini yazar. Kod yalnız kaynaktaki öğe ve ipuçlarından kurulur; " +
  "öğe eklemez, eksiltmez; anlamsız harf yığını sayılmaz. Kod listenin kendisi DEĞİLDİR: öğe adlarını virgül ya da " +
  "tireyle art arda yazmak kod sayılmaz. Kodun ne işe yaradığını anlatan cümle ('sırasını hatırlatır') yazma. " +
  MNEMONIC_EXAMPLES +
  "\n\n";

/** Öğretmen istemi — Astra'nın aynı belgeyle gözlenen ders akışı. */
export const TEACHER_SYSTEM =
  INTRO_DOCUMENT +
  "KAYNAK KURALI: Belgede geçen olgu, sayı, tarih, madde ve kural aynen kalır; belgeyle çelişme. " +
  "GENEL BİLGİ KUTUSU: Belge bir formülü, ara adımı, neden-sonuç ilişkisini ya da klasik soru tipini vermeden geçiyorsa, " +
  "o konudan sınavda gereken standart müfredat bilgisini yaz. Belge dışı her bilgi 'note' bloğunda durur: tone 'general', " +
  "başlık kavramın kendi adıdır. 'Sınav Müfredatı Tamamlaması' veya 'Genel bilgi' diye bir önek yazma. Kutu kısa bir hatırlatma değildir: " +
  "tanım, kural ya da formül ve klasik çözümlü örnek o kavramın ekranlarında da anlatılır; kutu onları etiketler. " +
  "Kutu sayısı ve cümle sayısı sınırlı değildir. Emin olunmayan güncel eşik, yönetmelik ya da tartışmalı sayı yazılmaz. " +
  "Kaynakta zaten olan bilgi bu kutuya konmaz. Kontrol sorusu kutunun görülmeyen şekline güvenemez: veri soru kökünde yazılır. " +
  `${WHY_NOTE_RULE} ` +
  "Kavramı ayırt ettirmek için kısa bir örnek vaka ya da benzetme kullanabilirsin, ama o vaka yeni bir " +
  "bilgi (sayı, kural, yasa, tarih, sonuç) taşımaz ve kaynaktaki tanımla çelişmez. " +
  `${SOURCE_LINK_EXEMPTION} ` +
  "Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz; kaynaktan uzun cümle kopyalama. " +
  "Kaynakta bir cümle açıkça bozuksa (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle çelişiyor), " +
  "onu kopyalama: kaynağın kendi açıklamalarından ve örneklerinden anlaşılan anlamı yaz. Örnek: 'işlemin kanunun " +
  "öngördüğü şekilde yapılması durumunda hüküm doğurmamasıdır' bozuk; kastedilen 'yapılmaması nedeniyle'. " +
  "Bu yeni bilgi değil, kaynağın düzeltilmesidir. Düzeltmeyi sessizce yap: derste kaynağın hatasından, " +
  "'kaynakta yanlış yazılmış' gibi bir nottan hiç söz etme.\n\n" +
  "ANLATIM: 'Sen' diye konuşan, sakin, sınav odaklı bir öğretmen. Kısa cümleler. Edebi giriş, boş laf ve gereksiz bilgi yok. " +
  "Her kavram dört parçadır: (1) net tanım, (2) kural, formül ya da şema (sayı doğrusu ve devre sırayla akan bir flow " +
  "şeması, tablo ilişkisi matrix), (3) çözümlü klasik sınav örneği, (4) öğrencinin çözeceği kontrol sorusu. " +
  "Önce kavramın ne olduğunu, sonra neyle karıştırıldığını, sonra sınavda nasıl tanınacağını söyle. Zıtlıkla anlat (X böyledir, Y ise şöyle). " +
  "SAYILAR: Kaynak bir sayı, eşik, aralık, oran ya da birim veriyorsa onu aynen yaz ('2 SD'nin altı', '%3', '13 cm'); " +
  "'yüksek', 'düşük', 'belirli bir değer' diye geçiştirme. Belgede olmayan standart müfredat sayısı yalnız " +
  "'Sınav Müfredatı Tamamlaması' kutusunda ve o kutunun çözümlü örneğinde yazılır.\n\n" +
  `${TEACHING_RUBRIC}\n\n` +
  "BLOKLAR: Her ekran sıralı bloklardan oluşur ve ekranda yukarıdan aşağı bu sırayla görünür; anlatım sırasıyla diz " +
  "(formül, onu açıklayan metnin hemen ardından gelebilir). KAYNAK'ta konuna ait bir tablo varsa ('| … |' satırları) " +
  "onu 'table' bloğu olarak koru: satırlarını paragrafa dökme, hücrelerdeki ayırıcı ipuçlarını düşürme (kısaltabilirsin); " +
  "metin tablonun ayırt ettiren kuralını tek cümlede söyler (hangi sütun neyi ayırır, hangi satır alarm). Kaynak " +
  "tablo vermeden bir karşılaştırma yapıyorsa da 'table' bloğu; " +
  "kardeş kavramları (aynı ailedeki 2-6 terim) 'cards' bloğunda tek cümlelik tanımlar olarak ver; sıralı bir işlem varsa " +
  "'procedure'; hesaplanabilir bağıntı varsa 'formula'; çözümlü hesap varsa 'example'. " +
  "Yaşa, evreye ya da türe göre değişen birden çok değer sayıyorsan ('6 ayda …, 12 ayda …, 2 yaşta …') bunları metinde " +
  "art arda sıralama: 'table' kur (satır yaş/evre, sütun alan) ve metinde ayırt ettiren kuralı tek cümlede söyle. " +
  "Tablo kurduğun ekranda metin tablonun satırlarını yeniden saymaz; ayırt ettiren kuralı tek cümlede söyler. " +
  "Öğrencinin sık karıştırdığı iki kavram varsa ekrana 'note' bloğu (tone: warn) koy; başlık iki kavramın gerçek " +
  "adını taşır ('Üniter devlet ile bölgeli devlet farkı'), 'X ile Y' gibi yer tutucu yazılmaz.\n\n" +
  VISUAL_BLOCK_RULE +
  EMPHASIS_RULE +
  "ÖRNEK VAKA (zorunlu): Derste EN AZ BİR ekranda, uyarı notu olmayan bir ekrana, 'note' bloğu (tone: info) koy; " +
  "başlık 'Örnek vaka: ' ile başlar ve vakayı adlandırır. Kısa, somut bir durum kur (bir hasta, bir ülke, bir açı, bir " +
  "işlem): durumun sonucunu kavram belirler — kavram değişse sonuç değişirdi. İki kavram karışıyorsa vakada ikisi aynı " +
  "olayda FARKLI sonuç versin (biri değişir, öteki değişmez). Vakadaki her sayı, eşik ve sonuç kaynakta geçer; kaynakta " +
  "olmayan sayı, kural, yaş ya da sonuç yazma. Vaka tanımı tekrar etmez. Örnek biçimi: 'Resmi nikâh memuru önünde " +
  "yapılmayan bir evlilik hiç doğmamıştır: yokluk; memur önünde ama evlenmesi yasak akrabalar arasında yapılsaydı " +
  "mutlak butlan olurdu.' Bu cümleyi kopyalama; kendi konunun kavramları için benzer bir vaka kur. Konuyu yalnızca " +
  "uygulayan birini anlatan durum ('ebeveyn ölçümleri eğriye işler', 'öğrenci tanımı ezberler') vaka sayılmaz. " +
  "Kuralı 'Bir kişi …' diye yeniden söyleyen kutu da vaka değildir ('Bir kişi milletvekili seçildikten sonra " +
  "yeterliliği olmadığı anlaşılırsa vekilliği düşer' kuralın kendisi): vaka en az bir somut ayrıntı (yaş, olay, " +
  "sıra, iki kişinin farkı) ve o ayrıntıdan çıkan sonucu taşır.\n\n" +
  "AKIŞ:\n" +
  "1) overview: dersin kancası — konuya girmeden önce öğrenciyi düşündüren 1-2 cümle. 'Önce dene' sorusundan önce " +
  "okunur: o sorunun cevabını vermez (soru 'temel risk etken mi?' diye soruyorsa kanca 'asıl risk sıvı kaybı' demez).\n" +
  "2) Kavramlar ve ekranlar: kaynağın bütün alt başlıklarını, kilit tanımlarını, sayısal kurallarını/formüllerini, " +
  "istisnalarını, aşama/sıralamalarını ve klasik soru/problem tiplerini kapsayacak kadar kavram — genelde 3-6 kavram, " +
  "6-10 ekran (kaynak darsa 2 kavram). OMURGA verildiyse her alt başlığı bir kavramda işle; yalnız terim sayıp " +
  "dersi bitirme. Bir kavram genelde tek ekrandır; hesap yolu, çok adımlı bir " +
  "işlemi ya da uzun bir tablosu varsa 2-3 ekrana böl: önce kavram ve formül, sonra adımlar ve kaynaktaki sayılarla " +
  "çözümlü örnek. Aynı kavramın ekranları art arda gelir ve aynı 'concept' adını taşır; 'heading' ekranın kendi " +
  "odağıdır ('Z-skoru', 'Z-skoru: hesap'). Hesap, çok adımlı işlem ya da uzun tablo YOKSA kavramı bölme: ikinci " +
  "ekran birinciyi tekrar edemez, yeni bir parça ('formula', 'procedure', 'example', 'table') taşır. KAYNAK'taki 5 ya " +
  "da daha çok satırlı bir tabloyu tek ekrana koyma: aynı kavramın 2-3 ekranına satır gruplarıyla böl (ör. yaş " +
  "aralığına göre); her ekranın 'table' bloğu yalnız kendi satırlarını taşır; satırları başka kavrama taşıma. İlk " +
  "kavram tek ekrandır (önce dene + kısa anlatım); bölünecek tablo ya da hesap ikinci kavramdan başlar. Bir tabloya " +
  "gönderen cümle ('tabloda oku') yalnız o tablonun durduğu ekranda yazılır. En fazla 12 ekran. Kapsanmayan kilit " +
  "bilgi için en çok 4 ekran daha eklenebilir; 16 ekranı geçme. Dersteki iki soru " +
  "aynı soruyu ya da aynı bilgiyi sormaz: her ekranın sorusu yeni bir ayrımı yoklar. 'concept' ve " +
  "'heading' kavramın adıdır. " +
  "Kaynakta başlık büyük harfle yazılmış olsa bile sen normal yazımla yaz ('MADDİ YAPTIRIMLAR' değil 'Maddi Yaptırımlar'). " +
  "Ekran numarası, 'Giriş/Özet/Örnek/Yaygın hata/Bilgi kontrolü' gibi şablon başlık yok. Her ekranda en az bir 'text' " +
  "bloğu. Kavramın ilk ekranındaki 'lead' satırı dersin başındaki içerik listesinde kavramın altında durur: kavramın " +
  "neyi ayırt ettirdiğini söyleyen tek kısa cümle; yeni bilgi taşımaz, başlığı tekrar etmez.\n" +
  "3) İlk ekranın İLK bloğu bir 'check' bloğudur (önce dene): konu anlatılmadan önce öğrencinin ön bilgisini yoklayan, " +
  "yaygın yanılgıyı ölçen bir soru; ekranın geri kalanı cevaptan sonra açılır. Bu soru doğru/yanlıştır (trueFalse, " +
  "options ['Doğru','Yanlış']): yaygın yanılgıyı bir ifade olarak yaz; yalnız kavram bir hesap gerektiriyorsa çoktan " +
  "seçmeli olabilir. Soruyu metin bloğunda tekrar sorma ('Önce düşün: … doğru mu, yanlış mı?' yazma); metin doğrudan " +
  "anlatır. Doğru/yanlış ifadesi yanlışsa 'corrected' " +
  "alanına ifadenin doğru hâlini tek cümleyle yaz; öğrenci cevaptan sonra 'Doğrusu' diye görür.\n" +
  "4) Her ekran tek bir 'check' bloğuyla biter; tek istisna ilk ekran: onun sorusu ilk bloktur (önce dene). İlk kavram " +
  "tek ekransa onun sorusu 'önce dene' sorusudur — o ekrana ikinci soru yazma. Öbür ekranlarda soru ekranın son " +
  "bloğudur. Bölünmüş bir tablonun her ekranındaki soru o ekrandaki komşu satırları ayırt ettirir (komşu iki satırı " +
  "karıştıran öğrenciyi yakalar: '9 ayda mı, 12 ayda mı?'). " +
  "Çoktan seçmeli soruda 4 şık; çeldiriciler aynı ailedeki kardeş terimler ya da " +
  "öğrencinin gerçekten karıştırdığı ifadeler. Tek doğru şık. Soru cevabı vermesin; sayma sorusu ('kaç tür vardır') yok. " +
  "explanation doğru cevabın nedenini söyler VE her çeldiricinin gerçekte ne olduğunu söyler. optionWhy her şık için bir " +
  "cümle (şık sayısı kadar). " +
  `${OPTION_ORDER_RULE} ` +
  "review: öğrenci bu soruyu yanlış yaparsa ders sonunda sorulan ikinci sorudur; tam bir soru yaz (prompt, options, " +
  "answerIndex, explanation). Önce düşün: en olası yanlış seçim hangisi, öğrenci neyi neyle karıştırdı? O karışıklığı " +
  "ölçen YENİ bir durum kur — tanımdan terim soruldaysa bu kez bir durumdan (olaydan) terim sorulur. Çoktan seçmelide " +
  "doğru şık bu sorunun doğru şıkkıyla AYNI metindir; çeldiricilerden biri o en olası yanlış seçim, öbürleri aynı " +
  "aileden. Ana sorunun kökünü tekrar etme; başka bir kavramın cevabını sorma. Durum sorusundaki olay tek kavrama " +
  "okunmalı: iki kavramla da açıklanabilen muğlak örnek kurma ('herkesten eşit oranda vergi' — oran mı, miktar mı?); " +
  "ayırt ettiren ayrıntıyı olayın içine yaz. Doğru/yanlış sorunun review'ı da doğru/yanlıştır (options " +
  "['Doğru','Yanlış']): aynı yanılgıyı başka bir durumda ölçen ifade (ana sorunun 'corrected' cümlesini aynen ya da " +
  "eş anlamlı sözcüklerle yeniden sorma; öğrenci onu az önce okudu); ifade yanlışsa 'corrected' alanına doğrusunu " +
  "yaz. review'ın explanation'ı da şıklara sırasıyla gönderme yapmaz.\n" +
  EXAMPLE_DOCUMENT +
  "7) summary: 3-5 madde; sınavda soruyu çözdürecek kesin bilgiler, anahtar kelimeleriyle.\n" +
  "8) nextFocus yalnız verilen SIRADAKİ KONULAR listesinden, aynen; liste boşsa boş dizi.\n\n" +
  "YAZMA: 'Kaynak:', sayfa numarası, 's.12', 'PDF', 'bu derste ... öğreneceğiz' gibi boş cümle, kendini tekrar, " +
  "iç not. Metinde başlığı tekrar etme. Bilgiyi kaynağa atfetme ('kaynakta … diye açıklanır', 'metne göre', " +
  "'belgede belirtildiği gibi' yok): öğretmen gibi doğrudan söyle.\n\n" +
  `${CONTENT_STYLE}\n\n` +
  `Yalnızca bu şemada JSON döndür (kullanmadığın isteğe bağlı alanları yazma):\n${SCHEMA}`;

/**
 * Belgesiz ders istemi: aynı akış ve anlatım; giriş, kaynak kuralı ve çözümlü
 * örnek kuralı değişir. Tek kaynaktan türetilir ki iki istem ayrışmasın.
 */
const RULE_DOCUMENT_END = "gibi bir nottan hiç söz etme.\n\n";
export const TOPIC_TEACHER_SYSTEM =
  INTRO_TOPIC +
  RULE_TOPIC +
  TEACHER_SYSTEM.slice(TEACHER_SYSTEM.indexOf(RULE_DOCUMENT_END) + RULE_DOCUMENT_END.length).replace(
    EXAMPLE_DOCUMENT,
    EXAMPLE_TOPIC,
  );

export function teacherSystem(mode: TeacherLessonMode = "document"): string {
  return mode === "topic" ? TOPIC_TEACHER_SYSTEM : TEACHER_SYSTEM;
}

/** Konunun kendi sayfalarından omurga; belgesiz derste yok. */
export function inputBackbone(input: Partial<Pick<TeacherLessonInput, "pages" | "topicLabel" | "runningHeaders" | "mode">>): string[] {
  if (input.mode === "topic" || !input.pages?.length) return [];
  return lessonBackbone(input.pages, { topicLabel: input.topicLabel, runningHeaders: input.runningHeaders });
}

export function teacherUserPrompt(input: TeacherLessonInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.previousTopic ? `ÖNCEKİ KONU (gerekirse tek cümleyle bağlan): ${input.previousTopic}` : "",
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    examPointsBlock(input.examPoints, "lesson"),
    `SIRADAKİ KONULAR: ${input.upcomingTopics.length ? input.upcomingTopics.join(" | ") : "(yok)"}`,
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu ya da bölüm adı değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.mode === "topic" ? "" : backboneBlock(inputBackbone(input)),
    input.mode === "topic" ? "" : keyFactsBlock(lessonKeyFacts(input.pages)),
    input.mode === "topic"
      ? "KAYNAK: (yok — belgesiz ders; konunun yerleşik bilgisiyle yaz)"
      : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Denetçi ayarı (18 Ekim 2026). 17 Ekim'de canlı "Kadın Hastalıkları ve Doğum" dersi iki
 * düzeltme turundan sonra tek bir eşik itirazıyla bütünüyle atıldı (~4 dk); ertesi denemede
 * "… belirtmiyor" türünden eksik-ayrıntı itirazları iki tur daha açtırdı. Eksik ayrıntı yanlış
 * bilgi değildir; eşdeğer söyleyiş sorun değildir; emin olunmayan şey yüksek yazılmaz.
 */
const CALIBRATION =
  "ÖNEM: 'high' yalnız öğrenciye yanlış ya da yanıltıcı bir şey öğreten, cevabı yanlış ya da çözülemez kılan " +
  "sorunlar içindir. Bir ayrıntının derste geçmemesi (eksik bilgi, 'şunu da belirtmiyor') tek başına 'low'dur; " +
  "eksiklik yazılan ifadeyi yanlış yapıyorsa 'high'. Aynı bilginin eşdeğer söylenişi ('≥2 katı' ile '2 katı ve " +
  "üzeri') sorun değildir. Emin olmadığın bir şeyi 'high' yazma. 'medium' yalnız ÖĞRETİM ÖLÇÜTÜ sorunları ve SINAVDA SORULUR maddesinin " +
  "eksikliği içindir: " +
  "öğretimi zayıflatan ama yanlış bir şey öğretmeyen sorun; düzeltmesi bir cümleyi ya da bir soruyu değiştirmektir. " +
  "Emin değilsen 'low'. 'problem' ve 'fix' en çok 30 kelime.\n";

/**
 * Öğretim puanı (23 Ekim 2026, ürün sahibinin kararı): denetçi denetlediği kısma 1-5 verir. İlk kavram dışında 3'ün
 * altı bir öğretim turu açar (`teacher-lesson-run.ts`); ilk kavramda yalnız kayda geçer (öğrenci ilk ekranı bekliyor).
 */
export const TEACHING_SCORE_RULE =
  '"teaching": denetlenen kısmın öğretim puanı, {"score":1-5,"reason":"…"}. 5: öğretmen gibi anlatıyor — ne olduğu, ' +
  "neden ya da nasıl öyle olduğu, somut bir örnek ya da vaka, neyle karıştığı ve kavramı gerçekten yoklayan bir soru. 3: " +
  "doğru ama kaynağın cümlelerini yeniden diziyor; neden ya da örnek yok. 1: tekrar, boş cümle, kaynağın kopyası. " +
  "Doğruluk sorunları puanı düşürmez (onlar issues'ta). reason en çok 25 kelime: puanı en çok yükseltecek tek değişiklik.";

const VERIFY_JSON =
  'JSON döndür: {"issues":[{"where":"screens[1].blocks[3]","severity":"high","problem":"…","fix":"…"}],' +
  '"teaching":{"score":4,"reason":"…"}} — severity ' +
  "'high', 'medium' ya da 'low'. Sorun yoksa issues boş dizi. " +
  TEACHING_SCORE_RULE;

/** Denetçinin öğretim puanı; yoksa ya da tanınmıyorsa null. */
export function parseTeachingScore(raw: unknown): { score: number; reason: string } | null {
  const row = (raw as { teaching?: { score?: unknown; reason?: unknown } } | null)?.teaching;
  const score = typeof row?.score === "number" ? Math.round(row.score) : Number.NaN;
  if (!Number.isFinite(score) || score < 1 || score > 5) return null;
  return { score, reason: typeof row?.reason === "string" ? row.reason.trim().slice(0, 300) : "" };
}

/**
 * İkinci sorunun (review) denetimi (20 Ekim 2026): yazar artık tam öğe yazıyor; denetçi onu da her soru gibi
 * çözer. Kör kıyasta kodun kurduğu ikinci sorular kaçırılan kavramı değil komşusunu soruyordu.
 */
const REVIEW_VERIFY =
  "Bunlar her sorunun 'review' alanına (yanlış cevaptan sonra sorulan ikinci soru) da uygulanır; review başka bir " +
  "kavramı soruyorsa ya da çoktan seçmelide doğru şıkkı ana sorunun doğru şıkkıyla aynı metin değilse bu da C'dir. " +
  // 24 Ekim 2026 lansman testi: denetçi doğru/yanlış sorunun ikinci sorusunu "doğru yanıtı Doğru, ana sorununki
  // Yanlış" diye C saydı; ikinci soru yeni bir ifadedir, cevabı farklı olabilir (`reviewItemProblems` de aramıyor).
  "Doğru/yanlış sorunun review'ı yeni bir ifadedir: cevabının ana sorunun cevabından farklı olması sorun değildir. " +
  // 22 Ekim 2026 inceleme: aynı belirti hem C (high) hem J (medium) diye yazılıydı; C'yi seçen denetçi öğretim
  // nitini düzeltme turuna, oradan yeniden yazıma taşıyordu. Yalnız öğretim ölçütü maddesi (medium).
  "(Kavramı bilmeden çözülebilen soru — kök üstündeki cümleyi geri soruyor ya da şıklardan yalnız biri sorulan " +
  "kategoriden — C değil, öğretim ölçütü maddesidir: 'medium'.)";

/**
 * Ezber kodunun denetimi (20 Ekim 2026): kod isteğe bağlı; olmaması sorun değil, ayrım taşımayan kod sorun.
 * Belgeli ve belgesiz denetçi aynı metni okur.
 */
const MNEMONIC_VERIFY =
  "Ezber kodu (tone 'mnemonic') kaynaktaki öğe ya da ipuçlarıyla birebir eşleşmiyor (öğe eksik ya da fazla, harf ya da " +
  "ipucu yanlış öğeye karşılık); kod yalnız sırayı ya da baş harfleri taşıyor ama sınav listenin tamamını ya da sırasını " +
  "sormuyor (kategori ↔ ipucu eşlemesi yok); kodun öğe adlarının art arda yazılmasından ibaret olması (kod değil liste). " +
  "Ezber kodunu yazarla aynı tanımla denetle: " +
  MNEMONIC_EXAMPLES +
  " Ezber kodunun olmaması sorun değildir. Liste kodunda harfleri birebir tutan akrostişin anlamının tuhaf olması tek " +
  "başına sorun değildir. ";

/** Öğretim ölçütü maddesi: yazarla aynı metin, 'medium'. */
const RUBRIC_VERIFY =
  "ÖĞRETİM ÖLÇÜTÜ'ne (yazarın okuduğu metin aşağıda) uymayan ekran, kutu, soru ya da özet: tekrar, kaynağın kısaltmasını " +
  "açıklamadan aktarma, ilk geçtiği yerde açıklanmamış terim, boş cümle, döngüsel tanım, üstündeki cümleyi geri soran " +
  "soru, kavramı bilmeden çözülebilen soru (şıklardan yalnız biri sorulan kategoriden), en olası yanlışı ölçmeyen " +
  "ikinci soru, kavramı düşüren özet. Bunlar 'medium'dur ('high' değil). " +
  TEACHING_RUBRIC +
  "\n";

export const VERIFY_SYSTEM =
  "Sen titiz bir ders denetçisisin. Bir dersi, yazıldığı KAYNAK ile karşılaştırıyorsun. Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan olgu, tanım, sayı, tarih, kural ya da sınıflandırma. (Yeni bilgi taşımayan örnek " +
  `vaka ya da benzetme sorun değildir. ${SOURCE_LINK_EXEMPTION} tone 'general' olan 'Genel bilgi' ve 'Neden böyle?' ` +
  "notu kaynakta olmayabilir; onu A'ya göre değil H'ye göre denetle.)\n" +
  "B) Kaynakla çelişen ya da kaynağın anlamını değiştiren ifade; kaynaktaki bir sayının, eşiğin ya da birimin yanlış " +
  "aktarılması ya da kaynak sayıyı açıkça verirken derste 'yüksek/düşük' gibi soyut sözle geçiştirilmesi.\n" +
  "C) Yanlış cevap anahtarı, birden fazla doğru şık, cevabı soru metninde veren soru; durum sorusundaki olayın " +
  `iki kavrama da okunabilmesi (ayırt ettiren ayrıntı eksik). ${REVIEW_VERIFY}\n` +
  "D) explanation, optionWhy, corrected'da (yanlış ifadenin doğrusu) ya da çözümlü örnekte yanlış bilgi veya hesap " +
  "hatası (review'un explanation ve corrected'ı dahil); explanation ya da optionWhy'ın şıklara sırasıyla ya da " +
  `harfiyle gönderme yapması. Yazarın okuduğu kural: ${OPTION_ORDER_RULE}\n` +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle; kaynağın bozuk kelimesinin ya da bozuk cümlesinin kopyası.\n" +
  "F) Ders içinde tutarsızlık (bir yerde üç tür deyip başka yerde farklı saymak gibi).\n" +
  "G) Derste kaynağın kendisinden söz eden iç not ('kaynakta yanlış yazılmış', 'kaynaktaki ifade hatalıdır' gibi) " +
  "ya da bilgiyi kaynağa atfeden cümle ('kaynakta … diye açıklanır', 'metne göre', 'belgede belirtildiği gibi').\n" +
  "H) 'Genel bilgi' notunda (tone 'general') yanlış, tartışmalı ya da güncel olarak değişebilecek bilgi; kaynakta zaten " +
  "olan bilginin bu nota konması; bu nottaki bilginin metinde, soruda, 'corrected'da ya da özette kullanılması. " +
  // 23 Ekim 2026 (4. ölçüm): hukuk derslerinde kutular döngüseldi ("Yargı yolu, … incelenmesini sağlar"). Döngüsel kutu
  // öğretim sorunudur: medium, düzeltme kutuyu çıkarır; kapanış yerine yenisini istemez (`isCircularWhyIssue`).
  "'Neden böyle?' kutusu başlıktaki bilgiyi başka sözlerle yeniden söylüyor, gerçek bir mekanizma (şu olduğu için şu " +
  "olur) vermiyorsa 'medium' yaz; problem 'Döngüsel Neden böyle?' diye başlasın, fix 'kutuyu çıkar'. " +
  "'Neden böyle?' notunda (tone 'general') yanlış ya da tartışmalı mekanizma; nota yeni sayı, eşik, kural, tarih ya da " +
  `sonuç konması; kaynak nedeni kendisi verirken kutu açılması. Yazarın okuduğu kural: ${WHY_NOTE_RULE}\n` +
  `I) ${MNEMONIC_VERIFY}` +
  "==vurgulanan== ifade kaynakta yok ya da yanlış; kaynakta kavramın bir SINAV İPUCU / " +
  "AKILDA TUT / ALARM kutusu varken derste hiç geçmemesi.\n" +
  `J) ${RUBRIC_VERIFY}` +
  "Kaynakta açıkça bozuk bir cümlenin (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle " +
  "çelişen) derste kaynağın kendi açıklama ve örnekleriyle tutarlı anlamıyla yazılması SORUN DEĞİLDİR; bunu A ya da B " +
  "sayma.\n" +
  `K) ${VISUAL_BLOCK_RULE}` +
  "Görsel kart yeni sayı, kural ya da sonuç taşıyorsa A gibi 'high'. Tuzak kartındaki wrong alanı bilerek yanlış " +
  "inançtır, A sayma. 2 karttan azsa ya da tuzak, çivi ve kaydırma hiç yoksa 'medium' yaz; problem 'Görsel kart " +
  "eksik' diye başlasın. Kartlar duruyorsa yokluk yazma. flow, cycle, matrix ya da tree şeması yoksa 'medium' yaz; " +
  "problem 'Yapılandırılmış şema eksik' diye başlasın. diagram_card yoksa 'medium' yaz; problem " +
  "'Parametrik şema eksik' diye başlasın. Dersi düşürme, kavramı atma.\n" +
  "A-I 'high'; J ve görsel kart eksiği 'medium'. Şunlar 'low': gereksiz uzunluk, zayıf kanca, ekranda 2'den fazla " +
  "==vurgu== ya da sınavlık olmayan bilgiye vurgu.\n" +
  CALIBRATION +
  VERIFY_JSON;

/** Belgesiz ders denetimi: kaynak yok, doğruluk ve öğretim kalitesi. */
export const TOPIC_VERIFY_SYSTEM =
  "Sen titiz bir ders denetçisisin. Belgesi olmayan bir sınav dersini doğruluk açısından denetliyorsun. Şunları bul:\n" +
  "A) Yanlış olgu, tanım, sayı, eşik, birim, tarih, kural ya da sınıflandırma.\n" +
  "B) Emin olunamayacak kadar ayrıntılı ya da güncel olarak değişebilecek bilgi (yürürlükteki oran, son düzenleme), " +
  "tartışmalı bir görüşün kesin doğru gibi sunulması.\n" +
  "C) Yanlış cevap anahtarı, birden fazla doğru şık, cevabı soru metninde veren soru; durum sorusundaki olayın " +
  `iki kavrama da okunabilmesi (ayırt ettiren ayrıntı eksik). ${REVIEW_VERIFY}\n` +
  "D) explanation, optionWhy ya da corrected'da (yanlış ifadenin doğrusu) yanlış bilgi (review'un explanation ve " +
  "corrected'ı dahil); çözümlü örnekte hesap hatası; explanation ya da optionWhy'ın şıklara sırasıyla ya da harfiyle " +
  `gönderme yapması. Yazarın okuduğu kural: ${OPTION_ORDER_RULE}\n` +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "F) Ders içinde tutarsızlık.\n" +
  `G) ${MNEMONIC_VERIFY}\n` +
  `H) ${RUBRIC_VERIFY}` +
  `I) ${VISUAL_BLOCK_RULE}` +
  "Görsel kart yanlış bilgi taşıyorsa A gibi 'high'. Tuzak kartındaki wrong alanı bilerek yanlış inançtır. 2 karttan " +
  "azsa ya da tuzak, çivi ve kaydırma hiç yoksa 'medium' yaz; problem 'Görsel kart eksik' diye başlasın. Kartlar " +
  "duruyorsa yokluk yazma. flow, cycle, matrix ya da tree şeması yoksa 'medium' yaz; problem 'Yapılandırılmış şema eksik' " +
  "diye başlasın. diagram_card yoksa 'medium' yaz; problem 'Parametrik şema eksik' diye başlasın.\n" +
  "A-G 'high'; H 'medium'. Görsel kart eksiği de 'medium'. Şunlar 'low': gereksiz uzunluk, zayıf kanca.\n" +
  CALIBRATION +
  "Kurumlar ya da kılavuz sürümleri arasında küçük farklar olan bir eşikte ders yaygın kabul gören değeri veriyorsa " +
  "bu A ya da B değildir.\n" +
  VERIFY_JSON;

export function verifySystem(mode: TeacherLessonMode = "document"): string {
  return mode === "topic" ? TOPIC_VERIFY_SYSTEM : VERIFY_SYSTEM;
}

export function verifyUserPrompt(
  lesson: LessonV3,
  input: Pick<TeacherLessonInput, "pages" | "mode" | "topicLabel" | "prepTitle">,
): string {
  const head =
    input.mode === "topic"
      ? `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz ders.)`
      : `KAYNAK:\n${sourceText(input.pages)}`;
  return `${head}\n\nDERS (JSON):\n${JSON.stringify(lesson)}`;
}

/**
 * Kavram kavram denetim (18 Ekim 2026). Ders akışla yazılırken her kavramın ekranları
 * biter bitmez denetlenir; öğrenci ilk kavramı okurken sonrakiler denetimden geçer.
 * Denetçi dersin o ana kadarki hâlini görür (tutarlılık için) ama yalnız istenen parçayı
 * denetler. Ekran numaraları dersin bütünündeki yeriyle yazılır.
 */
export type LessonPart = {
  /** Denetlenen ekranların dersteki ilk ve son sırası (dahil). */
  from: number;
  to: number;
  /** İlk parça: başlık, kanca ve hedef de denetlenir (giriş kartında görünür). */
  header: boolean;
  /** Son parça: sık yapılan hata ve özet de denetlenir. */
  closing: boolean;
};

export type TeacherDispute = { where: string; reason: string };

function partLabel(part: LessonPart): string {
  const screens = part.from === part.to ? `screens[${part.from}]` : `screens[${part.from}]–screens[${part.to}]`;
  return [screens, part.header ? "title, overview, objective" : "", part.closing ? "commonMistake, summary" : ""]
    .filter(Boolean)
    .join(", ");
}

function disputeLines(disputes: TeacherDispute[]): string {
  return disputes.map((item, i) => `${i + 1}. [${item.where}] ${item.reason}`).join("\n");
}

export function verifyPartUserPrompt(
  lesson: LessonV3,
  part: LessonPart,
  input: Pick<TeacherLessonInput, "pages" | "mode" | "topicLabel" | "prepTitle" | "examPoints">,
  disputes: TeacherDispute[] = [],
): string {
  return [
    verifyUserPrompt(lesson, input),
    examPointsVerifyBlock(input.examPoints),
    `DENETLENECEK: yalnız ${partLabel(part)}. Dersin öbür kısımları ayrıca denetlendi ya da denetlenecek; onları ` +
      "yalnız tutarlılık (F) için oku, onlar için sorun yazma.",
    // 23 Ekim 2026 (3. ölçüm): akışlı derste ilk kavram yazılırken sonrakiler henüz yok. Denetçi dersin başlığındaki
    // ve SINAVDA SORULUR listesindeki öbür konuları ("YSK ekranda yok", "seçim ilkeleri yok") ilk kavramda eksik
    // saydı; yazar onları ilk ekrana sıkıştırdı, ilk ekran 84-200 sn'ye çıktı ve aynı bilgi sonraki kavramda yeniden
    // anlatıldı (ikinci kör ölçümün "aynı YSK paragrafı üç ekranda" bulgusu).
    part.closing
      ? ""
      : "Bu kısım dersin son kısmı DEĞİL: başlıkta ya da SINAVDA SORULUR listesinde geçen öbür konular sonraki " +
        "kavramlarda anlatılacak. Onları bu kısımda eksik sayma; yalnız bu kısmın kavramına ait eksikliği yaz.",
    disputes.length
      ? `YAZARIN İTİRAZLARI (önceki denetimdeki sorunlar için):\n${disputeLines(disputes)}\n` +
        "Her itirazı tart: yazar haklıysa o sorunu yeniden yazma; haksızsa sorunu nedeniyle birlikte yeniden yaz."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const FIX_PART_PREFIX =
  "Sen aynı dersi yazan öğretmensin. Ders ekran ekran öğrenciye açılıyor; denetçi bir kısmında sorun buldu. Yalnız o " +
  "kısmı düzelt. Kaynakta dayanağı olmayan bilgiyi çıkar ya da kaynaktaki doğrusuyla değiştir; yanlış anahtarı düzelt; " +
  "bozuk cümleyi doğru Türkçeyle yeniden yaz; önerilen düzeltme ('→' sonrası) haklıysa onu uygula. Sorunsuz kısımları değiştirme. Bir sorunun yanlış olduğundan eminsen " +
  "(yazdığın bilgi doğru ve kurala uygun) o yeri değiştirme, 'disputes' içinde kısa nedenini yaz. Kurallar aynı:\n\n";

export function fixPartSystem(mode: TeacherLessonMode = "document"): string {
  return FIX_PART_PREFIX + teacherSystem(mode);
}

export function fixPartUserPrompt(
  lesson: LessonV3,
  part: LessonPart,
  issues: TeacherIssue[],
  input: TeacherLessonInput,
): string {
  const backbone = part.closing && issues.some((issue) => issue.problem.includes(BACKBONE_TAG));
  const coverage = part.closing && issues.some((issue) => issue.problem.includes(COVERAGE_TAG));
  const fields = [
    backbone || coverage
      ? `"screens": [screens[${part.from}]…screens[${part.to}] aynı sırayla (kısmın BÜTÜN ekranları), ardından ${
          backbone ? "işlenmemiş alt başlıklar" : "işlenmemiş kilit bilgiler"
        }${backbone && coverage ? " ve kilit bilgiler" : ""} için en çok ${BACKBONE_EXTRA_SCREENS} yeni ekran, her biri kendi 'concept' adıyla]`
      : `"screens": [screens[${part.from}]…screens[${part.to}] düzeltilmiş hâli, aynı sırayla; kısmın BÜTÜN ekranları, değiştirmediklerin de; 1-3 ekran, aynı kavram]`,
    part.header ? '"title", "overview", "objective" (değiştirdiysen)' : "",
    part.closing ? '"commonMistake", "summary" (değiştirdiysen)' : "",
    '"disputes": [{"where": "…", "reason": "…"}]',
  ].filter(Boolean);
  return [
    teacherUserPrompt(input),
    `ŞU ANKİ DERS (JSON):\n${JSON.stringify(lesson)}`,
    `DÜZELTİLECEK KISIM: ${partLabel(part)}`,
    `SORUNLAR:\n${issues.map((issue, i) => `${i + 1}. [${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`).join("\n")}`,
    "'[yapı kuralı]' ile başlayan sorunlar koddaki kurallardır: itiraz edilemez, mutlaka düzelt.",
    ...(issues.some((issue) => issue.problem.startsWith(TEACHING_TAG))
      ? [
          `'${TEACHING_TAG}' ile başlayanlar ÖĞRETİM ÖLÇÜTÜ sorunlarıdır, yanlış bilgi değil: yalnız o cümleyi ya da soruyu ` +
            "değiştir; doğru olan bilgiyi ve öbür ekranları bozma.",
        ]
      : []),
    `Dersin tamamını DEĞİL, yalnız şu alanları taşıyan bir JSON döndür: {${fields.join(", ")}}.`,
  ].join("\n\n");
}

/**
 * Düzelmeyen kavramı BAŞTAN yazdırma (18 Ekim 2026, ürün sahibinin kararı: "arkada yeniden
 * yazılsın"). Düzeltme turları aynı taslağı yamalıyor; aynı yerde takılan taslak (Pediatri,
 * gelişim basamakları: üç tur aynı sorun) yamayla düzelmiyor ve kavram dersten atılıyordu —
 * öğrenci sınavın en önemli bölümü eksik dersi tam sanıyordu. Önceki taslak bir kez bırakılır,
 * kavram kaynaktan yeniden yazılır; yeni taslak yine denetlenir.
 */
export function rewritePartUserPrompt(
  lesson: LessonV3,
  part: LessonPart,
  issues: TeacherIssue[],
  input: TeacherLessonInput,
  attempt = 1,
): string {
  const concept = lesson.screens[part.from]?.concept || lesson.screens[part.from]?.heading || "bu kavram";
  return [
    teacherUserPrompt(input),
    `ŞU ANKİ DERS (JSON):\n${JSON.stringify(lesson)}`,
    `YENİDEN YAZILACAK KISIM: ${partLabel(part)} — kavram "${concept}".`,
    attempt > 1
      ? `Bu kavram ${attempt}. kez baştan yazılıyor; dersten atılmayacak. Sorunlu cümleyi kaynaktaki doğrusuyla yaz ` +
        "ya da çıkar; emin olmadığın ayrıntıyı yazma, kavramın kaynaktaki kilit bilgisini koru."
      : "",
    `Bu kavramın taslağı düzeltmelere rağmen denetimden geçmedi. Son sorunlar:\n${issues
      .map((issue, i) => `${i + 1}. [${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`)
      .join("\n")}`,
    "Önceki taslağı bırak: kavramı KAYNAK'tan baştan, farklı bir kuruluşla yaz. Kavramın sınavda soruyu " +
      "çözdüren bilgisini (tablo, eşik, sınıflama, ayırıcı ipucu) mutlaka taşı; kaynaktaki tabloyu 'table' " +
      "bloğu olarak ver" +
      (part.header
        ? ". "
        : "; 5 ya da daha çok satırlı tabloyu aynı kavramın 2-3 ekranına satır gruplarıyla böl, her ekran bir soruyla bitsin. ") +
      "Aynı kavram adını ('concept') koru. '[yapı kuralı]' sorunları koddaki kurallardır.",
    `Yalnız şu alanları taşıyan bir JSON döndür: {"screens": [bu kavramın 1-3 ekranı, baştan yazılmış]${
      part.closing ? ', "commonMistake", "summary"' : ""
    }}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type PartFix = {
  screens: LessonV3["screens"];
  title?: string;
  overview?: string;
  objective?: string;
  commonMistake?: LessonV3["commonMistake"];
  summary?: string[];
  disputes: TeacherDispute[];
};

/** Düzeltilmiş kısmı okur; ekranlar dersin şemasından geçer. Bozuksa null. */
export function parsePartFix(raw: unknown, base: LessonV3, upcomingTopics: string[]): PartFix | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const disputes = Array.isArray(row.disputes)
    ? row.disputes.flatMap((item) => {
        const value = item as Record<string, unknown>;
        const reason = typeof value?.reason === "string" ? value.reason.trim().slice(0, 300) : "";
        return reason ? [{ where: typeof value.where === "string" ? value.where.slice(0, 80) : "ders", reason }] : [];
      })
    : [];
  const screens = Array.isArray(row.screens) ? row.screens : [];
  // Ekranlar ve kapanış alanları dersin kendi şemasından geçsin: tek kaynak.
  const shaped = parseTeacherLesson(
    {
      ...base,
      ...(typeof row.title === "string" ? { title: row.title } : {}),
      ...(typeof row.overview === "string" ? { overview: row.overview } : {}),
      ...(typeof row.objective === "string" ? { objective: row.objective } : {}),
      ...(row.commonMistake && typeof row.commonMistake === "object" ? { commonMistake: row.commonMistake } : {}),
      ...(Array.isArray(row.summary) ? { summary: row.summary } : {}),
      screens: screens.length ? screens : base.screens,
    },
    upcomingTopics,
  );
  if (!shaped) return null;
  if (!screens.length && !disputes.length) return null;
  return {
    screens: screens.length ? shaped.screens.slice(0, LESSON_SCREEN_HARD_CAP) : [],
    ...(typeof row.title === "string" ? { title: shaped.title } : {}),
    ...(typeof row.overview === "string" ? { overview: shaped.overview } : {}),
    ...(typeof row.objective === "string" ? { objective: shaped.objective } : {}),
    ...(row.commonMistake ? { commonMistake: shaped.commonMistake } : {}),
    ...(Array.isArray(row.summary) ? { summary: shaped.summary } : {}),
    disputes,
  };
}

/**
 * Önem dereceleri. 'medium' (20 Ekim 2026, ürün sahibinin kararı): öğretimi zayıflatan ama yanlış bir şey
 * öğretmeyen sorun (ÖĞRETİM ÖLÇÜTÜ). İlk kavramda tur açmaz; sonraki kavramlarda en çok bir kavram içi tur,
 * gerilerse önceki ekranlar geri gelir; asla atma ya da baştan yazma (teacher-lesson-run.ts).
 */
export type TeacherIssue = { where: string; severity: "high" | "medium" | "low"; problem: string; fix?: string };

/** Öğretim ölçütü sorununun önü: düzeltme isteminde ve yönetim kaydında yanlış bilgiden ayrılsın. */
export const TEACHING_TAG = "[öğretim]";
/** Omurga eksiği: kapanış kısmına yeni kavram ekranları eklenebilir. */
export const BACKBONE_TAG = "[omurga]";
/** Kilit bilgi, çözümlü örnek ya da kaynak yapısının şeması eksik. Kavramı düşürmez. */
export const COVERAGE_TAG = "[kapsam]";
export const BACKBONE_EXTRA_SCREENS = 4;

/** Kapsam eksiği: omurga, kilit bilgi ya da istenen şema. Yüksek olsa da kavram atılmaz. */
export function isCoverageIssue(issue: TeacherIssue): boolean {
  const problem = issue.problem.replace(/^\[yapı kuralı\]\s*/, "");
  return problem.startsWith(BACKBONE_TAG) || problem.startsWith(COVERAGE_TAG);
}

/** Öğrenci metninden denetim etiketlerini siler. Etiket yoksa aynı nesneyi döner. */
export function stripLessonIssueTags<T>(value: T): T {
  const raw = JSON.stringify(value);
  if (!/\[(?:omurga|kapsam|öğretim|yapı kuralı)\]/.test(raw)) return value;
  return JSON.parse(raw.replace(/\[(?:omurga|kapsam|öğretim|yapı kuralı)\]\s*/g, "")) as T;
}

/**
 * Denetçinin sorunları. Bilinmeyen önem 'high' sayılır. `medium: true` yalnız ders denetiminde: öbür motorlar
 * (podcast) 'medium' istemiyor; onlarda model yine de 'medium' yazarsa eskisi gibi 'high' sayılır.
 */
export function parseIssues(raw: unknown, options: { medium?: boolean } = {}): TeacherIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem) return [];
    const severity =
      row.severity === "low" ? ("low" as const) : row.severity === "medium" && options.medium ? ("medium" as const) : ("high" as const);
    return [
      {
        where: typeof row.where === "string" ? row.where.slice(0, 80) : "ders",
        severity,
        problem: (severity === "medium" ? `${TEACHING_TAG} ${problem}` : problem).slice(0, 400),
        fix: typeof row.fix === "string" ? row.fix.slice(0, 400) : undefined,
      },
    ];
  });
}

/**
 * Model çıktısını şemaya oturtur. Metne bir şey eklemez; yalnız liste dışı
 * nextFocus'u düşürür ve kaynaktan aynen alınmış BÜYÜK HARF başlığı normal
 * yazıma çevirir (KPSS altın denemesinde iki düzeltme turu da başlıkları
 * değiştirmedi; yazım yüzünden ders reddedilmesin).
 */
export function parseTeacherLesson(raw: unknown, upcomingTopics: string[]): LessonV3 | null {
  // Model "format" alanını unutursa ekranlı ders yine V3 sayılır; eski biçimde
  // (sections) dönerse çevrilir — biçim yüzünden ders reddedilmez.
  const shaped =
    raw && typeof raw === "object" && Array.isArray((raw as { screens?: unknown }).screens)
      ? { ...(raw as object), format: LESSON_V3_FORMAT }
      : raw;
  const lesson = readLessonV3(shaped);
  if (!lesson) return null;
  const allowed = new Set(upcomingTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  const nextFocus = (lesson.nextFocus ?? []).filter((item) => allowed.has(item.trim().toLocaleLowerCase("tr")));
  return {
    ...lesson,
    title: calmHeading(lesson.title),
    screens: lesson.screens.map(calmScreen),
    nextFocus,
  };
}

/** Kaynaktan aynen alınmış BÜYÜK HARF başlıklar normal yazıma; metne başka dokunulmaz. */
function calmScreen(screen: LessonScreen): LessonScreen {
  return {
    ...screen,
    heading: calmHeading(screen.heading),
    ...(screen.concept ? { concept: calmHeading(screen.concept) } : {}),
    blocks: screen.blocks.map((block): LessonBlock =>
      block.type === "cards" ? { ...block, cards: block.cards.map((card) => ({ ...card, title: calmHeading(card.title) })) } : block,
    ),
  };
}

/** Akışla gelen tek ekran: dersin ekran şemasından geçer. Bozuksa null. */
export function parseTeacherScreen(raw: unknown): LessonScreen | null {
  const parsed = lessonScreenSchema.safeParse(raw);
  return parsed.success ? calmScreen(parsed.data) : null;
}

const MINOR_WORDS = new Set(["ve", "ile", "veya", "ya", "da", "de", "ki", "için", "gibi", "ya da"]);

/**
 * "KESİN HÜKÜMSÜZLÜK VE İPTAL" → "Kesin Hükümsüzlük ve İptal". Yalnız
 * bağıran başlığa dokunur; ünlüsüz kısaltmalar (KPSS, TBMM) olduğu gibi kalır.
 */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

/**
 * Çoktan seçmeli kontrollerin şıklarını gerekçeleriyle birlikte, soru metnine
 * bağlı sabit bir sırayla karıştırır; answerIndex yeni yere taşınır. Metin
 * değişmez. Altın denemede Pediatri dersinin üç sorusunda da doğru cevap
 * ilk şıktı. Doğru/yanlış kontrollerine dokunulmaz.
 */
/** `salt`: "Dersi tekrarla"da aynı ders başka bir sırayla (18 Ekim 2026); yazımda boş. */
export function shuffleLessonChecks(lesson: LessonV3, salt = ""): LessonV3 {
  return {
    ...lesson,
    screens: lesson.screens.map((screen) => ({
      ...screen,
      blocks: screen.blocks.map((block): LessonBlock => (block.type === "check" ? { ...block, check: shuffleCheck(block.check, salt) } : block)),
    })),
  };
}

type Check = Extract<LessonBlock, { type: "check" }>["check"];

/** Metne bağlı sabit karışık sıra (xorshift; aynı metin, aynı sıra). */
function shuffledOrder(count: number, seedText: string): number[] {
  let state = seedOf(seedText);
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  return order;
}

function shuffleCheck(check: Check, salt = ""): Check {
  if (check.type !== "mcq" || !check.options || check.options.length < 3 || typeof check.answerIndex !== "number") {
    return check;
  }
  const order = shuffledOrder(check.options.length, salt + check.prompt);
  const whyAligned = check.optionWhy?.length === check.options.length;
  // İkinci soru (review) tam öğe olarak kendi şıklarını taşıyor (20 Ekim 2026): yazar onun da doğrusunu ilk şıkka
  // yazıyor; kendi kökünden türeyen sırayla karışır. Saklı sıra karışık olduğundan çalışma anı kaydırmaz.
  const review = check.review;
  const reviewOptions = review?.options;
  const shuffleReview = Boolean(
    reviewOptions &&
      reviewOptions.length >= 3 &&
      typeof review?.answerIndex === "number" &&
      review.answerIndex >= 0 &&
      review.answerIndex < reviewOptions.length,
  );
  const reviewOrder = shuffleReview ? shuffledOrder(reviewOptions!.length, salt + review!.prompt) : null;
  return {
    ...check,
    options: order.map((index) => check.options![index]),
    answerIndex: order.indexOf(check.answerIndex),
    ...(whyAligned ? { optionWhy: order.map((index) => check.optionWhy![index]) } : {}),
    ...(review && reviewOrder
      ? {
          review: {
            ...review,
            options: reviewOrder.map((index) => reviewOptions![index]!),
            answerIndex: reviewOrder.indexOf(review.answerIndex!),
          },
        }
      : {}),
  };
}

export function calmHeading(text: string): string {
  if (!shouting(text)) return text.trim();
  return text
    .trim()
    .split(/(\s+)/)
    .map((word, index) => {
      if (/^\s+$/.test(word) || !/\p{L}/u.test(word)) return word;
      if (!/[aeıioöuüAEIİOÖUÜ]/.test(word)) return word;
      const lower = word.toLocaleLowerCase("tr");
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      const first = lower.search(/\p{L}/u);
      return lower.slice(0, first) + lower.charAt(first).toLocaleUpperCase("tr") + lower.slice(first + 1);
    })
    .join("");
}

const SCAFFOLD_HEADING = /^(giriş|özet|örnek|yaygın hata|sık yapılan hata|bilgi kontrolü|kapanış|sonuç|tekrar)\b/i;
/**
 * Şema örneğinden kopyalanmış yer tutucu başlık: "X ile Y farkı", "X ve Y'nin farkı", "<karıştırılan kavram>",
 * "(… gerçek adıyla)", "…". Dar tutuldu: "Hepatit A ile B farkı", "X ile Y kromozomu farkı", "Yokluk ile butlan
 * farkı" gerçek kavram adlarıdır. Açılı ayraç yalnız küçük harfli sözcükleri sarıyorsa yer tutucudur: "T < Tsat ve
 * T > Tsat" bir koşuldur.
 */
const PLACEHOLDER_TITLE =
  /(?:^|[^\p{L}])[XY]\s+(?:ile|ve)\s+[XY](?:'\p{L}+)?\s+(?:arasındaki\s+)?fark|(?:^|[\s(])<\p{Ll}[\p{Ll}\s]{1,38}\p{Ll}>(?=$|[\s).,:;!?])|gerçek adıyla/u;
/**
 * Üç nokta yalnız kısa değerde yer tutucudur ("Basamaklar …", "Örnek vaka: …"); cümle sonundaki üslup üç noktası
 * ("Z-skoru nedir, nasıl hesaplanır…") değil (22 Ekim 2026 inceleme: her "…" yapı kuralı diye tur açıyordu).
 * Açılı ayraç yer tutucusu da ("<kod>") harfe yapışık "a<b ve b>c" eşitsizliğini kapsamaz.
 */
const ELLIPSIS = /…|\.\.\./g;

/** Şemadaki örnek alan değerleri ("kardeş kavram", "ikinci kavramın adı"): aynen kopyalanırsa yer tutucudur. */
const SCHEMA_PLACEHOLDERS = new Set(
  [
    "kardeş kavram",
    "kavramın adı",
    "ikinci kavramın adı",
    "üçüncü kavramın adı",
    "ekranın odağı: kavramın adı",
    "aynı kavram: hesap",
  ].map((text) => text.toLocaleLowerCase("tr")),
);

function placeholderTitle(text: string | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  const folded = value.toLocaleLowerCase("tr").replace(/\s*\(.*\)\s*$/, "").trim();
  const ellipsisStub = ELLIPSIS.test(value) && value.replace(ELLIPSIS, " ").trim().split(/\s+/).filter(Boolean).length <= 3;
  ELLIPSIS.lastIndex = 0;
  return PLACEHOLDER_TITLE.test(value) || ellipsisStub || SCHEMA_PLACEHOLDERS.has(folded);
}

function shouting(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.7;
}

function sameKey(a: string, b: string): boolean {
  const key = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\d]+/gu, " ").trim();
  return key(a) === key(b);
}

/**
 * "Doğrusu"nu yanlış ifadeden ayıran sözcükler (ilk 5 harfiyle) metinde en az ikisi
 * geçiyorsa metin cevabı veriyor sayılır. Ek farkı ("bozukluğu/bozukluğudur") köke takılmaz.
 */
function givesAway(text: string, prompt: string, corrected: string): boolean {
  const stems = (s: string) =>
    new Set(
      s
        .toLocaleLowerCase("tr")
        .replace(/[^\p{L}\d]+/gu, " ")
        .split(" ")
        .filter((word) => word.length >= 5)
        .map((word) => word.slice(0, 5)),
    );
  const asked = stems(prompt);
  const answer = [...stems(corrected)].filter((stem) => !asked.has(stem));
  if (answer.length < 2) return false;
  const seen = stems(text);
  return answer.filter((stem) => seen.has(stem)).length >= 2;
}

type StructureInput = Pick<TeacherLessonInput, "runningHeaders"> & Partial<Pick<TeacherLessonInput, "pages" | "topicLabel" | "mode">>;

function collector() {
  const issues: TeacherIssue[] = [];
  return {
    issues,
    add: (where: string, problem: string) => issues.push({ where, severity: "high", problem }),
    /** Öğretim kuralı: ilk kavramda tur açmaz, sonrakilerde en çok bir kavram içi tur (20 Ekim 2026). */
    medium: (where: string, problem: string) => issues.push({ where, severity: "medium", problem }),
    low: (where: string, problem: string) => issues.push({ where, severity: "low", problem }),
  };
}

/** Giriş kartı ve "önce dene": dersin başlığı, kancası ve ilk ekranın açılışı. */
export function headerStructureIssues(lesson: LessonV3, input: StructureInput): TeacherIssue[] {
  const { issues, add, low } = collector();
  const headers = input.runningHeaders ?? [];
  if (shouting(lesson.title)) add("title", "Başlık BÜYÜK HARFLE yazılmış; içerikten, normal yazımla bir konu adı ver.");
  if (headers.some((line) => sameKey(line, lesson.title))) add("title", "Başlık sayfa kenarında tekrar eden kitap başlığı; konunun kendi adını ver.");
  if (!lesson.overview?.trim()) add("overview", "Kanca (overview) yok.");
  // Tür serbest: Termodinamik altın denemesinde "önce dene" çoktan seçmeli
  // yazıldı, iki düzeltme turu da değiştirmedi ve iyi bir ders reddedildi.
  const opener = lesson.screens[0];
  const openerCheck = opener ? screenCheck(opener) : undefined;
  if (!opener || !screenChecksFirst(opener)) {
    add("screens[0].blocks[0]", "İlk ekran 'önce dene' ile açılmalı: ilk blok bir 'check' (tercihen doğru/yanlış).");
  }
  // Düşük önem: düzeltme turu açılırsa düzelir, ders bunun için düşmez (16 Ekim 2026,
  // "Gerçek Kişilik" dersi: gövde "doğru mu, yanlış mı?" diye sordu, kontrol çoktan seçmeliydi).
  if (opener && screenChecksFirst(opener) && openerCheck && openerCheck.type !== "trueFalse" && openerCheck.type !== "numerical") {
    low("screens[0].blocks[0]", "'Önce dene' sorusu doğru/yanlış olmalı: yaygın yanılgıyı bir ifade olarak yaz.");
  }
  if (opener && /doğru\s+mu,?\s+yanlış\s+mı/i.test(screenText(opener))) {
    low("screens[0]", "Metin 'önce dene' sorusunu tekrar soruyor; soru 'check' bloğunda, metin doğrudan anlatsın.");
  }
  // Kanca sorudan önce okunuyor (16 Ekim 2026 Gastroenterit dersi: kanca "asıl risk
  // dehidratasyon" dedi, ardından soru "temel risk etken mi?" diye sordu).
  if (
    opener &&
    screenChecksFirst(opener) &&
    openerCheck?.corrected &&
    givesAway(lesson.overview ?? "", openerCheck.prompt, openerCheck.corrected)
  ) {
    low("overview", "Kanca 'önce dene' sorusunun cevabını veriyor; cevabı söylemeden merak uyandır.");
  }
  return issues;
}

/** Tek ekranın kuralları; `index` ekranın dersteki yeri. */
export function screenStructureIssues(screen: LessonV3["screens"][number], index: number, input: StructureInput): TeacherIssue[] {
  const { issues, add, medium, low } = collector();
  const headers = input.runningHeaders ?? [];
  const where = `screens[${index}]`;
  // 20 Ekim 2026 kör kıyas: şemanın örnek değerleri ("X ile Y farkı") iki derste aynen ekrana çıktı.
  if (placeholderTitle(screen.heading) || placeholderTitle(screen.concept) || placeholderTitle(screen.lead)) {
    add(`${where}.heading`, "Başlıkta ya da kavram adında şemadan kopyalanmış yer tutucu var; kavramın gerçek adını yaz.");
  }
  if (shouting(screen.heading)) add(`${where}.heading`, "Ekran başlığı BÜYÜK HARF.");
  if (SCAFFOLD_HEADING.test(screen.heading.trim())) add(`${where}.heading`, "Şablon başlık; kavramın adını yaz.");
  if (headers.some((line) => sameKey(line, screen.heading))) add(`${where}.heading`, "Başlık sayfa üst bilgisi; kavramın adını yaz.");
  const text = screenText(screen);
  if (!text) add(`${where}.blocks`, "Ekranda en az bir 'text' bloğu olmalı.");
  // 16 Ekim 2026 Beslenme dersi: "Tabloda bulguyu … oku" dedi, tablo bir sonraki ekrandaydı.
  if (POINTS_TO_TABLE.test(text) && !/periyodik\s+tablo/i.test(text) && !screen.blocks.some((block) => block.type === "table")) {
    add(`${where}.blocks`, "Metin bir tabloya gönderiyor ama bu ekranda tablo yok; tabloyu bu ekrana taşı ya da cümleyi çıkar.");
  }
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(text)) {
    add(`${where}.blocks`, "Metinde kaynak/sayfa notu var; çıkar (kaynak ekranda ayrıca gösteriliyor).");
  }
  // KPSS altın denemesi: düzeltme turu "Kaynaktaki … ifadesi anlatım hatasıdır" diye derse not düştü.
  if (/kayna(?:kta|ktaki|ğın)\s[^.]{0,80}?(?:hata|yanlış|bozuk)/i.test(text)) {
    add(`${where}.blocks`, "Metinde kaynağın hatasından söz eden iç not var; düzeltmeyi sessizce yap, notu çıkar.");
  }
  const framed = sourceFrameIssue(screen);
  if (framed) {
    medium(
      `${where}.blocks`,
      `Kaynağa ya da kaynağın biçimine gönderme var ("${framed}"); bilgiyi öğretmen gibi doğrudan söyle (soru, açıklama ve ikinci soru dahil).`,
    );
  }
  // Sınav vurgusu ekran başına en çok 2 (18 Ekim 2026): her şey turuncuysa hiçbir şey öne çıkmaz.
  const marks = studentTextParts(text).filter((part) => part.exam).length;
  if (marks > 3) add(`${where}.blocks`, `Ekranda ${marks} sınav vurgusu (==…==) var; yalnız sınavda soru olacak en önemli iki bilgiyi işaretle.`);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 220) {
    add(`${where}.blocks`, `Ekranın metni çok uzun (${words} kelime); 60-140 kelimeye indir, ayrıntıyı karta/tabloya ya da ikinci ekrana taşı.`);
  }
  const checks = screen.blocks.flatMap((block, blockIndex) => (block.type === "check" ? [{ check: block.check, blockIndex }] : []));
  // Düşük önem (16 Ekim 2026 canlı Yenidoğan dersi düştü): ilk kavram tek ekranken
  // "önce dene" + "kavram soruyla biter" iki soru yazdırıyordu. Ekran yalnız ilk soruyu
  // gösterir, notlandırma da ilk soruya bakar; ikincisi öğrenciye zarar vermez.
  if (checks.length > 1) low(`${where}.blocks`, "Ekran başına tek 'check' bloğu; ikinci soruyu çıkar (ekran yalnız ilkini gösterir).");
  for (const { check, blockIndex } of checks) checkIssues(check, `${where}.blocks[${blockIndex}]`, add, low);
  screen.blocks.forEach((block, blockIndex) => {
    // 20 Ekim 2026 kör kıyas: şemadaki örnek başlık "X ile Y farkı" iki derste aynen ekrana çıktı.
    const titles =
      block.type === "note"
        ? [block.note.title]
        : block.type === "table"
          ? [block.table.caption]
          : block.type === "formula"
            ? [block.formula.title]
            : block.type === "procedure"
              ? [block.procedure.title]
              : block.type === "cards"
                ? block.cards.map((card) => card.title)
                : [];
    if (titles.some(placeholderTitle)) {
      add(
        `${where}.blocks[${blockIndex}]`,
        "Başlıkta yer tutucu var ('X ile Y', '<…>', '…', 'kardeş kavram'); karıştırılan kavramların gerçek adını yaz.",
      );
    }
    if (
      block.type === "note" &&
      block.note.tone === "general" &&
      !/^(genel bilgi|sınav müfredatı tamamlaması)\b/i.test(block.note.title.trim()) &&
      !isWhyNote(block)
    ) {
      add(
        `${where}.blocks[${blockIndex}]`,
        "Tamamlama kutusunun başlığı 'Sınav Müfredatı Tamamlaması:' ya da 'Genel bilgi:' ile başlamalı (mekanizma kutusuysa 'Neden böyle?: …').",
      );
    }
  });
  return issues;
}

/** Bir kavramın ardışık ekranları: en çok üç, bölünme gerekçeli, son ekranı soruyla biter. */
export function conceptStructureIssues(screens: LessonV3["screens"], group: { concept: string; screens: number[] }): TeacherIssue[] {
  const { issues, add } = collector();
  const first = group.screens[0]!;
  const lastIndex = group.screens[group.screens.length - 1]!;
  if (group.screens.length > 3) add(`screens[${first}].concept`, `'${group.concept}' en fazla üç ekran olmalı.`);
  // 16 Ekim 2026 Beslenme dersi: hesabı olmayan kavram ikiye bölündü, ikinci ekran
  // birinciyi tekrar etti. Sonraki ekran yeni bir parça taşımalı.
  for (const index of group.screens.slice(1)) {
    if (!screens[index]!.blocks.some((block) => SPLIT_WORTHY.has(block.type))) {
      add(
        `screens[${index}]`,
        `'${group.concept}' gereksiz bölünmüş: bu ekran formül, adımlar, çözümlü örnek ya da tablo taşımıyor; öncekiyle tek ekrana indir.`,
      );
    }
  }
  if (!screenCheck(screens[lastIndex]!)) {
    add(`screens[${lastIndex}]`, `'${group.concept}' kavramı bir soruyla bitmeli: son ekranına 'check' bloğu koy.`);
  }
  // Her ekran bir soruyla biter (20 Ekim 2026 kör kıyas: Pediatri'nin yoğun tablolu dersinde Astra 5 ekran içi soru
  // sordu, biz 2). Yalnız ilk ekranın sorusu başta (önce dene); sonraki ekranlarda sorunun yeri denetlenmez.
  for (const index of group.screens) {
    if (index === lastIndex || index === 0 || screenCheck(screens[index]!)) continue;
    add(
      `screens[${index}]`,
      `'${screens[index]!.heading}' ekranı bir soruyla bitmeli: her ekran tek bir 'check' bloğuyla biter (yalnız ilk ekranın sorusu başta).`,
    );
  }
  // Ezber kodu kavram başına en çok bir (18 Ekim 2026): birden çok kod akılda kalmaz, karışır.
  const codes = group.screens.flatMap((index) =>
    screens[index]!.blocks.filter((block) => block.type === "note" && block.note.tone === "mnemonic").map(() => index),
  );
  if (codes.length > 1) add(`screens[${codes[1]}].blocks`, `'${group.concept}' kavramında ${codes.length} ezber kodu var; en çok bir tane bırak.`);
  // "Neden böyle?" kavram başına en çok bir (23 Ekim 2026); düşük önem: fazlası yanlış bir şey öğretmez.
  const whys = group.screens.flatMap((index) => screens[index]!.blocks.filter(isWhyNote).map(() => index));
  if (whys.length > 1) {
    issues.push({ where: `screens[${whys[1]}].blocks`, severity: "low", problem: `'${group.concept}' kavramında ${whys.length} 'Neden böyle?' kutusu var; en çok bir tane bırak.` });
  }
  const traps = group.screens.flatMap((index) =>
    screens[index]!.blocks.filter((block) => block.type === "exam_trap_card").map(() => index),
  );
  if (traps.length > 1) {
    issues.push({
      where: `screens[${traps[1]}].blocks`,
      severity: "low",
      problem: `'${group.concept}' kavramında ${traps.length} sınav tuzağı kartı var; en çok bir tane bırak.`,
    });
  }
  const hooks = group.screens.flatMap((index) =>
    screens[index]!.blocks.filter((block) => block.type === "memory_hook_card").map(() => index),
  );
  if (hooks.length > 1) {
    issues.push({
      where: `screens[${hooks[1]}].blocks`,
      severity: "low",
      problem: `'${group.concept}' kavramında ${hooks.length} hafıza çivisi var; en çok bir tane bırak.`,
    });
  }
  return issues;
}

const RULE_BLOCK = new Set(["formula", "diagram", "diagram_card", "table", "procedure", "cards"]);

/** Her kavram: tanım, kural/şema, çözümlü örnek, kontrol sorusu. Eksikler yayın öncesi tek tamamlama çağrısına gider. */
export function fourPartGaps(lesson: LessonV3): string[] {
  const gaps: string[] = [];
  for (const group of conceptGroups(lesson.screens)) {
    const blocks = group.screens.flatMap((index) => lesson.screens[index]?.blocks ?? []);
    const name = group.concept || "Kavram";
    if (!blocks.some((block) => block.type === "text")) gaps.push(`${name}: net tanım (text bloğu)`);
    if (!blocks.some((block) => RULE_BLOCK.has(block.type))) gaps.push(`${name}: kural, formül ya da şema`);
    if (!blocks.some((block) => block.type === "example")) gaps.push(`${name}: çözümlü sınav örneği (example bloğu)`);
    if (!blocks.some((block) => block.type === "check")) gaps.push(`${name}: kontrol sorusu (check bloğu)`);
  }
  return gaps;
}

/** Dört parça ve ders başına bir parametrik şema. Tek tamamlama çağrısı bunu okur. */
export function lessonCompletionGaps(lesson: LessonV3): string[] {
  const gaps = fourPartGaps(lesson);
  if (parametricDiagramIssue(lesson)) {
    gaps.push(
      "Derste en az bir diagram_card: konu doğasına göre number_line, balance_scale, function_curve, timeline veya process_network. Koordinat yok.",
    );
  }
  return gaps;
}

/**
 * Kaynağın tablosu derste paragrafa dökülmüş mü (16 Ekim 2026 Pediatri solunum dersi:
 * 5 satırlık "Bulgular | Düşündürür | Ayırıcı ipucu" tablosu paragrafa döküldü, "ince
 * ral/ronküs" ve "reversibilite" düştü). `said` tablonun satırlarının arandığı metin.
 */
function flattenedSourceTable(said: string, pages: readonly { text: string }[]) {
  const stems = stemSet(said);
  return sourceTables(pages).find((table) => tableRowsMentioned(table, stems));
}

/** Tablonun en az üç ve yarısından çok satırı metinde anılıyor mu. */
function tableRowsMentioned(table: { rows: string[][] }, stems: Set<string>): boolean {
  const mentioned = table.rows.filter((row) => row.some((cell) => cellMentioned(cell, stems))).length;
  return table.rows.length >= 3 && mentioned >= 3 && mentioned * 2 >= table.rows.length;
}

/**
 * `split`: yoğun tablo bölme cümlesi. İlk kavramda yazılmaz (22 Ekim 2026 inceleme): istem ilk kavramı tek ekran
 * ister; "2-3 ekrana böl" oraya yapı kuralı diye gidince soğuk yolda fazladan tur açıyordu.
 */
export function flattenedTableIssue(table: { columns: string[]; rows: string[][] }, options: { split: boolean } = { split: true }): string {
  return (
    `Kaynaktaki tablo (${table.columns.join(" | ")}) derste paragrafa dökülmüş; onu 'table' bloğu olarak ver, ` +
    "ayırıcı ipuçlarını düşürme. Metin tablonun satırlarını yeniden saymasın, ayırt ettiren kuralı tek cümlede söylesin" +
    // Tek turda iki kural birden tutsun (20 Ekim 2026): tablo verilir VE yoğunsa bölünür.
    (options.split && table.rows.length >= DENSE_TABLE_ROWS
      ? `; ${DENSE_TABLE_ROWS}+ satırlı tabloyu aynı kavramın 2-3 ekranına böl, her ekran bir soruyla bitsin.`
      : ".")
  );
}

/**
 * Yoğun tablo (20 Ekim 2026 kör kıyas, Pediatri gelişim basamakları): 5 ve üstü satırlı tablo tek ekranda okunup
 * geçiliyordu; Astra aynı tabloyu parça parça sorarak öğretti. Kural yalnız kavramın kendi 'table' bloklarına bakar
 * (kaynak tablosuna değil): "aynı tablo" döngüsü (yalnız onu ilk anan kavram ister) yeniden kurulmasın. Kavram iki
 * tablo ekranına bölündüyse ya da zaten üç ekransa sağlanmış sayılır: imkânsızı istemez. İlk kavramda öğrenci
 * bekliyor: düşük.
 */
export const DENSE_TABLE_ROWS = 5;

export function denseTableIssues(
  screens: LessonV3["screens"],
  group: { concept: string; screens: number[] },
  severity: "high" | "low",
): TeacherIssue[] {
  const tableScreens = group.screens.filter((index) => screens[index]?.blocks.some((block) => block.type === "table"));
  // En büyük tablo sayılır, toplam değil (22 Ekim 2026 inceleme): bir ekrandaki iki küçük tablonun satırları
  // toplanınca var olmayan "5 satırlık tablo" için tur açılıyordu.
  const rows = group.screens.reduce(
    (max, index) => Math.max(max, ...(screens[index]?.blocks ?? []).map((block) => (block.type === "table" ? block.table.rows.length : 0))),
    0,
  );
  if (rows < DENSE_TABLE_ROWS || tableScreens.length >= 2 || group.screens.length >= 3) return [];
  return [
    {
      where: `screens[${tableScreens[0] ?? group.screens[0]}]`,
      severity,
      problem:
        `'${group.concept}' kavramının ${rows} satırlık tablosu tek ekranda: aynı kavramın 2-3 ekranına satır gruplarıyla ` +
        "böl; her ekranın tablosu yalnız kendi satırlarını taşısın ve ekran komşu satırları ayırt ettiren bir soruyla bitsin.",
    },
  ];
}

/** "Örnek vaka: …" başlığı (20 Ekim 2026). */
const ORNEK_VAKA = /^örnek vaka\b/iu;

/** Denetçinin döngüsel "Neden böyle?" sorunu: düzeltme kutuyu çıkarır, yerine yenisi istenmez. */
export function isCircularWhyIssue(issue: TeacherIssue): boolean {
  return /döngüsel\s+neden\s+böyle/iu.test(issue.problem);
}

/** Kapanışın "derste 'Neden böyle?' kutusu yok" kuralı. */
export function isMissingWhyIssue(issue: TeacherIssue): boolean {
  return /'Neden böyle\?' kutusu yok/u.test(issue.problem);
}

/** "Neden böyle?: …" mekanizma kutusu (tone 'general', 23 Ekim 2026). */
export function isWhyNote(block: LessonBlock): boolean {
  return block.type === "note" && block.note.tone === "general" && /^neden böyle\b/iu.test(block.note.title.trim());
}

function isCaseNote(block: LessonBlock): boolean {
  return block.type === "note" && block.note.tone === "info" && ORNEK_VAKA.test(block.note.title.trim());
}

/** Vurgu ve koyu işaretleri olmadan, cümlelere bölünmüş metin; altı sözcükten kısa cümle sayılmaz. */
function sentencesOf(text: string): string[] {
  return text
    .replace(/==|\*\*/g, "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 6);
}

/** Ekranın öğreten cümleleri: metin blokları ve not gövdeleri (ezber kodu, genel bilgi ve örnek vaka hariç). */
function taughtSentences(screen: LessonScreen): string[] {
  return screen.blocks.flatMap((block) => {
    if (block.type === "text") return sentencesOf(block.text);
    if (block.type === "note" && !isCaseNote(block) && block.note.tone !== "mnemonic" && block.note.tone !== "general") {
      return sentencesOf(block.note.body);
    }
    return [];
  });
}

function stemsOf(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("tr")
      .replace(/==|\*\*/g, "")
      .split(/[^\p{L}\d]+/u)
      .filter((word) => word.length >= 3 && !CASE_FILLER.has(word))
      .map((word) => word.slice(0, 5)),
  );
}

/** Vakayı vaka yapmayan dolgu sözcükleri: "Bir kişi …" kuralı yeniden söyler. */
const CASE_FILLER = new Set(["bir", "kişi", "kişinin", "biri", "birinin", "durumda", "durumu", "olursa", "ise"]);

function tableRowKeys(table: { rows: string[][] }): Set<string> {
  return new Set(table.rows.map((row) => row.join(" | ").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim()));
}

/** Ekranların anlatılmış sözcükleri: metin blokları ve not gövdeleri (`except` dışında). */
function toldStems(screens: readonly LessonScreen[], except: LessonBlock): Set<string> {
  const parts = screens.flatMap((screen) => [
    screenText(screen),
    ...screen.blocks.flatMap((block) => (block.type === "note" && block !== except ? [block.note.body] : [])),
  ]);
  return stemsOf(parts.join(" "));
}

const foldQuestion = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const questionNumbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join(" ");

/**
 * İki soru aynı bilgiyi mi soruyor: aynı metin ya da aynı sayılarla içerik sözcüklerinin dörtte üçü ortak. Eşik
 * ikinci sorudaki %85'ten (`nearSameQuestion`) düşük: aynı ifadenin olumsuzu ("iner" / "inmez") da aynı bilgidir.
 */
export function sameLessonQuestion(a: string, b: string): boolean {
  const left = foldQuestion(a);
  const right = foldQuestion(b);
  if (!left || !right) return false;
  if (left === right || nearSameQuestion(a, b)) return true;
  return questionNumbers(a) === questionNumbers(b) && stemOverlap(a, b) >= 0.75;
}

/** Öğrencinin bir ekranda gördüğü sorular: ana soru, "Doğrusu" cümlesi ve yanlışta gelen ikinci soru. */
function askedOn(screen: LessonScreen): string[] {
  const check = screenCheck(screen);
  if (!check) return [];
  const review = (check as { review?: { prompt?: unknown } | null }).review;
  return [
    check.prompt,
    (check as { corrected?: unknown }).corrected,
    typeof review?.prompt === "string" ? review.prompt : "",
  ].filter((text): text is string => typeof text === "string" && text.trim().length > 0);
}

/**
 * Ders içi soru tekrarı (25 Ekim 2026): canlıda aynı doğru/yanlış ifadesi iki ekranda soruldu. Ekranın sorusu
 * önceki ekranlardan birinde sorulan, "Doğrusu" diye gösterilen ya da ikinci soru olarak gelen soruyla aynıysa
 * o önceki metin döner.
 */
export function repeatedCheck(earlier: readonly LessonScreen[], screen: LessonScreen): string | null {
  const check = screenCheck(screen);
  if (!check?.prompt) return null;
  for (const prior of earlier) {
    const hit = askedOn(prior).find((text) => sameLessonQuestion(text, check.prompt));
    if (hit) return hit;
  }
  return null;
}

/**
 * Yayımdan önce son kapı (deterministik): önceki ekranlarda sorulmuş bir soruyu tekrar eden ekranın sorusu çıkar;
 * ikinci sorusu tekrar ediyorsa yalnız ikinci soru çıkar (çalışma anı yedeği kurar). Metin yazılmaz.
 */
export function dropRepeatedChecks(earlier: readonly LessonScreen[], screens: readonly LessonScreen[]): LessonScreen[] {
  const seen: LessonScreen[] = [...earlier];
  const out: LessonScreen[] = [];
  for (const screen of screens) {
    let next = screen;
    if (repeatedCheck(seen, screen)) {
      next = { ...screen, blocks: screen.blocks.filter((block) => block.type !== "check") };
    } else {
      const check = screenCheck(screen) as (ReturnType<typeof screenCheck> & { review?: { prompt?: unknown } | null }) | undefined;
      const reviewPrompt = typeof check?.review?.prompt === "string" ? check.review.prompt : "";
      if (reviewPrompt && seen.some((prior) => askedOn(prior).some((text) => sameLessonQuestion(text, reviewPrompt)))) {
        next = {
          ...screen,
          blocks: screen.blocks.map((block) => {
            if (block.type !== "check") return block;
            const { review: _dropped, ...rest } = block.check;
            void _dropped;
            return { ...block, check: rest };
          }),
        };
      }
    }
    out.push(next);
    seen.push(next);
  }
  return out;
}

/**
 * Ekranlar arası tekrar (22 Ekim 2026, kör kıyas 2. tur). Öğretim ölçütünün 1. maddesi istemde vardı ama on
 * çiftin dokuzunda yargıçlar aynı şeyi yazdı: "aynı YSK paragrafı üç ekranda", "aynı tarih tablosu üç kez",
 * "'eğri > tek ölçüm' derste 7 kez", "Örnek vaka kutusu vaka değil, metnin tekrarı". Kod yalnız işaretler
 * (öğretim önemi: ilk kavramda tur açmaz); düzeltmeyi yazar yapar.
 *
 * - Bir ekranın öğreten cümlesi önceki bir ekranın cümlesiyle neredeyse aynıysa (içerik sözcüklerinin %85'i),
 * - bir tablonun satırlarının yarısı önceki bir ekranın tablosunda aynen varsa,
 * - "Örnek vaka" kutusunun sözcüklerinin %80'i zaten anlatılmışsa (aynı ya da önceki ekranlarda) vaka yeni bir
 *   durum kurmuyor, kuralı "bir kişi" diye yeniden söylüyor demektir.
 */
export function repetitionIssues(screens: readonly LessonScreen[], indexes: readonly number[]): TeacherIssue[] {
  const { issues, medium } = collector();
  for (const index of indexes) {
    const screen = screens[index];
    if (!screen) continue;
    const where = `screens[${index}]`;
    const earlier = screens.slice(0, index);
    const twinCheck = repeatedCheck(earlier, screen);
    if (twinCheck) {
      medium(
        `${where}.blocks`,
        `Bu ekranın sorusu derste zaten soruldu ("${twinCheck.slice(0, 90)}"); aynı soruyu ya da aynı bilgiyi ikinci kez ` +
          "sorma, bu ekranın yeni ayrımını yoklayan bir soru yaz.",
      );
    }
    const earlierSentences = earlier.flatMap(taughtSentences);
    const repeated = taughtSentences(screen).find((sentence) =>
      earlierSentences.some((prior) => stemOverlap(sentence, prior) >= 0.85),
    );
    if (repeated) {
      medium(
        `${where}.blocks`,
        `Bu ekran önceki bir ekranda anlatılan bilgiyi yeniden anlatıyor ("${repeated.slice(0, 90)}"); tekrarı çıkar, ` +
          "üstüne yeni bir şey kur (neden, ayırt eden ipucu, uygulama).",
      );
    }
    screen.blocks.forEach((block, blockIndex) => {
      if (block.type === "table") {
        const rows = tableRowKeys(block.table);
        const twin = earlier.findIndex((prior) =>
          prior.blocks.some((other) => {
            if (other.type !== "table") return false;
            const seen = tableRowKeys(other.table);
            const shared = [...rows].filter((row) => seen.has(row)).length;
            return shared >= 2 && shared * 2 >= rows.size;
          }),
        );
        if (twin >= 0) {
          medium(
            `${where}.blocks[${blockIndex}]`,
            `Bu tablo ${twin + 1}. ekranda zaten verildi; ikinci kez koyma. Bu ekranda yalnız yeni satırlar ya da ` +
              "tablonun ayırt ettirdiği kural kalsın.",
          );
        }
      }
      if (block.type === "note" && isCaseNote(block)) {
        const told = toldStems([...earlier, screen], block);
        const own = stemsOf(block.note.body);
        const known = [...own].filter((stem) => told.has(stem)).length;
        if (own.size >= 6 && known / own.size >= 0.8) {
          medium(
            `${where}.blocks[${blockIndex}]`,
            "Örnek vaka anlatılan kuralı yeniden söylüyor, vaka kurmuyor. Somut bir durum yaz: kim, ne oldu, kavram " +
              "yüzünden sonuç ne oldu (kavram değişse sonuç değişirdi); kaynakta olmayan sayı ya da sonuç ekleme.",
          );
        }
      }
    });
  }
  return issues;
}

/**
 * Kaynağa ve kaynağın biçimine gönderme (22 Ekim 2026, kör kıyas 2. tur): "Genel oy için verilen bilgi 1934 yılıdır"
 * beş kez, "Notlarda çok partili ilk seçimin 1946'da yapıldığı belirtiliyor", "kaynakta verilen uyarı". Öğretmen
 * kaynağı anmaz, bilgiyi doğrudan söyler. Genel bilgi kutusu ("belgende geçmiyor") bunun dışında.
 */
const SOURCE_FRAME =
  /(?:^|[^\p{L}])(?:notlar(?:da|ında|ındaki|daki|ına göre|a göre)|notların(?:da|daki)|kaynak(?:ta|taki|a göre)|belge(?:de|deki|nde|ndeki|ye göre)|metne göre)(?=[^\p{L}]|$)|için verilen (?:bilgi|yıl|tarih)/iu;

export function sourceFrameIssue(screen: LessonScreen): string | null {
  const said = screen.blocks
    .filter((block) => !(block.type === "note" && block.note.tone === "general"))
    .map((block) => JSON.stringify(block))
    .join(" ");
  const hit = SOURCE_FRAME.exec(said);
  return hit ? hit[0].replace(/^[^\p{L}]+/u, "").trim() : null;
}

/** Dersin bütününe bakan kurallar: ekran ve kavram sayısı, sıra, örnek vaka, tablo, özet. */
export function lessonLevelStructureIssues(lesson: LessonV3, input: StructureInput): TeacherIssue[] {
  const { issues, add, low } = collector();
  const screens = lesson.screens;
  const groups = conceptGroups(screens);
  if (screens.length < 2) add("screens", "En az iki ekran olmalı.");
  /*
    Üst sınırlar düşük önemde (20 Ekim 2026): sınır ancak dersin kapanışında denetleniyor ve aşımı önceki kavramlar
    yapıyor; yüksek olunca son kavram kendi ekranlarıyla düzeltemeyeceği bir sorun için üç tur dönüp baştan yazılıyor,
    sonra atılıyordu. Her ekranın soruyla bitmesi ve yoğun tablonun bölünmesi ekran sayısını artırdı: 7 → 9.
    25 Ekim 2026: tam kapsam (omurganın her alt başlığı) için 9 → 12 ekran, 5 → 6 kavram.
  */
  const documentPages = input.mode === "topic" ? [] : (input.pages ?? []);
  const facts = lessonKeyFacts(documentPages);
  const cap = lessonScreenCap(facts.length);
  if (screens.length > cap) {
    low("screens", cap === 12 ? "En fazla on iki ekran; kavramı daha az ekrana sığdır." : `En fazla ${cap} ekran; kavramı daha az ekrana sığdır.`);
  }
  if (groups.length > 6) low("screens", "En fazla altı kavram; kısa alt başlıkları komşusuyla birleştir.");
  // Omurga ve kilit bilgi (yüksek): kavram düşmez; kapanışta sessiz bir ekran turu açar.
  const missingHeads = uncoveredBackbone(screens, inputBackbone(input));
  if (missingHeads.length) {
    issues.push({
      where: `screens[${screens.length - 1}]`,
      severity: "high",
      problem:
        `${BACKBONE_TAG} Kaynağın şu alt başlıkları derste işlenmedi: ${missingHeads.join(" · ")}. Her biri için bu kısmın ` +
        "ardına kendi 'concept' adıyla bir ekran ekle (tanım, sayısal kural/formül, istisna ya da çözümlü örnek; ekran bir " +
        "soruyla biter). Mevcut ekranları silme.",
    });
  }
  const missingFacts = uncoveredKeyFacts(screens, facts);
  if (missingFacts.length) {
    issues.push({
      where: `screens[${screens.length - 1}]`,
      severity: "high",
      problem:
        `${COVERAGE_TAG} Kaynakta duran kilit bilgiler derste yok: ${missingFacts
          .slice(0, 6)
          .map((fact) => fact.text)
          .join(" · ")}. Her birini sayı imzasıyla yaz; sıralı adımlar aynı sırada kalsın. Mevcut ekranları silme.`,
    });
  }
  const sourceText = documentPages.map((page) => page.text).join("\n");
  if (sourceHasWorkedProblem(sourceText) && !screens.some((screen) => screen.blocks.some((block) => block.type === "example"))) {
    issues.push({
      where: `screens[${screens.length - 1}]`,
      severity: "high",
      problem:
        `${COVERAGE_TAG} Kaynakta çözümlü bir problem var. Derste en az bir example bloğu olsun; sayılar kaynaktaki gibi, yeni sayı yok.`,
    });
  }
  const seenConcepts = new Set<string>();
  for (const group of groups) {
    const key = group.concept.toLocaleLowerCase("tr");
    if (seenConcepts.has(key)) add(`screens[${group.screens[0]!}].concept`, `'${group.concept}' kavramının ekranları art arda olmalı.`);
    seenConcepts.add(key);
  }
  // Astra her derste bir gündelik örnek kutusu koyuyor; bizim ilk dört dersimizde
  // hiç çıkmadı (2 Ekim 2026, ürün sahibinin kararı: her derste en az bir). 20 Ekim 2026 (kör kıyas): "Günlük
  // hayattan" kutuları düz kaldı; yerine sonucu kavramın belirlediği "Örnek vaka" (eski başlık kabul edilmez).
  const caseNote = (block: LessonBlock) => block.type === "note" && block.note.tone === "info" && ORNEK_VAKA.test(block.note.title.trim());
  if (!screens.some((screen) => screen.blocks.some(caseNote))) {
    add(
      "screens",
      "Örnek vaka kutusu yok: uyarı notu olmayan bir ekrana 'note' bloğu (tone: info, başlık 'Örnek vaka: ' ile başlar) " +
        "ekle; sonucu kavramın belirlediği kısa, somut bir durum; kaynakta olmayan sayı, kural ya da sonuç taşımasın.",
    );
  }
  // Belgede olmayan, denetlenmiş genel bilgi (16 Ekim 2026): az ve etiketli olmalı.
  const general = screens.flatMap((screen) =>
    screen.blocks.filter((block) => block.type === "note" && block.note.tone === "general" && !isWhyNote(block)),
  );
  if (general.length > 12) add("screens", "Sınav Müfredatı Tamamlaması kutuları kavram başına birden fazla olmasın; aynı kavramın kutularını birleştir.");
  // "Neden böyle?" derste en az bir (23 Ekim 2026, ürün sahibinin kararı): yalnız istemle dokuz derste bir kez yazıldı.
  // Öğretim önemi: kapanışta bir öğretim turu açar, kavram düşürmez. Belgesiz derste kaynak kuralı yok, kutu da yok.
  if ((input.pages?.length ?? 0) > 0 && !screens.some((screen) => screen.blocks.some(isWhyNote))) {
    issues.push({
      where: `screens[${screens.length - 1}]`,
      severity: "medium",
      problem:
        "Derste 'Neden böyle?' kutusu yok: kaynağın nedenini vermediği bir kilit bilgi için bu kavrama bir kutu ekle " +
        "(tone 'general', başlık 'Neden böyle?: …', 1-2 cümle mekanizma, yeni sayı ya da kural yok). Kaynak her nedeni " +
        "kendisi veriyorsa itiraz et.",
    });
  }
  // Tablonun satırları derste anılıyorsa tablo derste de tablo olmalı.
  if (!screens.some((screen) => screen.blocks.some((block) => block.type === "table"))) {
    const flattened = flattenedSourceTable(JSON.stringify(lesson), input.pages ?? []);
    if (flattened) add("screens", flattenedTableIssue(flattened, { split: conceptGroups(lesson.screens).length > 1 }));
  }
  const summary = lesson.summary ?? [];
  if (summary.length < 3 || summary.length > 5) add("summary", "Özet 3-5 madde olmalı.");
  const quota = visualCardQuotaIssue(lesson);
  if (quota) issues.push(quota);
  const diagram = structuredDiagramIssue(lesson, documentPages);
  if (diagram) issues.push(diagram);
  const parametric = parametricDiagramIssue(lesson);
  if (parametric) issues.push(parametric);
  return issues;
}

/** Formül tek başına kota değildir: tuzak, çivi ya da kaydırma da gerekir. */
const VISUAL_QUOTA_TYPES = new Set<LessonBlock["type"]>([
  "formula",
  "exam_trap_card",
  "memory_hook_card",
  "comparison_carousel",
]);

/**
 * Ders başına en az 2 görsel kart, en az biri tuzak / çivi / kaydırma (25 Ekim 2026).
 * Orta önem: kapanışta bir öğretim turu açar, kavramı düşürmez. İlk kavram beklerken tur açılmaz.
 */
/**
 * En az bir flow / cycle / matrix / tree. Serbest şekil bu kotayı doldurmaz.
 * Kaynak bir süreç, tablo ya da ağaç taşıyorsa eksik şema yüksek; kavram yine düşmez.
 * Kaynak yapısı yoksa önem orta kalır.
 */
export function structuredDiagramIssue(lesson: LessonV3, pages?: readonly { text: string }[]): TeacherIssue | null {
  if (!lesson.screens.length) return null;
  const found = lesson.screens.some((screen) =>
    screen.blocks.some(
      (block) =>
        block.type === "diagram_card" ||
        (block.type === "diagram" &&
          (block.diagram.layout === "flow" ||
            block.diagram.layout === "cycle" ||
            block.diagram.layout === "matrix" ||
            block.diagram.layout === "tree")),
    ),
  );
  const missing = pages?.length ? missingStructures(lesson.screens, sourceStructures(pages)) : [];
  if (missing.length) {
    return {
      where: `screens[${lesson.screens.length - 1}]`,
      severity: "high",
      problem: `${COVERAGE_TAG} Yapılandırılmış şema eksik (${missing.join(", ")}). ${DIAGRAM_LAYOUT_RULE}`,
    };
  }
  if (found) return null;
  return {
    where: `screens[${lesson.screens.length - 1}]`,
    severity: "medium",
    problem: `Yapılandırılmış şema eksik. ${DIAGRAM_LAYOUT_RULE}`,
  };
}

/** Ders başına en az bir parametrik şema. Orta önem: kavram düşmez, tamamlama çağrısı ister. */
export function parametricDiagramIssue(lesson: LessonV3): TeacherIssue | null {
  if (!lesson.screens.length) return null;
  const found = lesson.screens.some((screen) => screen.blocks.some((block) => block.type === "diagram_card"));
  if (found) return null;
  return {
    where: `screens[${lesson.screens.length - 1}]`,
    severity: "medium",
    problem:
      "Parametrik şema eksik. Konunun doğasına uyan bir diagram_card yaz: number_line, balance_scale, " +
      "function_curve, timeline veya process_network. Koordinat yok; etiket kaynaktaki terimdir.",
  };
}

export function visualCardQuotaIssue(lesson: LessonV3): TeacherIssue | null {
  if (!lesson.screens.length) return null;
  const cards = lesson.screens.flatMap((screen) => screen.blocks.filter((block) => VISUAL_QUOTA_TYPES.has(block.type)));
  const rich = cards.filter((block) => block.type !== "formula");
  if (cards.length >= 2 && rich.length >= 1) return null;
  return {
    where: `screens[${lesson.screens.length - 1}]`,
    severity: "medium",
    problem:
      "Görsel kart eksik: derste en az 2 kart olsun (hedef 3). Türler formula, exam_trap_card, memory_hook_card, " +
      "comparison_carousel; en az biri tuzak, hafıza çivisi ya da karşılaştırma kaydırması. Yeni sayı, kural ya da " +
      "sonuç ekleme; anlatılan bilgiyi kartın alanlarına koy. Düz paragraf kartın yerine geçmez. İlk ekranı şişirme.",
  };
}

/**
 * Yapı denetimi (saf, LessonV3). Sorunu düzeltmez; düzeltme turuna gider.
 * Gözlenen her eski kusur burada bir kural: BÜYÜK HARF başlık (sayfa üst
 * bilgisi), "Kaynak:" yapıştırma, bariz kontrol, eksik gerekçe. Önem
 * dereceleri V2'deki gibi; V3'ün kendi kuralları (ekran başına bir soru,
 * kavram bir soruyla biter, kavramın ekranları art arda) yüksek.
 */
export function lessonStructureIssues(lesson: LessonV3, input: StructureInput): TeacherIssue[] {
  const groups = conceptGroups(lesson.screens);
  return [
    ...headerStructureIssues(lesson, input),
    ...groups.flatMap((group) => conceptStructureIssues(lesson.screens, group)),
    // Akışlı yoldaki gibi: ilk kavramda düşük, sonrakilerde yüksek.
    ...groups.flatMap((group, index) => denseTableIssues(lesson.screens, group, index === 0 ? "low" : "high")),
    ...lesson.screens.flatMap((screen, index) => screenStructureIssues(screen, index, input)),
    ...repetitionIssues(lesson.screens, lesson.screens.map((_, index) => index)),
    ...lessonLevelStructureIssues(lesson, input),
  ];
}

/**
 * Akışlı derste bir kısmın yapı denetimi: `lesson` dersin o ana kadarki hâli. İlk kısım
 * giriş kartını, son kısım dersin bütününü de taşır. Ara kısımda tablo kuralı yalnız o
 * kısmın metnine bakar: tablo başka bir kavramda durabilir.
 */
export function partStructureIssues(lesson: LessonV3, part: LessonPart, input: StructureInput): TeacherIssue[] {
  const indexes = lesson.screens.map((_, index) => index).filter((index) => index >= part.from && index <= part.to);
  // Kapanış kısmı omurga turunda yeni kavramlar ekleyebilir (25 Ekim 2026): her kavram kendi kuralıyla denetlenir.
  const groups = conceptGroups(lesson.screens)
    .map((group) => ({ concept: group.concept, screens: group.screens.filter((index) => indexes.includes(index)) }))
    .filter((group) => group.screens.length);
  const issues = [
    ...(part.header ? headerStructureIssues(lesson, input) : []),
    ...groups.flatMap((group) => conceptStructureIssues(lesson.screens, group)),
    // İlk kavramda öğrenci bekliyor: yoğun tablo kuralı tur açmaz (istem ilk kavramı zaten tek ekran ister).
    ...groups.flatMap((group) => denseTableIssues(lesson.screens, group, part.header ? "low" : "high")),
    ...indexes.flatMap((index) => screenStructureIssues(lesson.screens[index]!, index, input)),
    ...repetitionIssues(lesson.screens, indexes),
  ];
  if (part.closing) return [...issues, ...lessonLevelStructureIssues(lesson, input)];
  const hasTable = lesson.screens.some((screen) => screen.blocks.some((block) => block.type === "table"));
  if (!hasTable) {
    const flattened = flattenedSourceTable(JSON.stringify(indexes.map((index) => lesson.screens[index])), input.pages ?? []);
    /*
      Tablo onu ilk anan kavramındır (20 Ekim 2026). Kavramlar aynı anda denetleniyor; önceki kavramın
      tablo düzeltmesi derse işlenmeden sonraki kavram aynı tablo için geri çevriliyordu. İdrar dersinde
      aynı hormon tablosu üç kavrama eklendi, ders 3 tur / 11 çağrı / 54 sn sürdü. Tablo hiç verilmezse
      dersin kapanışındaki genel kural yine yakalar.
    */
    const ownedEarlier =
      flattened && part.from > 0 && tableRowsMentioned(flattened, stemSet(JSON.stringify(lesson.screens.slice(0, part.from))));
    if (flattened && !ownedEarlier) {
      // İlk kavramda tur açmaz (23 Ekim 2026): istem tabloyu ikinci kavrama koyduruyor, ilk kavramın metni tablonun
      // değerlerini anınca bu kural yüksek yazıp tur döndürüyordu (Özel Açılar: 13 tur, iki kavram atıldı). Tablo
      // hiç verilmezse dersin kapanışındaki kural yine yakalar.
      issues.push({
        where: `screens[${part.from}]`,
        severity: part.header ? "low" : "high",
        problem: flattenedTableIssue(flattened, { split: !part.header }),
      });
    }
  }
  return issues;
}

/** Temiz sayfadaki Markdown tablolar (`| a | b |`); ayraç satırı (`|---|`) atlanır. */
export function sourceTables(pages: readonly { text: string }[]): { columns: string[]; rows: string[][] }[] {
  const tables: { columns: string[]; rows: string[][] }[] = [];
  for (const page of pages) {
    let current: string[][] = [];
    for (const raw of [...page.text.split(/\r?\n/), ""]) {
      const line = raw.trim();
      if (line.length > 2 && line.startsWith("|") && line.endsWith("|")) {
        const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) current.push(cells);
        continue;
      }
      if (current.length >= 2) tables.push({ columns: current[0]!, rows: current.slice(1) });
      current = [];
    }
  }
  return tables;
}

/** Sözcüklerin ilk beş harfi: Türkçe ek farkı ("krupta/krup", "öksürük/öksürüğü") eşleşmeye engel olmasın. */
function stemSet(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("tr")
      .split(/[^\p{L}\d]+/u)
      .filter((word) => word.length >= 3)
      .map((word) => word.slice(0, 5)),
  );
}

/** Kısa bir tablo hücresinin (en çok 4 sözcük) bütün sözcükleri derste geçiyor mu. */
function cellMentioned(cell: string, said: Set<string>): boolean {
  const stems = [...stemSet(cell)];
  // Beş harften kısa sözcük ekli hâliyle de geçer: "krup" → "krupu".
  const seen = (stem: string) => said.has(stem) || (stem.length < 5 && [...said].some((word) => word.startsWith(stem)));
  return stems.length > 0 && stems.length <= 4 && stems.every(seen);
}

/** Kavramın ikinci ve üçüncü ekranını haklı çıkaran parçalar. */
const SPLIT_WORTHY = new Set<LessonBlock["type"]>([
  "formula",
  "procedure",
  "example",
  "table",
  "exam_trap_card",
  "memory_hook_card",
  "comparison_carousel",
]);

/** "Tabloda … oku", "tablodaki değerlere bak": okuru bir tabloya gönderen cümle. */
const POINTS_TO_TABLE = /(?:^|[^\p{L}])tablo(?:da|daki|yu|ya)(?=[^\p{L}])[^.]{0,80}?(?:oku|bak|incele|karşılaştır|gör)/iu;

function checkIssues(
  check: Check,
  where: string,
  add: (where: string, problem: string) => void,
  low: (where: string, problem: string) => void,
) {
  if (check.type === "mcq") {
    const options = check.options ?? [];
    if (options.length !== 4) add(where, "Çoktan seçmeli soruda 4 şık olmalı.");
    if (typeof check.answerIndex !== "number" || check.answerIndex < 0 || check.answerIndex >= options.length) {
      add(where, "answerIndex şıklarla uyuşmuyor.");
    }
    if (!check.optionWhy || check.optionWhy.length !== options.length) add(where, "optionWhy her şık için bir cümle olmalı.");
    if (new Set(options.map((option) => option.trim().toLocaleLowerCase("tr"))).size !== options.length) {
      add(where, "Aynı şık iki kez yazılmış.");
    }
    // \b Türkçe harfi tanımıyor ("kaç" ç ile biter); boşlukla sınırla.
    if (/(?:^|\s)kaç\s+(?:\S+\s+){0,2}(tür|çeşit|başlık|madde|unsur|aşama|basamak)/i.test(check.prompt)) {
      add(where, "Sayma sorusu öğretici değil; kavramı ayırt ettiren bir soru sor.");
    }
    // İkinci soru tam öğe olmalı; çalışma anında reddedilecek öğe burada düzeltmeye gider (20 Ekim 2026, kör kıyas:
    // yalnız kök yazılan ikinci soru ana sorunun anahtarını aldı, doğru cevap yanlış sayıldı). Aynı liste:
    // `reviewItemProblems` (teacher-brain.ts) çalışma anında da bakıyor.
    for (const problem of reviewItemProblems(reviewInput(check))) add(`${where}.review`, `İkinci soru (review): ${problem}`);
    // Şıklar karıştırılıyor: "ilk seçenek …" karıştırmadan sonra başka şıkkı gösterir (18 Ekim 2026).
    if (refersToOptionOrder(check.explanation) || (check.optionWhy ?? []).some(refersToOptionOrder)) {
      add(where, "Açıklama şıklara sırasıyla gönderme yapıyor; şıklar karışık gösteriliyor, her şıkkı içeriğiyle an.");
    }
  }
  if (check.type === "trueFalse") {
    const options = check.options ?? [];
    if (options.length !== 2 || typeof check.answerIndex !== "number" || check.answerIndex > 1) {
      add(where, "Doğru/yanlış sorusunda şıklar ['Doğru','Yanlış'] ve answerIndex 0 ya da 1 olmalı.");
    }
    // Eksik "doğrusu" dersi düşürmez: düzeltme turu zaten açılırsa eklenir.
    const falseStatement = /^(yanlış|yanlis|false)$/i.test(options[check.answerIndex ?? -1]?.trim() ?? "");
    if (falseStatement && !check.corrected?.trim()) low(where, "Yanlış ifadenin doğrusu (corrected) yazılmamış.");
    // Doğru/yanlışın ikinci sorusu düşük önemde: "önce dene" ilk kavramda, öğrenci bekliyor; eksikse çalışma anı
    // aynı yargıyı yeniden sorar.
    for (const problem of reviewItemProblems(reviewInput(check))) low(`${where}.review`, `İkinci soru (review): ${problem}`);
  }
}

function reviewInput(check: Check) {
  return {
    type: check.type === "trueFalse" ? ("trueFalse" as const) : ("mcq" as const),
    prompt: check.prompt,
    options: check.options ?? [],
    answerIndex: check.answerIndex ?? 0,
    explanation: check.explanation,
    review: check.review,
    ...(check.corrected ? { corrected: check.corrected } : {}),
  };
}

/** İkinci soruya ait sorun: `screens[i].blocks[j].review` ya da `….check.review`. */
// Denetçi yeri bazen "….check.check.review" yazıyor (24 Ekim 2026 canlı kayıt); tanınmayan ikinci soru sorunu
// kavramı tam düzeltme turuna sokuyordu.
const REVIEW_WHERE = /screens\[(\d+)\]\.blocks\[(\d+)\](?:\.check)*\.review\b/;

export function isReviewIssue(issue: TeacherIssue): boolean {
  return REVIEW_WHERE.test(issue.where);
}

/**
 * Biçim kuralı: tablonun paragrafa dökülmesi ya da yoğun tablonun bölünmemesi (23 Ekim 2026). Yanlış bir şey
 * öğretmez; dördüncü ölçümde ilk kavramda bırakılan tablo kapanışta son kavramdan istendi, son kavram onu
 * düzeltemedi ve Özel Açılar'da iki kavram atıldı. Bir turdan sonra yalnız bunlar (ve ikinci soru) kalırsa kavram
 * yayımlanır.
 */
export function isLayoutIssue(issue: TeacherIssue): boolean {
  return /^\[yapı kuralı\] (?:Kaynaktaki tablo \(|'[^']*' kavramının \d+ satırlık tablosu tek ekranda)/u.test(issue.problem);
}

/**
 * Sorunlu ikinci soruları çıkarır (23 Ekim 2026). `from`: kısmın ilk ekranının dersteki sırası (sorunların
 * yeri ders bütünündeki sırayla yazılı). İkinci sorusu olmayan kontrolde çalışma anı kendi yedeğini kurar
 * (`reviewGateQuestion`: aynı olgu, ana sorunun anahtarı); öğrenci yine ikinci bir soru görür.
 */
export function stripReviews(screens: readonly LessonScreen[], from: number, issues: readonly TeacherIssue[]): LessonScreen[] {
  const targets = new Set(
    issues.flatMap((issue) => {
      const at = REVIEW_WHERE.exec(issue.where);
      return at ? [`${Number(at[1]) - from}:${at[2]}`] : [];
    }),
  );
  return screens.map((screen, screenIndex) => ({
    ...screen,
    blocks: screen.blocks.map((block, blockIndex) => {
      if (block.type !== "check" || !targets.has(`${screenIndex}:${blockIndex}`)) return block;
      const { review: _dropped, ...check } = block.check;
      void _dropped;
      return { ...block, check };
    }),
  }));
}

/** Yapı kuralı: kavramda birden fazla ezber kodu (`partStructureIssues`). */
const MNEMONIC_COUNT_RULE = /ezber kodu var; en çok bir/;

function isMnemonicBlock(block: unknown): boolean {
  const row = block as { type?: unknown; note?: { tone?: unknown } } | null;
  return row?.type === "note" && row.note?.tone === "mnemonic";
}

/**
 * Sorun ezber koduna mı ait: metni ezber kodundan söz ediyor ya da yeri bir ezber kodu kutusu
 * (`screens[i].blocks[j]`, ders bütünündeki sıra). 19 Ekim 2026: canlıda yavaş derslerin çoğu
 * ("Ün-Bö-Fed-Kon", "Ülke İnsan Otorite", "Çalış" ↔ C) bu kutu yüzünden 5-7 tur döndü.
 */
export function isMnemonicIssue(issue: TeacherIssue, lesson: Pick<LessonV3, "screens">): boolean {
  if (/ezber/i.test(issue.problem)) return true;
  const at = /screens\[(\d+)\]\.blocks\[(\d+)\]/.exec(issue.where);
  if (!at) return false;
  return isMnemonicBlock(lesson.screens[Number(at[1])]?.blocks[Number(at[2])]);
}

/** Yalnız "kavramda birden fazla ezber kodu" yapı kuralı mı. */
export function isMnemonicCountIssue(issue: TeacherIssue): boolean {
  return MNEMONIC_COUNT_RULE.test(issue.problem);
}

/**
 * Kavramın ekranlarından ezber kodu kutularını çıkarır (`keepFirst`: ilkini bırakır). Kod cümle
 * yazmaz; isteğe bağlı bir kutuyu siler ("parça düşer, istek düşmez", 19 Ekim 2026). Yalnız
 * ezber kutusundan oluşan ekran düşer.
 */
export function stripMnemonics(screens: LessonScreen[], options: { keepFirst?: boolean } = {}): LessonScreen[] {
  let kept = false;
  return screens
    .map((screen) => {
      const blocks = screen.blocks.filter((block) => {
        if (!isMnemonicBlock(block)) return true;
        if (options.keepFirst && !kept) {
          kept = true;
          return true;
        }
        return false;
      });
      return blocks.length === screen.blocks.length ? screen : { ...screen, blocks };
    })
    .filter((screen) => screen.blocks.length > 0);
}
