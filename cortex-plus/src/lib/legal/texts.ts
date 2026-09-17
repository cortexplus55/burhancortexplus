import { SELLER, sellerField } from "@/lib/legal/seller";

/**
 * Hukuki metinler — Mesafeli Sözleşmeler Yönetmeliği'ne göre.
 *
 * Bu metinler ÜRÜNÜN GERÇEK DAVRANIŞINA göre yazıldı, hazır şablondan
 * kopyalanmadı. Her madde kodda bir karşılığa dayanıyor:
 *
 *   hizmet anında sunulur        -> ödeme geri çağrısı krediyi hemen yüklüyor
 *   cayma hakkı doğmuyor         -> m.15/1-ğ, anında ifa edilen dijital içerik
 *   otomatik yenileme yok        -> auto_renew varsayılanı false
 *   başarısız işlemde iade       -> credit_refund / undoSpend
 *   cevaplanamayan soruda iade   -> saidNoSource dalı
 *
 * Bir madde yazıp kodda karşılığını kurmamak, en kötü seçenek olurdu:
 * sözleşmede söz verilip üründe yapılmayan şey, hiç söz vermemekten daha
 * büyük sorumluluk doğurur.
 *
 * NOT: Bu metinler bir hukukçu tarafından yazılmadı. Mevzuata ve ürünün
 * davranışına göre hazırlanmış çalışan taslaklardır; bir avukata okutulması
 * önerilir.
 */

const SELLER_BLOCK = () => [
  `Satıcı: ${sellerField("legalName")}`,
  `Adres: ${sellerField("address")}`,
  `Telefon: ${sellerField("phone")}`,
  `E-posta: ${sellerField("email")}`,
  `Vergi dairesi / numarası: ${sellerField("taxOffice")} / ${sellerField("taxNumber")}`,
  `İnternet sitesi: ${SELLER.website}`,
];

const SERVICE_DESC = [
  "Hizmetin konusu: Cortex Plus, öğrencinin yüklediği ders materyalinden ya da seçtiği konudan yapay zekâ ile çalışma içeriği üreten bir internet hizmetidir. Üretilen içerikler anlatım, konu haritası, test, sesli anlatım (podcast) ve sözlü pratiktir.",
  "Hizmet, kredi adı verilen kullanım hakkı üzerinden sunulur. Her yapay zekâ işleminin kaç kredi harcayacağı, işlem yapılmadan önce ekranda gösterilir.",
  "Abonelikler belirli bir dönem için satılır ve o dönemde tanımlı kullanım hakkını açar. Kredi paketleri tek seferlik alımdır ve bakiyeye eklenir.",
];

export const PRE_INFO_SECTIONS = [
  {
    heading: "Satıcı bilgileri",
    body: SELLER_BLOCK(),
  },
  {
    heading: "Hizmetin nitelikleri",
    body: SERVICE_DESC,
  },
  {
    heading: "Fiyat ve ödeme",
    body: [
      "Satın alınacak paketin adı, kullanım hakkı ve KDV dahil fiyatı ödeme adımından önce fiyatlandırma sayfasında gösterilir. Gösterilen fiyat, o an ödenecek toplam tutardır; ayrıca kargo, teslimat ya da işlem bedeli alınmaz.",
      "Ödeme, PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. altyapısı üzerinden kredi/banka kartı ile tek çekimde alınır. Kart bilgileri satıcıya iletilmez ve satıcı tarafından saklanmaz.",
      "Abonelikler otomatik olarak yenilenmez. Dönem sona erdiğinde hesaptan kendiliğinden tahsilat yapılmaz; devam etmek isteyen kullanıcı yeni bir satın alma yapar.",
    ],
  },
  {
    heading: "İfa ve teslimat",
    body: [
      "Hizmet dijitaldir ve fiziki teslimat içermez. Ödeme onaylandığı anda kullanım hakkı hesaba tanımlanır ve hizmet derhal kullanıma açılır.",
      "Ödeme onayı, ödeme kuruluşundan gelen bildirimle aynı anda işlenir. Bu bildirimin ulaşmaması hâlinde kullanım hakkı tanımlanmaz ve tahsil edilen tutar iade edilir.",
      "Hizmetten yararlanmak için internet bağlantısı ve güncel bir internet tarayıcısı gereklidir.",
    ],
  },
  {
    heading: "Cayma hakkı",
    body: [
      "Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) bendi uyarınca, elektronik ortamda anında ifa edilen ve tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmelerde cayma hakkı kullanılamaz.",
      "Cortex Plus hizmeti bu kapsamdadır: satın alma tamamlandığı anda kullanım hakkı hesaba geçer ve hizmet açılır. Bu nedenle satın alma sonrasında cayma hakkı doğmaz.",
      "Alıcı, ödeme adımındaki onay kutusunu işaretleyerek bu bilgilendirmeyi aldığını ve cayma hakkının bulunmadığını kabul etmiş sayılır.",
    ],
  },
  {
    heading: "Şikâyet ve başvuru",
    body: [
      `Talep ve şikâyetler ${sellerField("email")} adresine ya da site içindeki Destek sayfasından iletilebilir.`,
      "Uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dâhilinde alıcının yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.",
    ],
  },
];

