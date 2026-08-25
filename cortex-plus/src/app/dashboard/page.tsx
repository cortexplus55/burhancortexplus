import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Panel" };

const shortcuts = [
  { href: "/ogretmen", label: "Yeni ders sohbeti", body: "Takıldığın soruyu adım adım çöz." },
  { href: "/soru-coz", label: "Fotoğraftan çöz", body: "Sorunun fotoğrafını yükle." },
  { href: "/dokumanlar", label: "Doküman yükle", body: "Kendi notlarından çalış." },
  { href: "/deneme-sinavlari", label: "Deneme çöz", body: "Eksiklerini ortaya çıkar." },
];

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: wallet }, { data: conversations }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, onboarding_completed_at, primary_role")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("credit_wallets")
        .select("balance, free_allowance_remaining")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("study_plan_tasks")
        .select("id, title, due_date, completed, study_plans!inner(user_id)")
        .eq("study_plans.user_id", user.id)
        .eq("completed", false)
        .order("due_date")
        .limit(5),
    ]);

  const firstName = (profile?.full_name ?? "").split(" ")[0];
  const finishProfileHref = !profile?.onboarding_completed_at
    ? onboardingPathForRole(profile?.primary_role as string | undefined)
    : null;

  return (
    <AppShell title="Panel">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">
            {firstName ? `Merhaba ${firstName}` : "Merhaba"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {wallet
              ? `${wallet.balance} kredin ve ${wallet.free_allowance_remaining} ücretsiz hakkın var.`
              : "Kredi bilgin yükleniyor."}
          </p>
          {finishProfileHref ? (
            <Link href={finishProfileHref} className="mt-2 inline-block text-sm underline">
              Profilini tamamla
            </Link>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="rounded-lg border p-4 transition hover:bg-accent"
            >
              <p className="font-medium">{shortcut.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{shortcut.body}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Kaldığın yerden devam et">
            {conversations?.length ? (
              <ul className="space-y-2 text-sm">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/ogretmen?sohbet=${conversation.id}`}
                      className="flex items-center justify-between gap-3 hover:text-primary"
                    >
                      <span className="truncate">
                        {conversation.title ?? "Başlıksız sohbet"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(conversation.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Henüz sohbetin yok. İlk sorunu sorarak başla.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Yaklaşan görevlerin">
            {tasks?.length ? (
              <ul className="space-y-2 text-sm">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {task.due_date ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aktif görevin yok.{" "}
                <Link href="/calisma-plani" className="underline">
                  Çalışma planı oluştur
                </Link>
                .
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
