import { SELLER, sellerField } from "@/lib/legal/seller";

/**
 * Hukuki metinler — Mesafeli Sözleşmeler Yönetmeliği'ne göre.
 *
 * Bu metinler ÜRÜNÜN GERÇEK DAVRANIŞINA göre yazıldı, hazır şablondan
 * kopyalanmadı. Her madde kodda bir karşılığa dayanıyor:
 *
 *   hizmet anında sunulur        -> ödeme geri çağrısı krediyi hemen yüklüyor
 *   cayma hakkı doğmuyor         -> m.15/1-ğ ve h; hemen başlama ayrı kutuyla (performanceConsent)
 *   sözleşmenin örneği           -> ödeme onayında e-posta + Ödemelerim (purchase-contract.ts)
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

/*
  Satıcı kimliği bloğu.

  Bilerek yayınlanmayan alan için SATIR HİÇ YAZILMIYOR — "[doldurulacak]"
  yazılmıyor. 17 Eylül 2026'da tam bu hata yayına çıktı: telefon ve vergi
  numarası ürün kararıyla boş bırakılmıştı, `missingSellerFields()` bunları
  eksik saymıyordu (kırmızı uyarı yoktu), ama sözleşme metni yine
  "Telefon: [doldurulacak]" ve "Vergi dairesi / numarası: Bafra /
  [doldurulacak]" diye basıyordu.

  Sonuç her iki seçenekten de kötüydü: müşteriye sunulan bağlayıcı metin
  yarım görünüyor ve göz tam olarak yayınlamamayı seçtiğimiz iki şeye
  gidiyor. Boş bir alanın doğru karşılığı, o satırın olmamasıdır.

  `sellerField()` yine "[doldurulacak]" döndürüyor ve bu doğru: gerçekten
  zorunlu ama girilmemiş bir alan (ad, adres, e-posta, vergi dairesi)
  metinde görünmek zorunda. Ayrım şu — zorunlu alan eksikse haykırır,
  bilerek yayınlanmayan alan susar.
*/
const SELLER_BLOCK = () => {
  const lines = [
    `Satıcı: ${sellerField("legalName")}`,
    `Adres: ${sellerField("address")}`,
  ];
  if (SELLER.phone.trim()) lines.push(`Telefon: ${SELLER.phone.trim()}`);
  lines.push(`E-posta: ${sellerField("email")}`);
  lines.push(
    SELLER.taxNumber.trim()
      ? `Vergi dairesi / numarası: ${sellerField("taxOffice")} / ${SELLER.taxNumber.trim()}`
      : `Vergi dairesi: ${sellerField("taxOffice")}`,
  );
  lines.push(`İnternet sitesi: ${SELLER.website}`);
  return lines;
};

const SERVICE_DESC = [
  "Hizmetin konusu: Cortex Plus, öğrencinin yüklediği ders materyalinden ya da seçtiği konudan yapay zekâ ile çalışma içeriği üreten bir internet hizmetidir. Üretilen içerikler anlatım, konu haritası, test, sesli anlatım (podcast) ve sözlü pratiktir.",
  "Hizmet, kullanım hakkı üzerinden sunulur. Ücretli planlarda dönem için tanımlı hak işlemlerde harcanır ve kalan hak yüzde olarak gösterilir. Ücretsiz hesapta haftalık ders, günlük sohbet mesajı ve günlük fotoğraftan çözüm sayısı sınırlıdır; podcast, sözlü ve yazılı deneme, video ders ve sesli kullanım ücretli planlarda sunulur.",
  "Abonelikler belirli bir dönem için satılır ve o dönemde tanımlı kullanım hakkını açar. Kredi paketleri tek seferlik alımdır ve bakiyeye eklenir.",
];

/*
  Cayma hakkının istisnası (7 Kasım 2026): yalnız (ğ) bendine dayanmak yetersizdi. (h) bendi "cayma süresi dolmadan
  tüketicinin onayıyla ifasına başlanan hizmet"i sayar ve bu onayın AYRI ve açık alınması gerekir; sözleşme
  kutusunun içine gömülü bir cümle yetmez. Ödeme adımında ikinci kutu: `PERFORMANCE_CONSENT_TEXT`. Sunucu
  (`performanceConsent: z.literal(true)`) bu kutu olmadan ödemeyi başlatmaz.
*/
const CAYMA_RULE =
  "Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) bendi uyarınca elektronik ortamda anında ifa edilen hizmetlerde ve tüketiciye anında teslim edilen gayrimaddi mallarda, (h) bendi uyarınca da cayma süresi dolmadan tüketicinin onayıyla ifasına başlanan hizmetlerde cayma hakkı kullanılamaz.";

