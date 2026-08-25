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
