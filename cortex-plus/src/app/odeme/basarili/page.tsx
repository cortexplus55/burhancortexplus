import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export default async function OdemeBasariliPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme alındı"
      description="Kredilerin birkaç saniye içinde hesabına yansır."
    >
      <p className="mk-card p-6 text-center text-sm">
        <Link href="/krediler" className="text-[var(--mk-primary)] underline">
          Kredileri gör
        </Link>
        {" · "}
        <Link href="/ogretmen" className="text-[var(--mk-primary)] underline">
          Sor ekranına git
        </Link>
      </p>
    </MarketingPage>
  );
}
