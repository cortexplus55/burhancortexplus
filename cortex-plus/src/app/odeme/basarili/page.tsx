import { CheckCircle2 } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export default async function OdemeBasariliPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme alındı"
      description="Kredilerin birkaç saniye içinde hesabına yansır."
    >
      <ResultCard
        icon={CheckCircle2}
        tone="success"
        detail="Makbuzun Ödemeler sayfasında duruyor. Kredin hemen görünmezse sayfayı bir kez yenile — bankadan onay birkaç saniye sürebiliyor."
        primaryHref="/ogretmen"
        primaryLabel="Çalışmaya başla"
        secondaryHref="/krediler"
        secondaryLabel="Kredilerimi gör"
      />
    </MarketingPage>
  );
}
