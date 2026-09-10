import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { astraUserInitial } from "@/components/parity/astra-app-utils";
import { requireStudentArea } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { isPremiumUser } from "@/lib/ai/generate";
import { parseTutorStyle, tutorStyleLabel } from "@/lib/learning/tutor-style";
import { messageFeedbackEnabled } from "@/lib/learning/message-feedback";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreak } from "@/lib/streak/record-activity";
import { examCountdownLine, loadExamChatContext } from "@/lib/learning/exam-chat-context";

/**
 * Sınavın içinden açılan sohbet.
 *
 * Sohbet genel bir sekmedeydi: öğrenci derste takıldığında sınavdan çıkıp
 * konuyu baştan anlatmak zorunda kalıyordu. Astra'da sohbet hazırlığın
 * içinde duruyor, kaç gün kaldığını biliyor ve hazır başlangıçlardan biri
 * "son testimi veya dersimi gözden geçir".
 *
 * Sayfanın kendisi ince: bağlamı sunucu tarafında `loadExamChatContext`
 * kuruyor ve `prepId` ile sohbet ucuna gidiyor.
 */
export const metadata = { title: "Sınav sohbeti" };
export const dynamic = "force-dynamic";

export default async function ExamPrepChatPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();

  const context = await loadExamChatContext(supabase, user.id, prepId);
  if (!context) notFound();

  const [{ data: profile }, isPremium, chatCost, feedbackOn, account, streak] =
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
    ]);

  const style = parseTutorStyle(profile?.tutor_style);
  const avatar = profile?.avatar_url as string | null | undefined;

  return (
    <AstraParitySorShell
      userInitial={astraUserInitial(profile?.full_name, user.email)}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      streak={streak}
      account={account}
      recentConversations={[]}
    >
      <ChatPanel
        variant="astra"
        composerMode="parity"
        prepId={prepId}
        feedbackEnabled={feedbackOn}
        greetingLine={examCountdownLine(context.prepTitle, context.daysLeft)}
        showEmptyStarter={false}
        // Konu seçici burada yanıltıcı olurdu: sohbet zaten bu hazırlığın
        // konularını biliyor, üstüne bir ders seçtirmek karışıklık yaratır.
        showSubjectPicker={false}
        placeholder="Sor, konuş veya dosya gönder"
        hasDocuments
        returnPath={`/deneme-sinavlari/${prepId}`}
        chatCreditCost={chatCost ?? undefined}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
        starterPrompts={[
          {
            label: "Anlamadığım bir şeyi açıkla",
            prompt: "Son okuduğum derste anlamadığım bir yer var, tekrar anlatır mısın?",
          },
          {
            label: "Son dersimi gözden geçir",
            prompt: "Son okuduğum dersi kısaca gözden geçirelim; en kritik noktalar neydi?",
          },
          {
            label: "Zayıf noktalarımı bul",
            prompt:
              "Bu hazırlıkta hangi konularda zayıfım? Ölçülmemiş konular varsa onları da söyle.",
          },
          {
            label: "Çalışma planını konuşalım",
            prompt: "Sınava kalan sürede neye öncelik vermeliyim?",
          },
        ]}
      />
    </AstraParitySorShell>
  );
}
