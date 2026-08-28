import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ParentShell } from "@/components/layout/parent-shell";
import { astraGreetingName } from "@/components/parity/astra-app-utils";
import { requireParent } from "@/lib/auth/session";
import { getParentLinkStatus } from "@/lib/parent/link-status";
import { firstLinkedProfile } from "@/lib/parent/child-profile";
import { getParentCoachRemaining } from "@/lib/parent/coach-quota";
import { formatDateShort } from "@/lib/format";

export const metadata = { title: "Veli desteği" };

const PARENT_STARTERS = [
  {
    label: "Motivasyon",
    prompt:
      "Çocuğum ders çalışmak istemiyor. Suçlamadan, evde uygulayabileceğim somut bir ritim öner.",
  },
  {
    label: "Sınav kaygısı",
    prompt:
      "Yaklaşan sınavda kaygılı. Teşhis koymadan, ebeveyn olarak nasıl destek olabilirim?",
  },
  {
    label: "Ekran süresi",
    prompt:
      "Çalışma ile ekran süresini dengelemek için ev kuralları öner. Sert yasak yerine uygulanabilir sınırlar ver.",
  },
  {
    label: "Çalışma ortamı",
    prompt:
      "Evde odaklanmayı artıracak sade bir çalışma ortamı ve 25 dakikalık bir oturum planı yaz.",
  },
];

export default async function VeliSorPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { supabase, user } = await requireParent();
  const params = await searchParams;

  const [{ data: profile }, linkStatus, coachRemaining, { data: children }, { data: threads }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      getParentLinkStatus(supabase, user.id),
      getParentCoachRemaining(supabase, user.id),
      supabase
        .from("parent_student_links")
        .select(
          "student_id, status, profiles!parent_student_links_student_id_fkey(full_name)",
        )
        .eq("parent_id", user.id)
        .eq("status", "active"),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

  let initialMessages: { role: "user" | "assistant"; content: string }[] = [];
  let conversationId: string | undefined;

  if (params.sohbet) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", params.sohbet)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversation) {
      conversationId = conversation.id;
      const { data: rows } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at");

      initialMessages = (rows ?? [])
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => ({
          role: row.role as "user" | "assistant",
          content: row.content as string,
        }));
    }
  }

  const firstName = astraGreetingName(profile?.full_name ?? user.email);
  const childNames = (children ?? [])
    .map((row) => firstLinkedProfile(row.profiles)?.full_name)
    .filter((name): name is string => Boolean(name));
  const viewingThread = Boolean(conversationId);

  return (
    <ParentShell title="Destek">
      {!linkStatus.hasActiveChild ? (
        <p className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90">
          Öğrenci onaylayınca öneriler onun ilerleme özetine göre kişiselleşir.
          Sohbet içerikleri yine gizli kalır.
        </p>
      ) : (
        <p className="mb-4 text-xs text-[var(--astra-muted)]">
          {childNames.length
            ? `Öneriler ${childNames.join(", ")} için onaylı özete bakarak verilir. Çocuğunun sohbetleri görünmez.`
            : "Öneriler onaylı ilerleme özetine bakarak verilir. Sohbetler gizli."}{" "}
          Destek AI ayrı ücretsiz kotadır; Plus gerekmez.
        </p>
      )}

      {viewingThread ? (
        <Link
          href="/veli/sor"
          className="mb-3 inline-block text-xs font-medium text-[var(--astra-muted)]"
        >
          ← Yeni sohbet
        </Link>
      ) : null}

      {!viewingThread && threads?.length ? (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-medium text-[var(--astra-muted)]">
            Son sohbetlerin
          </h2>
          <ul className="space-y-1">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/veli/sor?sohbet=${thread.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[var(--astra-pill)]"
                >
                  <span className="truncate">
                    {thread.title ?? "Başlıksız sohbet"}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--astra-muted)]">
                    {formatDateShort(thread.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ChatPanel
        variant="astra"
        audience="parent"
        greetingLine={`${firstName}, çocuğuna nasıl destek olmak istersin?`}
        startPrompt="Çocuğumun ders çalışma motivasyonunu nasıl artırabilirim?"
        startLabel="Başla"
        placeholder="Bir soru sor ya da durumu anlat"
        showSubjectPicker={false}
        showAttachments={false}
        returnPath="/veli/sor"
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        hasDocuments={false}
        quotaHint={
          coachRemaining > 0
            ? `${coachRemaining} ücretsiz Destek hakkın kaldı. Plus gerekmez.`
            : "Ücretsiz Destek hakkın doldu. Plus gerekmez."
        }
        isPremium={false}
        starterPrompts={PARENT_STARTERS}
      />
    </ParentShell>
  );
}
