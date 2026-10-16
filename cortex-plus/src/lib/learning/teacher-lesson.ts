import {
  LESSON_V3_FORMAT,
  conceptGroups,
  readLessonV3,
  screenCheck,
  screenChecksFirst,
  screenText,
  type LessonBlock,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import { CONTENT_STYLE } from "@/lib/ai/content-style";

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
  /** Temiz kaynak sayfaları, sırayla. */
  pages: { page: number; text: string }[];
  /** Sıradaki gerçek konular; nextFocus yalnız bunlardan. */
  upcomingTopics: string[];
  /** Hazırlıktaki bir önceki konu; varsa derse bağlanılır. */
  previousTopic?: string | null;
  /** Aşinalık ve ruh hali satırı (session-signals). */
  learnerLine?: string;
  /** Sayfa kenarında tekrar eden satırlar: başlık olamaz. */
  runningHeaders?: string[];
  /**
   * "document": belgeli ders, kaynak kuralı. "topic": belgesiz hazırlık
   * (2 Ekim 2026, ürün sahibinin kararı) — aynı öğretmen akışı, kaynak kuralı
   * yerine doğruluk kuralı; denetçi doğruluğa bakar.
   */
  mode?: TeacherLessonMode;
};

export type TeacherLessonMode = "document" | "topic";

