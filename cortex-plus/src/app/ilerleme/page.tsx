import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "İlerleme" };

export default async function IlerlemePage() {
  const { supabase, user } = await requireUser();

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
    { label: "Sohbet", value: conversations.count ?? 0 },
    { label: "Quiz", value: quizzes.count ?? 0 },
    { label: "Kart seti", value: flashcards.count ?? 0 },
    { label: "Deneme ortalaması", value: average ?? 0, suffix: average ? "/100" : "" },
  ];

  return (
    <AppShell title="İlerleme">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatNumber(stat.value)}
                {stat.suffix ?? ""}
              </p>
            </div>
          ))}
        </div>

        <SectionCard
          title="Eksik konular"
          description="Deneme sınavı analizlerinden çıkarılan başlıklar."
        >
          {weak.data?.length ? (
            <ul className="space-y-2">
              {weak.data.map((topic) => (
                <li
                  key={topic.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{topic.topic_label ?? "Konu"}</span>
                  <span className="text-xs text-muted-foreground">
                    öncelik {Math.round(Number(topic.severity) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Henüz analiz verisi yok. Bir deneme sınavı çözdüğünde burada görünür.
            </p>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
