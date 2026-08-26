import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export default function OdemeBasariliPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme alındı"
      description="Kredilerin birkaç saniye içinde hesabına yansır."
    >
      <p className="mk-card p-6 text-center text-sm">
        <Link href="/dashboard" className="text-[var(--mk-primary)] underline">
          Panele git
        </Link>
      </p>
    </MarketingPage>
  );
}
