import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { ApplicationReview } from "@/components/admin/application-review";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Öğretmen başvuruları" };

export default async function OgretmenBasvurulariPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: applications } = await service
    .from("teacher_applications")
    .select("id, institution, status, created_at, notes, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const pending = (applications ?? []).filter((item) => item.status === "pending");
  const resolved = (applications ?? []).filter((item) => item.status !== "pending");

  return (
    <AppShell variant="admin" title="Öğretmen başvuruları">
      <div className="space-y-6">
        {pending.length ? (
          <ul className="space-y-3">
            {pending.map((application) => (
              <li key={application.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {(application.profiles as { full_name?: string } | null)
                        ?.full_name ?? "İsimsiz kullanıcı"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {application.institution ?? "Kurum belirtilmedi"} ·{" "}
                      {formatDate(application.created_at)}
                    </p>
                  </div>
                  <ApplicationReview applicationId={application.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Bekleyen başvuru yok"
            description="Yeni başvurular geldiğinde burada listelenir."
          />
        )}

        {resolved.length ? (
          <section className="rounded-lg border p-4">
            <h2 className="font-medium">Sonuçlananlar</h2>
            <ul className="mt-3 divide-y text-sm">
              {resolved.map((application) => (
                <li
                  key={application.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>
                    {(application.profiles as { full_name?: string } | null)
                      ?.full_name ?? "İsimsiz"}{" "}
                    · {application.institution ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {application.status} · {formatDate(application.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
