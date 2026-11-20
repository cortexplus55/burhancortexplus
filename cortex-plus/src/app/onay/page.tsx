import { redirect } from "next/navigation";
import { MarketingPage } from "@/components/layout/marketing-page";
import { getRequestUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { consentStatusFrom } from "@/lib/legal/consent-evidence";
import { loadConsentRows } from "@/lib/legal/record-consent";
import { createServiceClient } from "@/lib/supabase/server";
import { OnayClient } from "./onay-client";

export const metadata = { title: "Onaylar" };
export const dynamic = "force-dynamic";

/**
 * Faz 2 (madde 6): Google ile ilk girişte (ya da onayı hiç kaydedilmemiş hesapta) KVKK Aydınlatma Metni, Kullanım
 * Koşulları ve yaş beyanı bu ekranda alınır; onaydan sonra öğrenci gitmek istediği yere döner. Onay zaten tamsa ya da
 * okunamazsa ekran beklemeden geçer: öğrenci bir veritabanı hatası yüzünden kilitlenmez (onay kapısı yine sorar).
 */
export default async function OnayPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext ?? null);
  const { user } = await getRequestUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/onay?next=${encodeURIComponent(next)}`)}`);

  const rows = await loadConsentRows(createServiceClient(), user.id);
  if (!rows) redirect(next);
  const status = consentStatusFrom(rows);
  if (!status.missing.length && !status.ageNeeded) redirect(next);

  return (
    <MarketingPage
      variant="auth"
      title="Devam etmeden önce"
      description="Cortex Plus'ı kullanmaya başlamadan önce metinleri okuyup onaylaman gerekiyor."
    >
      <OnayClient state={{ missing: status.missing, ageNeeded: status.ageNeeded }} next={next} />
    </MarketingPage>
  );
}
