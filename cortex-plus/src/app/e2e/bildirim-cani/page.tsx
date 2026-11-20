import { notFound } from "next/navigation";
import { GuestPreferencesView } from "@/components/notifications/guest-preferences-view";
import { fixturePlan } from "../ana-ekran/plan";
import { BildirimCaniFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (20 Kasım 2026, Faz 6): öğrenci kabuğundaki bildirim çanı, veritabanısız. Çanın uçları
 * (`/api/notifications`, `/api/notifications/read`) testte `page.route` ile karşılanır. `?ekran=liste` /bildirimler
 * listesi, `?ekran=tercihler` tercih paneli, `?ekran=misafir` e-postadaki bağlantının sayfası;
 * `?plan=plus|hafta|sigma|kurucu`, yoksa ücretsiz.
 */
export default async function E2eBildirimCaniPage({ searchParams }: { searchParams: Promise<{ plan?: string; ekran?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  if (params.ekran === "misafir") {
    return (
      <GuestPreferencesView
        token={"f".repeat(64)}
        preferences={{
          studyRemindersEmail: true,
          examCountdownEmail: false,
          weeklyDigestEmail: true,
          inAppNotifications: true,
          preferredStudyHour: 20,
        }}
        marketingOn
      />
    );
  }
  const screen = params.ekran === "liste" ? "liste" : params.ekran === "tercihler" ? "tercihler" : "cani";
  return <BildirimCaniFixture plan={fixturePlan(params.plan)} screen={screen} />;
}
