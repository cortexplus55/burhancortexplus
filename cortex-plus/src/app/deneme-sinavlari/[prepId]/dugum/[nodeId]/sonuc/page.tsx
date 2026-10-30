import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { LessonRatingCard } from "@/components/parity/lesson-rating-card";
import { LevelSuggestCard } from "@/components/parity/level-suggest-card";
import { loadLevelHint } from "@/lib/learning/prep-level";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepLessonReplayHref, examPrepLessonRewriteHref, examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";
import { nodeResultView } from "@/lib/learning/node-result";
import { resultStages } from "@/lib/learning/result-stages";
import { replayLabel } from "@/lib/learning/feedback-copy";
import { mockReviewHref } from "@/lib/learning/mock-exam/prep-node-link";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { MASTERY_ROW_COLUMNS, masterySnapshotFromRow, scoreTopicMastery, topicMasteryView } from "@/lib/learning/learning-tracking";
import { countOpenMisconceptions } from "@/lib/learning/misconception-store";
import { getUserStreak } from "@/lib/streak/record-activity";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import "@/styles/node-result.css";

export const metadata = { title: "Sonuç" };
export const dynamic = "force-dynamic";

/**
 * Bitmiş etkinliğin sonucu (17 Ekim 2026, Astra'daki gibi). "Sonuçları gör" ve yoldaki
 * bitmiş düğüm buraya gelir; etkinlik baştan kurulmaz. "Dersi tekrarla" yeniden başlatır.
 *
 * Dört aşama (29 Ekim 2026): yıldız ve seri, konu hâkimiyeti artışı, kapanan ve kalan eksik,
 * sıradaki etkinlik / tekrar incele. Sayılar `result-stages.ts`'ten; sayfa cümle yazmaz.
 */
