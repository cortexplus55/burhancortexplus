"use client";

import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences-panel";
import { NotificationsList } from "@/components/notifications/notifications-list";
import type { InAppNotification } from "@/lib/notifications/in-app";
import { fixtureAccount } from "../ana-ekran/fixture";
import type { FixturePlan } from "../ana-ekran/plan";

/** Yalnız test fikstürü (E2E_FIXTURE=1): bildirim çanı, /bildirimler listesi ve tercih paneli, veritabanısız. */
const NOW = Date.parse("2026-11-20T12:00:00Z");

const ITEMS: InAppNotification[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "podcast_ready",
    title: "Podcast'in hazır",
    body: "Hücre bölünmesi bölümü dinlenmeye hazır. Uzun bir açıklama satırı telefonda iki satırda kesilir.",
    actionUrl: "/e2e/bildirim-cani?ekran=liste",
    isRead: false,
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "blind_spot_detected",
    title: "Yeni sınav tuzağı",
    body: "Mol kavramında sık yapılan bir hata yakalandı.",
    actionUrl: null,
    isRead: false,
    createdAt: new Date(NOW - 3 * 3_600_000).toISOString(),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "payment",
    title: "Ödemen alındı",
    body: "Plus planın açıldı.",
    actionUrl: null,
    isRead: true,
    createdAt: new Date(NOW - 3 * 86_400_000).toISOString(),
  },
];

export function BildirimCaniFixture({ plan, screen }: { plan: FixturePlan; screen: "cani" | "liste" | "tercihler" }) {
  const account = fixtureAccount(plan);
  return (
    <ParitySorShell userInitial="Ö" userName="Öğrenci" streak={4} account={account}>
      {screen === "liste" ? (
        <PageShell title="Bildirimler">
          <NotificationsList initialItems={ITEMS} initialUnread={2} now={NOW} />
        </PageShell>
      ) : screen === "tercihler" ? (
        <PageShell title="Bildirim ve E-Posta Tercihleri" width="read">
          <NotificationPreferencesPanel
            initial={{
              studyRemindersEmail: true,
              examCountdownEmail: true,
              weeklyDigestEmail: false,
              inAppNotifications: true,
              preferredStudyHour: 19,
            }}
            mode={{ kind: "token", token: "f".repeat(64) }}
            showAllOff
          />
        </PageShell>
      ) : (
        <PageShell title="Ana Sayfa" />
      )}
    </ParitySorShell>
  );
}