/** Ödeme adımındaki ikinci kutu: hizmetin hemen başlaması talebi ve cayma hakkının bulunmadığının bilgisi. */
export const PERFORMANCE_CONSENT_TEXT =
  "Hizmetin hemen başlamasını istiyorum. Ödeme onaylanınca hak hesaba hemen tanımlandığı için cayma hakkımın bulunmadığını biliyorum.";

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
      CAYMA_RULE,
      "Cortex Plus hizmeti bu kapsamdadır: satın alma tamamlandığı anda kullanım hakkı hesaba geçer ve hizmet açılır. Bu nedenle satın alma sonrasında cayma hakkı doğmaz.",
      "Alıcı, ödeme adımında bu formu ve Mesafeli Satış Sözleşmesi'ni okuduğunu bir kutuyla; hizmetin hemen başlamasını istediğini ve bu nedenle cayma hakkının bulunmadığını bildiğini ayrı bir kutuyla onaylar. İkinci kutu işaretlenmeden ödeme başlamaz.",
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
      "Alıcı, hizmeti bir başka kullanıcının (örneğin velisi olduğu öğrencinin) hesabı için de satın alabilir. Bu durumda ödemeyi yapan alıcı, kullanım hakkının tanımlandığı hesap ise ödeme bağlantısında belirtilen öğrenci hesabıdır; sözleşmenin tarafı ödemeyi yapan alıcıdır.",
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
      "Hizmet dijitaldir; fiziki teslimat yapılmaz. Ödeme onaylandığı anda kullanım hakkı alıcının hesabına (bir öğrenci için ödendiyse o öğrencinin hesabına) tanımlanır ve hizmet derhal kullanıma açılır.",
      "Abonelik süresi, ödemenin onaylandığı tarihte başlar ve satın alınan paketin süresi kadar devam eder. Süre sonunda kendiliğinden yenilenmez.",
      "Mücbir sebep, altyapı sağlayıcısı kaynaklı kesinti ya da alıcının internet erişiminden kaynaklanan aksaklıklar nedeniyle hizmete erişilememesi hâlinde satıcı, makul sürede gidermek için gereken özeni gösterir.",
    ],
  },
  {
    heading: "Cayma hakkının bulunmaması",
    body: [
      CAYMA_RULE,
      "Alıcı, ödeme adımında hizmetin derhal ifasına başlanmasını ayrı bir onay kutusuyla açıkça talep eder ve bu nedenle cayma hakkının bulunmadığını bildiğini kabul eder.",
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
      "Alıcının ödeme adımındaki onay kutularını işaretleyip ödemeyi tamamlamasıyla bu sözleşme kurulmuş ve yürürlüğe girmiş olur.",
      "Ödeme onaylanınca sözleşmenin ve Ön Bilgilendirme Formu'nun satın alma bilgileriyle birlikte bir örneği hesabın e-posta adresine gönderilir; aynı örnek Ödemelerim sayfasından her zaman görüntülenebilir.",
    ],
  },
];

export const CANCELLATION_SECTIONS = [
  {
    heading: "Cayma hakkı",
    body: [
      "Cortex Plus, elektronik ortamda anında ifa edilen bir dijital hizmettir: satın alma tamamlandığı anda kullanım hakkı hesaba geçer ve hizmet açılır.",
      "Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) ve (h) bentleri uyarınca bu tür hizmetlerde cayma hakkı kullanılamaz. Satın alma sırasında bu bilgilendirme yapılır; hizmetin hemen başlamasını istediğiniz ayrı bir kutuyla onaylanmadan ödeme başlamaz.",
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
  {
    heading: "İade talebi nasıl işler",
    body: [
      "Destek sayfasında \"Ödeme ve iade\" konusunu seçip yazın; hangi ödeme olduğunu ve nedenini kısaca belirtin.",
      "Talep onaylanırsa iade ödeme kuruluşu üzerinden ödemenin yapıldığı karta gönderilir. Tam iadede üyelik sona erer ya da süresi iade edilen kadar kısalır; üyelik bitince hesap ücretsiz katmana döner, çalışmalarınız silinmez. Kısmi iadede üyelik devam eder.",
      "İade yapıldığında uygulama içinde bildirim ve hesabınızın e-posta adresine bilgi gönderilir.",
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
