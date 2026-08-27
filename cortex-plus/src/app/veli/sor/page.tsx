import { ChatPanel } from "@/components/chat/chat-panel";
import { ParentShell } from "@/components/layout/parent-shell";
import { astraGreetingName } from "@/components/parity/astra-app-utils";
import { requireParent } from "@/lib/auth/session";

export const metadata = { title: "Veli desteği" };

export default async function VeliSorPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { supabase, user } = await requireParent();
  const params = await searchParams;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

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

  return (
    <ParentShell>
      <ChatPanel
        variant="astra"
        audience="parent"
        greetingLine={`${firstName}, çocuğuna nasıl destek olmak istersin? 💬`}
        startPrompt="Çocuğumun ders çalışma motivasyonunu nasıl artırabilirim?"
        startLabel="Başla"
        placeholder="Bir soru sor ya da durumu anlat"
        showSubjectPicker={false}
        showAttachments={false}
        returnPath="/veli/sor"
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        hasDocuments={false}
      />
    </ParentShell>
  );
}
