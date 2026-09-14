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

export const metadata = { title: "İlerleme" };

export default async function IlerlemePage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [conversations, quizzes, flashcards, attempts, weak, mistakes, activity] =
    await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("flashcard_sets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("practice_exam_attempts")
      .select("score")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("weak_topics")
      .select("id, topic_label, severity")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    countMistakes(supabase, user.id),
    // Çalışma geçmişi: bitirilen etkinliklerin tarihleri. Son bir yıl
    // yeter; ısı haritası 52 hafta gösteriyor.
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
  ]);

  const activityStamps = (activity.data ?? [])
    .map((row) => row.updated_at as string)
    .filter(Boolean);

  const scores = (attempts.data ?? [])
    .map((row) => Number(row.score ?? 0))
    .filter((score) => score > 0);
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

  const topicRows = (weak.data ?? []).map((topic) => ({
    label: topic.topic_label ?? "Konu",
    severity: Number(topic.severity ?? 0),
  }));

  const hasAnyActivity =
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
        <h1 className="cp-page-title">İlerleme</h1>
      </div>
      <div className="space-y-6">
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
          {activityStamps.length ? (
            <SectionCard
              title="Çalışma geçmişin"
              description="Bitirdiğin etkinlikler. Ekranda geçirdiğin süreyi ölçmüyoruz; bu grafik etkinlik sayar."
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
                {mistakes.open > 0
                  ? `${formatNumber(mistakes.open)} soru tekrar bekliyor`
                  : mistakes.mastered > 0
                    ? `Bekleyen soru yok · ${formatNumber(mistakes.mastered)} soruyu aştın`
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
