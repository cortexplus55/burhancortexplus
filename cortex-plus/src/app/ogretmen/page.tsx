import { AppShell } from "@/components/layout/app-shell";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AstraGamificationGate } from "@/components/parity/astra-gamification";
import {
  astraGreetingName,
  astraTimeGreeting,
} from "@/components/parity/astra-app-utils";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { isPremiumUser } from "@/lib/ai/generate";
import {
  parseTutorStyle,
  tutorStyleLabel,
} from "@/lib/learning/tutor-style";

export const metadata = { title: "Sor" };

export default async function OgretmenPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;

  const [{ count }, { data: profile }, chatCost, isPremium] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("profiles")
      .select("full_name, tutor_style")
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
  const greetingLine = `${firstName}, ${astraTimeGreeting().toLowerCase()}! 🌙`;
  const style = parseTutorStyle(profile?.tutor_style);

  return (
    <AppShell>
      <AstraGamificationGate />
      <ChatPanel
        variant="astra"
        greetingLine={greetingLine}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        hasDocuments={(count ?? 0) > 0}
        chatCreditCost={chatCost}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
      />
    </AppShell>
  );
}
