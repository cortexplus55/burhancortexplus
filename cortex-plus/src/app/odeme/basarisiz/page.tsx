import { XCircle } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export default async function OdemeBasarisizPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme tamamlanamadı"
      description="İşlem iptal edildi veya banka onaylamadı."
    >
      <ResultCard
        icon={XCircle}
        tone="error"
        detail="Siparişin oluşmadı, kredin değişmedi. Tekrar denemek istersen paketler sayfasından aynı yerden devam edebilirsin; sorun sürerse bize yaz."
        primaryHref="/paketler"
        primaryLabel="Tekrar dene"
        secondaryHref="/iletisim"
        secondaryLabel="Bize ulaş"
      />
    </MarketingPage>
  );
}
