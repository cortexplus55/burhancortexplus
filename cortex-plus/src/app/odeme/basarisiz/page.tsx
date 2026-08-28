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
        <Link href="/paketler" className="text-[var(--mk-primary)] underline">
          Paketlere dön
        </Link>
        {" · "}
        <Link href="/ogretmen" className="text-[var(--mk-primary)] underline">
          Sor ekranına git
        </Link>
      </p>
    </MarketingPage>
  );
}