export default async function NodeResultPage({ params }: { params: Promise<{ prepId: string; nodeId: string }> }) {
  const { prepId, nodeId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prep }, { data: node }, { data: attempt }] = await Promise.all([
    supabase.from("exam_preps").select("id, target_score").eq("id", prepId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("exam_prep_nodes")
      .select("id, kind, title, session_meta")
      .eq("id", nodeId)
      .eq("exam_prep_id", prepId)
      .maybeSingle(),
    supabase
      .from("exam_prep_node_attempts")
      .select("id, score, total, created_at, started_at, updated_at, payload")
      .eq("node_id", nodeId)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!prep || !node) notFound();
  if (!attempt) redirect(examPrepNodeHref(prepId, nodeId));
  // Bitmiş yazılı deneme (20 Ekim 2026): "72/100 Doğru cevaplar" yerine denemenin soru incelemesi.
  const mockReview = mockReviewHref(prepId, node.kind as string, attempt.payload);
  if (mockReview) redirect(mockReview);

  const view = nodeResultView({
    score: attempt.score as number | null,
    total: attempt.total as number | null,
    startedAt: (attempt.started_at as string | null) ?? null,
    createdAt: attempt.created_at as string,
    updatedAt: (attempt.updated_at as string | null) ?? null,
    kind: node.kind as string,
  });
  const kind = PLAN_NODE_META[node.kind as PlanNodeKind]?.title ?? "Etkinlik";
  const topic = parseSessionMeta(node.session_meta)?.topicTitle?.trim() || String(node.title ?? "");
  const back = `/deneme-sinavlari/${prepId}`;
  const replayHref = node.kind === "lesson" ? examPrepLessonReplayHref(prepId, nodeId) : examPrepNodeHref(prepId, nodeId);

  // Her okuma kendi başına düşer: biri gelmezse kart o aşamayı "okunamadı" diye yazar, sayfa açılır.
  const target = typeof prep.target_score === "number" ? prep.target_score : null;
  const [levelHint, streak, openMisconceptions, masteryRows] = await Promise.all([
    loadLevelHint(supabase, prepId).catch(() => null),
    getUserStreak(supabase, user.id).catch(() => null),
    countOpenMisconceptions(supabase, { userId: user.id, prepId }).catch(() => null),
    supabase
      .from("exam_prep_topic_mastery")
      .select(MASTERY_ROW_COLUMNS)
      .eq("exam_prep_id", prepId)
      .eq("user_id", user.id)
      .then(({ data }) => (data ?? []) as Record<string, unknown>[], () => null),
  ]);
  const masteryStates = masteryRows
    ? masteryRows.map((row) => topicMasteryView(scoreTopicMastery(masterySnapshotFromRow(row)), target).state)
    : null;
  const stages = resultStages({
    kind: node.kind as string,
    score: attempt.score as number | null,
    total: attempt.total as number | null,
    streak,
    topicGain: (attempt.payload as { topicGain?: unknown } | null)?.topicGain,
    openMisconceptions,
    masteryStates,
  });

  return (
    <ParitySorShell {...shell} chrome="session">
      <main className={view.pct != null && view.pct < 50 ? "cp-node-result is-low" : "cp-node-result"}>
        <Link href={back} className="cp-node-result-close" aria-label="Kapat">
          <X className="h-5 w-5" aria-hidden />
        </Link>
        <p className="cp-node-result-kicker">{view.scored ? view.scoreLabel : kind}</p>
        {view.scored ? (
          <p
            className="cp-node-result-score"
            aria-label={
              view.scoreLabel === "Bildiğin kartlar"
                ? `${view.total} karttan ${view.score} bildin`
                : `${view.total} sorudan ${view.score} doğru`
            }
          >
            {view.score}
            <span>/{view.total}</span>
          </p>
        ) : null}
        <p className="cp-node-result-emoji" aria-hidden>
          {view.emoji}
        </p>
        <h1 className="cp-node-result-headline">{view.headline}</h1>
        {topic ? <p className="cp-node-result-topic">{topic}</p> : null}
        <dl className="cp-node-result-stats">
          {view.pct != null ? (
            <div>
              <dt>Doğruluk</dt>
              <dd>%{view.pct}</dd>
            </div>
          ) : null}
          {view.minutes != null ? (
            <div>
              <dt>Harcanan zaman</dt>
              <dd>{view.minutes} dk</dd>
            </div>
          ) : null}
        </dl>

        <ol className="cp-node-result-stages" aria-label="Sonuç özeti">
          {stages.map((stage) => (
            <li key={stage.id} className="cp-node-result-stage" data-stage={stage.id}>
              <span className="cp-node-result-stage-icon" aria-hidden>
                {stage.icon}
              </span>
              <span className="cp-node-result-stage-body">
                <span className="cp-node-result-stage-title">{stage.title}</span>
                <span className={stage.id === "mastery" && stage.gain ? "cp-node-result-stage-value cp-node-result-stage-gain" : "cp-node-result-stage-value"}>
                  {stage.value}
                </span>
                {stage.note ? <span className="cp-node-result-stage-note">{stage.note}</span> : null}
              </span>
            </li>
          ))}
          <li className="cp-node-result-stage" data-stage="next">
            <span className="cp-node-result-stage-body">
              <span className="cp-node-result-stage-title">Sırada ne var?</span>
              <span className="cp-node-result-actions">
                <Link href={back} className="is-primary">
                  ⏭️ Sıradaki etkinliğe geç
                </Link>
                <Link href={replayHref}>📖 Tekrar incele</Link>
              </span>
            </span>
          </li>
        </ol>

        <div className="cp-node-result-links">
          {/* Ders: aynı ders yeniden açılır; "Farklı anlat" yeni bir anlatım yazdırır (18 Ekim 2026). */}
          <Link href={replayHref} className="cp-node-result-pill">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {replayLabel(node.kind)}
          </Link>
          {/* Açık seçim (30 Ekim 2026): bitmiş dersin düz adresi artık kayıtlı dersi açar. */}
          {node.kind === "lesson" ? (
            <Link href={examPrepLessonRewriteHref(prepId, nodeId)} className="cp-node-result-pill">
              <Sparkles className="h-4 w-4" aria-hidden />
              Farklı anlat
            </Link>
          ) : null}
          <Link href={`/deneme-sinavlari/${prepId}/sohbet`} className="cp-node-result-pill">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Öğretmenine sor
          </Link>
        </div>
        <div className="cp-node-result-rating">
          {levelHint ? <LevelSuggestCard prepId={prepId} hint={levelHint} /> : null}
          <LessonRatingCard attemptId={attempt.id as string} kind={node.kind} />
        </div>
        <Link href={back} className="cp-node-result-go">
          Devam et
        </Link>
      </main>
    </ParitySorShell>
  );
}
