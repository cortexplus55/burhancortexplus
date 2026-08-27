import Link from "next/link";
import { ParentShell } from "@/components/layout/parent-shell";
import { ParentLinkForms } from "@/components/parity/parent-link-forms";
import {
  astraGreetingName,
  astraTimeGreeting,
} from "@/components/parity/astra-app-utils";
import { requireParent } from "@/lib/auth/session";
import { getChildSummary, type ChildSummary } from "@/lib/parent/child-summary";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Çocuklarım" };

type LinkedProfile = {
  full_name: string | null;
  grade_level: string | null;
  school_name: string | null;
  avatar_url: string | null;
};

/** Supabase join sonucu tekil ya da dizi gelebiliyor. */
function firstProfile(value: unknown): LinkedProfile | null {
  if (Array.isArray(value)) return (value[0] as LinkedProfile) ?? null;
  return (value as LinkedProfile) ?? null;
}

function ChildSummaryBlock({
  summary,
}: {
  summary: ChildSummary | null | undefined;
}) {
  if (!summary) return null;

  const stats = [
    { label: "Aktif gün", value: `${summary.activeDays}` },
    {
      label: "Deneme",
      value: summary.averageScore
        ? `${summary.examAttempts} · ort ${summary.averageScore}`
        : `${summary.examAttempts}`,
    },
    { label: "Quiz", value: `${summary.quizAttempts}` },
    { label: "Açık görev", value: `${summary.openTasks}` },
  ];

  return (
    <div className="mt-4">
      <p className="text-xs text-[var(--astra-muted)]">Son 30 gün</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--astra-border)] p-2 text-center"
          >
            <p className="text-sm font-semibold">{stat.value}</p>
            <p className="mt-0.5 text-[10px] text-[var(--astra-muted)]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {summary.weakTopics.length ? (
        <div className="mt-3">
          <p className="text-xs text-[var(--astra-muted)]">
            Desteğe ihtiyaç duyduğu konular
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.weakTopics.map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {summary.lastExamAt ? (
        <p className="mt-3 text-xs text-[var(--astra-muted)]">
          Son deneme: {formatDate(summary.lastExamAt)}
        </p>
      ) : null}
    </div>
  );
}

export default async function VeliPage() {
  const { supabase, user } = await requireParent();

  const [{ data: profile }, { data: links }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("parent_student_links")
      .select(
        "id, status, invite_email, created_at, student_id, profiles!parent_student_links_student_id_fkey(full_name, grade_level, school_name, avatar_url)",
      )
      .eq("parent_id", user.id)
      .neq("status", "revoked")
      .order("created_at", { ascending: false }),
  ]);

  const rows = links ?? [];
  const active = rows.filter((row) => row.status === "active");
  const pending = rows.filter((row) => row.status === "pending");
  const firstName = astraGreetingName(profile?.full_name ?? user.email);

  const summaries = new Map<string, ChildSummary | null>(
    await Promise.all(
      active.map(
        async (row) =>
          [
            row.id as string,
            await getChildSummary(user.id, row.student_id as string),
          ] as const,
      ),
    ),
  );

  return (
    <ParentShell>
      <section className="pt-2">
        <h1 className="text-xl font-semibold">
          {firstName}, {astraTimeGreeting().toLocaleLowerCase("tr")}
        </h1>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          Çocuğunun ilerlemesini buradan takip edebilirsin.
        </p>
      </section>

      {active.length ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-[var(--astra-muted)]">
            Bağlı öğrenciler ({active.length})
          </h2>
          {active.map((row) => {
            const child = firstProfile(row.profiles);
            return (
              <article key={row.id} className="astra-pay-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-800/90 text-lg">
                    {child?.avatar_url && !child.avatar_url.startsWith("http")
                      ? child.avatar_url
                      : (child?.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {child?.full_name ?? "Öğrenci"}
                    </p>
                    <p className="truncate text-xs text-[var(--astra-muted)]">
                      {[child?.grade_level, child?.school_name]
                        .filter(Boolean)
                        .join(" · ") || "Profil bilgisi yok"}
                    </p>
                  </div>
                </div>
                <ChildSummaryBlock summary={summaries.get(row.id as string)} />

                <p className="mt-3 text-xs text-[var(--astra-muted)]">
                  Sohbet içerikleri gizlidir; yalnızca ilerleme özeti paylaşılır.
                </p>
              </article>
            );
          })}
        </section>
      ) : null}

      {pending.length ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-[var(--astra-muted)]">
            Onay bekleyen ({pending.length})
          </h2>
          {pending.map((row) => {
            const child = firstProfile(row.profiles);
            return (
              <article
                key={row.id}
                className="astra-pay-card flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {child?.full_name ?? row.invite_email ?? "Davet"}
                  </p>
                  <p className="text-xs text-[var(--astra-muted)]">
                    {formatDate(row.created_at)} · onay bekliyor
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300">
                  Bekliyor
                </span>
              </article>
            );
          })}
        </section>
      ) : null}

      {!active.length && !pending.length ? (
        <section className="mt-6 astra-pay-card p-5 text-center">
          <p className="text-2xl" aria-hidden>
            👋
          </p>
          <h2 className="mt-2 font-semibold">Henüz bağlı öğrenci yok</h2>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Çocuğunun davet kodunu gir veya e-posta ile davet gönder.
          </p>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-[var(--astra-muted)]">
          Öğrenci ekle
        </h2>
        <ParentLinkForms />
      </section>

      <section className="mt-6 astra-pay-card p-5">
        <h2 className="font-semibold">Plus ile daha fazlası</h2>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          Sınırsız AI desteği ve deneme analizi için aboneliği sen yönetebilirsin.
        </p>
        <Link
          href="/veli/plus"
          className="astra-btn-primary mt-4 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
        >
          Paketleri gör
        </Link>
      </section>
    </ParentShell>
  );
}
