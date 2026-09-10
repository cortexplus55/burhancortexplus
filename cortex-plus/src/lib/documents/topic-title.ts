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

/** Üretim tarafına verilen adlandırma talimatı — kural tek yerde dursun. */
export const TOPIC_TITLE_RULE =
  "Başlık, belgenin içindekiler satırını kopyalamak değil, konuyu adlandırmaktır. " +
  "Bölüm numarasını ve sondaki parantezli kısaltmayı yazma. " +
  "Başlık tek başına okunduğunda neyin konusu olduğu anlaşılsın: gerekiyorsa " +
  'alanın adını ekle ("Faz Bağıntıları" değil, "Zeminlerin Faz Bağıntıları"). ' +
  "Bir bölümün alt başlığı kendi başına sınanacak kadar önemliyse ana başlığa " +
  '"ve" ile ekle ("Efektif Gerilme İlkesi ve Sızma Kuvvetleri"); en fazla iki bileşen. ' +
  "Tek başına ölçülemeyen, yalnızca bağlam veren bir bölümü ayrı konu yapma — " +
  "onu anlattığı asıl konunun içine kat. Başlık cümle değildir, sonuna nokta koyma.";
