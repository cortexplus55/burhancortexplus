import { LegalDocument } from "@/components/layout/legal-document";

export const metadata = {
  title: "KVKK aydınlatma metni",
  description:
    "6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni.",
};

export default function KvkkPage() {
  return (
    <LegalDocument
      title="KVKK aydınlatma metni"
      description="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır."
      sections={[
        {
          heading: "Veri sorumlusu",
          body: [
            "Cortex Plus, cortexplus.app alan adı üzerinden sunulan hizmetin veri sorumlusudur.",
            "İletişim: kvkk@cortexplus.app",
          ],
        },
        {
          heading: "İşlenen kişisel veriler",
          body: [
            "Kimlik ve iletişim verisi: ad soyad, e-posta.",
            "Müşteri işlem verisi: kredi hareketleri, ödeme kayıtları.",
            "İşlem güvenliği verisi: oturum kayıtları, IP tabanlı hız sınırlama kayıtları.",
          ],
        },
        {
          heading: "Hukuki sebep",
          body: [
            "Sözleşmenin kurulması ve ifası (madde 5/2-c).",
            "Hukuki yükümlülüğün yerine getirilmesi (madde 5/2-ç).",
            "Meşru menfaat (madde 5/2-f) ve açık rıza gerektiren hâllerde rızan.",
          ],
        },
        {
          heading: "Haklarınız",
          body: [
            "Kişisel verilerinin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme.",
            "İşlemenin sınırlandırılmasını talep etme ve otomatik sistemlerle analiz sonucuna itiraz etme.",
            "Taleplerini kvkk@cortexplus.app adresine veya uygulama içindeki Ayarlar sayfasından iletebilirsin.",
          ],
        },
      ]}
    />
  );
}
