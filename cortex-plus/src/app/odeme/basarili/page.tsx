import { CheckCircle2 } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export default async function OdemeBasariliPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Ödeme alındı"
      description="Plus hakkın birkaç saniye içinde hesabına işlenir."
    >
      <ResultCard
        icon={CheckCircle2}
        tone="success"
        detail="Makbuzun Ödemeler sayfasında duruyor. Hakların hemen görünmezse sayfayı bir kez yenile — bankadan onay bazen birkaç saniye sürer."
        primaryHref="/"
        primaryLabel="Çalışmaya başla"
        secondaryHref="/odemeler"
        secondaryLabel="Makbuzumu gör"
      />
    </MarketingPage>
  );
}
