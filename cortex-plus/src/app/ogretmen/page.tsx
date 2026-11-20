import { emailUnverifiedFromMetadata } from "@/lib/auth/email-unverified-flag";
import { ChatPanel } from "@/components/chat/chat-panel";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { ParitySorShell } from "@/components/parity/sor-shell";
import {
  parityGreetingName,
  parityTimeGreeting,
  parityShellName,
  parityUserInitial,
} from "@/components/parity/app-utils";
import { requireStudentArea } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { parseTutorStyle, tutorStyleLabel } from "@/lib/learning/tutor-style";
import { messageFeedbackEnabled } from "@/lib/learning/message-feedback";
import { turkishLower } from "@/lib/text/turkish";
import { homeLine, startGreeting as companionStartGreeting } from "@/lib/companion/voice";
import { loadActivityDays, loadTodayMood } from "@/lib/companion/today-mood";
import { istanbulDay } from "@/lib/istanbul-day";
import { getSessionUserContext } from "@/lib/auth/session-context";
import { loadRecentConversations } from "@/lib/student/recent-conversations";
import { getUserStreak } from "@/lib/streak/record-activity";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { loadNearestExamCountdown } from "@/lib/learning/exam-countdown-load";
import { loadContinueStep } from "@/lib/learning/prep-cards";
import { pathSkipKindsForView } from "@/lib/billing/node-free-meter";
import { createServiceClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { ContinueLine } from "@/components/parity/continue-line";
import { HomeCockpit, HomeSelectionProvider, HomeToolsTray } from "@/components/parity/home-cockpit";
import { loadHomeCockpit, type NodeRow } from "@/lib/learning/home-cockpit";
import { uiV2 } from "@/lib/ui-v2/flags";
import { InviteStrip } from "@/components/growth/invite-strip";
import { loadInviteLink } from "@/lib/credits/invite-code";
import "@/styles/ui-v2-buyume.css";
import "@/styles/ui-v2-ogretmen.css";
import { firstLessonStatus, freeTopicLocks } from "@/lib/billing/free-topic-gate";

export const metadata = { title: "Sor" };

export default async function OgretmenPage({
  searchParams,
}: {
  searchParams: Promise<{ sohbet?: string; belge?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const params = await searchParams;
  const hasConversation = Boolean(params.sohbet);

  // Faz 2 (madde 2): profil, plan ve kredi özeti oturum bağlamından (requireUser ile aynı istek içi okuma; 45 sn
  // paylaşımlı önbellek). Birbirine bağlı olmayan bütün okumalar tek turda; eskiden geri bildirim bayrağı, sohbet,
  // mesajlar, ruh hali, bayraklar sırayla bekleniyordu.
  const [
    { count },
    context,
    chatCost,
    streak,
    { data: goal },
    recent,
    { count: prepCount },
    countdown,
    feedbackOn,
    conversationRead,
    todayMood,
    activityRead,
    uiOgretmen,
    teacherV2,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
    getSessionUserContext(user.id, { client: supabase }),
    getCreditCost("AI_CHAT_STANDARD"),
    getUserStreak(supabase, user.id),
    // Kayıt sırasında verilen hedef; başlangıç önerilerini buna göre yazıyoruz.
    supabase
      .from("learning_goals")
      .select("goal_text, target_date")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    loadRecentConversations(supabase, user.id),
    // Hiç hazırlığı yoksa selamın altında ilk adım kartı (19 Ekim 2026). "Hedef puan" kaydı sayılmaz.
    supabase
      .from("exam_preps")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("exam_type", "hedef")
      .neq("exam_type", STUDIO_EXAM_TYPE),
    loadNearestExamCountdown(supabase, user.id),
    messageFeedbackEnabled(supabase),
    hasConversation
      ? supabase
          .from("conversations")
          .select("id")
          .eq("id", params.sohbet!)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Dost katmanı (8 Kasım 2026): selamın altındaki satır ve öğretmenin ilk sözü gerçek sinyallerden (ruh hali, seri,
    // son çalışmadan beri geçen gün, sınava kalan gün, sıradaki adım). Model çağrısı yok; okuma düşerse sade selam.
    loadTodayMood(supabase, user.id).catch(() => null),
    loadActivityDays(supabase, user.id).catch(() => null),
    // Yeni görünüm bayrağı (Faz 6A, `ui.v2.ogretmen`): KAPALIYKEN sarmalayıcı yok ve sohbet bugünkü gibi kayar.
    uiV2("ogretmen", user.id),
    // Faz 13A (15 Kasım 2026): öğretmen hissi, kişi bazlı bayrak; okuma düşerse kapalı.
    isFeatureEnabled(createServiceClient(), TEACHER_V2_FLAG, user.id).catch(() => false),
  ]);
  const profile = context.profile;
  const account = context.account;
  const isPremium = context.entitlements.isPremium;
  const conversations = recent;
  const activity = activityRead ?? { daysSinceLast: null, streak };

  // Kimlik ve oy da geliyor: eski bir sohbeti açtığında daha önce bastığın
  // başparmak dolu görünsün, ikinci kez oy vermeye kalkmayasın.
  let initialMessages: {
    role: "user" | "assistant";
    content: string;
    id?: string;
    rating?: 1 | -1 | null;
  }[] = [];
  let conversationId: string | undefined;
  const conversation = (conversationRead as { data: { id: string } | null }).data;

  // Faz 3B: ücretsiz hesapta kilitli adımlar sunucunun kararından (`freeTopicLocks`, hazırlık sayfasıyla aynı girdi).
  const freeAccount = account?.showsUpgradeChrome === true && !account?.isAdmin;
  const lockService = freeAccount ? createServiceClient() : null;
  const withPreps = !hasConversation && (prepCount ?? 0) > 0;

  // İkinci tur: yalnız ilk turun sonucuna bağlı okumalar, birlikte.
  const [rows, skipKinds, firstLesson] = await Promise.all([
    conversation
      ? feedbackOn
        ? supabase
            .from("messages")
            .select("id, role, content, rating")
            .eq("conversation_id", conversation.id)
            .order("created_at")
            .then(({ data }) => data)
        : supabase
            .from("messages")
            .select("id, role, content")
            .eq("conversation_id", conversation.id)
            .order("created_at")
            .then(({ data }) => data)
      : Promise.resolve(null),
    // Ana ekran öğretmenle sohbet alanıdır (8 Kasım 2026, ürün sahibi): selam, Başla ve hiç hazırlığı olmayan öğrenciye
    // ilk adım kartları. Hazırlığı olan öğrenciye tek satır "Kaldığın yerden devam" (8 Kasım 2026); okuma düşerse
    // satır yok. 13 Kasım 2026 (ürün sahibinin kararı): hazırlığı olan öğrencinin boş ana ekranı beş parça (sınav
    // şeridi, konu halkası, metin bloğu, ince yazma çubuğu, üst çubuk). Veri devam kartının kaynağından; okuma düşerse
    // eski devam kartına dönülür.
    withPreps ? pathSkipKindsForView(createServiceClient(), user.id, supabase).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
    // Ücretsiz hesabın ilk dersi (kapı ve "Ücretsiz ders" etiketi; okunamazsa null: kapı açık der, OTONOM §9 karar 3).
    lockService
      ? firstLessonStatus(lockService, user.id).then((status) => status?.state ?? null).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (conversation) {
    conversationId = conversation.id;
    // İki ayrı sorgu, çünkü sütun listesi tip düzeyinde sabit olmak zorunda.
    initialMessages = ((rows ?? []) as { id: string; role: string; content: string; rating?: number | null }[])
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content as string,
        id: row.id as string,
        rating: ("rating" in row ? (row.rating as 1 | -1 | null) : null) ?? null,
      }));
  }

  const firstName = parityGreetingName(profile?.full_name ?? user.email);
  const timeGreeting = parityTimeGreeting();
  const moon =
    timeGreeting === "İyi akşamlar" || timeGreeting === "İyi geceler" ? " 🌙" : "";
  // `toLowerCase()` burada "İ"yi "i" + ayrı bir nokta işaretine çeviriyordu:
  // ekranda "i̇yi günler" diye çift noktalı görünüyordu.
  const greetingLine = `${firstName}, ${turkishLower(timeGreeting)}!${moon}`;
  const goalText = goal?.goal_text ?? null;
  // Dost katmanı (8 Kasım 2026): selamın altındaki satır ve öğretmenin ilk sözü gerçek sinyallerden (ruh hali, seri,
  // son çalışmadan beri geçen gün, sınava kalan gün, sıradaki adım). Model çağrısı yok; okuma düşerse sade selam.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  const companionSignals = {
    firstName: firstName === "Merhaba" ? null : firstName,
    mood: todayMood,
    streak: activity.streak || streak,
    daysSinceLast: activity.daysSinceLast,
    examDaysLeft: countdown?.state === "countdown" ? countdown.daysLeft : null,
    examTitle: countdown?.state === "countdown" ? countdown.examTitle : null,
    hour,
    seed: istanbulDay(),
    // 11 Kasım 2026: sınav sabahı kâğıdı Plus'ta; ücretsiz hesaba (yükseltme kromu gören) kâğıt önerilmez.
    cramSheetLocked: account?.showsUpgradeChrome === true,
  };
  const startGreeting = companionStartGreeting(companionSignals);
  const style = parseTutorStyle(profile?.tutor_style);
  const lockedNodeIds = lockService
    ? async (prepId: string, prepTitle: string, rows: readonly NodeRow[]) => {
        const locks = await freeTopicLocks(lockService, {
          userId: user.id,
          prepId,
          nodes: rows
            .filter((row) => row.status !== "done")
            .map((row) => ({
              id: String(row.id),
              kind: String(row.kind ?? ""),
              sessionMeta: row.session_meta ?? null,
              topicLabel: String((row.session_meta as { topicTitle?: string } | null)?.topicTitle ?? "") || prepTitle || "konu",
            })),
        });
        return new Set(locks?.lockedIds ?? []);
      }
    : undefined;
  const cockpit = withPreps ? await loadHomeCockpit(supabase, user.id, skipKinds, lockedNodeIds).catch(() => []) : [];
  const continueStep =
    withPreps && cockpit.length === 0
      ? await loadContinueStep(supabase, user.id, skipKinds).catch(() => null)
      : null;
  const greetingSubline = params.sohbet
    ? undefined
    : homeLine({
        ...companionSignals,
        nextStep: continueStep
          ? { heading: continueStep.next.heading, kindLabel: continueStep.next.kindLabel, minutes: continueStep.next.minutes }
          : null,
      }).text;
  const heroCards =
    !params.sohbet && prepCount === 0 ? (
      <FirstStepLauncher firstName={firstName} gradeLevel={profile?.grade_level} goalText={goalText} />
    ) : undefined;
  // Kaldığın yerden devam selamla Başla'nın arasında (10 Kasım 2026): Başla'nın altındayken telefonda ilk ekranda
  // hiç görünmüyordu. Dost satırı aynı adımı anıyorsa kartın hemen üstünde kalır, ikisi birlikte okunur.
  const heroLead = continueStep ? <ContinueLine step={continueStep} /> : undefined;
  const avatar = profile?.avatar_url as string | null | undefined;
  // Faz 11C (`ui.v2.buyume`): ilk ders tamamlanınca ana ekranda davet şeridi (ücretsizde ilk dersin durumu, ücretlide
  // yolda biten bir adım). Bağlantı /davet ile aynı kaynaktan; bayrak kapalıyken okunmaz.
  const inviteStrip =
    cockpit.length && (firstLesson === "done" || cockpit.some((prep) => prep.progress.done > 0)) && (await uiV2("buyume", user.id))
      ? await loadInviteLink(supabase, user.id)
          .then(({ url }) => <InviteStrip url={url} plan={account?.audience ?? "free"} />)
          .catch(() => undefined)
      : undefined;

  const panel = (
      <ChatPanel
        homeCockpit={cockpit.length ? <HomeCockpit aside={inviteStrip} /> : undefined}
        homeTools={cockpit.length ? <HomeToolsTray freeAccount={freeAccount} /> : undefined}
        variant="parity"
        composerMode="parity"
        feedbackEnabled={feedbackOn}
        greetingLine={greetingLine}
        greetingSubline={greetingSubline}
        startGreeting={startGreeting}
        showEmptyStarter
        startLabel="Başla"
        heroFooter={heroCards}
        heroLead={heroLead}
        showSubjectPicker
        placeholder="Sor, konuş veya dosya gönder"
        initialConversationId={conversationId}
        initialDocumentId={params.belge}
        initialMessages={initialMessages}
        hasDocuments={(count ?? 0) > 0}
        chatCreditCost={chatCost ?? undefined}
        isPremium={isPremium}
        tutorStyleLabel={tutorStyleLabel(style)}
        initialTutorStyle={style}
        followUser={uiOgretmen}
        teacherV2={teacherV2}
      />
  );
  const body = cockpit.length ? <HomeSelectionProvider preps={cockpit}>{panel}</HomeSelectionProvider> : panel;

  return (
    <ParitySorShell
      home
      userInitial={parityUserInitial(profile?.full_name, user.email)}
      userName={parityShellName(profile?.full_name, user.email)}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      streak={streak}
      account={account}
      entitlements={{ firstLesson, examDaysLeft: countdown?.state === "countdown" ? countdown.daysLeft : null }}
      emailUnverified={!account?.isAdmin && emailUnverifiedFromMetadata(user.app_metadata)}
      recentConversations={conversations}
    >
      {uiOgretmen ? (
        <div className="cx-ui-scope" data-ui="ogretmen">
          {body}
        </div>
      ) : (
        body
      )}
    </ParitySorShell>
  );
}
