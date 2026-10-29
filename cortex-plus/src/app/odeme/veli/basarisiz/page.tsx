import { XCircle } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export const metadata = { title: "Ödeme tamamlanmadı" };
export const dynamic = "force-dynamic";

/** Ödeme bankadan dönmedi: aynı bağlantıyla yeniden denenir; ücret alınmamıştır. */
export default async function ParentPayFailedPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const retry = token && /^[A-Za-z0-9._-]{20,600}$/.test(token) ? `/odeme/veli/${token}` : "/";
  return (
    <MarketingPage variant="auth" title="Ödeme tamamlanmadı" description="Bankadan onay gelmedi; hesabınızdan ücret alınmadı.">
      <ResultCard
        icon={XCircle}
        tone="error"
        detail="Kart bilgilerini kontrol edip aynı bağlantıyla yeniden deneyebilirsiniz. Sorun sürerse bankanızla görüşün."
        primaryHref={retry}
        primaryLabel={retry === "/" ? "Ana sayfa" : "Yeniden dene"}
        secondaryHref="/iletisim"
        secondaryLabel="Destek"
      />
    </MarketingPage>
  );
}
