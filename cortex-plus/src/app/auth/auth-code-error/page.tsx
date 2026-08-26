import { MarketingPage } from "@/components/layout/marketing-page";
import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Doğrulama hatası"
      description="Bağlantının süresi dolmuş veya geçersiz olabilir."
    >
      <p className="mk-card p-4 text-center text-sm">
        <Link href="/giris" className="text-[var(--mk-primary)] underline">
        Giriş sayfasına dön
        </Link>
      </p>
    </MarketingPage>
  );
}
