import { CheckCircle2 } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export const metadata = { title: "Ödeme alındı" };

/** Velinin ödemesi tamamlandı: veli hesap sahibi değil, öğrenci sayfalarına yönlendirilmez. */
export default function ParentPayThanksPage() {
  return (
    <MarketingPage variant="auth" title="Ödeme alındı, teşekkürler" description="Paket birkaç saniye içinde öğrencinin hesabına işlenir.">
      <ResultCard
        icon={CheckCircle2}
        tone="success"
        detail="Makbuz e-postanıza gelir. Öğrenci uygulamayı açtığında Plus hakkını hemen görür; görünmezse sayfayı bir kez yenilemesi yeter."
        primaryHref="/"
        primaryLabel="Cortex Plus'ı tanı"
        secondaryHref="/fiyatlandirma"
        secondaryLabel="Planları gör"
      />
    </MarketingPage>
  );
}
