import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sohbetler" };

export default async function SohbetlerPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page">
        <h1 className="mb-5 text-xl font-semibold">Geçmiş konuşmalar</h1>
      {conversations?.length ? (
        <ul className="space-y-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/ogretmen?sohbet=${conversation.id}`}
                className="astra-pay-card flex min-h-[52px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--astra-pill)]"
              >
                <span className="truncate text-sm font-medium text-[var(--astra-text)]">
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
          icon={MessageCircle}
          title="Henüz sohbetin yok"
          description="AI öğretmenle ilk sorunu sorduğunda burada listelenir."
          actionHref="/ogretmen"
          actionLabel="Sohbet başlat"
        />
      )}
      </div>
    </AstraParitySorShell>
  );
}
