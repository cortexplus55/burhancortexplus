import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { TopicBars } from "@/components/student/topic-bars";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "İlerleme" };

export default async function IlerlemePage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [conversations, quizzes, flashcards, attempts, weak] = await Promise.all([
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
  ]);

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
    (conversations.count ?? 0) > 0 ||
    (quizzes.count ?? 0) > 0 ||
    (flashcards.count ?? 0) > 0 ||
    scores.length > 0;

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page">
      {/* Sayfanın h1'i yoktu: ekran okuyucu "burası neresi" sorusunu
          yanıtlayamıyordu, sekme başlığı dışında hiçbir işaret yoktu. */}
      <div className="ap-page-head">
        <h1 className="ap-page-title">İlerleme</h1>
      </div>
      <div className="space-y-6">
        {!hasAnyActivity ? (
          <EmptyState
            variant="astra"
            icon={TrendingUp}
            title="Henüz ilerleme verin yok"
            description="Sohbet, quiz veya deneme ile çalışmaya başladığında özet burada görünür."
            actionHref="/deneme-sinavlari"
            actionLabel="Deneme çöz"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="astra-pay-card block p-4 transition-transform hover:scale-[1.01]"
              >
                <p className="text-xs text-[var(--astra-muted)]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--astra-text)]">
                  {formatNumber(stat.value)}
                  {stat.suffix ?? ""}
                </p>
                <p className="mt-2 text-xs font-semibold text-[var(--astra-primary)]">
                  Detaya git →
                </p>
              </Link>
            ))}
          </div>
        )}

        <SectionCard
          variant="astra"
          title="Eksik konular"
          description="Deneme sınavı analizlerinden çıkarılan başlıklar."
        >
          {topicRows.length ? (
            <TopicBars topics={topicRows} />
          ) : (
            <p className="text-sm text-[var(--astra-muted)]">
              Henüz analiz verisi yok. Bir deneme sınavı çözdüğünde burada görünür.
            </p>
          )}
        </SectionCard>
      </div>
      </div>
    </AstraParitySorShell>
  );
}
