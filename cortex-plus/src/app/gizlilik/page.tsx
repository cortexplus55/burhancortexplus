import { LegalDocument } from "@/components/layout/legal-document";

export const metadata = {
  title: "Gizlilik politikası",
  description: "Cortex Plus'ın kişisel verileri işleme ve saklama ilkeleri.",
};

export default function GizlilikPage() {
  return (
    <LegalDocument
      title="Gizlilik politikası"
      description="Bu metin, Cortex Plus hizmetini kullanırken verilerinin nasıl işlendiğini açıklar."
      sections={[
        {
          heading: "Toplanan veriler",
          body: [
            "Hesap bilgileri: ad soyad, e-posta adresi ve seçtiğin sınıf/seviye bilgisi.",
            "Kullanım verileri: oluşturduğun sohbetler, quizler, çalışma planları ve yüklediğin dokümanlar.",
            "Teknik veriler: oturum çerezleri, hata kayıtları ve temel kullanım ölçümleri.",
          ],
        },
        {
          heading: "İşleme amaçları",
          body: [
            "Hizmetin sunulması, kişiselleştirilmesi ve güvenliğinin sağlanması.",
            "Kredi ve ödeme işlemlerinin yürütülmesi.",
            "Kötüye kullanımın önlenmesi ve yasal yükümlülüklerin yerine getirilmesi.",
          ],
        },
        {
          heading: "Paylaşım",
          body: [
            "Veriler yalnızca hizmetin çalışması için gerekli tedarikçilerle paylaşılır: barındırma, veritabanı, yapay zekâ sağlayıcısı, e-posta ve ödeme altyapısı.",
            "Kart bilgileri Cortex Plus sunucularında saklanmaz; ödeme sağlayıcısı tarafından işlenir.",
          ],
        },
        {
          heading: "Saklama ve silme",
          body: [
            "Veriler hesabın aktif olduğu sürece saklanır.",
            "Ayarlar sayfasından veri silme talebi oluşturabilirsin; talep alındığında yasal süreler içinde işlenir.",
          ],
        },
        {
          heading: "Güvenlik",
          body: [
            "Dosyalar özel depolamada tutulur ve imzalı bağlantı ile erişilir.",
            "Veritabanı erişimi satır düzeyi güvenlik (RLS) politikalarıyla kullanıcı bazında sınırlandırılır.",
          ],
        },
      ]}
    />
  );
}
