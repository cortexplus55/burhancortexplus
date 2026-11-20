import { AppShell } from "@/components/layout/app-shell";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireUser } from "@/lib/auth/session";
import { listInAppNotifications } from "@/lib/notifications/in-app";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Bildirimler" };
export const dynamic = "force-dynamic";

/**
 * Bildirimler (Faz 6, 20 Kasım 2026): yeni `in_app_notifications` ve eski `notifications` tablosu birleşik okunur
 * (`listInAppNotifications`; sunucu anahtarı + kullanıcı süzgeci). Okundu işareti `/api/notifications/read` ucundan.
 */
export default async function BildirimlerPage() {
  const { user } = await requireUser();
  const { items, unread } = await listInAppNotifications(createServiceClient(), user.id, { limit: 50 });

  return (
    <AppShell title="Bildirimler" creditHint="Bildirimler ücretsizdir.">
      <NotificationsList initialItems={items} initialUnread={unread} now={Date.now()} />
    </AppShell>
  );
}
