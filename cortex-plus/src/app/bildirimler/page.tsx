import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { NotificationItem } from "@/components/notifications/notification-item";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Bildirimler" };

export default async function BildirimlerPage() {
  const { supabase, user } = await requireUser();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell title="Bildirimler">
      {notifications?.length ? (
        <ul className="divide-y rounded-lg border">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              id={notification.id}
              title={notification.title}
              body={notification.body}
              readAt={notification.read_at}
              createdAt={notification.created_at}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Bildirimin yok"
          description="Hesabınla ilgili güncellemeler burada görünecek."
        />
      )}
    </AppShell>
  );
}
