import { SELLER, sellerField } from "@/lib/legal/seller";
import { CROSS_BORDER_SCC_NOTIFIED } from "@/lib/legal/compliance-flags";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";

/**
 * KVKK Aydınlatma Metni — 6698 sayılı Kanun m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve
 * Esaslar Hakkında Tebliğ'e göre. Tebliğ'in istediği beş unsur: veri sorumlusunun kimliği, işleme amaçları, kimlere
 * ve hangi amaçla aktarıldığı, toplama yöntemi ve hukuki sebebi, m.11 hakları. Kurul'un çocuk verisi rehberi (2025)
 * ayrıca çocuğun anlayacağı dilde kısa bir özet istiyor: `KVKK_SUMMARY`.
 *
 * Her cümle ürünün bugünkü davranışına dayanır (ses kaydı saklanmaz → yazıya çevirme ucu kaydetmez; analitik
 * yalnız izinle → `analytics.tsx`; kart bilgisi gelmez → PayTR iFrame). Bir davranış değişirse metin ve
 * `LEGAL_VERSIONS.kvkk_aydinlatma` birlikte değişir.
 *
 * Aydınlatma bir onay değil, bilgilendirmedir: öğrenci "okudum ve anladım" der. Açık rıza yalnız analitik çerezler
 * için istenir ve ayrı yerde (çerez tercihi) alınır; iki metin birbirine bağlanmaz.
 */

export const KVKK_VERSION = LEGAL_VERSIONS.kvkk_aydinlatma;

/** Kısaca — 12 yaşındaki bir öğrencinin bir dakikada okuyabileceği özet. Asıl metnin yerini tutmaz. */
export const KVKK_SUMMARY: string[] = [
  `Cortex Plus'ı ${SELLER.legalName} (şahıs işletmesi) sunar; verilerinden o sorumludur.`,
  "Hesabını açmak, sana ders hazırlamak ve ilerlemeni göstermek için adını, e-postanı, sınıfını, yüklediğin notları ve verdiğin cevapları kullanırız.",
  "Notlarını ve sorularını, ders hazırlaması için yapay zekâ hizmetine (OpenAI) göndeririz. OpenAI bunları kendi yapay zekâsını eğitmek için kullanmaz.",
  "Verilerini satmayız ve reklam için kullanmayız.",
  "Site ziyaretini ölçen analitik çerezler yalnız sen izin verirsen çalışır; izin vermesen de site tamamen çalışır.",
  "18 yaşından küçüksen bu metni velinle birlikte oku. İstediğin zaman verilerini sorabilir, düzeltilmesini isteyebilir ya da hesabını silebilirsin.",
];

const transferBasis = CROSS_BORDER_SCC_NOTIFIED
  ? "Bu sağlayıcıların bir kısmının sunucuları ya da merkezleri yurt dışındadır. Yurt dışına aktarım, KVKK'nın 9. maddesi uyarınca Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşmeler imzalanarak ve Kurul'a bildirilerek, yalnız hizmetin gerektirdiği kadar yapılır."
  : "Bu sağlayıcıların bir kısmının sunucuları ya da merkezleri yurt dışındadır; bu nedenle verilerin yurt dışına aktarılır. Aktarım yalnız hizmetin gerektirdiği kadardır ve sağlayıcılarla yapılan veri işleme sözleşmelerine dayanır.";

