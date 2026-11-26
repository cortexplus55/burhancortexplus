import { sellerField } from "@/lib/legal/seller";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";

/**
 * Kullanım Koşulları. Ürünün bugünkü davranışına göre yazıldı: ücretsiz hesapta ilk hazırlığın ilk ders döngüsü süresiz
 * açık, sohbet ve fotoğraf sayaçla (21 Kasım 2026: kota cümlesi satış sözleşmeleriyle aynı merkezden, `plan-copy.ts`;
 * eski "haftalık ders" sınırı 11 Kasım 2026'da kalkmıştı), otomatik yenileme yok (`AUTO_RENEW_SUPPORTED = false`), en çok iki cihaz, sıralamada ad +
 * soyadın baş harfi + okul. Eski metindeki "kredi bedelleri işlem öncesinde gösterilir" cümlesi kaldırıldı:
 * öğrenci 19 Ekim 2026'dan beri kredi sayısı görmüyor, söz tutulmuyordu.
 *
 * 26 Kasım 2026 (mağaza uyumluluğu): web satışı (PayTR, yenilenmez) ile mobil uygulamadaki mağaza aboneliği (App Store /
 * Google Play, otomatik yenilenir, 24 saat kuralı, mağazadan iptal ve iade) ayrı yazıldı; "Bildir" ve yapay zekâ
 * içeriğinin resmî sınav, tıbbi ya da hukuki tavsiye yerine geçmediği eklendi; giriş yapmadan silme yolu yazıldı.
 * Uygulamadaki abonelik ekranının cümleleri `store-products.ts` `storeRenewalTerms` ile aynı kuralı söyler.
 *
 * Metin değişince `LEGAL_VERSIONS.kullanim_kosullari` de değişir; öğrenci bir sonraki girişte yeniden onaylar.
 */

