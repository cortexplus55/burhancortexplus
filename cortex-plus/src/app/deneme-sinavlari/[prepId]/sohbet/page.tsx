import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { parityUserInitial } from "@/components/parity/app-utils";
import { requireStudentArea } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { isPremiumUser } from "@/lib/ai/generate";
import { parseTutorStyle, tutorStyleLabel } from "@/lib/learning/tutor-style";
import { messageFeedbackEnabled } from "@/lib/learning/message-feedback";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreak } from "@/lib/streak/record-activity";
import { examChatGreeting, loadExamChatContext } from "@/lib/learning/exam-chat-context";
import { EXAM_CHAT_STARTERS } from "@/lib/learning/exam-chat-chrome";

/**
 * Sınavın içinden açılan sohbet.
 *
 * Kabuk sınav sohbetine özel: geri, seri, menü, avatar. Karşılama cümlesi
 * kaç gün kaldığını söyler; boş ekrandaki dört çip ve oluşturucunun üstündeki
 * hızlı komutlar sabit metindir. Geçmiş, öğrencinin kendi konuşma kayıtlarıdır.
 */
export const metadata = { title: "Sınav sohbeti" };
export const dynamic = "force-dynamic";

const SOHBET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExamPrepChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ sohbet?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();

  const context = await loadExamChatContext(supabase, user.id, prepId);
  if (!context) notFound();

  const [{ data: profile }, isPremium, chatCost, feedbackOn, account, streak, { data: conversations }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, tutor_style")
        .eq("id", user.id)
        .maybeSingle(),
      isPremiumUser(supabase, user.id),
      getCreditCost("AI_CHAT_STANDARD"),
      messageFeedbackEnabled(supabase),
      getStudentAccountContext(supabase, user.id),
      getUserStreak(supabase, user.id),
      supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

  const style = parseTutorStyle(profile?.tutor_style);
  const avatar = profile?.avatar_url as string | null | undefined;
  const chatPath = `/deneme-sinavlari/${prepId}/sohbet`;

  let initialMessages: {
    role: "user" | "assistant";
    content: string;
    id?: string;
    rating?: 1 | -1 | null;
  }[] = [];
  let conversationId: string | undefined;
  const requested = query.sohbet && SOHBET_ID.test(query.sohbet) ? query.sohbet : undefined;

  if (requested) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", requested)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (conversation) {
      conversationId = conversation.id;
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

  return (
    <ParitySorShell
      chrome="exam"
      backHref={`/deneme-sinavlari/${prepId}`}
      conversationBaseHref={chatPath}
      userInitial={parityUserInitial(profile?.full_name, user.email)}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      streak={streak}
      account={account}
      recentConversations={(conversations ?? []).map((row) => ({
        id: row.id as string,
        title: (row.title as string | null) ?? "Yeni sohbet",
        updatedAt: row.updated_at as string,
      }))}
    >
      <ChatPanel
        variant="parity"
        composerMode="parity"
        examChrome
        prepId={prepId}
        feedbackEnabled={feedbackOn}
        greetingLine={examChatGreeting(context.prepTitle, context.daysLeft)}
        showEmptyStarter={false}
        showSubjectPicker={false}
        placeholder="Sor, konuş veya dosya gönder"
        hasDocuments
        returnPath={`/deneme-sinavlari/${prepId}`}
        chatCreditCost={chatCost ?? undefined}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
        starterPrompts={context.starters.length ? context.starters : EXAM_CHAT_STARTERS}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
      />
    </ParitySorShell>
  );
}
