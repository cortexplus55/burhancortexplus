import { LegalDocument } from "@/components/layout/legal-document";

export const metadata = {
  title: "Kullanım koşulları",
  description: "Cortex Plus hizmetinin kullanım şartları.",
};

export default function KullanimKosullariPage() {
  return (
    <LegalDocument
      title="Kullanım koşulları"
      description="Cortex Plus'ı kullanarak aşağıdaki koşulları kabul etmiş olursun."
      sections={[
        {
          heading: "Hesap",
          body: [
            "Hesabını doğru bilgilerle oluşturman ve şifreni gizli tutman gerekir.",
            "Hesabın üzerinden yapılan işlemlerden sen sorumlusun.",
          ],
        },
        {
          heading: "Kredi ve ödeme",
          body: [
            "Kredi bedelleri işlem öncesinde gösterilir ve sunucu tarafında belirlenir.",
            "Başarısız işlemlerde kredi otomatik iade edilir.",
            "Ödemeler PayTR altyapısı üzerinden alınır; kart bilgileri tarafımızda saklanmaz.",
          ],
        },
        {
          heading: "Cayma hakkı ve iade",
          body: [
            "Abonelik ve kredi paketi satın alımlarında, satın alma tarihinden itibaren 14 gün içinde gerekçe göstermeden iade talep edebilirsin. Talebin karşılanır ve ödediğin tutarın tamamı iade edilir.",
            "Mesafeli Sözleşmeler Yönetmeliği, anında sunulan dijital hizmetlerde cayma hakkını zorunlu tutmuyor. Bu 14 günlük hakkı yasa gerektirdiği için değil, ürünü denemeden ödeme yapmanı istemediğimiz için veriyoruz.",
            "İade talebini destek sayfasından iletebilirsin. Talep alındıktan sonra ödeme sağlayıcısına iletilir; tutarın kartına geçmesi bankana bağlı olarak birkaç iş günü sürebilir.",
            "İade sonrası abonelik kapatılır ve o satın almayla gelen kullanılmamış kredi hesaptan düşülür.",
            "Başarısız işlemlerde harcanan kredi, iade talebine gerek kalmadan otomatik geri verilir.",
          ],
        },
        {
          heading: "Kabul edilebilir kullanım",
          body: [
            "Hizmeti yasa dışı amaçlarla, başkalarının haklarını ihlal edecek şekilde veya sistem güvenliğini tehdit ederek kullanamazsın.",
            "Yapay zekâ çıktıları hata içerebilir; kritik kararlarda doğrulama sorumluluğu kullanıcıdadır.",
            "Sınav kurallarına aykırı kullanım kullanıcının sorumluluğundadır.",
          ],
        },
        {
          heading: "İçerik hakları",
          body: [
            "Yüklediğin içeriklerin haklarına sahip olduğunu beyan edersin.",
            "Platform arayüzü, metinleri ve yazılımı Cortex Plus'a aittir.",
          ],
        },
        {
          heading: "Fesih",
          body: [
            "Koşulların ihlali hâlinde hesabın askıya alınabilir.",
            "Hesabını dilediğin zaman kapatma talebi oluşturabilirsin.",
          ],
        },
      ]}
    />
  );
}