export const TERMS_VERSION = LEGAL_VERSIONS.kullanim_kosullari;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "Taraflar ve kapsam",
    body: [
      `Bu koşullar, ${sellerField("legalName")} (şahıs işletmesi, "Cortex Plus") ile cortexplus.app üzerinden ya da Cortex Plus mobil uygulamasıyla hesap açan veya hizmeti kullanan kişi arasındadır. Hesap açarak bu koşulları kabul etmiş olursun.`,
      "Web sitesinden ücretli bir plan satın aldığında ayrıca Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi uygulanır.",
      "Mobil uygulamayı App Store ya da Google Play'den indirdiysen uygulamayı kullanırken bu koşulların yanında indirdiğin mağazanın kendi kullanım koşulları da uygulanır.",
    ],
  },
  {
    heading: "Hesap",
    body: [
      "Hesabını doğru bilgilerle açman ve şifreni gizli tutman gerekir. Hesabın üzerinden yapılan işlemlerden sen sorumlusun.",
      "Her kişi kendi hesabını kullanır; hesabını başkasıyla paylaşamazsın. Hesap aynı anda en çok iki cihazda açık kalır; üçüncü cihazda giriş yapılınca en eski oturum kapanır.",
    ],
  },
  {
    heading: "18 yaşından küçük kullanıcılar",
    body: [
      "18 yaşından küçüksen hesabını velinin (anne, baba ya da yasal temsilcinin) bilgisi ve izniyle açarsın; kayıtta bunu beyan edersin.",
      "Ücretli bir plan satın almak için velinin onayı gerekir. Web sitesinde velin ödemeyi \"Velime ödeme linki\" ile kendisi de yapabilir.",
      "Velin istediği zaman hesabının kapatılmasını isteyebilir.",
    ],
  },
  {
    heading: "Ücretsiz ve ücretli kullanım",
    body: [
      `${PLAN_MARKETING_COPY.legalUsage} Güncel sınırlar ve fiyatlar fiyatlandırma sayfasında yazar.`,
      "Bir iş teknik bir arıza yüzünden tamamlanamazsa kullandığın hak kendiliğinden geri verilir.",
      "Web sitesinde ödemeler PayTR altyapısıyla alınır; kart bilgilerin bize gelmez ve bizde saklanmaz. Mobil uygulamada satın alma yalnız App Store ya da Google Play üzerinden yapılır ve ödemeyi mağaza alır.",
      "Satın aldığın plan hesabına tanımlanır; aynı hesapla girdiğin her yerde açık olur.",
    ],
  },
  {
    heading: "Cayma hakkı ve iade",
    body: [
      "Cortex Plus anında sunulan dijital bir hizmettir: ödeme onaylandığı anda hak hesabına geçer ve hizmet kullanıma açılır. Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) ve (h) bentleri uyarınca bu tür hizmetlerde cayma hakkı kullanılamaz. Web sitesindeki ödeme adımında hizmetin hemen başlamasını istediğini ayrı bir kutuyla onaylarsın.",
      "Web sitesinden alınan abonelikler otomatik olarak yenilenmez: dönem sona erdiğinde hesabından kendiliğinden tahsilat yapılmaz, devam etmek istersen yeni bir satın alma yaparsın. Ödediğin dönem sonuna kadar hizmet açık kalır.",
      "Web sitesinden yapılan bir ödemede hatalı ya da yetkisiz bir işlem olduğunu düşünüyorsan Destek sayfasından \"Ödeme ve iade\" konusuyla yaz; her talebi tek tek inceleriz. Haklı bulunan işlemde tutar ödemenin yapıldığı karta iade edilir.",
    ],
  },
  {
    heading: "Mobil uygulamada mağaza aboneliği",
    body: [
      "Mobil uygulamada App Store ya da Google Play üzerinden satın aldığın abonelik (Sınav Haftası haftalık, Plus ve Sigma aylık) mağaza hesabın üzerinden ücretlendirilir; fiyat ve dönem satın alma ekranında yazar.",
      "Bu abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse aynı süre ve aynı fiyatla otomatik olarak yenilenir; yenileme ücreti dönemin bitişinden önceki 24 saat içinde mağaza tarafından alınır.",
      "Otomatik yenilemeyi App Store ya da Google Play'in abonelik ayarlarından istediğin an kapatabilirsin; iptal, içinde bulunduğun dönemin sonunda geçerli olur ve dönem sonuna kadar planın açık kalır. Kullanılmayan süre için kısmi iade yapılmaz.",
      "Mağazadan yapılan satın almaların iadesi Apple'ın ya da Google'ın iade kurallarına göre, satın aldığın mağaza üzerinden istenir.",
      "Hesabını silmek mağaza aboneliğini kendiliğinden iptal etmez; aboneliği mağazanın abonelik ayarlarından ayrıca iptal etmelisin.",
    ],
  },
  {
    heading: "Yüklediğin içerik",
    body: [
      "Yalnız kullanma hakkın olan içerikleri yükle: kendi notların, öğretmeninin verdiği materyal ya da kişisel çalışman için kullandığın ders kitabı sayfaları gibi.",
      "Başkalarının kişisel verilerini (ör. arkadaşlarının adları, telefon numaraları, sağlık bilgileri) gereksiz yere yükleme.",
      "Yüklediğin içerik yalnız senin hesabında işlenir ve başka kullanıcılarla paylaşılmaz. İçeriğin üzerindeki haklar sende kalır; hizmeti sunmamız için gereken kadarıyla işlememize izin verirsin.",
    ],
  },
  {
    heading: "Yapay zekâ içerikleri",
    body: [
      "Dersler, testler, podcast'ler ve cevaplar yapay zekâyla üretilir. Denetimden geçirilseler de hata içerebilirler. Bir hata görürsen soruda \"Hata bildir\"i, öğretmen sohbetinde yanıtın altındaki \"Bildir\"i kullan.",
      "Yapay zekâ içerikleri çalışmana yardım eder; resmî sınav kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez. Önemli kararlarda (sınav, sağlık, hukuk gibi) içeriği kaynağından doğrula.",
    ],
  },
  {
    heading: "Kabul edilebilir kullanım",
    body: [
      "Hizmeti yasa dışı amaçlarla, başkalarının haklarını ihlal edecek ya da sistemin güvenliğini tehdit edecek şekilde kullanamazsın.",
      "Sistemi otomatik araçlarla zorlamak, hakları kötüye kullanmak için birden çok hesap açmak ya da başkasının hesabına girmek yasaktır.",
      "Sınav kurallarına aykırı kullanım (ör. sınav sırasında kopya) senin sorumluluğundadır.",
    ],
  },
  {
    heading: "Yıldızlar ve sıralama",
    body: [
      "Sıralamada adın, soyadının baş harfi ve okulun diğer öğrencilere görünür; istersen yıldızlar penceresinden gizleyebilirsin. 18 yaşından küçük kullanıcılarda görünürlük kapalı başlar.",
    ],
  },
  {
    heading: "Fikri haklar",
    body: ["Platformun arayüzü, metinleri ve yazılımı Cortex Plus'a aittir; izin almadan kopyalanamaz ya da çoğaltılamaz."],
  },
  {
    heading: "Hesabın askıya alınması ve kapatılması",
    body: [
      "Bu koşulların ihlali hâlinde hesabın askıya alınabilir ya da kapatılabilir.",
      "Hesabını Ayarlar'dan ya da giriş yapmadan cortexplus.app/hesap-silme sayfasından istediğin zaman kalıcı olarak silebilirsin; verilerin KVKK Aydınlatma Metni'nde yazıldığı şekilde silinir.",
    ],
  },
  {
    heading: "Sorumluluğun sınırı",
    body: [
      "Hizmeti özenle sunarız ama her an kesintisiz ve hatasız olacağını garanti edemeyiz. Altyapı sağlayıcısından kaynaklanan kesintilerde hizmeti makul sürede geri getirmek için gereken özeni gösteririz.",
      "Tüketici olarak kanundan doğan hakların saklıdır.",
    ],
  },
  {
    heading: "Değişiklikler",
    body: [
      `Koşulları güncellersek sürüm tarihi değişir. Önemli değişikliklerde bir sonraki girişinde yeni metni gösterir ve onayını isteriz; onaylamak istemezsen hesabını kapatabilirsin. Bu metnin sürümü: ${TERMS_VERSION}.`,
    ],
  },
  {
    heading: "Uyuşmazlıklar",
    body: [
      `Talep ve şikâyetlerini ${sellerField("email")} adresine ya da Destek sayfasına iletebilirsin.`,
      "Bu koşullara Türk hukuku uygulanır. Tüketici uyuşmazlıklarında Ticaret Bakanlığı'nın ilan ettiği parasal sınırlar içinde Tüketici Hakem Heyetleri, bu sınırların üzerinde Tüketici Mahkemeleri yetkilidir.",
    ],
  },
];
