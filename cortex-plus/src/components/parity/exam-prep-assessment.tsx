"use client";

import Link from "next/link";
import { formatDayLong } from "@/lib/format";
import type { LearningTrackingView } from "@/components/parity/exam-prep-home";
import { READY_HEADLINE } from "@/lib/learning/learning-tracking";
import { METRIC_HINT, METRIC_LABEL, coverageLine } from "@/lib/learning/prep-metrics";

/**
 * Konu satırı `topicMasteryView`'dan (30 Ekim 2026, Paket I #7): yol, İlerleme ve Hazırsın ile aynı rozet
 * ve aynı sayı. Önceden burada kayıtlı `confidence` ve `measured_level` okunuyordu; ölçülmemiş konu da sayı
 * gösteriyordu.
 */
export type TopicMasteryRow = {
  topicKey: string;
  measured: boolean;
  /** "Sağlam" / "Çalışılacak" / "Ölçülmedi". */
  stateLabel: string;
  /** "%62" ya da "Ölçülmedi". */
  percentText: string;
  evidenceCount: number;
  lastPracticedAt: string | null;
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
  // Tek karar (29 Ekim 2026): "Hazırsın" ekranıyla aynı iddia. Buradaki ayrı %70 eşiği değerlendirme
  // sayfasını "hazır" derken yolun Hazırsın düğümünü kapalı bırakıyordu.
  const go = tracking.claimFullyReady;

  return (
    <div className="cp-exam-page">
      <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
        ← Yola dön
      </Link>
      <header className="cp-exam-trail-head" style={{ marginTop: "1rem" }}>
        <h1>Sınav öncesi genel değerlendirme</h1>
        <p className="text-sm text-[var(--cp-muted)]">
          {title}
          {examDate ? ` · sınav ${formatDayLong(examDate)}` : ""}
          {daysLeft != null ? ` · ${daysLeft} gün` : ""}
        </p>
      </header>

      <section className="cp-countdown" aria-label="Üç gösterge">
        <AssessmentMeter
          title={METRIC_LABEL.completion}
          pct={tracking.programProgressPct}
          label={tracking.programLabel}
          hint={METRIC_HINT.completion}
        />
        <AssessmentMeter
          title={METRIC_LABEL.mastery}
          pct={tracking.topicMasteryPct}
          label={tracking.topicMasteryLabel}
          hint={`${METRIC_HINT.mastery} ${coverageLine(
            tracking.measuredTopicCount,
            tracking.measuredTopicCount + tracking.unmeasuredTopicCount,
          )}.`}
          emptyText="Ölçülmedi"
        />
        <AssessmentMeter
          title={METRIC_LABEL.readiness}
          pct={tracking.examReadinessPct}
          label={tracking.examReadinessLabel}
          hint={
            tracking.claimFullyReady
              ? "Ölçülen başarı + kapsam + deneme."
              : `${METRIC_HINT.readiness} Adımları bitirmek tek başına %100 hazırlık değildir.`
          }
        />
      </section>

      <section className="cp-exam-assessment-verdict" role="status">
        <p className="cp-lesson-kicker">Karar özeti</p>
        <h2>
          {tracking.claimFullyReady
            ? READY_HEADLINE
            : go
              ? "Denemeye hazır görünüyorsun"
              : "Önce zayıf noktaları kapat"}
        </h2>
        <ul className="text-sm text-[var(--cp-muted)]" style={{ paddingLeft: "1.1rem" }}>
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
          <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            {go ? "Sıradaki adıma git" : "Öncelikli derse git"}
          </Link>
          {openMisconceptions > 0 ? (
            <Link
              href={`/deneme-sinavlari/${prepId}/tekrarlar`}
              className="cp-exam-continue"
            >
              Yanlışlar ve tekrarlar
            </Link>
          ) : null}
          {mockNodeHref ? (
            <Link href={mockNodeHref} className="cp-exam-continue">
              Genel denemeyi aç
            </Link>
          ) : null}
        </div>
      </section>

      <section aria-label="Konu bazlı sonuçlar" style={{ marginTop: "1.25rem" }}>
        <h2 className="text-base font-semibold">Konu bazlı sonuçlar</h2>
        {!topics.length ? (
          <p className="text-sm text-[var(--cp-muted)]" role="status">
            Henüz konu ölçümü yok. Tanışma veya quiz oturumları burayı doldurur.
          </p>
        ) : (
          <ul className="cp-exam-topic-board">
            {topics.map((t) => (
              <li key={t.topicKey}>
                <strong>{t.topicKey}</strong>
                <span>
                  {t.measured
                    ? `${t.stateLabel} · ${t.percentText} · ${t.evidenceCount} cevap`
                    : t.evidenceCount > 0
                      ? `Ölçülmedi · ${t.evidenceCount} cevap (en az 3 gerekir)`
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
      <div className="cp-countdown-row">
        <span>{title}</span>
        <span className="cp-countdown-pct">
          {shown == null ? emptyText : `%${shown}`}
        </span>
      </div>
      <div className="cp-countdown-meter" aria-hidden>
        <span
          style={{
            width: `${shown == null ? 0 : Math.max(shown, shown > 0 ? 3 : 0)}%`,
          }}
        />
      </div>
      <p className="cp-countdown-state text-sm">{label}</p>
      <p className="text-xs text-[var(--cp-muted)]">{hint}</p>
    </div>
  );
}
