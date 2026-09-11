/**
 * Konu bölme ve adlandırma kuralı — "ev stili".
 *
 * Aynı zemin mekaniği PDF'ini iki ürüne yükleyip karşılaştırdık. Belgenin
 * kendi içindekiler tablosunda sekiz numaralı bölüm var; Astra bundan yedi
 * konu çıkardı, biz sekizini de olduğu gibi kopyaladık:
 *
 *   biz:    "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)"
 *   Astra:  "Dane Boyu Dağılımı ve Zemin Sınıflandırması"
 *   biz:    "5. Efektif Gerilme İlkesi"
 *   Astra:  "Efektif Gerilme İlkesi ve Sızma Kuvvetleri"   (5.2'den terfi)
 *   biz:    "1. Zeminin Oluşumu ve Üç Fazlı Sistem"
 *   Astra:  (konu değil — tek başına sınanamıyor, 2'nin açılışına katıldı)
 *
 * Fark okunabilirlik değil, işlev: konu listesi öğrencinin gördüğü ilk
 * ekran. Numara ve parantez içi kısaltma orada hiçbir şey öğretmiyor,
 * "Faz Bağıntıları" ise belgeden koparıldığında neyin bağıntısı olduğunu
 * söylemiyor.
 *
 * Buradaki kurallar belgeden bağımsız; binlerce PDF aynı elden çıkmış gibi
 * görünsün diye üretim tarafında da doğrulama tarafında da bunlar geçerli.
 */

/** Başlıktaki bölüm numarası: "3.", "1.2.", "IV -" gibi. */
const LEADING_NUMBER = /^\s*(\d+([.)]\d+)*[.)]?|[IVXLC]+[.)])\s+/;

/** Sonda duran parantezli kısaltma: "(USCS)", "(TS 1500)". */
const TRAILING_PAREN = /\s*\([^()]{2,20}\)\s*$/;

/**
 * Konu sayısı belgenin uzunluğuna göre.
 *
 * Yaklaşık her üç öğretim sayfasına bir konu. Alt sınır 4: iki konuya
 * bölünmüş bir belge plan üretmeye yetmiyor. Üst sınır 12: 200 sayfalık bir
 * ders kitabı 60 konuya bölünürse çalışma planı gün başına birkaç dakikaya
 * iniyor ve konu listesi gezilemez oluyor.
 */
export function targetTopicCount(contentPageCount: number): number {
  const raw = Math.round(contentPageCount / 3);
  return Math.min(12, Math.max(4, raw));
}

/**
 * Başlığı ev stiline çeker: numara ve sondaki parantezli kısaltma atılır,
 * fazladan boşluk toplanır. Kelimelere dokunmaz — anlamı değiştirmek
 * modelin işi, temizlik bizim.
 */
