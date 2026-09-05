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
import { messageFeedbackEnabled } from "@/lib/learning/message-feedback";
import { countMistakes } from "@/lib/learning/mistake-notebook";
import { turkishLower } from "@/lib/text/turkish";
import { firstPrompts } from "@/lib/student/first-prompts";
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

  const [
    { count },
    { data: profile },
    chatCost,
    isPremium,
    account,
    streak,
    { data: goal },
    { data: conversations },
    mistakes,
  ] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "completed"),
      supabase
        .from("profiles")
        .select(
          "full_name, tutor_style, primary_role, avatar_url, grade_level, focus_subject",
        )
        .eq("id", user.id)
        .maybeSingle(),
      getCreditCost("AI_CHAT_STANDARD"),
      isPremiumUser(supabase, user.id),
      getStudentAccountContext(supabase, user.id),
      getUserStreak(supabase, user.id),
      // Kayıt sırasında verilen hedef; başlangıç önerilerini buna göre yazıyoruz.
      supabase
        .from("learning_goals")
        .select("goal_text")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5),
      countMistakes(supabase, user.id),
    ]);

  // Kimlik ve oy da geliyor: eski bir sohbeti açtığında daha önce bastığın
  // başparmak dolu görünsün, ikinci kez oy vermeye kalkmayasın.
  let initialMessages: {
    role: "user" | "assistant";
    content: string;
    id?: string;
    rating?: 1 | -1 | null;
  }[] = [];
  let conversationId: string | undefined;

  const feedbackOn = await messageFeedbackEnabled(supabase);

  if (params.sohbet) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", params.sohbet)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversation) {
      conversationId = conversation.id;
      // İki ayrı sorgu, çünkü sütun listesi tip düzeyinde sabit olmak zorunda.
      const { data: rows } = feedbackOn
        ? await supabase
            .from("messages")
            .select("id, role, content, rating")
            .eq("conversation_id", conversation.id)
            .order("created_at")
        : await supabase
            .from("messages")
            .select("id, role, content")
            .eq("conversation_id", conversation.id)
            .order("created_at");
      initialMessages = (rows ?? [])
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => ({
          role: row.role as "user" | "assistant",
          content: row.content as string,
          id: row.id as string,
          rating: ("rating" in row ? (row.rating as 1 | -1 | null) : null) ?? null,
        }));
    }
  }

  const firstName = astraGreetingName(profile?.full_name ?? user.email);
  const timeGreeting = astraTimeGreeting();
  const moon =
    timeGreeting === "İyi akşamlar" || timeGreeting === "İyi geceler" ? " 🌙" : "";
  // `toLowerCase()` burada "İ"yi "i" + ayrı bir nokta işaretine çeviriyordu:
  // ekranda "i̇yi günler" diye çift noktalı görünüyordu.
  const greetingLine = `${firstName}, ${turkishLower(timeGreeting)}!${moon}`;
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
        feedbackEnabled={feedbackOn}
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
        starterPrompts={firstPrompts({
          grade: profile?.grade_level,
          subject: profile?.focus_subject,
          goal: goal?.goal_text,
        })}
        dailyDrillCount={mistakes.open}
      />
    </AstraParitySorShell>
  );
}
