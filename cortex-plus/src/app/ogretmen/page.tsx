import { ChatPanel } from "@/components/chat/chat-panel";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import {
  astraGreetingName,
  astraTimeGreeting,
  astraUserInitial,
} from "@/components/parity/astra-app-utils";
import { requireStudentArea } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { isPremiumUser } from "@/lib/ai/generate";
import { parseTutorStyle, tutorStyleLabel } from "@/lib/learning/tutor-style";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreak } from "@/lib/streak/record-activity";

export const metadata = { title: "Sor" };

export default async function OgretmenPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const params = await searchParams;

  const [{ count }, { data: profile }, chatCost, isPremium, account, streak, { data: conversations }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "completed"),
      supabase
        .from("profiles")
        .select("full_name, tutor_style, primary_role, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      getCreditCost("AI_CHAT_STANDARD"),
      isPremiumUser(supabase, user.id),
      getStudentAccountContext(supabase, user.id),
      getUserStreak(supabase, user.id),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5),
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
  const timeGreeting = astraTimeGreeting();
  const moon =
    timeGreeting === "İyi akşamlar" || timeGreeting === "İyi geceler" ? " 🌙" : "";
  const greetingLine = `${firstName}, ${timeGreeting.toLowerCase()}!${moon}`;
  const style = parseTutorStyle(profile?.tutor_style);
  const avatar = profile?.avatar_url as string | null | undefined;

  return (
    <AstraParitySorShell
      userInitial={astraUserInitial(profile?.full_name, user.email)}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      streak={streak}
      account={account}
      recentConversations={(conversations ?? []).map((row) => ({
        id: row.id,
        title: row.title ?? "Yeni sohbet",
        updatedAt: row.updated_at,
      }))}
    >
      <ChatPanel
        variant="astra"
        composerMode="parity"
        greetingLine={greetingLine}
        showEmptyStarter
        startLabel="Başla"
        showSubjectPicker
        placeholder="Sor, konuş veya dosya gönder"
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        hasDocuments={(count ?? 0) > 0}
        chatCreditCost={chatCost ?? undefined}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
      />
    </AstraParitySorShell>
  );
}
