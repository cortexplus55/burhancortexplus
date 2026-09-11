"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  PLAN_NODE_META,
  daysUntilExam,
  readinessLabel,
  readinessScore,
  type NodeStatus,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";
import {
  examPrepAssessmentHref,
  examPrepIntroHref,
  examPrepReviewsHref,
} from "@/lib/learning/exam-prep-hrefs";
import {
  topicProgressFromNodes,
} from "@/lib/learning/exam-prep-ui-path";
import { cn } from "@/lib/utils";
import {
  ExamPrepSettingsPanel,
  type PrepSettingsInitial,
} from "@/components/parity/exam-prep-settings-panel";

export type HomeNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
  status: NodeStatus;
  sessionMeta?: {
    objective?: string;
    sourcePages?: number[];
    durationMinutes?: number;
    role?: string;
    calendarDate?: string;
    topicTitle?: string;
  } | null;
};

export type LearningTrackingView = {
  programProgressPct: number;
  programLabel: string;
  topicMasteryPct: number | null;
  topicMasteryLabel: string;
  measuredTopicCount: number;
  unmeasuredTopicCount: number;
  examReadinessPct: number;
  examReadinessLabel: string;
  claimFullyReady: boolean;
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
  introPending = false,
  startHref,
  canShare = false,
  initialShared = false,
  scheduleSummary = null,
  learningTracking = null,
  uiV2 = false,
  openMisconceptions = 0,
  settings = null,
  documentId = null,
  documentName = null,
}: {
  prepId: string;
  /** Hazırlığın kurulduğu belge; konu haritası oradan yenilenir. */
  documentId?: string | null;
  documentName?: string | null;
  title: string;
  examType: string;
  examDate: string | null;
  daysLabel: string;
  progressPct: number;
  nodes: HomeNode[];
  hasTopic: boolean;
  activeTopicLabel?: string | null;
  needsIntro: boolean;
  /** Tanı ertelendi ve hâlâ yapılmadı — hatırlatılır. */
  introPending?: boolean;
  startHref: string;
  /** Okulu seçilmemiş kullanıcıya paylaşım düğmesi gösterilmez. */
  canShare?: boolean;
  initialShared?: boolean;
  scheduleSummary?: string | null;
  /** Stage 6 — three separate indicators when pdf_learning_v2 is on. */
  learningTracking?: LearningTrackingView | null;
  /** Stage 9 — daily path, settings, reviews, assessment chrome. */
  uiV2?: boolean;
  openMisconceptions?: number;
  settings?: PrepSettingsInitial | null;
}) {
  const router = useRouter();
  const ready = nodes.find((node) => node.status === "ready");
  const started = hasTopic && !needsIntro;
  const daysLeft = examDate ? daysUntilExam(examDate) : null;
  const readiness = readinessScore(nodes);
  const readinessState = readinessLabel(readiness);
  const [shared, setShared] = useState(initialShared);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<"yol" | "konular">("yol");
  /** Bakım bağlantıları çalışmanın önüne geçmesin diye kapalı başlıyor. */
  const [toolsOpen, setToolsOpen] = useState(false);
  const topicRows = useMemo(() => topicProgressFromNodes(nodes), [nodes]);
  const showTracking = Boolean(learningTracking);


  function openNode(node: HomeNode) {
    if (!hasTopic) {
      router.push(`/deneme-sinavlari/${prepId}/konu`);
      return;
    }
    if (needsIntro) {
      router.push(`/deneme-sinavlari/${prepId}/tanisma`);
      return;
    }
    router.push(`/deneme-sinavlari/${prepId}/dugum/${node.id}`);
  }

  // Paylaşım yalnızca konu başlıklarını görünür kılar; ilerleme ve cevaplar
  // hiçbir zaman paylaşılmaz — katılan kişi kendi kopyasını alır.
  async function toggleShare() {
    const next = !shared;
    setSharing(true);
    try {
      const res = await fetch("/api/school", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, share: next }),
      });
      if (!res.ok) throw new Error();
      setShared(next);
      toast.success(
        next
          ? "Hazırlığın okul akışında görünüyor."
          : "Paylaşım kaldırıldı.",
      );
    } catch {
      toast.error("İşlem tamamlanamadı.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="ap-exam-page ap-exam-trail-page">
      <Link href="/deneme-sinavlari" className="ap-back-pill">
        ← Geri
      </Link>
      {/* Tek kart: ders, sınav ve iki görünüm bir arada. Önceden başlık
          düz metindi ve konular ayrı bir sayfadaydı; öğrenci nerede
          kaldığını görmek için sayfadan çıkmak zorundaydı. */}
      <header className="ap-exam-trail-head ap-exam-hero">
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
        <div className="ap-exam-tabs" role="tablist" aria-label="Hazırlık görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={view === "yol"}
            className={cn("ap-exam-tab", view === "yol" && "is-active")}
            onClick={() => setView("yol")}
          >
            Çalışma yolu
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "konular"}
            className={cn("ap-exam-tab", view === "konular" && "is-active")}
            onClick={() => setView("konular")}
          >
            Konular <span className="ap-exam-tab-count">{topicRows.length}</span>
          </button>
        </div>
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
        {canShare ? (
          <button
            type="button"
            className={cn("ap-share-toggle", shared && "ap-share-toggle--on")}
            disabled={sharing}
            onClick={() => void toggleShare()}
          >
            {shared ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Okulunla paylaşıldı
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Okulunla paylaş
              </>
            )}
          </button>
        ) : null}
      </header>

      {scheduleSummary ? (
        <p className="text-sm text-[var(--ap-muted)]" style={{ margin: "0.75rem 0" }}>
          Plan: {scheduleSummary}
        </p>
      ) : null}

      {uiV2 ? (
        <nav className="ap-exam-v2-links" aria-label="Öğrenme ekranları">
          {/* Sohbet hazırlığın içinde duruyor: takılan öğrenci sınavdan
              çıkıp konuyu baştan anlatmak zorunda kalmasın. Bakımla
              birlikte gizlenmiyor, çünkü çalışmanın parçası. */}
          <Link
            href={`/deneme-sinavlari/${prepId}/sohbet`}
            className="ap-back-pill ap-back-pill--accent"
          >
            Bu sınav için sor
          </Link>
          <Link href={examPrepReviewsHref(prepId)} className="ap-back-pill">
            Yanlışlar
            {openMisconceptions > 0 ? ` (${openMisconceptions})` : ""}
          </Link>
          {/* Tarih değiştirme, gün dağıtma ve değerlendirme bakım işleri;
              ilk ekranda çalışmanın önüne geçiyorlardı. */}
          <button
            type="button"
            className="ap-back-pill"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((open) => !open)}
          >
            Daha fazla {toolsOpen ? "▴" : "▾"}
          </button>
        </nav>
      ) : null}

      {uiV2 && toolsOpen ? (
        <div className="ap-exam-tools">
          <Link href={examPrepAssessmentHref(prepId)} className="ap-back-pill">
            Sınav öncesi değerlendirme
          </Link>
          {/* Konu haritası belgenin kendisine ait; yenilemek için oraya
              gidiliyor. Buradan yenilenemiyor çünkü bu hazırlığın konuları
              kurulurken kopyalandı — belgeyi yenilemek bu planı değil,
              bundan sonra kurulacak hazırlıkları etkiler. */}
          {documentId ? (
            <Link href={`/dokumanlar/${documentId}`} className="ap-back-pill">
              Kaynağı aç{documentName ? ` · ${documentName}` : ""}
            </Link>
          ) : null}
          {settings ? (
            <ExamPrepSettingsPanel prepId={prepId} initial={settings} />
          ) : null}
        </div>
      ) : null}

      {!uiV2 && settings ? (
        <ExamPrepSettingsPanel prepId={prepId} initial={settings} />
      ) : null}

      {uiV2 && view === "konular" ? (
        <section className="ap-topic-progress" aria-label="Konular">
          {topicRows.length ? (
            <ul>
              {topicRows.map((row) => (
                <li key={row.title}>
                  <Link href={`/deneme-sinavlari/${prepId}/konu`}>
                    <span className="ap-topic-progress-name">{row.title}</span>
                    <span className="ap-topic-progress-count">
                      {row.done}/{row.total} tamamlandı
                    </span>
                    <span className="ap-topic-progress-bar" aria-hidden>
                      <span style={{ width: `${row.pct}%` }} />
                    </span>
                    <span className="ap-topic-progress-pct">%{row.pct}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--ap-muted)]">
              Plan kurulunca konular burada ilerlemeleriyle listelenir.
            </p>
          )}
        </section>
      ) : null}

      {daysLeft !== null || showTracking ? (
        <section
          className={cn(
            "ap-countdown",
            daysLeft !== null && daysLeft <= 3 && "ap-countdown--urgent",
          )}
        >
          {daysLeft !== null ? (
            <>
              <p className="ap-countdown-kicker">Sınava kadar</p>
              <p className="ap-countdown-days">
                <strong>{daysLeft}</strong>
                <span>gün</span>
              </p>
            </>
          ) : (
            <p className="ap-countdown-kicker">Öğrenme takibi</p>
          )}

          {showTracking && learningTracking ? (
            /* Sınava hazırlık tahmini öne çıkıyor; konu hâkimiyeti altında
               küçülüyor ama kalıyor — hangi sayının neyi ölçtüğü
               uyarısıyla birlikte. */
            <div className="ap-countdown-readiness">
              <TrackingMeter
                title="Sınava hazırlık tahmini"
                pct={learningTracking.examReadinessPct}
                label={learningTracking.examReadinessLabel}
                hint={
                  learningTracking.claimFullyReady
                    ? "Ölçülen başarı + kapsam + deneme sonuçlarına göre."
                    : "Etkinlik bitirmek tek başına %100 hazırlık değildir."
                }
              />
              <div className="ap-tracking-secondary">
                {/* "Program ilerlemesi" takvime bağlıydı: planın kaçıncı
                    gününde olduğunu ölçüyordu. Takvim kalkınca ölçtüğü şey
                    kalmadı; yerini yolun ne kadarının bittiği aldı ve o da
                    üstteki çubukta zaten duruyor. */}
                <TrackingMeter
                  title="Konu hâkimiyeti"
                  pct={learningTracking.topicMasteryPct}
                  label={learningTracking.topicMasteryLabel}
                  hint={
                    learningTracking.measuredTopicCount === 0
                      ? "Ölçülmemiş konularda yüksek güven gösterilmez."
                      : `${learningTracking.measuredTopicCount} ölçülen · ${learningTracking.unmeasuredTopicCount} ölçülmemiş`
                  }
                  emptyText="Henüz ölçülmedi"
                />
              </div>
            </div>
          ) : daysLeft !== null ? (
            <div className="ap-countdown-readiness">
              <div className="ap-countdown-row">
                <span>Çalışma ilerlemen</span>
                <span className="ap-countdown-pct">%{readiness}</span>
              </div>
              <div className="ap-countdown-meter" aria-hidden>
                <span style={{ width: `${Math.max(readiness, readiness > 0 ? 3 : 0)}%` }} />
              </div>
              <p className="ap-countdown-state">
                <span aria-hidden>{readinessState.emoji}</span> {readinessState.text}
              </p>
              <p className="text-xs text-[var(--ap-muted)]">
                Bu oran etkinliklerin tamamlanmasını gösterir; konu hakimiyetini ölçmez.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {introPending ? (
        <Link href={examPrepIntroHref(prepId)} className="ap-intro-nudge">
          <strong>Seviyeni henüz ölçmedik.</strong>
          <span>
            8 soruluk tanı, planı hangi konuya daha çok zaman ayıracağına göre
            ayarlar. Birkaç dakika sürer.
          </span>
        </Link>
      ) : null}

      {!nodes.length ? (
        <div className="ap-exam-empty" role="status">
          <p>
            <strong>Henüz çalışma yolu yok</strong>
          </p>
          <p className="text-sm text-[var(--ap-muted)]">
            Konu seçip tanı ölçümünü tamamladığında günlük yol burada görünür.
          </p>
          <Link href={startHref} className="ap-exam-continue ap-exam-continue--primary">
            İlk adımı aç
          </Link>
        </div>
      ) : uiV2 && view === "yol" ? (
        // Yol tarihsiz: öğrenci neyi ne zaman çalışacağına kendi karar
        // veriyor. Gün blokları kalktı — "Gün 3" yazan bir başlık,
        // öğrenciyi geri kalmışlık duygusuna sokmaktan başka bir şey
        // yapmıyordu. Sıra duruyor, kilit duruyor, takvim yok.
        <ol className="ap-exam-trail" aria-label="Çalışma yolu">
          {nodes.map((node, index) => (
            <li
              key={node.id}
              className={`ap-exam-trail-item ap-exam-trail-item--${index % 2 === 0 ? "left" : "right"}`}
            >
              <button
                type="button"
                className={`ap-exam-trail-node ap-exam-trail-node--${node.status}`}
                disabled={node.status === "locked"}
                aria-label={`${node.title || PLAN_NODE_META[node.kind].title}, ${
                  node.status === "done"
                    ? "tamamlandı"
                    : node.status === "locked"
                      ? "kilitli"
                      : "sırada"
                }`}
                onClick={() => openNode(node)}
              >
                {node.status === "done" ? "✓" : node.status === "locked" ? "🔒" : index + 1}
              </button>
              <span>
                <strong>{node.title || PLAN_NODE_META[node.kind].title}</strong>
                <em>
                  {node.sessionMeta?.topicTitle
                    ? `${node.sessionMeta.topicTitle}`
                    : PLAN_NODE_META[node.kind].title}
                  {node.sessionMeta?.durationMinutes
                    ? ` · ${node.sessionMeta.durationMinutes} dk`
                    : ""}
                  {node.sessionMeta?.sourcePages?.length
                    ? ` · s.${node.sessionMeta.sourcePages.slice(0, 4).join(",")}`
                    : ""}
                </em>
              </span>
            </li>
          ))}
        </ol>
      ) : (
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
                onClick={() => openNode(node)}
              >
                {node.status === "done" ? "✓" : node.status === "locked" ? "🔒" : index + 1}
              </button>
              <span>
                <strong>{node.title || PLAN_NODE_META[node.kind].title}</strong>
                <em>
                  Gün {node.dayIndex}
                  {node.sessionMeta?.durationMinutes
                    ? ` · ${node.sessionMeta.durationMinutes} dk`
                    : ""}
                  {node.sessionMeta?.sourcePages?.length
                    ? ` · s.${node.sessionMeta.sourcePages.slice(0, 4).join(",")}`
                    : ""}
                </em>
              </span>
            </li>
          ))}
        </ol>
      )}

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

function TrackingMeter({
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
    <div>
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
