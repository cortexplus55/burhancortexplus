import { AppShell } from "@/components/layout/app-shell";
import { ChatPanel } from "@/components/chat/chat-panel";
import { astraGreetingName } from "@/components/parity/astra-app-utils";
import { requireStudentArea } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { isPremiumUser } from "@/lib/ai/generate";
import { parseTutorStyle, tutorStyleLabel } from "@/lib/learning/tutor-style";

export const metadata = { title: "Sor" };

export default async function OgretmenPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const params = await searchParams;

  const [{ count }, { data: profile }, chatCost, isPremium] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("profiles")
      .select("full_name, tutor_style, primary_role")
      .eq("id", user.id)
      .maybeSingle(),
    getCreditCost("AI_CHAT_STANDARD"),
    isPremiumUser(supabase, user.id),
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
  const greetingLine = `${firstName}, bugün ne çalışalım?`;
  const style = parseTutorStyle(profile?.tutor_style);

  return (
    <AppShell accountStrip={false}>
      <ChatPanel
        variant="astra"
        composerMode="minimal"
        greetingLine={greetingLine}
        greetingSubline="Sorunu yaz veya fotoğraf yükle — adım adım birlikte çözelim."
        showEmptyStarter={false}
        showSubjectPicker={false}
        placeholder="Sorunu yaz veya fotoğraf yükle…"
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        hasDocuments={(count ?? 0) > 0}
        chatCreditCost={chatCost ?? undefined}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
      />
    </AppShell>
  );
}
