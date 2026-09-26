"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Mic, Share2 } from "lucide-react";
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
  examPrepNodeHref,
  examPrepReviewsHref,
} from "@/lib/learning/exam-prep-hrefs";
import {
  topicProgressFromNodes,
} from "@/lib/learning/exam-prep-ui-path";
import { STUDY_PATH_HINT, studyNodeAria } from "@/lib/learning/study-tools";
import { StudyToolsHub } from "@/components/parity/study-tools-hub";
import { groupNodesByPhase } from "@/lib/learning/exam-plan-phases";
import { cn } from "@/lib/utils";
import { TOPIC_ONLY_NOTICE } from "@/lib/learning/prep-source";
import { PREP_HOME_COPY } from "@/lib/learning/exam-wizard-copy";
import { trailMetaLine } from "@/lib/learning/path-trail-label";
import { PrepMaterialAdder } from "@/components/parity/prep-add-material";
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
    topicId?: string;
    topicTitle?: string;
  } | null;
};

function trailGlyph(node: HomeNode, index: number) {
  if (node.status === "done") return "✓";
  if (node.kind === "podcast") return <Mic className="h-5 w-5" aria-hidden />;
  return index + 1;
}

export type PrepMaterial = {
  id: string;
  name: string;
  kindLabel: string;
  href: string;
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
  topicsDone = 0,
  topicCount = 0,
  topicLabels = [],
  topicOptions = [],
  materials = [],
  readinessClaim = null,
  topicWarnings = {},
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
  /** Konu birimi. Düğüm sayısı buraya yazılmaz. */
  topicsDone?: number;
  topicCount?: number;
  /** Beceri ağacı. Konu düzenleme burada yok; o yalnızca kurulum sihirbazında. */
  topicLabels?: string[];
  /** Podcast rotasının konu kimliği. Etiket listesinden ayrıdır. */
  topicOptions?: { id: string; label: string }[];
  /** Materyaller sekmesi. Birden fazla belge varsa hepsi; yoksa eski tek belge. */
  materials?: PrepMaterial[];
  /** Ölçülen veri hazır diyorsa true. Bilinmiyorsa null; uydurma yok. */
  readinessClaim?: boolean | null;
  /** Konu başlığı → kaynaklar çelişiyorsa Türkçe uyarı. */
  topicWarnings?: Record<string, string>;
}) {
  const router = useRouter();
  const ready = nodes.find((node) => node.status === "ready");
  const started = hasTopic && !needsIntro;
  const hasProgress = nodes.some((node) => node.status === "done");
  const recommendPodcast = hasProgress && started && ready?.kind === "podcast";
  const firstPlayable = nodes.find((node) => node.status !== "locked");
  const beginHref =
    hasTopic && !needsIntro && firstPlayable
      ? examPrepNodeHref(prepId, firstPlayable.id)
      : startHref;
  const primaryHref = hasProgress ? startHref : beginHref;
  const primaryLabel = hasProgress ? PREP_HOME_COPY.continue : PREP_HOME_COPY.startLearning;
  const daysLeft = examDate ? daysUntilExam(examDate) : null;
  const readiness = readinessScore(nodes);
  const readinessState = readinessLabel(readiness);
  const [shared, setShared] = useState(initialShared);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<"yol" | "konular" | "materyaller" | "ilerleme">("yol");
  const [progressPane, setProgressPane] = useState<"agac" | "sorular">("agac");
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  /** Bakım bağlantıları çalışmanın önüne geçmesin diye kapalı başlıyor. */
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hubTopic, setHubTopic] = useState<string | null | undefined>(undefined);
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
    <div className="cp-exam-page cp-exam-trail-page">
      <Link href="/deneme-sinavlari" className="cp-back-pill">
        ← Geri
      </Link>
      {/* Tek kart: ders, sınav ve iki görünüm bir arada. Önceden başlık
          düz metindi ve konular ayrı bir sayfadaydı; öğrenci nerede
          kaldığını görmek için sayfadan çıkmak zorundaydı. */}
      <header className="cp-exam-trail-head cp-exam-hero">
        <div className="cp-exam-trail-meter" aria-hidden>
          <span
            style={{
              width: `${topicCount > 0 ? Math.round((topicsDone / topicCount) * 100) : progressPct}%`,
            }}
          />
        </div>
        <p>
          {topicCount > 0 ? `${topicsDone} / ${topicCount} konu` : `${progressPct}%`}
        </p>
        <h1>{title}</h1>
        <p className="text-sm text-[var(--cp-muted)]">
          {examType}
          {examDate ? ` · sınav ${examDate}` : ""}
          {daysLabel ? ` · ${daysLabel}` : ""}
        </p>
        {/* Belgesiz hazırlıkta içerik konunun genel bilgisinden geliyor.
            Öğrenci bunu bilmezse "notumda bu varmış" diye okur. */}
        {documentId ? null : (
          <p className="cp-exam-source-note">{TOPIC_ONLY_NOTICE}</p>
        )}
        <div className="cp-exam-tabs" role="tablist" aria-label="Hazırlık görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={view === "yol"}
            className={cn("cp-exam-tab", view === "yol" && "is-active")}
            onClick={() => setView("yol")}
          >
            {PREP_HOME_COPY.path}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "konular"}
            className={cn("cp-exam-tab", view === "konular" && "is-active")}
            onClick={() => setView("konular")}
          >
            {PREP_HOME_COPY.topics}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "materyaller"}
            className={cn("cp-exam-tab", view === "materyaller" && "is-active")}
            onClick={() => setView("materyaller")}
          >
            {PREP_HOME_COPY.materials}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "ilerleme"}
            className={cn("cp-exam-tab", view === "ilerleme" && "is-active")}
            onClick={() => setView("ilerleme")}
          >
            {PREP_HOME_COPY.progress}
          </button>
        </div>
        {activeTopicLabel ? (
          <div>
            <Link
              href={`/deneme-sinavlari/${prepId}/konu`}
              className="cp-exam-topic-badge"
              title="Çalışılan konuyu değiştir"
            >
              <strong>{activeTopicLabel}</strong>
              <span>Değiştir ↻</span>
            </Link>
          </div>
        ) : null}
        <button type="button" className="cp-back-pill cp-back-pill--accent" onClick={() => setHubTopic(null)}>
          Ders oluştur
        </button>
        {canShare ? (
          <button
            type="button"
            className={cn("cp-share-toggle", shared && "cp-share-toggle--on")}
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

      {/* Plan özeti "5 çalışma gününde 225 dk var" diyordu: takvim
          kalktıktan sonra öğrencinin karşılığını göremediği bir cümle. */}
      {!uiV2 && scheduleSummary ? (
        <p className="text-sm text-[var(--cp-muted)]" style={{ margin: "0.75rem 0" }}>
          Plan: {scheduleSummary}
        </p>
      ) : null}

      {uiV2 ? (
        <nav className="cp-exam-v2-links" aria-label="Öğrenme ekranları">
          {/* Sohbet hazırlığın içinde duruyor: takılan öğrenci sınavdan
              çıkıp konuyu baştan anlatmak zorunda kalmasın. Bakımla
              birlikte gizlenmiyor, çünkü çalışmanın parçası. */}
          <Link
            href={`/deneme-sinavlari/${prepId}/sohbet`}
            className="cp-back-pill cp-back-pill--accent"
          >
            Bu sınav için sor
          </Link>
          <Link href={`/deneme-sinavlari/${prepId}/zor-sorular`} className="cp-back-pill">
            {PREP_HOME_COPY.challenge}
          </Link>
          <Link href={examPrepReviewsHref(prepId)} className="cp-back-pill">
            Yanlışlar
            {openMisconceptions > 0 ? ` (${openMisconceptions})` : ""}
          </Link>
          {/* Tarih değiştirme, gün dağıtma ve değerlendirme bakım işleri;
              ilk ekranda çalışmanın önüne geçiyorlardı. */}
          <button
            type="button"
            className="cp-back-pill"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((open) => !open)}
          >
            Daha fazla {toolsOpen ? "▴" : "▾"}
          </button>
        </nav>
      ) : null}

      {uiV2 && toolsOpen ? (
        <div className="cp-exam-tools">
          <button type="button" className="cp-back-pill" onClick={() => setHubTopic(null)}>
            Ders oluştur
          </button>
          <Link href={examPrepAssessmentHref(prepId)} className="cp-back-pill">
            Sınav öncesi değerlendirme
          </Link>
          {/* Konu haritası belgenin kendisine ait; yenilemek için oraya
              gidiliyor. Buradan yenilenemiyor çünkü bu hazırlığın konuları
              kurulurken kopyalandı — belgeyi yenilemek bu planı değil,
              bundan sonra kurulacak hazırlıkları etkiler. */}
          {documentId ? (
            <Link href={`/dokumanlar/${documentId}`} className="cp-back-pill">
              Kaynağı aç{documentName ? ` · ${documentName}` : ""}
            </Link>
          ) : (
            // İçeriğin öğrencinin belgesinden gelmediğini gizlemek, "notumda
            // bu varmış" yanılgısının ta kendisi olurdu.
            <Link href="/dokumanlar" className="cp-back-pill">
              Belge ekle
            </Link>
          )}
          {settings ? (
            <ExamPrepSettingsPanel prepId={prepId} initial={settings} />
          ) : null}
        </div>
      ) : null}

      {!uiV2 && settings ? (
        <ExamPrepSettingsPanel prepId={prepId} initial={settings} />
      ) : null}

      {view === "ilerleme" ? (
        <section className="cp-progress-pane" aria-label="İlerleme">
          <div className="cp-exam-tabs" role="tablist" aria-label="İlerleme görünümü">
            <button
              type="button"
              role="tab"
              aria-selected={progressPane === "agac"}
              className={cn("cp-exam-tab", progressPane === "agac" && "is-active")}
              onClick={() => setProgressPane("agac")}
            >
              {PREP_HOME_COPY.skillTree}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={progressPane === "sorular"}
              className={cn("cp-exam-tab", progressPane === "sorular" && "is-active")}
              onClick={() => setProgressPane("sorular")}
            >
              {PREP_HOME_COPY.allQuestions}
            </button>
          </div>
          {progressPane === "agac" ? (
            <SkillTree
              labels={
                topicLabels.length
                  ? topicLabels
                  : topicRows.map((row) => row.title)
              }
              rows={topicRows}
              openSkill={openSkill}
              onToggle={setOpenSkill}
              startHref={startHref}
            />
          ) : (
            <p className="text-sm text-[var(--cp-muted)]">
              {topicsDone > 0 || nodes.some((node) => node.status === "done")
                ? PREP_HOME_COPY.practicedElsewhere
                : PREP_HOME_COPY.noPractice}
            </p>
          )}
        </section>
      ) : null}

      {(view === "yol" || view === "ilerleme") && (daysLeft !== null || showTracking) ? (
        <section
          className={cn(
            "cp-countdown",
            daysLeft !== null && daysLeft <= 3 && "cp-countdown--urgent",
          )}
        >
          {daysLeft !== null ? (
            <>
              <p className="cp-countdown-kicker">Sınava kadar</p>
              <p className="cp-countdown-days">
                <strong>{daysLeft}</strong>
                <span>gün</span>
              </p>
            </>
          ) : (
            <p className="cp-countdown-kicker">Öğrenme takibi</p>
          )}

          {showTracking && learningTracking ? (
            /* Sınava hazırlık tahmini öne çıkıyor; konu hâkimiyeti altında
               küçülüyor ama kalıyor — hangi sayının neyi ölçtüğü
               uyarısıyla birlikte. */
            <div className="cp-countdown-readiness">
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
              <div className="cp-tracking-secondary">
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
            <div className="cp-countdown-readiness">
              <div className="cp-countdown-row">
                <span>Çalışma ilerlemen</span>
                <span className="cp-countdown-pct">%{readiness}</span>
              </div>
              <div className="cp-countdown-meter" aria-hidden>
                <span style={{ width: `${Math.max(readiness, readiness > 0 ? 3 : 0)}%` }} />
              </div>
              <p className="cp-countdown-state">
                <span aria-hidden>{readinessState.emoji}</span> {readinessState.text}
              </p>
              <p className="text-xs text-[var(--cp-muted)]">
                Bu oran etkinliklerin tamamlanmasını gösterir; konu hakimiyetini ölçmez.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {introPending ? (
        <Link href={examPrepIntroHref(prepId)} className="cp-intro-nudge">
          <strong>Seviyeni henüz ölçmedik.</strong>
          <span>
            8 soruluk tanı, planı hangi konuya daha çok zaman ayıracağına göre
            ayarlar. Birkaç dakika sürer.
          </span>
        </Link>
      ) : null}

      {view === "konular" ? (
        <TopicList
          prepId={prepId}
          labels={topicLabels.length ? topicLabels : topicRows.map((row) => row.title)}
          rows={topicRows}
          warnings={topicWarnings}
          onCreate={(label) => setHubTopic(label)}
        />
      ) : null}

      {view === "materyaller" ? (
        <>
          <MaterialsList materials={materials} />
          <PrepMaterialAdder prepId={prepId} count={materials.length} />
        </>
      ) : null}

      {view === "yol" && !uiV2 ? (
        <p>
          <Link href={`/deneme-sinavlari/${prepId}/zor-sorular`} className="cp-back-pill">
            {PREP_HOME_COPY.challenge}
          </Link>
        </p>
      ) : null}

      {view === "yol" && !nodes.length ? (
        <div className="cp-exam-empty cp-exam-empty--discover" role="status">
          <p>
            <strong>Çalışma yolu henüz kurulmadı</strong>
          </p>
          <p className="text-sm text-[var(--cp-muted)]">
            Bir konu seçip kısa tanı ölçümünü bitir; podcast, alıştırma ve deneme sırası burada açılsın.
          </p>
          <div className="cp-exam-empty-actions">
            <Link href={primaryHref} className="cp-exam-continue cp-exam-continue--primary">
              {primaryLabel}
            </Link>
            {introPending ? (
              <Link href={examPrepIntroHref(prepId)} className="cp-exam-continue">
                Önce tanı ölçümü
              </Link>
            ) : null}
          </div>
        </div>
      ) : view === "yol" ? (
        <>
          <p className="cp-study-hub-hint">{STUDY_PATH_HINT}</p>
          <StudyPath
            nodes={nodes}
            onOpen={openNode}
            readinessClaim={readinessClaim}
            topicCount={topicCount}
          />
        </>
      ) : null}

      {view === "yol" ? (
        <div className={cn("cp-exam-start-card", recommendPodcast && "cp-exam-reco")}>
          {recommendPodcast ? (
            <>
              <p className="cp-exam-reco-kicker">ÖNERİLEN DERS</p>
              <h2>Podcast</h2>
              <Link href={startHref} className="cp-exam-reco-go">
                {PREP_HOME_COPY.continue}
              </Link>
            </>
          ) : (
            <>
              <p>{hasProgress ? "Sıradaki derse geç" : "Başlamaya hazır mısın?"}</p>
              <Link href={primaryHref} className="cp-exam-continue cp-exam-continue--primary">
                {primaryLabel}
              </Link>
            </>
          )}
        </div>
      ) : null}
      {hubTopic !== undefined ? (
        <StudyToolsHub
          prepId={prepId}
          nodes={nodes}
          topics={topicLabels.length ? topicLabels : topicRows.map((row) => row.title)}
          topicOptions={topicOptions}
          topicLabel={hubTopic}
          onTopic={setHubTopic}
          onClose={() => setHubTopic(undefined)}
        />
      ) : null}
    </div>
  );
}

function StudyPath({
  nodes,
  onOpen,
  readinessClaim,
  topicCount = 0,
}: {
  nodes: HomeNode[];
  onOpen: (node: HomeNode) => void;
  readinessClaim: boolean | null;
  topicCount?: number;
}) {
  const groups = useMemo(() => {
    let cursor = 0;
    return groupNodesByPhase(nodes).map((group) => ({
      phase: group.phase,
      items: group.nodes.map((node) => {
        const index = cursor;
        cursor += 1;
        return { node, index };
      }),
    }));
  }, [nodes]);

  return (
    <div className="cp-exam-phases">
      {groups.map((group) => (
        <section
          key={group.phase.id}
          className="cp-exam-phase"
          aria-labelledby={`phase-${group.phase.id}`}
        >
          <header className="cp-exam-phase-head">
            <h2 id={`phase-${group.phase.id}`}>{group.phase.title}</h2>
            <p>{group.phase.blurb}</p>
          </header>
          <ol className="cp-exam-trail" aria-label={group.phase.title}>
            {group.items.map(({ node, index }) => (
              <li
                key={node.id}
                className={`cp-exam-trail-item cp-exam-trail-item--${index % 2 === 0 ? "left" : "right"}`}
              >
                <button
                  type="button"
                  className={`cp-exam-trail-node cp-exam-trail-node--${node.status}${
                    node.kind === "podcast" ? " cp-exam-trail-node--podcast" : ""
                  }`}
                  aria-label={`${node.title || PLAN_NODE_META[node.kind].title}, ${studyNodeAria(node.status)}`}
                  onClick={() => onOpen(node)}
                >
                  {trailGlyph(node, index)}
                </button>
                <span>
                  <strong>{node.title || PLAN_NODE_META[node.kind].title}</strong>
                  <em>
                    {trailMetaLine(node, {
                      topicCount,
                      readinessClaim,
                    })}
                  </em>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TopicList({
  prepId,
  labels,
  rows,
  warnings,
  onCreate,
}: {
  prepId: string;
  labels: string[];
  rows: { title: string; pct: number; done: number; total: number }[];
  warnings: Record<string, string>;
  onCreate?: (label: string) => void;
}) {
  if (!labels.length) {
    return <p className="text-sm text-[var(--cp-muted)]">{PREP_HOME_COPY.noTopics}</p>;
  }
  return (
    <section className="cp-topic-progress" aria-label={PREP_HOME_COPY.topics}>
      <ul>
        {labels.map((label) => {
          const row = rows.find((item) => item.title === label);
          const pct = row?.pct ?? 0;
          return (
            <li key={label}>
              <Link href={`/deneme-sinavlari/${prepId}/konu`}>
                <span className="cp-topic-progress-name">{label}</span>
                <span className="cp-topic-progress-pct">
                  {pct}
                  {PREP_HOME_COPY.masterySuffix}
                </span>
                <span className="cp-topic-progress-bar" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="cp-topic-progress-count">
                  {row && row.total > 0
                    ? `${row.done} / ${row.total} etkinlik`
                    : PREP_HOME_COPY.noPractice}
                </span>
                {warnings[label] ? (
                  <span className="cp-topic-warning">{warnings[label]}</span>
                ) : null}
              </Link>
              {onCreate ? (
                <button type="button" className="cp-back-pill" onClick={() => onCreate(label)}>
                  {label} için ders oluştur
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MaterialsList({ materials }: { materials: PrepMaterial[] }) {
  if (!materials.length) {
    return (
      <p className="cp-exam-materials text-sm text-[var(--cp-muted)]">
        {PREP_HOME_COPY.materialsEmpty}
      </p>
    );
  }
  return (
    <ul className="cp-exam-materials">
      {materials.map((material) => (
        <li key={material.id}>
          <Link href={material.href} className="cp-exam-material">
            <strong>{material.name}</strong>
            <span>{material.kindLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SkillTree({
  labels,
  rows,
  openSkill,
  onToggle,
  startHref,
}: {
  labels: string[];
  rows: { title: string; pct: number }[];
  openSkill: string | null;
  onToggle: (label: string | null) => void;
  startHref: string;
}) {
  if (!labels.length) {
    return (
      <p className="text-sm text-[var(--cp-muted)]">
        {PREP_HOME_COPY.emptyTree}
      </p>
    );
  }
  return (
    <ul className="cp-skill-tree">
      {labels.map((label) => {
        const pct = rows.find((row) => row.title === label)?.pct ?? 0;
        const open = openSkill === label;
        return (
          <li key={label}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(open ? null : label)}
            >
              <strong>{label}</strong>
              <span>
                {pct}
                {PREP_HOME_COPY.masterySuffix}
              </span>
            </button>
            {open ? (
              <div className="cp-skill-detail">
                <p>
                  {pct > 0 ? PREP_HOME_COPY.skillPractice : PREP_HOME_COPY.noPractice}
                </p>
                {pct === 0 ? (
                  <Link href={startHref}>{PREP_HOME_COPY.createLesson}</Link>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
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