export const DISTANCE_SALES_SECTIONS = [
  {
    heading: "Taraflar",
    body: [
      ...SELLER_BLOCK(),
      "Alıcı: Hizmeti satın alan ve kayıt sırasında bildirdiği bilgilerle tanımlanan gerçek kişi.",
      "Alıcı, ödeme adımındaki onay kutusunu işaretleyerek bu sözleşmeyi ve Ön Bilgilendirme Formu'nu okuduğunu ve kabul ettiğini beyan eder.",
    ],
  },
  {
    heading: "Sözleşmenin konusu",
    body: [
      "Bu sözleşme, alıcının internet sitesi üzerinden elektronik ortamda sipariş verdiği, aşağıda nitelikleri ve satış fiyatı belirtilen hizmetin sunulmasıyla ilgili olarak tarafların hak ve yükümlülüklerini düzenler.",
      ...SERVICE_DESC,
    ],
  },
  {
    heading: "Sözleşme konusu hizmetin temel nitelikleri ve fiyatı",
    body: [
      "Satın alınan paketin adı, açtığı kullanım hakkı, süresi ve KDV dahil fiyatı ödeme adımından önce ekranda gösterilir ve ödeme onayıyla birlikte bu sözleşmenin ayrılmaz parçası hâline gelir.",
      "Fiyatlar Türk Lirası cinsindendir ve ilan edildiği an için geçerlidir. Satıcı, ileriye dönük fiyat değişikliği yapabilir; değişiklik önceden yapılmış satın almaları etkilemez.",
    ],
  },
  {
    heading: "İfa şekli ve süresi",
    body: [
      "Hizmet dijitaldir; fiziki teslimat yapılmaz. Ödeme onaylandığı anda kullanım hakkı alıcının hesabına tanımlanır ve hizmet derhal kullanıma açılır.",
      "Abonelik süresi, ödemenin onaylandığı tarihte başlar ve satın alınan paketin süresi kadar devam eder. Süre sonunda kendiliğinden yenilenmez.",
      "Mücbir sebep, altyapı sağlayıcısı kaynaklı kesinti ya da alıcının internet erişiminden kaynaklanan aksaklıklar nedeniyle hizmete erişilememesi hâlinde satıcı, makul sürede gidermek için gereken özeni gösterir.",
    ],
  },
  {
    heading: "Cayma hakkının bulunmaması",
    body: [
      "Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) bendi uyarınca, elektronik ortamda anında ifa edilen ve tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmelerde cayma hakkı kullanılamaz.",
      "Alıcı, satın alma anında hizmetin derhal ifa edileceğini ve bu nedenle cayma hakkının bulunmadığını bildiğini kabul eder.",
      "Bu durum, hatalı ya da yetkisiz işlemlere ilişkin başvuru hakkını ortadan kaldırmaz; bu tür talepler ayrıca incelenir.",
    ],
  },
  {
    heading: "Alıcının yükümlülükleri",
    body: [
      "Alıcı, kayıt sırasında verdiği bilgilerin doğru olduğunu ve hesabının güvenliğinden kendisinin sorumlu olduğunu kabul eder.",
      "Alıcı, sisteme yüklediği belgelerin haklarına sahip olduğunu ya da kullanma yetkisi bulunduğunu beyan eder.",
      "Hizmet, yürürlükteki mevzuata, üçüncü kişilerin haklarına ya da sınav kurallarına aykırı biçimde kullanılamaz.",
    ],
  },
  {
    heading: "Satıcının yükümlülükleri ve sorumluluğun sınırı",
    body: [
      "Satıcı, hizmeti sözleşmede tanımlandığı şekilde sunmakla yükümlüdür.",
      "Yapay zekâ ile üretilen içerikler hata içerebilir. Sistem, üretilen cevabı göndermeden önce ikinci bir denetimden geçirir ve emin olamadığı soruda cevap vermek yerine durumu bildirir; bu durumda o işlem için kredi düşülmez. Buna rağmen içeriklerin doğruluğu mutlak olarak taahhüt edilmez ve kritik kararlarda doğrulama sorumluluğu alıcıdadır.",
      "Teknik bir arıza nedeniyle tamamlanamayan işlemlerde harcanan kredi, talep gerekmeksizin iade edilir.",
    ],
  },
  {
    heading: "Kişisel veriler",
    body: [
      "Kişisel veriler, Gizlilik Politikası ve KVKK Aydınlatma Metni'nde açıklanan amaç ve yöntemlerle işlenir.",
      "Ödeme sırasında girilen kart bilgileri satıcıya iletilmez; ödeme kuruluşunun altyapısında işlenir ve satıcı tarafından saklanmaz.",
    ],
  },
  {
    heading: "Uyuşmazlıkların çözümü",
    body: [
      `Alıcı, talep ve şikâyetlerini ${sellerField("email")} adresine ya da site içindeki Destek sayfasına iletebilir.`,
      "Uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dâhilinde alıcının yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.",
    ],
  },
  {
    heading: "Yürürlük",
    body: [
      "Alıcının ödeme adımındaki onay kutusunu işaretleyip ödemeyi tamamlamasıyla bu sözleşme kurulmuş ve yürürlüğe girmiş olur.",
      "Sözleşmenin bir örneği alıcının hesabına bağlı olarak saklanır ve Ödemelerim sayfasından her zaman görüntülenebilir.",
    ],
  },
];