export function normalizeTopicTitle(title: string): string {
  return title
    .replace(LEADING_NUMBER, "")
    .replace(TRAILING_PAREN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kabul edilmeyen başlıklar. Boş dizi dönerse başlık kurala uyuyor.
 *
 * `normalizeTopicTitle` çalıştıktan SONRA çağrılır; numara ve parantez
 * zaten temizlendiği için burada kalanlar modelin düzeltemediğimiz
 * hataları: "Sayfa 7", tek kelimelik başlık, cümleye dönmüş başlık.
 */
export function topicTitleIssues(title: string): string[] {
  const issues: string[] = [];
  const clean = title.trim();

  if (/^sayfa\s*\d+/i.test(clean)) {
    issues.push("Başlık sayfa numarası olamaz.");
  }
  if (clean.replace(/[^\p{L}]/gu, "").length < 6) {
    issues.push("Başlık çok kısa; konuyu adlandırmıyor.");
  }
  if (clean.split(/\s+/).filter(Boolean).length > 10) {
    issues.push("Başlık cümleye dönmüş; en fazla 10 kelime.");
  }
  if (/[.!?]$/.test(clean)) {
    issues.push("Başlık cümle değil; sonunda nokta olmaz.");
  }
  return issues;
}

/** Üst düzey bölüm numarası: "3." evet, alt başlık "2.3." hayır. */
const CHAPTER_NUMBER = /^\s*\d+[.)]\s+\S/;
const SUB_NUMBER = /^\s*\d+\.\d/;

/** İçindekiler satırının sonundaki sayfa numarası: "… Dağılımı 14". */
const TOC_PAGE_TAIL = /\s+\d{1,3}$/;

/**
 * Numaralı ama bölüm olmayan başlık.
 *
 * Belgeler bölüm sonlarına numaralı kontrol soruları koyuyor ve bunlar da
 * başlık olarak çıkıyor: "1. Boussinesq çözümü hangi varsayımları yapar?",
 * "2. S r e = w G s özdeşliğini bir faz diyagramıyla doğrula." Omurgaya
 * girerlerse bekçi otuz sahte bölüm arar ve hiçbir taslağı geçirmez.
 */
function looksLikeQuestionOrSentence(heading: string): boolean {
  if (/[?]$/.test(heading)) return true;
  if (/[=<>≤≥±×÷√]/.test(heading)) return true;
  const words = heading.split(/\s+/).filter(Boolean).length;
  return words > 9;
}

/**
 * Haritanın kaybetmemesi gereken omurga: belgenin kendi bölümleri.
 *
 * Uzun süre yalnızca `headings[0]`'a bakıyordu ve omurga neredeyse boş
 * kalıyordu: zemin belgesinde sayfaların ilk başlığı çoğunlukla bölüm
 * adı değil, bir tablo başlığı ya da formül satırıydı ("temel faz
 * özdeşliği", "ÖRNEK 1", "i = Δh / L"). Sekiz bölümden yalnızca ikisi
 * omurgaya giriyor, "6. Yük Altında Gerilme Dağılımı" hiç görünmüyordu —
 * bekçi de onu koruyamıyordu.
 *
 * Artık sayfanın BÜTÜN başlıkları taranıyor. İçindekiler satırının
 * sonundaki sayfa numarası atılıyor ki "… Dağılımı 14" ile "… Dağılımı"
 * aynı bölüm sayılsın.
 *
 * Numarasız belgeler (slayt destesi, taranmış not) için ölçü sayfa
 * yayılımı: iki ya da daha fazla sayfada geçen başlık gerçek bir
 * bölümdür; tek sayfalık başlık gürültü olabilir.
 */
export function chapterHeadings(
  pages: { headings: string[] }[],
): string[] {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const seenOnPage = new Set<string>();
    for (const raw of page.headings ?? []) {
      const heading = (raw ?? "").replace(TOC_PAGE_TAIL, "").trim();
      if (!heading || SUB_NUMBER.test(heading)) continue;
      if (looksLikeQuestionOrSentence(heading)) continue;
      if (seenOnPage.has(heading)) continue;
      seenOnPage.add(heading);
      counts.set(heading, (counts.get(heading) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([heading, count]) => CHAPTER_NUMBER.test(heading) || count >= 2)
    .map(([heading]) => heading);
}

/**
 * Bir bölümün kendi alt başlıkları — dersin bölüm omurgası.
 *
 * `chapterHeadings` üst düzey başlıkları topluyor ve alt başlıkları
 * ELİYOR; burada tam tersi yapılıyor. Belgenin kendi alt başlıkları
 * dersin bölümleri oluyor:
 *
 *   3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)  ← konu
 *     3.1. Dane Boyu Dağılımı                              ← bölüm
 *     3.2. Atterberg (Kıvam) Limitleri                     ← bölüm
 *     3.3. Birleştirilmiş Zemin Sınıflandırması (USCS)     ← bölüm
 *
 * Neden: model kendi başına bölüm seçince şemanın alt sınırı kadar
 * yazıp gerisini "Yaygın Hata", "Kapanış" gibi şablon adlarıyla
 * dolduruyordu. Canlıda üretilen zemin dersi yukarıdaki üç bölümün
 * ikisini yazdı, USCS sınıflandırmasını hiç anlatmadı — öğrenci
 * kaynağında duran bir konuyu hiç görmedi.
 *
 * Numarasız belgede boş dönüyor; o zaman bölümleri model seçmeye
 * devam ediyor. Eksik omurga, yanlış omurgadan iyidir.
 */
export function sectionHeadings(pages: { headings: string[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    for (const raw of page.headings ?? []) {
      const heading = (raw ?? "").replace(TOC_PAGE_TAIL, "").trim();
      if (!heading || !SUB_NUMBER.test(heading)) continue;
      if (looksLikeQuestionOrSentence(heading)) continue;
      const title = normalizeTopicTitle(heading);
      if (topicTitleIssues(title).length) continue;
      const key = foldTrLocal(title);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
  }
  // lessonV2Schema en fazla altı bölüm kabul ediyor.
  return out.slice(0, 6);
}

/** Bir sayfa bu bölümü taşıyor mu? İçindekiler kuyruğu göz ardı edilir. */
export function pageCarriesHeading(
  page: { headings: string[] },
  heading: string,
): boolean {
  return (page.headings ?? []).some(
    (raw) => (raw ?? "").replace(TOC_PAGE_TAIL, "").trim() === heading,
  );
}

/**
 * Hedef konu sayısı yüzünden düşürülen bölüm var mı?
 *
 * İlk canlı denemede kural işledi ama pahalıya patladı: 8 bölümlük zemin
 * PDF'inden 7 konu çıktı, çünkü model "6. Yük Altında Gerilme Dağılımı"
 * bölümünü birleştirmek yerine listeden attı. Sayfalar en yakın konuya
 * bağlandığı için kapsama %100 görünüyordu; kaybolan şey konunun ADIYDI.
 * Öğrenci listede o konuyu göremiyor, o adla bir ders üretilmiyor.
 *
 * Bölüm başlığındaki anlamlı kelimelerin yarısı hiçbir konu başlığında
 * geçmiyorsa o bölüm temsil edilmiyor demektir. Birleştirme buradan
 * geçer ("Konsolidasyon ve Oturma Analizi" her iki adı da taşır), atma
 * geçmez.
 */
const TITLE_STOPWORDS = new Set([
  "ve",
  "ile",
  "veya",
  "icin",
  "bir",
  "bu",
  "altinda",
  "uzerinde",
  "arasinda",
  "giris",
  "temel",
  "genel",
  // Bölüm başlığındaki yapısal kuyruklar. Pediatri belgesinde "1. Sağlam
  // Çocuk İzlemi: Çerçeve" başlığının en uzun kelimesi "çerçeve" çıkıyor
  // ve model doğru bir başlık yazsa bile ("Sağlam Çocuk İzlemi Sıklığı")
  // bekçi bölümü eksik sayıyordu. Bunlar konuyu adlandırmaz, çerçeveler.
  "cerceve",
  "cercevesi",
  "yaklasim",
  "yaklasimi",
  "degerlendirilmesi",
  "degerlendirme",
  "basliklari",
  "kurallari",
  "olcutler",
  "olcutleri",
]);

function significantWords(heading: string): string[] {
  return foldTrLocal(normalizeTopicTitle(heading))
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w));
}

/** Türkçe katlama — page-analysis'e bağımlılık yaratmamak için yerel kopya. */
function foldTrLocal(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i");
}

/**
 * Türkçe ek almış hâlleri de eşleştir: "sınıflandırma" başlıktaki
 * "sınıflandırması" ile aynı kelimedir. Tam eşitlik arayınca bu ikisi
 * ıskalanıyor ve doğru birleştirilmiş bir başlık bile eksik sayılıyordu.
 */
function covers(titleWords: string[], word: string): boolean {
  return titleWords.some((t) => t.startsWith(word) || word.startsWith(t));
}

export function unrepresentedHeadings(
  headings: string[],
  topicTitles: string[],
): string[] {
  const titleWords = topicTitles.map(significantWords);
  const missing: string[] = [];

  for (const heading of headings) {
    const words = significantWords(heading);
    // Anlamlı kelimesi olmayan başlık ("Giriş", "Bölüm 2") ölçülemez.
    if (words.length === 0) continue;

    // En uzun kelime bölümün en ayırt edici parçası.
    const distinctive = [...words].sort((a, b) => b.length - a.length)[0];

    // Kelimelerin TEK BİR başlıkta toplanması gerekiyor. Ayrı ayrı
    // bakmak bir bölümü kaçırdı: "6. Yük Altında Gerilme Dağılımı"
    // düşmüştü ama "gerilme" başka konuda ("Efektif Gerilme İlkesi"),
    // "dağılımı" bir başkasında ("Dane Boyu Dağılımı") geçtiği için
    // bekçi bölümü temsil edilmiş saydı. İki farklı konunun kelimeleri
    // üçüncü bir konuyu var etmez.
    const represented = titleWords.some((title) => {
      const hit = words.filter((w) => covers(title, w)).length / words.length;
      return hit >= 0.6 && covers(title, distinctive);
    });
    if (!represented) missing.push(heading);
  }
  return missing;
}

/**
 * Üretim tarafına verilen adlandırma talimatı — kural tek yerde dursun.
 *
 * Örnekler ARTIK BELGENİN KENDİSİNDEN geliyor. Eskiden burada üç sabit
 * çift vardı ve hepsi bir zemin mekaniği PDF'inden alınmıştı: biyoloji
 * belgesi yükleyen öğrencinin isteği de "Dane Boyu Dağılımı" örneğini
 * taşıyordu. İçerik öğrenciye sızmıyordu ama model başka bir alanın
 * diliyle yönlendiriliyordu ve kural, örneklere benzemeyen belgelerde
 * daha zayıf çalışıyordu.
 *
 * Soyut kural tek başına yetmiyor (iki kez denendi, kapsam eki gelmedi);
 * modelin önüne o an işlenen belgenin gerçek satırları konuyor.
 *
 * Kapsam eki HER başlığa gerekmiyor: kendi başına anlaşılan bir başlığa
 * dokunulmaz. Gereken yer, başlık belgeden koparıldığında neyin konusu
 * olduğunun kaybolduğu yer.
 */
export function topicTitleRule(documentHeadings: string[] = []): string {
  // Kuralın anlattığı durum numaralı içindekiler satırı; örnek olarak da
  // onlar gösteriliyor. Numarasız belgede örnek verilmiyor, kural yine
  // geçerli.
  const samples = documentHeadings
    .map((heading) => (heading ?? "").replace(TOC_PAGE_TAIL, "").trim())
    .filter((heading) => LEADING_NUMBER.test(heading) || TRAILING_PAREN.test(heading))
    .slice(0, 3);
  const examples = samples.length
    ? "Bu belgenin kendi satırlarından örnek: " +
      samples.map((heading) => `"${heading}"`).join(", ") +
      ". Bunları numarasız, kısaltmasız ve tek başına okununca ne anlattığı " +
      "belli olacak şekilde yeniden adlandır. "
    : "";
  return (
    "Başlık, belgenin içindekiler satırını kopyalamak değil, konuyu adlandırmaktır. " +
    "Bölüm numarasını ve sondaki parantezli kısaltmayı yazma. " +
    "Başlık tek başına, listede okununca neyin konusu olduğu anlaşılsın. " +
    examples +
    "Kapsam ekini yalnızca gerektiğinde koy: başlık kendi başına zaten " +
    "anlaşılıyorsa olduğu gibi bırak. " +
    "Bir bölümün alt başlığı kendi başına sınanacak kadar önemliyse ana başlığa " +
    '"ve" ile ekle; en fazla iki bileşen. ' +
    "Tek başına ölçülemeyen, yalnızca bağlam veren bir bölümü ayrı konu yapma — " +
    "onu anlattığı asıl konunun içine kat. Başlık cümle değildir, sonuna nokta koyma."
  );
}
