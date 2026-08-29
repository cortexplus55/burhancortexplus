import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { SupportForm } from "@/components/support/support-form";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Destek" };

const SUPPORT_STATUS: Record<string, string> = {
  open: "Açık",
  pending: "Bekliyor",
  closed: "Kapandı",
  resolved: "Çözüldü",
};

export default async function DestekPage() {
  const { supabase, user } = await requireUser();

  const { data: requests } = await supabase
    .from("support_requests")
    .select("id, subject, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell title="Destek" creditHint="Destek talebi göndermek ücretsizdir.">
      <div className="space-y-6">
        <SectionCard
          title="Yeni destek talebi"
          description="Sorununu yaz; ekibimiz e-posta ile dönüş yapar."
        >
          <SupportForm />
        </SectionCard>

        {requests?.length ? (
          <SectionCard title="Taleplerin">
            <ul className="divide-y">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>{request.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {SUPPORT_STATUS[request.status] ?? request.status} ·{" "}
                    {formatDate(request.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>
    </AppShell>
  );
}
