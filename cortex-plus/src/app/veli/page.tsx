import { ParentShell } from "@/components/layout/parent-shell";
import { ParentLinkForms } from "@/components/parity/parent-link-forms";
import { ChildProgressCard } from "@/components/parent/child-progress-card";
import { PendingChildCard } from "@/components/parent/pending-child-card";
import {
  astraGreetingName,
  astraTimeGreeting,
} from "@/components/parity/astra-app-utils";
import { requireParent } from "@/lib/auth/session";
import { getChildSummary, type ChildSummary } from "@/lib/parent/child-summary";
import { getParentLinkStatus } from "@/lib/parent/link-status";
import {
  childAvatarLabel,
  childMetaLine,
  firstLinkedProfile,
} from "@/lib/parent/child-profile";
import { Users } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Çocuklarım" };

export default async function VeliPage() {
  const { supabase, user } = await requireParent();

  const [{ data: profile }, { data: links }, linkStatus] = await Promise.all([
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
    getParentLinkStatus(supabase, user.id),
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

  const anyChildNeedsPlus = active.some((row) => {
    const summary = summaries.get(row.id as string);
    return summary && !summary.hasPlus;
  });
  const allHavePlus =
    active.length > 0 &&
    active.every((row) => summaries.get(row.id as string)?.hasPlus);

  return (
    <ParentShell title="Çocuklarım">
      <section className="pt-2">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--astra-text)]">
          {firstName}, {astraTimeGreeting().toLocaleLowerCase("tr")}
        </h1>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          {linkStatus.hasActiveChild
            ? "Onaylı çocuğunun ilerlemesini buradan takip edersin. Sohbetler gizli kalır."
            : "Öğrenci onaylayınca ilerleme özeti ve Plus açılır."}
        </p>
      </section>

      {active.length ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-[var(--astra-muted)]">
            Bağlı öğrenciler ({active.length})
          </h2>
          {active.map((row) => {
            const child = firstLinkedProfile(row.profiles);
            return (
              <ChildProgressCard
                key={row.id}
                name={child?.full_name ?? "Öğrenci"}
                meta={childMetaLine(child)}
                avatar={childAvatarLabel(child)}
                summary={summaries.get(row.id as string) ?? null}
                href={`/veli/cocuk/${row.student_id}`}
                plusHref={`/veli/plus?ogrenci=${row.student_id}`}
                linkId={row.id as string}
              />
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
            const child = firstLinkedProfile(row.profiles);
            return (
              <PendingChildCard
                key={row.id}
                linkId={row.id as string}
                title={
                  child?.full_name ?? (row.invite_email as string) ?? "Davet"
                }
                createdAt={row.created_at as string}
              />
            );
          })}
        </section>
      ) : null}

      {!active.length && !pending.length ? (
        <section className="mt-6 astra-pay-card p-5 text-center">
          <Users
            className="mx-auto h-8 w-8 text-[var(--astra-muted)]"
            aria-hidden
          />
          <h2 className="font-semibold text-[var(--astra-text)]">Henüz bağlı öğrenci yok</h2>
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
        {!linkStatus.hasActiveChild ? (
          <>
            <h2 className="font-semibold">Plus henüz kapalı</h2>
            <p className="mt-1 text-sm text-[var(--astra-muted)]">
              Öğrenci bağlantıyı onayladıktan sonra Plus’ı onun hesabı için
              satın alabilirsin.
            </p>
          </>
        ) : allHavePlus ? (
          <>
            <h2 className="font-semibold">Plus aktif</h2>
            <p className="mt-1 text-sm text-[var(--astra-muted)]">
              Bağlı öğrencilerin aboneliği açık. Kota çocuğunun hesabında.
            </p>
            <Link
              href="/veli/plus"
              className="astra-btn-primary mt-4 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
            >
              Aboneliği yönet
            </Link>
          </>
        ) : (
          <>
            <h2 className="font-semibold">
              {anyChildNeedsPlus
                ? "Çocuğun için Plus al"
                : "Plus ile daha fazlası"}
            </h2>
            <p className="mt-1 text-sm text-[var(--astra-muted)]">
              Raporlar ücretsiz. Plus kotası çocuğunun AI ve deneme hakkına
              gider.
            </p>
            <Link
              href="/veli/plus"
              className="astra-btn-primary mt-4 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
            >
              Paketleri gör
            </Link>
          </>
        )}
      </section>
    </ParentShell>
  );
}
