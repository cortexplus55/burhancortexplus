import { MarketingPage } from "@/components/layout/marketing-page";
import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <MarketingPage
      title="Doğrulama hatası"
      description="Bağlantının süresi dolmuş veya geçersiz olabilir."
    >
      <Link href="/giris" className="text-primary underline">
        Giriş sayfasına dön
      </Link>
    </MarketingPage>
  );
}