export const KVKK_SECTIONS: LegalSection[] = [
  {
    heading: "Veri sorumlusu",
    body: [
      `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verilerin, veri sorumlusu sıfatıyla ${sellerField("legalName")} (şahıs işletmesi, "Cortex Plus") tarafından işlenir.`,
      `Adres: ${sellerField("address")}`,
      `E-posta: ${sellerField("email")}${SELLER.phone.trim() ? ` · Telefon: ${SELLER.phone.trim()}` : ""}`,
    ],
  },
  {
    heading: "Hangi verileri işliyoruz",
    body: [
      "Kimlik ve iletişim: ad soyad ve e-posta adresi. Google ile girersen Google'ın bize ilettiği ad ve e-posta adresi.",
      "Öğrenim bilgileri: sınıfın, hedef sınavın, yazarsan okulun, anlatım tercihin, çalışma tercihlerin ve sınav tarihin.",
      "Yüklediğin içerik: ders notların, belgelerin ve fotoğrafların ile bunlardan çıkarılan metin.",
      "Öğrenme kayıtları: sohbet mesajların, test ve deneme cevapların, puanların, ilerlemen, yanlışların, yıldızların ve bunlardan otomatik çıkarılan kısa öğrenme özeti.",
      "Sesli kullanım: sesli derste ve sözlü pratikte söylediklerin yazıya çevrilir; ses kaydı saklanmaz.",
      "Ödeme ve abonelik: satın aldığın plan, tutar, ödeme durumu ve tarihleri. Kart bilgilerin bize gelmez; ödeme kuruluşu işler.",
      "Destek ve geri bildirim: destek taleplerin, anket cevapların ve sana gönderdiğimiz bildirimler.",
      "İşlem güvenliği: oturum ve cihaz kayıtları, giriş zamanları, IP adresinin tek yönlü özeti ve hata kayıtları.",
      "Velime ödeme bağlantısıyla ödeme yapılırsa velinin e-posta adresi ödeme makbuzu için ödeme kuruluşuna iletilir ve sözleşme örneği bu adrese gönderilir; adres bizde saklanmaz.",
      "Çerez ve benzeri teknolojilerle toplanan veriler Çerez Politikası'nda ayrıca yazılıdır.",
    ],
  },
  {
    heading: "Verileri hangi amaçla işliyoruz",
    body: [
      "Hesabını açmak ve korumak; seni tanımak ve giriş yapmanı sağlamak.",
      "Yüklediğin notlardan ya da seçtiğin konudan ders, test, kart, podcast, sözlü pratik ve çalışma planı hazırlamak; cevaplarını değerlendirmek ve ilerlemeni göstermek.",
      "Ödemeleri almak, aboneliğini yönetmek, iade ve itirazları sonuçlandırmak, fatura ve muhasebe yükümlülüklerini yerine getirmek.",
      "Destek taleplerini cevaplamak, sana hizmetle ilgili bildirim ve hatırlatma göndermek.",
      "Hizmetin güvenliğini sağlamak: kötüye kullanımı, sahte hesabı ve otomatik saldırıları önlemek, hataları bulup düzeltmek.",
      "İzin verirsen, hangi sayfaların ve özelliklerin kullanıldığını ölçerek hizmeti geliştirmek.",
      "Yasal yükümlülükleri yerine getirmek ve yetkili kurumların kanuni taleplerini karşılamak.",
    ],
  },
  {
    heading: "Hukuki sebepler",
    body: [
      "Sözleşmenin kurulması ve ifası (KVKK m.5/2-c): hesap, ders ve içerik üretimi, ilerleme, ödeme, destek.",
      "Hukuki yükümlülük (m.5/2-ç): vergi ve ticaret mevzuatı gereği ödeme kayıtları, elektronik ticaret mevzuatındaki yükümlülükler, yetkili kurumların talepleri.",
      "Bir hakkın tesisi, kullanılması veya korunması (m.5/2-e): bir uyuşmazlıkta kanıt olacak onay ve ödeme kayıtları.",
      "Meşru menfaat (m.5/2-f): güvenlik, kötüye kullanımın önlenmesi, hız sınırı, cihaz sınırı ve hata izleme; temel haklarına zarar vermeyecek ölçüde.",
      "Açık rıza (m.5/1): yalnız analitik çerezler için. İzin vermemek hizmetten yararlanmanı engellemez; iznini istediğin zaman geri alabilirsin.",
    ],
  },
  {
    heading: "Verileri nasıl topluyoruz",
    body: [
      "Kayıt formundan, uygulamadaki ekranlardan, yüklediğin dosyalardan, Google ile girmeyi seçersen Google'dan, ödeme yaptığında ödeme kuruluşunun bildirimlerinden ve çerezlerden; elektronik ortamda, otomatik ve kısmen otomatik yollarla.",
    ],
  },
  {
    heading: "Verileri kimlere aktarıyoruz",
    body: [
      "Verilerini satmayız, reklam ağlarıyla paylaşmayız. Yalnız hizmeti sunmak için çalıştığımız sağlayıcılara, işin gerektirdiği kadarını aktarırız:",
      "Supabase — veritabanı, dosya depolama ve oturum (sunucular Almanya, Frankfurt; şirket ABD).",
      "Vercel — sitenin barındırılması (işlem Almanya, Frankfurt bölgesinde; içerik dağıtım ağı küresel; şirket ABD).",
      "OpenAI — ders, test ve podcast üretimi, sohbet, fotoğraf okuma, seslendirme ve konuşmayı yazıya çevirme (ABD). OpenAI, bu yolla gönderilen içeriği kendi modellerini eğitmek için kullanmaz; kötüye kullanım denetimi için en çok 30 gün saklayabilir.",
      "Google — e-posta gönderimi ve Google ile giriş (ABD). E-posta gönderiminde Resend de kullanılabilir (ABD).",
      "Upstash — hız sınırı ve kısa süreli kilit kayıtları (kullanıcı kimliği ve IP özeti).",
      "Sentry — hata kayıtları; kişisel veriler ayıklanarak gönderilir.",
      "PostHog — yalnız analitik çerezlere izin verirsen, sayfa ve özellik kullanım sayıları (Avrupa Birliği sunucuları).",
      "PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. — ödemenin alınması ve iadesi (Türkiye).",
      "Yetkili kamu kurum ve kuruluşları — yalnız kanunen zorunlu olduğunda.",
      transferBasis,
      "Sıralamada (yıldızlar) diğer öğrenciler adını, soyadının baş harfini ve okulunu görebilir; istersen yıldızlar penceresinden gizlersin. 18 yaşından küçük kullanıcılarda bu görünürlük kapalı başlar.",
      "Bir hazırlığı okul ağında ya da sınıf bağlantısıyla paylaşırsan yalnız başlığı, tarihi ve konu adları paylaşılır; belgelerin, cevapların ve puanların paylaşılmaz.",
    ],
  },
  {
    heading: "Otomatik değerlendirme",
    body: [
      "Test ve deneme puanların, hazır olma tahminin ve sana önerilen çalışma yolu otomatik sistemlerle hesaplanır. Bir soruda hata görürsen soruda \"Hata bildir\"i kullanabilirsin.",
      "Otomatik bir sonuca itiraz etmek istersen Destek sayfasından bize yaz; itirazını bir kişi inceler.",
    ],
  },
  {
    heading: "Ne kadar saklıyoruz",
    body: [
      "Hesabın açık kaldıkça. Hesabını Ayarlar'dan silersen belgelerin, sohbetlerin, cevapların ve ilerlemen hemen silinmeye başlar; yarım kalan adımlar her gün otomatik olarak yeniden denenir.",
      "Ödeme yapılmış hesaplarda ödeme kayıtları vergi ve ticaret mevzuatının öngördüğü süre (10 yıla kadar) saklanır; bu yüzden giriş kapatılır, e-posta adresi anonimleştirilir, ödeme kaydı kalır.",
      "Hangi metni ne zaman onayladığının kaydı, olası bir uyuşmazlıkta kanıt olarak hesabınla (ödeme kaydı varsa onunla) birlikte saklanır.",
      "Hız sınırı ve kilit kayıtları dakikalar ya da günler içinde kendiliğinden silinir; hata kayıtları hata izleme hizmetinde en çok 90 gün tutulur. Çerezlerin süreleri Çerez Politikası'nda yazar.",
    ],
  },
  {
    heading: "18 yaşından küçük kullanıcılar",
    body: [
      "Cortex Plus'ı ortaokul ve lise öğrencileri de kullanır. 18 yaşından küçüksen hesabını velinin (anne, baba ya da yasal temsilcinin) bilgisi ve izniyle açmalısın; kayıtta bunu beyan edersin.",
      "Çocuklardan yalnız hizmet için gereken verileri isteriz; okul adı gibi alanlar zorunlu değildir. Adın sıralamada kapalı başlar ve analitik çerezler izin verilmeden çalışmaz.",
      "Velin, senin adına haklarını kullanmak ya da hesabının kapatılmasını istemek için bize yazabilir; velilik ilişkisini doğrulamak için bilgi isteyebiliriz.",
    ],
  },
  {
    heading: "Haklarınız (KVKK m.11)",
    body: [
      "a) Kişisel verilerinin işlenip işlenmediğini öğrenme,",
      "b) İşlenmişse buna ilişkin bilgi talep etme,",
      "c) İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,",
      "ç) Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,",
      "d) Eksik veya yanlış işlenmişse düzeltilmesini isteme,",
      "e) KVKK m.7'deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,",
      "f) (d) ve (e) bentleri uyarınca yapılan işlemlerin, verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,",
      "g) Münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhine bir sonucun ortaya çıkmasına itiraz etme,",
      "ğ) Kanuna aykırı işlenmesi sebebiyle zarara uğrarsan zararın giderilmesini talep etme.",
    ],
  },
  {
    heading: "Nasıl başvurursun",
    body: [
      `Hesabındayken Destek sayfasında "Kişisel veri başvurusu" konusunu seçerek, kayıtlı e-posta adresinden ${sellerField("email")} adresine yazarak ya da yukarıdaki adrese yazılı olarak başvurabilirsin. Başvuruda adını soyadını ve talebini açıkça yaz.`,
      "Başvurunu en geç 30 gün içinde ve kural olarak ücretsiz sonuçlandırırız; işlem ayrıca bir maliyet gerektirirse Kurul'un belirlediği tarife uygulanabilir.",
      "Başvurun reddedilirse, cevabı yetersiz bulursan ya da süresinde cevap alamazsan Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsin.",
      "Hesabını ve verilerini Ayarlar'dan kendin de silebilirsin; analitik çerez iznini sayfanın altındaki \"Çerez tercihleri\"nden geri alabilirsin.",
    ],
  },
  {
    heading: "Bu metindeki değişiklikler",
    body: [
      `Metni güncellersek sürüm tarihi değişir; önemli değişikliklerde bir sonraki girişinde yeni metni gösterir ve okuduğunu yeniden onaylamanı isteriz. Bu metnin sürümü: ${KVKK_VERSION}.`,
    ],
  },
];