export const CANCELLATION_SECTIONS = [
  {
    heading: "Cayma hakkı",
    body: [
      "Cortex Plus, elektronik ortamda anında ifa edilen bir dijital hizmettir: satın alma tamamlandığı anda kullanım hakkı hesaba geçer ve hizmet açılır.",
      "Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) bendi uyarınca bu tür hizmetlerde cayma hakkı kullanılamaz. Satın alma sırasında bu bilgilendirme yapılır ve onayınız alınır.",
    ],
  },
  {
    heading: "Aboneliğin sona ermesi",
    body: [
      "Abonelikler otomatik yenilenmez. Satın aldığınız dönem sona erdiğinde hesabınızdan kendiliğinden tahsilat yapılmaz.",
      "Dönem boyunca hizmet açık kalır; süre bitince hesap ücretsiz katmana döner ve çalışmalarınız durur.",
    ],
  },
  {
    heading: "Kredi iadesi",
    body: [
      "Teknik bir arıza nedeniyle tamamlanamayan işlemlerde harcanan kredi, talep gerekmeksizin otomatik olarak geri verilir.",
      "Yapay zekâ öğretmeni, yüklediğiniz kaynakta karşılığı olmayan bir soruya cevap vermek yerine durumu bildirir. Bu durumda o soru için kredi düşülmez.",
      "Bunlar kredi iadesidir; ödenen tutarın geri ödenmesi anlamına gelmez.",
    ],
  },
  {
    heading: "Hatalı veya yetkisiz işlem",
    body: [
      "Hesabınızdan bilginiz dışında bir işlem yapıldığını düşünüyorsanız ya da tahsilat hatalıysa, Destek sayfasından ya da e-posta ile bize yazın.",
      "Her talep tek tek incelenir. Haklı bulunan işlemlerde tutar, ödemenin yapıldığı karta iade edilir; iadenin kartınıza yansıması bankanıza bağlı olarak birkaç iş günü sürebilir.",
    ],
  },
];

export const DELIVERY_SECTIONS = [
  {
    heading: "Hizmet nasıl sunulur",
    body: [
      "Cortex Plus dijital bir hizmettir. Fiziki ürün gönderimi, kargo ve teslimat süreci yoktur.",
      "Ödeme onaylandığı anda satın aldığınız kullanım hakkı hesabınıza tanımlanır ve hizmet derhal açılır. Ayrıca bir bekleme süresi yoktur.",
    ],
  },
  {
    heading: "Kullanım hakkı ne zaman görünür",
    body: [
      "Ödeme kuruluşundan gelen onay bildirimi işlendiğinde kredi bakiyeniz güncellenir ve hesabınıza bildirim düşer.",
      "Ödeme tamamlandığı hâlde bakiyeniz birkaç dakika içinde güncellenmezse Destek sayfasından bize yazın; işlemi kaydından takip edip tamamlarız.",
    ],
  },
  {
    heading: "Erişim için gerekenler",
    body: [
      "Hizmete internet bağlantısı olan güncel bir tarayıcıdan erişilir. Ayrı bir uygulama indirmeniz gerekmez.",
      "Sesli anlatım ve sözlü pratik için cihazınızda ses çıkışı, sözlü pratikte ayrıca mikrofon gereklidir.",
    ],
  },
];
