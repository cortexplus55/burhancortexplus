import { AlertTriangle } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";
import { ParentPayForm } from "@/components/billing/parent-pay-form";
import { formatTryWhole } from "@/lib/format";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { verifyParentPayToken } from "@/lib/payments/parent-link";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Velim için ödeme" };
export const dynamic = "force-dynamic";

/**
 * Velinin hesapsız ödeme sayfası (29 Ekim 2026). Bağlantıdaki imza doğrulanır; sayfa öğrencinin
 * yalnız adını ve seçilen planı gösterir. Bu sayfa herkese açık: oturum istemez.
 */
export default async function ParentPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyParentPayToken(token);
  if (!verified.ok) {
    return (
      <MarketingPage variant="auth" title="Bağlantı açılamadı" description={verified.reason === "expired" ? "Bu ödeme bağlantısının süresi dolmuş." : "Bu ödeme bağlantısı geçerli değil."}>
        <ResultCard
          icon={AlertTriangle}
          tone="error"
          detail="Öğrenciden Abonelik sayfasından yeni bir bağlantı üretmesini isteyin; bağlantılar üç gün geçerlidir."
          primaryHref="/"
          primaryLabel="Ana sayfa"
          secondaryHref="/iletisim"
          secondaryLabel="Destek"
        />
      </MarketingPage>
    );
  }

  const service = createServiceClient();
  const [{ data: plan }, { data: student }] = await Promise.all([
    service.from("plans").select("id, name, price_try").eq("id", verified.claims.planId).eq("active", true).maybeSingle(),
    service.from("profiles").select("full_name").eq("id", verified.claims.studentId).maybeSingle(),
  ]);
  if (!plan || !student) {
    return (
      <MarketingPage variant="auth" title="Bağlantı açılamadı" description="Bu bağlantının planı artık satışta değil ya da hesap bulunamadı.">
        <ResultCard icon={AlertTriangle} tone="error" detail="Öğrenciden yeni bir bağlantı isteyin." primaryHref="/" primaryLabel="Ana sayfa" secondaryHref="/iletisim" secondaryLabel="Destek" />
      </MarketingPage>
    );
  }
  const studentName = String(student.full_name ?? "").trim().split(/\s+/)[0] || "Öğrenci";

  return (
    <MarketingPage
      variant="auth"
      title={`${studentName} için Cortex Plus`}
      description="Hesap açmadan, kart bilgisi bize gelmeden güvenli ödeme. Paket öğrencinin hesabına tanımlanır."
    >
      {isPaytrConfigured() ? (
        <ParentPayForm token={token} studentName={studentName} planName={plan.name as string} priceLabel={formatTryWhole(plan.price_try as number)} />
      ) : (
        <ResultCard icon={AlertTriangle} tone="error" detail="Ödeme altyapısı şu an kapalı. Daha sonra yeniden deneyin." primaryHref="/" primaryLabel="Ana sayfa" secondaryHref="/iletisim" secondaryLabel="Destek" />
      )}
    </MarketingPage>
  );
}