export function sourceText(pages: TeacherLessonInput["pages"]): string {
  return pages.map((item) => `[s.${item.page}]\n${item.text.trim()}`).join("\n\n");
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
        {"type": "check", "check": {"type": "trueFalse", "prompt": "öğrencinin gerçekten inandığı yanılgı, bir ifade olarak", "options": ["Doğru", "Yanlış"], "answerIndex": 1, "explanation": "neden yanlış (ya da doğru) olduğu", "corrected": "ifade yanlışsa doğru hâli, tek cümle"}},
        {"type": "text", "text": "60-140 kelime; anahtar terimler **koyu**; soruyu tekrar sormaz, doğrudan anlatır"},
        {"type": "formula", "formula": {"title": "…", "expression": "kaynaktaki bağıntı", "note": "harflerin anlamı"}}
      ]
    },
    {
      "heading": "aynı kavram: hesap",
      "concept": "kavramın adı (bir önceki ekranla aynı)",
      "blocks": [
        {"type": "text", "text": "formülün nasıl uygulanacağı, kısa"},
        {"type": "procedure", "procedure": {"title": "…", "steps": [{"label": "…", "detail": "kaynaktaki sayıyla"}]}},
        {"type": "example", "example": {"prompt": "…", "givens": ["…"], "unknown": "…", "steps": ["…"], "result": "birimli sonuç", "solution": "…"}},
        {"type": "check", "check": {"type": "mcq", "prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "doğru cevabın nedeni + her çeldiricinin gerçekte ne olduğu", "optionWhy": ["şık 1 için tek cümle", "şık 2", "şık 3", "şık 4"], "review": {"prompt": "aynı kavramı farklı yönden soran durum sorusu; şıklar aynı kalır"}}}
      ]
    },
    {
      "heading": "ikinci kavramın adı",
      "concept": "ikinci kavramın adı",
      "lead": "…",
      "blocks": [
        {"type": "text", "text": "…"},
        {"type": "cards", "cards": [{"title": "kardeş kavram", "body": "tek cümle tanım"}, {"title": "kardeş kavram", "body": "tek cümle tanım"}]},
        {"type": "table", "table": {"caption": "…", "columns": ["…","…"], "rows": [["…","…"], ["…","…"]]}},
        {"type": "note", "note": {"title": "X ile Y farkı", "body": "…", "tone": "warn"}},
        {"type": "check", "check": {"type": "mcq", "prompt": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explanation": "…", "optionWhy": ["…","…","…","…"], "review": {"prompt": "…"}}}
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

/** Öğretmen istemi — Astra'nın aynı belgeyle gözlenen ders akışı. */
export const TEACHER_SYSTEM =
  INTRO_DOCUMENT +
  "KAYNAK KURALI (kesin): Her olgu, tanım, sayı, tarih, madde numarası, kural, sınıflandırma ve olay örneği yalnızca " +
  "KAYNAK metninden gelir. Kaynakta yoksa yazma; tahmin etme, genel kültürden ekleme — tek istisna aşağıdaki " +
  "'Genel bilgi' kutusu. " +
  "GENEL BİLGİ KUTUSU: Kaynak bir konuyu sınavda sorulan kesin bilgisini vermeden geçiyorsa (yaş sınırı, eşik, " +
  "neden — örn. kaynak 'bal konusunda aile eğitimi önemlidir' deyip yaşı ve nedeni vermiyor) o bilgiyi yalnız bir " +
  "'note' bloğunda ver: tone 'general', başlık 'Genel bilgi: …', tek iki cümle. Yalnız ders kitaplarında tartışmasız, " +
  "güncel olarak değişmeyen bilgi; emin değilsen yazma. Ders başına en fazla iki kutu. Kaynakta zaten olan bilgiyi " +
  "buraya koyma; bu kutudaki bilgiyi metin, soru, 'corrected' ya da özet bloğunda kullanma — sorular kaynaktan çözülür. " +
  "Kavramı ayırt ettirmek için gündelik hayattan kısa bir örnek ya da benzetme kullanabilirsin, ama o örnek yeni bir " +
  "bilgi (sayı, kural, yasa, tarih, sonuç) taşımaz ve kaynaktaki tanımla çelişmez. " +
  "Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz; kaynaktan uzun cümle kopyalama. " +
  "Kaynakta bir cümle açıkça bozuksa (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle çelişiyor), " +
  "onu kopyalama: kaynağın kendi açıklamalarından ve örneklerinden anlaşılan anlamı yaz. Örnek: 'işlemin kanunun " +
  "öngördüğü şekilde yapılması durumunda hüküm doğurmamasıdır' bozuk; kastedilen 'yapılmaması nedeniyle'. " +
  "Bu yeni bilgi değil, kaynağın düzeltilmesidir. Düzeltmeyi sessizce yap: derste kaynağın hatasından, " +
  "'kaynakta yanlış yazılmış' gibi bir nottan hiç söz etme.\n\n" +
  "ANLATIM: 'Sen' diye konuşan, sakin, sınav odaklı bir öğretmen. Kısa cümleler. Önce kavramın ne olduğunu, sonra neyle " +
  "karıştırıldığını, sonra sınavda nasıl tanınacağını söyle. Zıtlıkla anlat (X böyledir, Y ise şöyle). " +
  "SAYILAR: Kaynak bir sayı, eşik, aralık, oran ya da birim veriyorsa onu aynen yaz ('2 SD'nin altı', '%3', '13 cm'); " +
  "'yüksek', 'düşük', 'belirli bir değer' diye geçiştirme. Kaynakta olmayan sayıyı ekleme.\n\n" +
  "BLOKLAR: Her ekran sıralı bloklardan oluşur ve ekranda yukarıdan aşağı bu sırayla görünür; anlatım sırasıyla diz " +
  "(formül, onu açıklayan metnin hemen ardından gelebilir). KAYNAK'ta konuna ait bir tablo varsa ('| … |' satırları) " +
  "onu 'table' bloğu olarak koru: satırlarını paragrafa dökme, hücrelerdeki ayırıcı ipuçlarını düşürme (kısaltabilirsin); " +
  "metin o tablonun nasıl okunacağını ve neyi ayırt ettirdiğini söyler. Kaynak tablo vermeden bir karşılaştırma " +
  "yapıyorsa da 'table' bloğu; " +
  "kardeş kavramları (aynı ailedeki 2-6 terim) 'cards' bloğunda tek cümlelik tanımlar olarak ver; sıralı bir işlem varsa " +
  "'procedure'; hesaplanabilir bağıntı varsa 'formula'; çözümlü hesap varsa 'example'. " +
  "Yaşa, evreye ya da türe göre değişen birden çok değer sayıyorsan ('6 ayda …, 12 ayda …, 2 yaşta …') bunları metinde " +
  "art arda sıralama: 'table' kur (satır yaş/evre, sütun alan) ve metinde tabloyu nasıl okuyacağını söyle. " +
  "Tablo kurduğun ekranda metin tablonun satırlarını yeniden saymaz; ayırt ettiren ölçütü ve tablonun nasıl okunacağını söyler. " +
  "Öğrencinin sık karıştırdığı iki kavram varsa ekrana 'note' bloğu (tone: warn) koy: 'X ile Y farkı'. " +
  "GÜNDELİK ÖRNEK (zorunlu): Derste EN AZ BİR ekranda, uyarı notu olmayan bir ekrana, 'note' bloğu (tone: info) ile " +
  "gündelik hayattan kısa bir örnek kutusu koy. Başlık 'Günlük hayattan: …' diye başlasın ve örneği anlatsın. " +
  "Somut bir sahne kur: biri bir şey yapıyor ve bir şey oluyor; soyut tanımı tekrar etme. Örnek biçimi: 'Kırmızı ışıkta " +
  "geçip bir arabaya çarptığında devlete ödediğin para ceza, karşı tarafın hasarını ödemen tazminattır.' Bu cümleyi " +
  "kopyalama; kendi konunun kavramları için benzer bir sahne kur. Örnek, kavramı ya da karıştırılan iki kavramı " +
  "ayırt ettirir; yeni bilgi (sayı, kural, yasa, tarih, sonuç) taşımaz ve kaynaktaki tanımla çelişmez. Sahnede iki " +
  "kavram aynı olayda FARKLI sonuç versin (biri değişir, öteki değişmez; biri ceza, öteki tazminat). Konuyu yalnızca " +
  "uygulayan birini anlatan sahne ('ebeveyn ölçümleri eğriye işler', 'öğrenci tanımı ezberler') örnek sayılmaz.\n\n" +
  "AKIŞ:\n" +
  "1) overview: dersin kancası — konuya girmeden önce öğrenciyi düşündüren 1-2 cümle. 'Önce dene' sorusundan önce " +
  "okunur: o sorunun cevabını vermez (soru 'temel risk etken mi?' diye soruyorsa kanca 'asıl risk sıvı kaybı' demez).\n" +
  "2) Kavramlar ve ekranlar: 3-4 kavram (kaynak darsa 2). Bir kavram genelde tek ekrandır; hesap yolu, çok adımlı bir " +
  "işlemi ya da uzun bir tablosu varsa 2-3 ekrana böl: önce kavram ve formül, sonra adımlar ve kaynaktaki sayılarla " +
  "çözümlü örnek. Aynı kavramın ekranları art arda gelir ve aynı 'concept' adını taşır; 'heading' ekranın kendi " +
  "odağıdır ('Z-skoru', 'Z-skoru: hesap'). Hesap, çok adımlı işlem ya da uzun tablo YOKSA kavramı bölme: ikinci " +
  "ekran birinciyi tekrar edemez, yeni bir parça ('formula', 'procedure', 'example', 'table') taşır. Bir tabloya " +
  "gönderen cümle ('tabloda oku') yalnız o tablonun durduğu ekranda yazılır. En fazla 7 ekran. 'concept' ve " +
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
  "4) Her kavramın son ekranında bir 'check' bloğu olur; ekran başına en fazla bir 'check' bloğu. İlk kavram tek " +
  "ekransa onun sorusu 'önce dene' sorusudur — o ekrana ikinci soru yazma. Öbür ekranlarda soru ekranın son bloğudur. " +
  "Çoktan seçmeli soruda 4 şık; çeldiriciler aynı ailedeki kardeş terimler ya da " +
  "öğrencinin gerçekten karıştırdığı ifadeler. Tek doğru şık. Soru cevabı vermesin; sayma sorusu ('kaç tür vardır') yok. " +
  "explanation doğru cevabın nedenini söyler VE her çeldiricinin gerçekte ne olduğunu söyler. optionWhy her şık için bir " +
  "cümle (şık sayısı kadar). review: aynı kavramı farklı yönden soran soru — tanımdan terim soruldaysa bu kez " +
  "bir durumdan (olaydan) terim sorulur; şıklar aynı kalır. Durum sorusundaki olay tek kavrama okunmalı: iki kavramla " +
  "da açıklanabilen muğlak örnek kurma ('herkesten eşit oranda vergi' — oran mı, miktar mı?); ayırt ettiren ayrıntıyı " +
  "olayın içine yaz.\n" +
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

export function teacherUserPrompt(input: TeacherLessonInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.previousTopic ? `ÖNCEKİ KONU (gerekirse tek cümleyle bağlan): ${input.previousTopic}` : "",
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    `SIRADAKİ KONULAR: ${input.upcomingTopics.length ? input.upcomingTopics.join(" | ") : "(yok)"}`,
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu ya da bölüm adı değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.mode === "topic"
      ? "KAYNAK: (yok — belgesiz ders; konunun yerleşik bilgisiyle yaz)"
      : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const VERIFY_SYSTEM =
  "Sen titiz bir ders denetçisisin. Bir dersi, yazıldığı KAYNAK ile karşılaştırıyorsun. Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan olgu, tanım, sayı, tarih, kural ya da sınıflandırma. (Yeni bilgi taşımayan gündelik " +
  "örnek ya da benzetme sorun değildir. tone 'general' olan 'Genel bilgi' notu kaynakta olmayabilir; onu A'ya göre " +
  "değil H'ye göre denetle.)\n" +
  "B) Kaynakla çelişen ya da kaynağın anlamını değiştiren ifade; kaynaktaki bir sayının, eşiğin ya da birimin yanlış " +
  "aktarılması ya da kaynak sayıyı açıkça verirken derste 'yüksek/düşük' gibi soyut sözle geçiştirilmesi.\n" +
  "C) Yanlış cevap anahtarı, birden fazla doğru şık, cevabı soru metninde veren soru; durum sorusundaki olayın " +
  "iki kavrama da okunabilmesi (ayırt ettiren ayrıntı eksik).\n" +
  "D) explanation, optionWhy, corrected'da (yanlış ifadenin doğrusu) ya da çözümlü örnekte yanlış bilgi veya hesap hatası.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle; kaynağın bozuk kelimesinin ya da bozuk cümlesinin kopyası.\n" +
  "F) Ders içinde tutarsızlık (bir yerde üç tür deyip başka yerde farklı saymak gibi).\n" +
  "G) Derste kaynağın kendisinden söz eden iç not ('kaynakta yanlış yazılmış', 'kaynaktaki ifade hatalıdır' gibi) " +
  "ya da bilgiyi kaynağa atfeden cümle ('kaynakta … diye açıklanır', 'metne göre', 'belgede belirtildiği gibi').\n" +
  "H) 'Genel bilgi' notunda (tone 'general') yanlış, tartışmalı ya da güncel olarak değişebilecek bilgi; kaynakta zaten " +
  "olan bilginin bu nota konması; bu nottaki bilginin metinde, soruda, 'corrected'da ya da özette kullanılması.\n" +
  "Kaynakta açıkça bozuk bir cümlenin (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle " +
  "çelişen) derste kaynağın kendi açıklama ve örnekleriyle tutarlı anlamıyla yazılması SORUN DEĞİLDİR; bunu A ya da B " +
  "sayma.\n" +
  "A-H 'high'. Şunlar 'low': öğretici olmayan soru, gereksiz uzunluk, zayıf kanca.\n" +
  'JSON döndür: {"issues":[{"where":"screens[1].blocks[3]","severity":"high","problem":"…","fix":"…"}]}. ' +
  "Sorun yoksa issues boş dizi.";

/** Belgesiz ders denetimi: kaynak yok, doğruluk ve öğretim kalitesi. */
export const TOPIC_VERIFY_SYSTEM =
  "Sen titiz bir ders denetçisisin. Belgesi olmayan bir sınav dersini doğruluk açısından denetliyorsun. Şunları bul:\n" +
  "A) Yanlış olgu, tanım, sayı, eşik, birim, tarih, kural ya da sınıflandırma.\n" +
  "B) Emin olunamayacak kadar ayrıntılı ya da güncel olarak değişebilecek bilgi (yürürlükteki oran, son düzenleme), " +
  "tartışmalı bir görüşün kesin doğru gibi sunulması.\n" +
  "C) Yanlış cevap anahtarı, birden fazla doğru şık, cevabı soru metninde veren soru; durum sorusundaki olayın " +
  "iki kavrama da okunabilmesi (ayırt ettiren ayrıntı eksik).\n" +
  "D) explanation, optionWhy ya da corrected'da (yanlış ifadenin doğrusu) yanlış bilgi; çözümlü örnekte hesap hatası.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "F) Ders içinde tutarsızlık.\n" +
  "A-F 'high'. Şunlar 'low': öğretici olmayan soru, gereksiz uzunluk, zayıf kanca.\n" +
  'JSON döndür: {"issues":[{"where":"screens[1].blocks[3]","severity":"high","problem":"…","fix":"…"}]}. ' +
  "Sorun yoksa issues boş dizi.";

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

const FIX_PREFIX =
  "Sen aynı dersi yazan öğretmensin. Denetçinin bulduğu sorunları düzelt. Kaynakta dayanağı olmayan bilgiyi çıkar ya da " +
  "kaynaktaki doğrusuyla değiştir; yanlış anahtarı düzelt; bozuk cümleyi doğru Türkçeyle yeniden yaz. " +
  "Listedeki her alanı mutlaka değiştir; önerilen düzeltme ('→' sonrası) varsa onu uygula. Dersi aynen geri döndürme. " +
  "Sorunsuz kısımları değiştirme. Kurallar ve şema aynı:\n\n";

export const FIX_SYSTEM = FIX_PREFIX + TEACHER_SYSTEM;

export function fixSystem(mode: TeacherLessonMode = "document"): string {
  return FIX_PREFIX + teacherSystem(mode);
}

export function fixUserPrompt(
  lesson: LessonV3,
  issues: TeacherIssue[],
  input: TeacherLessonInput,
): string {
  return [
    teacherUserPrompt(input),
    `ŞU ANKİ DERS (JSON):\n${JSON.stringify(lesson)}`,
    `DÜZELTİLECEK SORUNLAR:\n${issues.map((issue, i) => `${i + 1}. [${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`).join("\n")}`,
    "Düzeltilmiş dersin tamamını aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

export type TeacherIssue = { where: string; severity: "high" | "low"; problem: string; fix?: string };

export function parseIssues(raw: unknown): TeacherIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem) return [];
    return [
      {
        where: typeof row.where === "string" ? row.where.slice(0, 80) : "ders",
        severity: row.severity === "low" ? ("low" as const) : ("high" as const),
        problem: problem.slice(0, 400),
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
    screens: lesson.screens.map((screen) => ({
      ...screen,
      heading: calmHeading(screen.heading),
      ...(screen.concept ? { concept: calmHeading(screen.concept) } : {}),
      blocks: screen.blocks.map((block): LessonBlock =>
        block.type === "cards"
          ? { ...block, cards: block.cards.map((card) => ({ ...card, title: calmHeading(card.title) })) }
          : block,
      ),
    })),
    nextFocus,
  };
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
export function shuffleLessonChecks(lesson: LessonV3): LessonV3 {
  return {
    ...lesson,
    screens: lesson.screens.map((screen) => ({
      ...screen,
      blocks: screen.blocks.map((block): LessonBlock => (block.type === "check" ? { ...block, check: shuffleCheck(block.check) } : block)),
    })),
  };
}

type Check = Extract<LessonBlock, { type: "check" }>["check"];

function shuffleCheck(check: Check): Check {
  if (check.type !== "mcq" || !check.options || check.options.length < 3 || typeof check.answerIndex !== "number") {
    return check;
  }
  let state = seedOf(check.prompt);
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const order = check.options.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  const whyAligned = check.optionWhy?.length === check.options.length;
  return {
    ...check,
    options: order.map((index) => check.options![index]),
    answerIndex: order.indexOf(check.answerIndex),
    ...(whyAligned ? { optionWhy: order.map((index) => check.optionWhy![index]) } : {}),
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

/**
 * Yapı denetimi (saf, LessonV3). Sorunu düzeltmez; düzeltme turuna gider.
 * Gözlenen her eski kusur burada bir kural: BÜYÜK HARF başlık (sayfa üst
 * bilgisi), "Kaynak:" yapıştırma, bariz kontrol, eksik gerekçe. Önem
 * dereceleri V2'deki gibi; V3'ün kendi kuralları (ekran başına bir soru,
 * kavram bir soruyla biter, kavramın ekranları art arda) yüksek.
 */
export function lessonStructureIssues(
  lesson: LessonV3,
  input: Pick<TeacherLessonInput, "runningHeaders"> & Partial<Pick<TeacherLessonInput, "pages">>,
): TeacherIssue[] {
  const issues: TeacherIssue[] = [];
  const add = (where: string, problem: string) => issues.push({ where, severity: "high", problem });
  const low = (where: string, problem: string) => issues.push({ where, severity: "low", problem });
  const headers = input.runningHeaders ?? [];
  const screens = lesson.screens;
  const groups = conceptGroups(screens);

  if (shouting(lesson.title)) add("title", "Başlık BÜYÜK HARFLE yazılmış; içerikten, normal yazımla bir konu adı ver.");
  if (headers.some((line) => sameKey(line, lesson.title))) add("title", "Başlık sayfa kenarında tekrar eden kitap başlığı; konunun kendi adını ver.");
  if (!lesson.overview?.trim()) add("overview", "Kanca (overview) yok.");
  if (screens.length < 2) add("screens", "En az iki ekran olmalı.");
  if (screens.length > 7) add("screens", "En fazla yedi ekran; konuyu daralt ya da kavramı daha az ekrana sığdır.");
  if (groups.length > 5) add("screens", "En fazla dört kavram; konuyu daralt.");
  const seenConcepts = new Set<string>();
  for (const group of groups) {
    const key = group.concept.toLocaleLowerCase("tr");
    const first = group.screens[0]!;
    const lastIndex = group.screens[group.screens.length - 1]!;
    if (seenConcepts.has(key)) add(`screens[${first}].concept`, `'${group.concept}' kavramının ekranları art arda olmalı.`);
    seenConcepts.add(key);
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
  }

  // Tür serbest: Termodinamik altın denemesinde "önce dene" çoktan seçmeli
  // yazıldı, iki düzeltme turu da değiştirmedi ve iyi bir ders reddedildi.
  const opener = screens[0];
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

  screens.forEach((screen, index) => {
    const where = `screens[${index}]`;
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
  });

  // Astra her derste bir gündelik örnek kutusu koyuyor; bizim ilk dört dersimizde
  // hiç çıkmadı (2 Ekim 2026, ürün sahibinin kararı: her derste en az bir).
  if (!screens.some((screen) => screen.blocks.some((block) => block.type === "note" && block.note.tone === "info"))) {
    add(
      "screens",
      "Gündelik örnek kutusu yok: uyarı notu olmayan bir ekrana 'note' bloğu (tone: info, başlık 'Günlük hayattan: …') ile " +
        "kavramı tanıdık bir durumla ayırt ettiren kısa bir örnek ekle; yeni bilgi taşımasın.",
    );
  }
  // Belgede olmayan, denetlenmiş genel bilgi (16 Ekim 2026): az ve etiketli olmalı.
  const general = screens.flatMap((screen, index) =>
    screen.blocks.flatMap((block, blockIndex) =>
      block.type === "note" && block.note.tone === "general" ? [{ note: block.note, where: `screens[${index}].blocks[${blockIndex}]` }] : [],
    ),
  );
  if (general.length > 2) add("screens", "En fazla iki 'Genel bilgi' kutusu; gerisini çıkar ya da kaynaktaki bilgiyle anlat.");
  for (const item of general) {
    if (!/^genel bilgi\b/i.test(item.note.title.trim())) {
      add(item.where, "Genel bilgi kutusunun başlığı 'Genel bilgi: …' ile başlamalı; öğrenci bilginin belgesinden gelmediğini görsün.");
    }
  }
  // 16 Ekim 2026 Pediatri solunum dersi: kaynağın 5 satırlık "Bulgular | Düşündürür |
  // Ayırıcı ipucu" tablosu paragrafa döküldü, "ince ral/ronküs" ve "reversibilite" düştü.
  // Tablonun satırları derste anılıyorsa tablo derste de tablo olmalı.
  if (!screens.some((screen) => screen.blocks.some((block) => block.type === "table"))) {
    const said = stemSet(JSON.stringify(lesson));
    const flattened = sourceTables(input.pages ?? []).find((table) => {
      const mentioned = table.rows.filter((row) => row.some((cell) => cellMentioned(cell, said))).length;
      return table.rows.length >= 3 && mentioned >= 3 && mentioned * 2 >= table.rows.length;
    });
    if (flattened) {
      add(
        "screens",
        `Kaynaktaki tablo (${flattened.columns.join(" | ")}) derste paragrafa dökülmüş; onu 'table' bloğu olarak ver, ` +
          "ayırıcı ipuçlarını düşürme. Metin tablonun satırlarını yeniden saymasın, nasıl okunacağını söylesin.",
      );
    }
  }
  const summary = lesson.summary ?? [];
  if (summary.length < 3 || summary.length > 5) add("summary", "Özet 3-5 madde olmalı.");
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
const SPLIT_WORTHY = new Set<LessonBlock["type"]>(["formula", "procedure", "example", "table"]);

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
    if (!check.review?.prompt) add(`${where}.review`, "review (farklı yönden tekrar sorusu) yok.");
  }
  if (check.type === "trueFalse") {
    const options = check.options ?? [];
    if (options.length !== 2 || typeof check.answerIndex !== "number" || check.answerIndex > 1) {
      add(where, "Doğru/yanlış sorusunda şıklar ['Doğru','Yanlış'] ve answerIndex 0 ya da 1 olmalı.");
    }
    // Eksik "doğrusu" dersi düşürmez: düzeltme turu zaten açılırsa eklenir.
    const falseStatement = /^(yanlış|yanlis|false)$/i.test(options[check.answerIndex ?? -1]?.trim() ?? "");
    if (falseStatement && !check.corrected?.trim()) low(where, "Yanlış ifadenin doğrusu (corrected) yazılmamış.");
  }
}
