import Link from "next/link";
import {
  BookOpen,
  Camera,
  FileUp,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Panel" };

const shortcuts = [
  {
    href: "/ogretmen",
    label: "Yeni ders sohbeti",
    body: "Takıldığın soruyu adım adım çöz.",
    icon: MessageCircle,
  },
  {
    href: "/soru-coz",
    label: "Fotoğraftan çöz",
    body: "Sorunun fotoğrafını yükle.",
    icon: Camera,
  },
  {
    href: "/dokumanlar",
    label: "Doküman yükle",
    body: "Kendi notlarından çalış.",
    icon: FileUp,
  },
  {
    href: "/deneme-sinavlari",
    label: "Deneme çöz",
    body: "Eksiklerini ortaya çıkar.",
    icon: BookOpen,
  },
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
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--astra-text)]">
            {firstName ? `Merhaba ${firstName}` : "Merhaba"}
          </h2>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            {wallet
              ? `${wallet.balance} kredin ve ${wallet.free_allowance_remaining} ücretsiz hakkın var.`
              : "Kredi bilgin yükleniyor."}
          </p>
          {finishProfileHref ? (
            <Link
              href={finishProfileHref}
              className="mt-2 inline-block text-sm font-medium text-[var(--astra-primary)] underline-offset-2 hover:underline"
            >
              Profilini tamamla
            </Link>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="astra-pay-card group block p-4 transition-transform hover:scale-[1.01]"
              >
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-[var(--astra-primary)] transition-colors group-hover:bg-amber-500/25">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="font-semibold text-[var(--astra-text)]">{shortcut.label}</p>
                <p className="mt-1 text-sm text-[var(--astra-muted)]">{shortcut.body}</p>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard variant="astra" title="Kaldığın yerden devam et">
            {conversations?.length ? (
              <ul className="space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/ogretmen?sohbet=${conversation.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-[var(--astra-pill)]"
                    >
                      <span className="truncate font-medium text-[var(--astra-text)]">
                        {conversation.title ?? "Başlıksız sohbet"}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                        {formatDate(conversation.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                variant="astra"
                icon={Sparkles}
                title="Henüz sohbetin yok"
                description="İlk sorunu Sor ekranından yazarak başla."
                actionHref="/ogretmen"
                actionLabel="Sohbet başlat"
              />
            )}
          </SectionCard>

          <SectionCard variant="astra" title="Yaklaşan görevlerin">
            {tasks?.length ? (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href="/calisma-plani"
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-[var(--astra-pill)]"
                    >
                      <span className="truncate text-[var(--astra-text)]">{task.title}</span>
                      <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                        {task.due_date ?? "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                variant="astra"
                icon={BookOpen}
                title="Aktif görevin yok"
                description="Hedefini yazarak haftalık görevler oluştur."
                actionHref="/calisma-plani"
                actionLabel="Plan oluştur"
              />
            )}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
