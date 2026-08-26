import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export default function OdemeBasarisizPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme tamamlanamadı"
      description="İşlem iptal edildi veya başarısız oldu. Paketler sayfasından tekrar deneyebilirsin."
    >
      <p className="mk-card p-6 text-center text-sm">
        <Link href="/fiyatlandirma" className="text-[var(--mk-primary)] underline">
          Fiyatlandırmaya dön
        </Link>
      </p>
    </MarketingPage>
  );
}
