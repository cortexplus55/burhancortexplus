"use client";

import Link from "next/link";
import type { LearningTrackingView } from "@/components/parity/exam-prep-home";

export type TopicMasteryRow = {
  topicKey: string;
  measured: boolean;
  level: string;
  confidence: number;
  evidenceCount: number;
  lastPracticedAt: string | null;
};

const LEVEL_LABEL: Record<string, string> = {
  unknown: "Ölçülmedi",
  weak: "Zayıf",
  emerging: "Gelişiyor",
  solid: "Sağlam",
};

export function ExamPrepAssessment({
  prepId,
  title,
  examDate,
  daysLeft,
  tracking,
  topics,
  openMisconceptions,
  mockScorePct,
  targetScore,
  nextHref,
  mockNodeHref,
}: {
  prepId: string;
  title: string;
  examDate: string | null;
  daysLeft: number | null;
  tracking: LearningTrackingView;
  topics: TopicMasteryRow[];
  openMisconceptions: number;
  mockScorePct: number | null;
  targetScore: number | null;
  nextHref: string;
  mockNodeHref: string | null;
}) {
  const go =
    tracking.claimFullyReady ||
    (tracking.examReadinessPct >= 70 &&
      tracking.measuredTopicCount > 0 &&
      openMisconceptions === 0);

  return (
    <div className="ap-exam-page">
      <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
        ← Yola dön
      </Link>
      <header className="ap-exam-trail-head" style={{ marginTop: "1rem" }}>
        <h1>Sınav öncesi genel değerlendirme</h1>
        <p className="text-sm text-[var(--ap-muted)]">
          {title}
          {examDate ? ` · sınav ${examDate}` : ""}
          {daysLeft != null ? ` · ${daysLeft} gün` : ""}
        </p>
      </header>

      <section className="ap-countdown" aria-label="Üç gösterge">
        <AssessmentMeter
          title="Program ilerlemesi"
          pct={tracking.programProgressPct}
          label={tracking.programLabel}
          hint="Etkinlik bitirme oranı — doğruluk değil."
        />
        <AssessmentMeter
          title="Konu hâkimiyeti"
          pct={tracking.topicMasteryPct}
          label={tracking.topicMasteryLabel}
          hint={`${tracking.measuredTopicCount} ölçülen · ${tracking.unmeasuredTopicCount} ölçülmemiş`}
          emptyText="Henüz ölçülmedi"
        />
        <AssessmentMeter
          title="Sınava hazırlık tahmini"
          pct={tracking.examReadinessPct}
          label={tracking.examReadinessLabel}
          hint={
            tracking.claimFullyReady
              ? "Ölçülen başarı + kapsam + deneme."
              : "Programı bitirmek tek başına %100 hazırlık değildir."
          }
        />
      </section>

      <section className="ap-exam-assessment-verdict" role="status">
        <p className="ap-lesson-kicker">Karar özeti</p>
        <h2>{go ? "Denemeye hazır görünüyorsun" : "Önce zayıf noktaları kapat"}</h2>
        <ul className="text-sm text-[var(--ap-muted)]" style={{ paddingLeft: "1.1rem" }}>
          <li>
            Açık yanılgı: {openMisconceptions}
            {openMisconceptions > 0 ? " — tekrarlar ekranına bak" : ""}
          </li>
          <li>
            Son deneme skoru:{" "}
            {mockScorePct == null ? "henüz yok" : `%${mockScorePct}`}
            {targetScore != null ? ` · hedef %${targetScore}` : ""}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2" style={{ marginTop: "0.75rem" }}>
          <Link href={nextHref} className="ap-exam-continue ap-exam-continue--primary">
            {go ? "Sıradaki adıma git" : "Öncelikli derse git"}
          </Link>
          {openMisconceptions > 0 ? (
            <Link
              href={`/deneme-sinavlari/${prepId}/tekrarlar`}
              className="ap-exam-continue"
            >
              Yanlışlar ve tekrarlar
            </Link>
          ) : null}
          {mockNodeHref ? (
            <Link href={mockNodeHref} className="ap-exam-continue">
              Genel denemeyi aç
            </Link>
          ) : null}
        </div>
      </section>

      <section aria-label="Konu bazlı sonuçlar" style={{ marginTop: "1.25rem" }}>
        <h2 className="text-base font-semibold">Konu bazlı sonuçlar</h2>
        {!topics.length ? (
          <p className="text-sm text-[var(--ap-muted)]" role="status">
            Henüz konu ölçümü yok. Tanışma veya quiz oturumları burayı doldurur.
          </p>
        ) : (
          <ul className="ap-exam-topic-board">
            {topics.map((t) => (
              <li key={t.topicKey}>
                <strong>{t.topicKey}</strong>
                <span>
                  {t.measured
                    ? `${LEVEL_LABEL[t.level] ?? t.level} · güven %${t.confidence} · ${t.evidenceCount} kanıt`
                    : "Ölçülmedi"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AssessmentMeter({
  title,
  pct,
  label,
  hint,
  emptyText = "—",
}: {
  title: string;
  pct: number | null;
  label: string;
  hint: string;
  emptyText?: string;
}) {
  const shown = pct == null ? null : Math.max(0, Math.min(100, pct));
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div className="ap-countdown-row">
        <span>{title}</span>
        <span className="ap-countdown-pct">
          {shown == null ? emptyText : `%${shown}`}
        </span>
      </div>
      <div className="ap-countdown-meter" aria-hidden>
        <span
          style={{
            width: `${shown == null ? 0 : Math.max(shown, shown > 0 ? 3 : 0)}%`,
          }}
        />
      </div>
      <p className="ap-countdown-state text-sm">{label}</p>
      <p className="text-xs text-[var(--ap-muted)]">{hint}</p>
    </div>
  );
}
