import { AppShell } from "@/components/layout/app-shell";
import { GrantCredits } from "@/components/admin/grant-credits";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Kullanıcılar" };

export default async function AdminKullanicilarPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: profiles } = await service
    .from("profiles")
    .select(
      "id, full_name, grade_level, created_at, credit_wallets(balance), user_roles(role, revoked_at)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell variant="admin" title="Kullanıcılar">
      <ul className="divide-y rounded-lg border">
        {(profiles ?? []).map((profile) => {
          const roles = (profile.user_roles ?? [])
            .filter((role) => !role.revoked_at)
            .map((role) => role.role as string);
          const wallet = profile.credit_wallets as { balance?: number } | null;

          return (
            <li
              key={profile.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {profile.full_name || "İsimsiz kullanıcı"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(profile.created_at)} · {wallet?.balance ?? 0} kredi
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <GrantCredits userId={profile.id} />
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
