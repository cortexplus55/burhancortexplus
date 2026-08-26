import { MarketingPage, OriginMarketingLink } from "@/components/layout/marketing-page";

export default function AuthCodeErrorPage() {
  return (
    <MarketingPage
      title="Doğrulama hatası"
      description="Bağlantının süresi dolmuş veya geçersiz olabilir."
    >
      <OriginMarketingLink href="/giris">Giriş sayfasına dön</OriginMarketingLink>
    </MarketingPage>
  );
}
