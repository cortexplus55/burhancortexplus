import Link from "next/link";
import { LegalDocument } from "@/components/layout/legal-document";

export const metadata = {
  title: "Gizlilik politikası",
  description: "Cortex Plus'ın kişisel verileri işleme ve saklama ilkeleri.",
};

/*
  Gizlilik politikası: kısa bir özet ve güvenlik önlemleri. Asıl ve bağlayıcı metin KVKK Aydınlatma Metni
  (`kvkk-text.ts`); bu sayfa onunla çelişmesin diye ayrıntıyı oraya bırakır (7 Kasım 2026, uyum paketi).
*/
export default function GizlilikPage() {
  return (
    <LegalDocument
      title="Gizlilik politikası"
      description="Bu metin, Cortex Plus hizmetini kullanırken verilerinin nasıl işlendiğini kısaca açıklar."
      sections={[
        {
          heading: "Toplanan veriler",
          body: [
            "Hesap bilgileri: ad soyad, e-posta adresi, seçtiğin sınıf ve hedef sınav.",
            "Kullanım verileri: sohbetlerin, testlerin, çalışma planların ve yüklediğin belgeler.",
            "Teknik veriler: oturum çerezleri ve hata kayıtları; sayfa kullanım ölçümleri yalnız analitik çerezlere izin verirsen.",
            "Hangi verinin hangi amaçla ve hangi hukuki sebeple işlendiğinin tam listesi KVKK Aydınlatma Metni'ndedir.",
          ],
        },
        {
          heading: "Neden işliyoruz",
          body: [
            "Hizmeti sunmak ve sana göre ayarlamak, hesabını ve ödemelerini yönetmek, kötüye kullanımı önlemek ve yasal yükümlülükleri yerine getirmek için.",
            "Verilerini satmayız ve reklam için kullanmayız.",
          ],
        },
        {
          heading: "Paylaşım",
          body: [
            "Veriler yalnız hizmetin çalışması için gerekli sağlayıcılarla paylaşılır: barındırma, veritabanı, yapay zekâ, e-posta, hata izleme ve ödeme. Sağlayıcıların adları ve ülkeleri KVKK Aydınlatma Metni'nde yazar.",
            "Yapay zekâ sağlayıcısına (OpenAI) gönderilen içerik onların modellerini eğitmek için kullanılmaz.",
            "Kart bilgileri Cortex Plus sunucularında saklanmaz; ödeme kuruluşu tarafından işlenir.",
          ],
        },
        {
          heading: "18 yaşından küçükler",
          body: [
            "18 yaşından küçük kullanıcılar hesabı velilerinin bilgisi ve izniyle açar. Adları sıralamada varsayılan olarak gizlidir ve analitik çerezler izin verilmeden çalışmaz.",
          ],
        },
        {
          heading: "Saklama ve silme",
          body: [
            "Veriler hesabın açık olduğu sürece saklanır.",
            "Ayarlar sayfasından hesabını sildiğinde silme hemen başlar; ödeme kayıtları yalnız mevzuatın öngördüğü süre boyunca kalır.",
          ],
        },
        {
          heading: "Güvenlik",
          body: [
            "Dosyalar özel depolamada tutulur ve yalnız kısa ömürlü imzalı bağlantıyla açılır.",
            "Veritabanı erişimi satır düzeyi güvenlik kurallarıyla kullanıcı bazında sınırlanır; tarayıcıdan yapılabilen yazma işlemleri birkaç tabloyla ve kullanıcının kendi satırlarıyla sınırlıdır.",
            "IP adresi; kötüye kullanım, onay ve çerez tercihi kayıtlarında tek yönlü özet olarak tutulur. Hız sınırı için kısa süreli, ödeme sırasında ise ödeme kuruluşuna ve ödeme onayının kanıt kaydına olduğu gibi kullanılır (ayrıntı KVKK Aydınlatma Metni'nde).",
          ],
        },
      ]}
    >
      <p className="mt-10 text-sm leading-relaxed text-[var(--mk-muted)]">
        Ayrıntılar için{" "}
        <Link href="/kvkk" className="underline underline-offset-4">
          KVKK Aydınlatma Metni
        </Link>{" "}
        ve{" "}
        <Link href="/cerez-politikasi" className="underline underline-offset-4">
          Çerez Politikası
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
