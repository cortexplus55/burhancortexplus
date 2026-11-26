import { notFound } from "next/navigation";
import { NativeSubscriptionScreen } from "@/components/billing/native-subscription-screen";
import { AccountDeletionPanel } from "@/components/profile/account-deletion-panel";
import { storeOffersFromPlans } from "@/lib/billing/store-products";

export const dynamic = "force-dynamic";

/*
  Uçtan uca fikstür (26 Kasım 2026, mağaza uyumluluğu): uygulamanın abonelik ekranı (`?platform=ios|android`) ve
  Ayarlar'daki kalıcı hesap silme bölümü (`?ekran=silme`), giriş ve veritabanı olmadan. Fiyatlar canlı plan
  satırlarının biçiminde (kuruş).
*/
const PLAN_ROWS = [
  { slug: "plus-haftalik", price_try: 34900, active: true },
  { slug: "plus-aylik", price_try: 59900, active: true },
  { slug: "sigma-aylik", price_try: 199900, active: true },
];

export default async function E2eMagazaPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; ekran?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  if (params.ekran === "silme") {
    return (
      <main className="cp-sor-main" style={{ padding: "24px 16px" }}>
        <h1>Hesabı sil</h1>
        <AccountDeletionPanel request={null} requestedAtLabel={null} />
      </main>
    );
  }
  const platform = params.platform === "android" ? "android" : "ios";
  return (
    <main className="cp-sor-main">
      <NativeSubscriptionScreen platform={platform} offers={storeOffersFromPlans(PLAN_ROWS)} currentPlan={null} />
    </main>
  );
}
