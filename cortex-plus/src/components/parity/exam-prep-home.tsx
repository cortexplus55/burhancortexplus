"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PLAN_NODE_META,
  daysUntilExam,
  readinessLabel,
  readinessScore,
  type NodeStatus,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";
import { cn } from "@/lib/utils";

export type HomeNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
  status: NodeStatus;
};

export function ExamPrepHome({
  prepId,
  title,
  examType,
  examDate,
  daysLabel,
  progressPct,
  nodes,
  hasTopic,
  activeTopicLabel,
  needsIntro,
  startHref,
}: {
  prepId: string;
  title: string;
  examType: string;
  examDate: string | null;
  daysLabel: string;
  progressPct: number;
  nodes: HomeNode[];
  hasTopic: boolean;
  activeTopicLabel?: string | null;
  needsIntro: boolean;
  startHref: string;
}) {
  const router = useRouter();
  const ready = nodes.find((node) => node.status === "ready");
  const started = hasTopic && !needsIntro;
  const daysLeft = examDate ? daysUntilExam(examDate) : null;
  const readiness = readinessScore(nodes);
  const readinessState = readinessLabel(readiness);

  return (
    <div className="ap-exam-page ap-exam-trail-page">
      <Link href="/deneme-sinavlari" className="ap-back-pill">
        ← Geri
      </Link>
      <header className="ap-exam-trail-head">
        <div className="ap-exam-trail-meter" aria-hidden>
          <span style={{ width: `${progressPct}%` }} />
        </div>
        <p>{progressPct}%</p>
        <h1>{title}</h1>
        <p className="text-sm text-[var(--ap-muted)]">
          {examType}
          {examDate ? ` · sınav ${examDate}` : ""}
          {daysLabel ? ` · ${daysLabel}` : ""}
        </p>
        {activeTopicLabel ? (
          <div>
            <Link
              href={`/deneme-sinavlari/${prepId}/konu`}
              className="ap-exam-topic-badge"
              title="Çalışılan konuyu değiştir"
            >
              <strong>{activeTopicLabel}</strong>
              <span>Değiştir ↻</span>
            </Link>
          </div>
        ) : null}
      </header>

      {daysLeft !== null ? (
        <section
          className={cn(
            "ap-countdown",
            daysLeft <= 3 && "ap-countdown--urgent",
          )}
        >
          <p className="ap-countdown-kicker">Sınava kadar</p>
          <p className="ap-countdown-days">
            <strong>{daysLeft}</strong>
            <span>gün</span>
          </p>

          <div className="ap-countdown-readiness">
            <div className="ap-countdown-row">
              <span>Hazırlık puanın</span>
              <span className="ap-countdown-pct">%{readiness}</span>
            </div>
            <div className="ap-countdown-meter" aria-hidden>
              <span style={{ width: `${Math.max(readiness, readiness > 0 ? 3 : 0)}%` }} />
            </div>
            <p className="ap-countdown-state">
              <span aria-hidden>{readinessState.emoji}</span> {readinessState.text}
            </p>
          </div>
        </section>
      ) : null}

      <ol className="ap-exam-trail">
        {nodes.map((node, index) => (
          <li
            key={node.id}
            className={`ap-exam-trail-item ap-exam-trail-item--${index % 2 === 0 ? "left" : "right"}`}
          >
            <button
              type="button"
              className={`ap-exam-trail-node ap-exam-trail-node--${node.status}`}
              disabled={node.status === "locked"}
              aria-label={`${node.title}, gün ${node.dayIndex}`}
              onClick={() => {
                if (!hasTopic) {
                  router.push(`/deneme-sinavlari/${prepId}/konu`);
                  return;
                }
                if (needsIntro) {
                  router.push(`/deneme-sinavlari/${prepId}/tanisma`);
                  return;
                }
                router.push(`/deneme-sinavlari/${prepId}/dugum/${node.id}`);
              }}
            >
              {node.status === "done" ? "✓" : node.status === "locked" ? "🔒" : index + 1}
            </button>
            <span>
              <strong>{PLAN_NODE_META[node.kind].title}</strong>
              <em>Gün {node.dayIndex}</em>
            </span>
          </li>
        ))}
      </ol>

      <div className="ap-exam-start-card">
        <p>{started ? "Sıradaki derse geç" : "Başlamaya hazır mısın?"}</p>
        <Link href={startHref} className="ap-exam-continue ap-exam-continue--primary">
          {started
            ? ready
              ? `Sonraki: ${PLAN_NODE_META[ready.kind].title}`
              : "Yola dön"
            : "Hadi başlayalım!"}
        </Link>
      </div>
    </div>
  );
}
