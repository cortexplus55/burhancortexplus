import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { NotificationItem } from "@/components/notifications/notification-item";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { getPrimaryRole, requireUser } from "@/lib/auth/session";

export const metadata = { title: "Bildirimler" };

export default async function BildirimlerPage() {
  const { supabase, user } = await requireUser();
  const role = await getPrimaryRole(user.id);
  const isParent = role === "parent";

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const unread = (notifications ?? []).some((row) => !row.read_at);

  if (!isParent) {
    return (
      <AppShell title="Bildirimler" creditHint="Bildirimler ücretsizdir.">
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

  return (
    <AppShell title="Bildirimler" accountStrip={false}>
      <section className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl font-semibold">Bildirimler</h1>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Bağlantı onayı, ödeme ve kota. Sohbet içerikleri gelmez.
          </p>
        </div>
        {unread ? <MarkAllReadButton /> : null}
      </section>

      {notifications?.length ? (
        <ul className="mt-5 space-y-2">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              id={notification.id}
              title={notification.title}
              body={notification.body}
              readAt={notification.read_at}
              createdAt={notification.created_at}
              tone="astra"
            />
          ))}
        </ul>
      ) : (
        <section className="astra-pay-card mt-5 p-5 text-center">
          <h2 className="font-semibold">Bildirim yok</h2>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Çocuk bağlantısı, ödeme isteği ve kota yüklemeleri burada görünür.
          </p>
        </section>
      )}
    </AppShell>
  );
}
