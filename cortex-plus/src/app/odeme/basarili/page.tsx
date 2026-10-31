import { ParityMarketingPage } from "@/components/parity/marketing";
import { PaymentActivation } from "@/components/billing/payment-activation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ödeme alındı" };
// Oturum çerezi ve `?kaynak=` okunuyor; sayfa her istekte çizilir (Suspense sınırı yok).
export const dynamic = "force-dynamic";

/**
 * PayTR'nin başarılı ödeme dönüşü (31 Ekim 2026). Plus'ı açan sunucu bildirimi 5-15 sn sonra
 * gelebildiği için sayfa düz bir "Ödeme alındı" kartı değil: durumu yoklayan ekran
 * (`PaymentActivation`). Oturum telefonda düştüyse yoklama başlamaz, giriş bağlantısı çıkar.
 * Hesapsız velinin bağlantıyla ödemesi kendi sayfalarında (`/odeme/veli/...`), buraya gelmez.
 */
export default async function OdemeBasariliPage({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const { kaynak } = await searchParams;
  const forChild = kaynak === "veli";

  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    signedIn = false;
  }

  return (
    <ParityMarketingPage variant="auth">
      <PaymentActivation
        signedIn={signedIn}
        forChild={forChild}
        returnPath={forChild ? "/odeme/basarili?kaynak=veli" : "/odeme/basarili"}
      />
    </ParityMarketingPage>
  );
}
