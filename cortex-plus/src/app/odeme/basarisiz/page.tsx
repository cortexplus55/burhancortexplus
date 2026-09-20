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
        detail="Siparişin oluşmadı, hesabında bir değişiklik yok. Kartını veya bakiyeni kontrol edip fiyatlandırmadan tekrar deneyebilirsin."
        primaryHref="/fiyatlandirma"
        primaryLabel="Paketlere dön"
        secondaryHref="/iletisim"
        secondaryLabel="Destek al"
      />
    </MarketingPage>
  );
}
