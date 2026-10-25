import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { TopicBars } from "@/components/student/topic-bars";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { formatNumber } from "@/lib/format";
import { countMistakes } from "@/lib/learning/mistake-notebook";
import { ActivityHistory } from "@/components/student/activity-history";
import { LearningTimeCard } from "@/components/student/learning-time-card";
import { StreakFreezeBadge } from "@/components/parity/streak-freeze-badge";
import { streakFreezeTitle } from "@/lib/learning/streak-freeze-copy";
import { PrepRadarChart } from "@/components/parity/prep-radar-chart";
import { PrepForecastChart } from "@/components/parity/prep-forecast-chart";
import { loadNearestPrepInsights } from "@/lib/learning/prep-insights-load";
import { todayKey } from "@/lib/learning/daily-drill";
import { normalizeLearningRows, type LearningTimeRow } from "@/lib/learning/learning-time";

export const metadata = { title: "Aktivitelerim" };
export const dynamic = "force-dynamic";

type CountResult = { count: number | null };
type RowsResult<T> = { data: T[] | null };

/**
 * Bir kaynak düşerse sayfa düşmez: o kart boş görünür. Supabase sorgusu hata
 * nesnesi döndürür, yardımcılar fırlatabilir — ikisi de burada yakalanır.
 */
async function settle<T>(label: string, work: PromiseLike<T> | (() => PromiseLike<T>), fallback: T): Promise<T> {
  try {
    const result = await (typeof work === "function" ? work() : work);
    const error = (result as { error?: unknown } | null)?.error;
    if (error) {
      console.error(`[ilerleme] ${label}_failed`, error);
      return fallback;
    }
    return result ?? fallback;
  } catch (error) {
    console.error(`[ilerleme] ${label}_failed`, error);
    return fallback;
  }
}

const NO_COUNT: CountResult = { count: 0 };

