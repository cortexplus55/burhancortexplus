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

/**
 * Haritanın kaybetmemesi gereken omurga: belgenin kendi bölümleri.
 *
 * Numaralı başlık en temiz sinyal ama binlerce PDF'in çoğunda yok —
 * slayt destesi, taranmış ders notu, makale. Numara şartı konursa bekçi
 * o belgelerde sessiz kalıyor ve konu düşmesini yakalayamıyoruz.
 *
 * Numarasız belgede ölçü sayfa yayılımı: bir başlık iki ya da daha fazla
 * sayfanın ilk başlığıysa gerçek bir bölümdür. Tek sayfada geçen başlık
 * gürültü olabilir (kutu başlığı, şekil adı) ve onu omurga sayarsak
 * gereksiz yere taslak reddedip kredi yakıyoruz.
 */
export function chapterHeadings(
  pages: { headings: string[] }[],
): string[] {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const heading = (page.headings[0] ?? "").trim();
    if (!heading || SUB_NUMBER.test(heading)) continue;
    counts.set(heading, (counts.get(heading) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([heading, count]) => CHAPTER_NUMBER.test(heading) || count >= 2)
    .map(([heading]) => heading);
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

    // En uzun kelime bölümün en ayırt edici parçası: "Yük Altında Gerilme
    // Dağılımı" içinde "gerilme" başka konularda da geçer, "dağılımı"
    // geçmez. O kelime hiçbir başlıkta yoksa bölüm temsil edilmiyordur.
    const distinctive = [...words].sort((a, b) => b.length - a.length)[0];

    let best = 0;
    let distinctiveCovered = false;
    for (const title of titleWords) {
      const hit = words.filter((w) => covers(title, w)).length / words.length;
      if (hit > best) best = hit;
      if (covers(title, distinctive)) distinctiveCovered = true;
    }
    if (best < 0.5 || !distinctiveCovered) missing.push(heading);
  }
  return missing;
}

/**
 * Üretim tarafına verilen adlandırma talimatı — kural tek yerde dursun.
 *
 * Soyut kural iki kez denendi ve kapsam eki gelmedi; örnek verince
 * geliyor. Aşağıdaki çiftler uydurma değil: aynı zemin PDF'inin bizde ve
 * Astra'da aldığı gerçek başlıklar.
 *
 * Kapsam eki HER başlığa gerekmiyor. Pediatri belgesinde "Gelişimsel
 * Basamaklar", üslü belgesinde "Bilimsel Gösterim" tek başına anlaşılıyor
 * ve model doğru davranıp dokunmadı. Gereken yer, başlık belgeden
 * koparıldığında neyin konusu olduğunun kaybolduğu yer.
 */
export const TOPIC_TITLE_RULE =
  "Başlık, belgenin içindekiler satırını kopyalamak değil, konuyu adlandırmaktır. " +
  "Bölüm numarasını ve sondaki parantezli kısaltmayı yazma. " +
  "Başlık tek başına, listede okununca neyin konusu olduğu anlaşılsın. " +
  "Örnekler — solda belgenin satırı, sağda olması gereken: " +
  '"2. Faz Bağıntıları ve İndeks Özellikler" → "Zeminlerin Faz Bağıntıları ve İndeks Özellikleri"; ' +
  '"3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)" → "Dane Boyu Dağılımı ve Zemin Sınıflandırması"; ' +
  '"5. Efektif Gerilme İlkesi" (alt başlığı: Sızmanın Etkisi) → "Efektif Gerilme İlkesi ve Sızma Kuvvetleri". ' +
  "Kapsam ekini yalnızca gerektiğinde koy: \"Gelişimsel Basamaklar\" ya da " +
  '"Bilimsel Gösterim" zaten tek başına anlaşılıyor, onlara dokunma. ' +
  "Bir bölümün alt başlığı kendi başına sınanacak kadar önemliyse ana başlığa " +
  '"ve" ile ekle; en fazla iki bileşen. ' +
  "Tek başına ölçülemeyen, yalnızca bağlam veren bir bölümü ayrı konu yapma — " +
  "onu anlattığı asıl konunun içine kat. Başlık cümle değildir, sonuna nokta koyma.";
