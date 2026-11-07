import { sellerField } from "@/lib/legal/seller";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";

/**
 * Kullanım Koşulları. Ürünün bugünkü davranışına göre yazıldı: ücretsiz katman sayaçla (haftalık ders, günlük
 * mesaj ve fotoğraf), otomatik yenileme yok (`AUTO_RENEW_SUPPORTED = false`), en çok iki cihaz, sıralamada ad +
 * soyadın baş harfi + okul. Eski metindeki "kredi bedelleri işlem öncesinde gösterilir" cümlesi kaldırıldı:
 * öğrenci 19 Ekim 2026'dan beri kredi sayısı görmüyor, söz tutulmuyordu.
 *
 * Metin değişince `LEGAL_VERSIONS.kullanim_kosullari` de değişir; öğrenci bir sonraki girişte yeniden onaylar.
 */

export const TERMS_VERSION = LEGAL_VERSIONS.kullanim_kosullari;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "Taraflar ve kapsam",
    body: [
      `Bu koşullar, ${sellerField("legalName")} (şahıs işletmesi, "Cortex Plus") ile cortexplus.app üzerinden hesap açan ya da hizmeti kullanan kişi arasındadır. Hesap açarak bu koşulları kabul etmiş olursun.`,
      "Ücretli bir plan satın aldığında ayrıca Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi uygulanır.",
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
      "Ücretli bir plan satın almak için velinin onayı gerekir. Velin ödemeyi \"Velime ödeme linki\" ile kendisi de yapabilir.",
      "Velin istediği zaman hesabının kapatılmasını isteyebilir.",
    ],
  },
  {
    heading: "Ücretsiz ve ücretli kullanım",
    body: [
      "Ücretsiz hesapta haftalık ders, günlük sohbet mesajı ve günlük fotoğraftan çözüm sayısı sınırlıdır; bazı özellikler (podcast, sözlü ve yazılı deneme, video ders, sesli kullanım) yalnız ücretli planlarda açılır. Güncel sınırlar ve fiyatlar fiyatlandırma sayfasında yazar.",
      "Bir iş teknik bir arıza yüzünden tamamlanamazsa kullandığın hak kendiliğinden geri verilir.",
      "Ödemeler PayTR altyapısıyla alınır; kart bilgilerin bize gelmez ve bizde saklanmaz.",
    ],
  },
  {
    heading: "Cayma hakkı ve iade",
    body: [
      "Cortex Plus anında sunulan dijital bir hizmettir: ödeme onaylandığı anda hak hesabına geçer ve hizmet kullanıma açılır. Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin birinci fıkrasının (ğ) ve (h) bentleri uyarınca bu tür hizmetlerde cayma hakkı kullanılamaz. Ödeme adımında hizmetin hemen başlamasını istediğini ayrı bir kutuyla onaylarsın.",
      "Abonelikler otomatik olarak yenilenmez: dönem sona erdiğinde hesabından kendiliğinden tahsilat yapılmaz, devam etmek istersen yeni bir satın alma yaparsın. Ödediğin dönem sonuna kadar hizmet açık kalır.",
      "Hatalı ya da yetkisiz bir işlem olduğunu düşünüyorsan Destek sayfasından \"Ödeme ve iade\" konusuyla yaz; her talebi tek tek inceleriz. Haklı bulunan işlemde tutar ödemenin yapıldığı karta iade edilir.",
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
      "Dersler, testler, podcast'ler ve cevaplar yapay zekâyla üretilir. Denetimden geçirilseler de hata içerebilirler. Bir hata görürsen soruda \"Hata bildir\"i kullan.",
      "Önemli kararlarda (sınav, sağlık, hukuk gibi) içeriği kaynağından doğrula.",
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
      "Hesabını Ayarlar'dan istediğin zaman kapatabilirsin; verilerin KVKK Aydınlatma Metni'nde yazıldığı şekilde silinir.",
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