export default async function IlerlemePage() {
  const { supabase, user } = await requireStudentArea();

  const [shell, conversations, quizzes, flashcards, attempts, weak, mistakes, activity, learningTime, prepInsights] =
    await Promise.all([
    settle("shell", () => loadParityShellProps(supabase, user.id, user.email), {} as Partial<
      Awaited<ReturnType<typeof loadParityShellProps>>
    >),
    settle<CountResult>(
      "conversations",
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      NO_COUNT,
    ),
    settle<CountResult>(
      "quizzes",
      supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      NO_COUNT,
    ),
    settle<CountResult>(
      "flashcards",
      supabase
        .from("flashcard_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      NO_COUNT,
    ),
    settle<RowsResult<{ score: unknown }>>(
      "attempts",
      supabase
        .from("practice_exam_attempts")
        .select("score")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      { data: [] },
    ),
    settle<RowsResult<{ topic_label: unknown; severity: unknown }>>(
      "weak_topics",
      supabase
        .from("weak_topics")
        .select("id, topic_label, severity")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      { data: [] },
    ),
    settle("mistakes", () => countMistakes(supabase, user.id), { open: 0, mastered: 0 }),
    // Çalışma geçmişi: bitirilen etkinliklerin tarihleri. Son bir yıl
    // yeter; ısı haritası 52 hafta gösteriyor.
    settle<RowsResult<{ updated_at: unknown }>>(
      "activity",
      supabase
        .from("exam_prep_node_attempts")
        .select("updated_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte(
          "updated_at",
          new Date(Date.now() - 370 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .order("updated_at", { ascending: false })
        .limit(2000),
      { data: [] },
    ),
    // Aktif öğrenme süresi (ders, test, sohbet). Gün × ekran × ders satırı.
    settle<RowsResult<unknown>>(
      "learning_time",
      supabase
        .from("learning_time")
        .select("activity_date, subject, seconds")
        .eq("user_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(5000),
      { data: [] },
    ),
    settle("prep_insights", () => loadNearestPrepInsights(supabase, user.id), null),
  ]);
  const learningRows: LearningTimeRow[] = normalizeLearningRows(learningTime.data);

  const activityStamps = (activity.data ?? [])
    .map((row) => (typeof row?.updated_at === "string" ? row.updated_at : ""))
    .filter((stamp) => stamp && !Number.isNaN(Date.parse(stamp)));

  const scores = (attempts.data ?? [])
    .map((row) => Number(row?.score ?? 0))
    .filter((score) => Number.isFinite(score) && score > 0);
  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;

  const stats = [
    {
      label: "Sohbet",
      value: conversations.count ?? 0,
      href: "/sohbetler",
    },
    { label: "Quiz", value: quizzes.count ?? 0, href: "/quizler" },
    { label: "Kart seti", value: flashcards.count ?? 0, href: "/flashcardlar" },
    {
      label: "Deneme ortalaması",
      value: average ?? 0,
      suffix: average ? "/100" : "",
      href: "/deneme-sinavlari",
    },
  ];

  const topicRows = (weak.data ?? []).filter(Boolean).map((topic) => ({
    label: typeof topic.topic_label === "string" && topic.topic_label.trim() ? topic.topic_label : "Konu",
    severity: Number(topic.severity) || 0,
  }));
  const openMistakes = Number(mistakes?.open) || 0;
  const masteredMistakes = Number(mistakes?.mastered) || 0;

  const hasAnyActivity =
    learningRows.length > 0 ||
    activityStamps.length > 0 ||
    (conversations.count ?? 0) > 0 ||
    (quizzes.count ?? 0) > 0 ||
    (flashcards.count ?? 0) > 0 ||
    scores.length > 0;

  return (
    <ParitySorShell {...shell}>
      <div className="cp-exam-page">
      {/* Sayfanın h1'i yoktu: ekran okuyucu "burası neresi" sorusunu
          yanıtlayamıyordu, sekme başlığı dışında hiçbir işaret yoktu. */}
      <div className="cp-page-head">
        <h1 className="cp-page-title">Aktivitelerim</h1>
      </div>
      <div className="space-y-6">
        {prepInsights ? (
          <SectionCard
            title="Hazırlık düzeyi"
            description={`${prepInsights.title} · 5 eksen ve 14 günlük tahmin. Uydurma yükseliş yok.`}
          >
            <div className="cp-prep-insights">
              <PrepRadarChart view={prepInsights.radar} compact />
              <PrepForecastChart series={prepInsights.forecastSeries} />
            </div>
            <Link
              href={prepInsights.href}
              className="mt-4 inline-flex text-sm font-semibold text-[var(--cs-primary)]"
            >
              Hazırlık yoluna git →
            </Link>
          </SectionCard>
        ) : null}
        <SectionCard
          title="Çalışma serin"
          description={
            shell.streakFreeze
              ? streakFreezeTitle(shell.streakFreeze)
              : "Üst üste çalıştığın günler. Bir gün boşlukta kalkan seriyi korur."
          }
        >
          <p className="flex items-center gap-2 text-2xl font-semibold text-[var(--cs-text)]">
            <span aria-hidden>🔥</span>
            <span>{Number(shell.streak) || 0} gün</span>
            {shell.streakFreeze ? <StreakFreezeBadge state={shell.streakFreeze} /> : null}
          </p>
        </SectionCard>
        {!hasAnyActivity ? (
          <EmptyState
            variant="parity"
            icon={TrendingUp}
            title="Henüz ilerleme verin yok"
            description="Sohbet, quiz veya deneme ile çalışmaya başladığında özet burada görünür."
            actionHref="/deneme-sinavlari"
            actionLabel="Deneme çöz"
          />
        ) : (
          <>
          <LearningTimeCard rows={learningRows} today={todayKey()} />
          {activityStamps.length ? (
            <SectionCard
              title="Çalışma geçmişin"
              description="Bitirdiğin dersler, testler ve denemeler."
            >
              <ActivityHistory timestamps={activityStamps} />
            </SectionCard>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="cs-pay-card block p-4 transition-transform hover:scale-[1.01]"
              >
                <p className="text-xs text-[var(--cs-muted)]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--cs-text)]">
                  {formatNumber(stat.value)}
                  {stat.suffix ?? ""}
                </p>
                <p className="mt-2 text-xs font-semibold text-[var(--cs-primary)]">
                  Detaya git →
                </p>
              </Link>
            ))}
          </div>
          </>
        )}

        <SectionCard
          variant="parity"
          title="Eksik konular"
          description="Deneme sınavı analizlerinden çıkarılan başlıklar."
        >
          {topicRows.length ? (
            <TopicBars topics={topicRows} />
          ) : (
            <p className="text-sm text-[var(--cs-muted)]">
              Henüz analiz verisi yok. Bir deneme sınavı çözdüğünde burada görünür.
            </p>
          )}

          {/* Grafik neyi bilmediğini söylüyordu ama yapılacak bir şey
              önermiyordu. Defter tam olarak o soruları tutuyor. */}
          <Link
            href="/yanlislarim"
            className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 p-4 transition-colors hover:border-white/25"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--cs-text)]">
                Yanlış defteri
              </span>
              <span className="mt-1 block text-xs text-[var(--cs-muted)]">
                {openMistakes > 0
                  ? `${formatNumber(openMistakes)} soru tekrar bekliyor`
                  : masteredMistakes > 0
                    ? `Bekleyen soru yok · ${formatNumber(masteredMistakes)} soruyu aştın`
                    : "Yanlış yaptığın sorular burada birikir"}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-[var(--cs-primary)]">
              Aç →
            </span>
          </Link>
        </SectionCard>
      </div>
      </div>
    </ParitySorShell>
  );
}
