"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  ClipboardCheck,
  Crosshair,
  FileText,
  Flag,
  Flame,
  FolderOpen,
  Layers,
  Lock,
  MessageCircle,
  MessagesSquare,
  Mic,
  MoreVertical,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Share2,
  Target,
  X,
} from "lucide-react";
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

/**
 * Düğümün simgesi — Astra'daki gibi etkinlik türünü söylüyor, sıra numarasını
 * değil. Kilitli düğümde tür yerine kilit: "bu daha açılmadı" tek bakışta
 * okunuyor. Test düğümleri harfle (AB / ABCD), podcast altıgenle ayrılıyor.
 */
function NodeGlyph({ node }: { node: HomeNode }) {
  if (node.status === "locked") return <Lock className="h-5 w-5" aria-hidden />;
  const icon = "h-6 w-6";
  switch (node.kind) {
    case "quiz":
      return (
        <span className="cp-path-letters" aria-hidden>
          AB
          <br />
          CD
        </span>
      );
    case "true_false":
      return (
        <span className="cp-path-letters" aria-hidden>
          AB
        </span>
      );
    case "podcast":
      return <AudioLines className={icon} aria-hidden />;
    case "qa":
      return <MessagesSquare className={icon} aria-hidden />;
    case "oral":
      return <Mic className={icon} aria-hidden />;
    case "flashcards":
      return <Layers className={icon} aria-hidden />;
    case "spaced":
      return <RotateCcw className={icon} aria-hidden />;
    case "gaps":
      return <Crosshair className={icon} aria-hidden />;
    case "focused":
      return <Target className={icon} aria-hidden />;
    case "written_exam":
      return <PenLine className={icon} aria-hidden />;
    case "final_check":
      return <ClipboardCheck className={icon} aria-hidden />;
    case "readiness":
      return <Flag className={icon} aria-hidden />;
    default:
      return <FileText className={icon} aria-hidden />;
  }
}

/** Düğüm biçimi: podcast altıgen, test kare, geri kalanı daire. */
function nodeShape(kind: PlanNodeKind): "hex" | "square" | "round" {
  if (kind === "podcast") return "hex";
  if (kind === "quiz" || kind === "true_false") return "square";
  return "round";
}

/** "Birim Çember · Ders · notlar s.10–18" → "Birim Çember". */
function nodeHeading(node: HomeNode): string {
  const raw = node.title || PLAN_NODE_META[node.kind].title;
  return raw.split(" · ")[0]?.trim() || raw;
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
  /** Kaynaklar. Birden fazla belge varsa hepsi; yoksa eski tek belge. */
  materials?: PrepMaterial[];
  /** Ölçülen veri hazır diyorsa true. Bilinmiyorsa null; uydurma yok. */
  readinessClaim?: boolean | null;
  /** Konu başlığı → kaynaklar çelişiyorsa Türkçe uyarı. */
  topicWarnings?: Record<string, string>;
}) {
  const router = useRouter();
  const ready = nodes.find((node) => node.status === "ready");
  const hasProgress = nodes.some((node) => node.status === "done");
  const firstPlayable = nodes.find((node) => node.status !== "locked");
  const beginHref =
    hasTopic && !needsIntro && firstPlayable
      ? examPrepNodeHref(prepId, firstPlayable.id)
      : startHref;
  const primaryHref = hasProgress ? startHref : beginHref;
  /** Alt karttaki etkinlik: sıradaki, yoksa bitmemiş ilk düğüm. */
  const nextNode = ready ?? nodes.find((node) => node.status !== "done") ?? null;
  const daysLeft = examDate ? daysUntilExam(examDate) : null;
  const readiness = readinessScore(nodes);
  const readinessState = readinessLabel(readiness);
  const pathPct =
    topicCount > 0 ? Math.round((topicsDone / topicCount) * 100) : progressPct;
  const [shared, setShared] = useState(initialShared);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<"yol" | "ilerleme">("yol");
  const [progressPane, setProgressPane] = useState<"agac" | "sorular">("agac");
  /** "⋮" — Astra'nın hazırlık menüsü: paylaş, ders oluştur, kaynaklar, ayarlar. */
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsPane, setOptionsPane] = useState<"menu" | "kaynaklar" | "ayarlar">("menu");
  const [hubTopic, setHubTopic] = useState<string | null | undefined>(undefined);
  const topicRows = useMemo(() => topicProgressFromNodes(nodes), [nodes]);
  const showTracking = Boolean(learningTracking);
  const labels = topicLabels.length ? topicLabels : topicRows.map((row) => row.title);

  useEffect(() => {
    if (!optionsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [optionsOpen]);

  function openOptions(pane: "menu" | "kaynaklar" | "ayarlar" = "menu") {
    setOptionsPane(pane);
    setOptionsOpen(true);
  }

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
      {/* Astra'da hazırlığın sağ üstünde üç simge var: sohbet, paylaş, "⋮".
          Bakım işleri (ayarlar, kaynaklar, değerlendirme) o menüde; ilk
          ekran yalnızca yolu gösteriyor. */}
      <div className="cp-prep-actions" role="toolbar" aria-label="Hazırlık işlemleri">
        <Link
          href={`/deneme-sinavlari/${prepId}/sohbet`}
          className="cp-prep-icon"
          aria-label="Bu sınav için sor"
          title="Bu sınav için sor"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </Link>
        {canShare ? (
          <button
            type="button"
            className={cn("cp-prep-icon", shared && "is-on")}
            aria-label={shared ? "Okulunla paylaşıldı" : "Okulunla paylaş"}
            aria-pressed={shared}
            title={shared ? "Okulunla paylaşıldı" : "Okulunla paylaş"}
            disabled={sharing}
            onClick={() => void toggleShare()}
          >
            <Share2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="cp-prep-icon"
          aria-label="Hazırlık seçenekleri"
          aria-haspopup="dialog"
          title="Hazırlık seçenekleri"
          onClick={() => openOptions("menu")}
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <header className="cp-exam-trail-head cp-exam-hero">
        <h1>{title}</h1>
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
            aria-selected={view === "ilerleme"}
            className={cn("cp-exam-tab", view === "ilerleme" && "is-active")}
            onClick={() => setView("ilerleme")}
          >
            {PREP_HOME_COPY.progress}
            <span className="cp-exam-tab-pct">%{pathPct}</span>
          </button>
        </div>
      </header>

      {view === "ilerleme" ? (
        <>
          <p className="cp-prep-topics-count">
            {topicCount > 0 ? `${topicsDone} / ${topicCount} konu` : `%${progressPct}`}
            {daysLabel ? ` · ${daysLabel}` : ""}
          </p>
          {daysLeft !== null || showTracking ? (
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
              <TopicList
                prepId={prepId}
                labels={labels}
                rows={topicRows}
                warnings={topicWarnings}
                onCreate={(label) => setHubTopic(label)}
              />
            ) : (
              <p className="text-sm text-[var(--cp-muted)]">
                {topicsDone > 0 || hasProgress
                  ? PREP_HOME_COPY.practicedElsewhere
                  : PREP_HOME_COPY.noPractice}
              </p>
            )}
          </section>
        </>
      ) : null}

      {view === "yol" && introPending ? (
        <Link href={examPrepIntroHref(prepId)} className="cp-intro-nudge">
          <strong>Seviyeni henüz ölçmedik.</strong>
          <span>
            8 soruluk tanı, planı hangi konuya daha çok zaman ayıracağına göre
            ayarlar. Birkaç dakika sürer.
          </span>
        </Link>
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
              {PREP_HOME_COPY.continue}
            </Link>
            {introPending ? (
              <Link href={examPrepIntroHref(prepId)} className="cp-exam-continue">
                Önce tanı ölçümü
              </Link>
            ) : null}
          </div>
        </div>
      ) : view === "yol" ? (
        <StudyPath
          nodes={nodes}
          currentId={nextNode?.id ?? null}
          onOpen={openNode}
          readinessClaim={readinessClaim}
        />
      ) : null}

      {/* Astra'nın alt kartı: etkinlik türü, başlık, "Dersi özelleştir" ve
          "Devam et". Yol düğümlerinin yanında yazı yok; ne olduğunu bu kart
          söylüyor. */}
      {view === "yol" && nodes.length ? (
        <div className="cp-exam-start-card cp-path-next">
          {nextNode ? (
            <p className="cp-path-next-kind">{PLAN_NODE_META[nextNode.kind].title}</p>
          ) : null}
          <h2 className="cp-path-next-title">
            {nextNode ? nodeHeading(nextNode) : "Tüm etkinlikler bitti"}
          </h2>
          <div className="cp-path-next-actions">
            <button
              type="button"
              className="cp-path-next-custom"
              aria-label="Dersi özelleştir"
              title="Dersi özelleştir"
              onClick={() => setHubTopic(nextNode?.sessionMeta?.topicTitle ?? null)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
            <Link href={primaryHref} className="cp-exam-continue cp-exam-continue--primary">
              {PREP_HOME_COPY.continue}
            </Link>
          </div>
        </div>
      ) : null}

      {optionsOpen ? (
        <div className="cp-oral-modal-back" onClick={() => setOptionsOpen(false)}>
          <div
            className="cp-oral-modal cp-prep-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prep-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="cp-oral-bar">
              {optionsPane === "menu" ? (
                <span />
              ) : (
                <button
                  type="button"
                  className="cp-oral-icon"
                  aria-label="Geri"
                  onClick={() => setOptionsPane("menu")}
                >
                  ←
                </button>
              )}
              <h2 id="prep-sheet-title">
                {optionsPane === "kaynaklar"
                  ? PREP_HOME_COPY.materials
                  : optionsPane === "ayarlar"
                    ? "Ayarlar"
                    : "Hazırlık"}
              </h2>
              <button
                type="button"
                className="cp-oral-icon"
                aria-label="Kapat"
                onClick={() => setOptionsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {optionsPane === "menu" ? (
              <>
                <div className="cp-prep-sheet-card">
                  <p className="cp-prep-sheet-kicker">{examType}</p>
                  <p className="cp-prep-sheet-title">{title}</p>
                  <p className="cp-prep-sheet-meta">
                    {topicCount > 0 ? `${topicsDone} / ${topicCount} konu` : `%${progressPct}`}
                    {examDate ? ` · sınav ${examDate}` : ""}
                    {daysLabel ? ` · ${daysLabel}` : ""}
                  </p>
                  {!uiV2 && scheduleSummary ? (
                    <p className="cp-prep-sheet-meta">Plan: {scheduleSummary}</p>
                  ) : null}
                </div>
                <ul className="cp-prep-sheet-list">
                  {canShare ? (
                    <li>
                      <button type="button" disabled={sharing} onClick={() => void toggleShare()}>
                        <Share2 className="h-4 w-4" aria-hidden />
                        {shared ? "Okul paylaşımını kaldır" : "Sınıf arkadaşlarınla paylaş"}
                      </button>
                    </li>
                  ) : null}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setOptionsOpen(false);
                        setHubTopic(null);
                      }}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {PREP_HOME_COPY.createLesson}
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => setOptionsPane("kaynaklar")}>
                      <FolderOpen className="h-4 w-4" aria-hidden />
                      {PREP_HOME_COPY.materials}
                    </button>
                  </li>
                  {activeTopicLabel ? (
                    <li>
                      <Link href={`/deneme-sinavlari/${prepId}/konu`}>
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        Çalışılan konu: {activeTopicLabel}
                      </Link>
                    </li>
                  ) : null}
                  <li>
                    <Link href={`/deneme-sinavlari/${prepId}/zor-sorular`}>
                      <Flame className="h-4 w-4" aria-hidden />
                      {PREP_HOME_COPY.challenge}
                    </Link>
                  </li>
                  {uiV2 ? (
                    <li>
                      <Link href={examPrepReviewsHref(prepId)}>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Yanlışlar
                        {openMisconceptions > 0 ? ` (${openMisconceptions})` : ""}
                      </Link>
                    </li>
                  ) : null}
                  {uiV2 ? (
                    <li>
                      <Link href={examPrepAssessmentHref(prepId)}>
                        <ClipboardCheck className="h-4 w-4" aria-hidden />
                        Sınav öncesi değerlendirme
                      </Link>
                    </li>
                  ) : null}
                  {settings ? (
                    <li>
                      <button type="button" onClick={() => setOptionsPane("ayarlar")}>
                        <Settings className="h-4 w-4" aria-hidden />
                        Ayarlar
                      </button>
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}

            {optionsPane === "kaynaklar" ? (
              <div className="cp-prep-sheet-pane">
                <MaterialsList materials={materials} />
                <PrepMaterialAdder prepId={prepId} count={materials.length} />
                {/* Konu haritası belgenin kendisine ait; yenilemek için oraya
                    gidiliyor. Buradan yenilenemiyor çünkü bu hazırlığın
                    konuları kurulurken kopyalandı. */}
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
              </div>
            ) : null}

            {optionsPane === "ayarlar" && settings ? (
              <div className="cp-prep-sheet-pane">
                <ExamPrepSettingsPanel prepId={prepId} initial={settings} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hubTopic !== undefined ? (
        <StudyToolsHub
          prepId={prepId}
          nodes={nodes}
          topics={labels}
          topicOptions={topicOptions}
          topicLabel={hubTopic}
          onTopic={setHubTopic}
          onClose={() => setHubTopic(undefined)}
        />
      ) : null}
    </div>
  );
}

/**
 * Zikzak yol. Astra'daki gibi düğümlerin yanında yazı yok; bu yüzden satır
 * yüksekliği sabit ve çizgi SVG ile düğüm merkezlerinden geçiyor. Eski
 * denemede (d2954d2) yazı satırı değişken yükseklikteydi ve çizgi CSS ile
 * güvenilir bükülemiyordu — sebep ortadan kalktı.
 */
const PATH_ROW = 96;
const PATH_STEP = 56;
const PATH_WIDTH = 280;
const PATH_PATTERN = [0, 1, 0, -1] as const;

function StudyPath({
  nodes,
  currentId,
  onOpen,
  readinessClaim,
}: {
  nodes: HomeNode[];
  currentId: string | null;
  onOpen: (node: HomeNode) => void;
  readinessClaim: boolean | null;
}) {
  // Önerilen sıra aşamalardan geliyor (tanı → öğren → pekiştir); yol aynı
  // sırayı tek bir zikzak olarak çiziyor, aşama başlıkları Astra'daki gibi yok.
  const ordered = useMemo(
    () => groupNodesByPhase(nodes).flatMap((group) => group.nodes),
    [nodes],
  );
  const points = ordered.map((node, index) => ({
    node,
    x: PATH_WIDTH / 2 + PATH_PATTERN[index % PATH_PATTERN.length] * PATH_STEP,
    y: PATH_ROW / 2 + index * PATH_ROW,
  }));
  const height = ordered.length * PATH_ROW;

  return (
    <div className="cp-path" style={{ height }}>
      <p className="sr-only">{STUDY_PATH_HINT}</p>
      <svg
        className="cp-path-lines"
        width={PATH_WIDTH}
        height={height}
        viewBox={`0 0 ${PATH_WIDTH} ${height}`}
        aria-hidden
      >
        {points.slice(1).map((point, index) => {
          const from = points[index];
          const midY = (from.y + point.y) / 2;
          return (
            <path
              key={point.node.id}
              d={`M${from.x} ${from.y} C${from.x} ${midY} ${point.x} ${midY} ${point.x} ${point.y}`}
              className={from.node.status === "done" ? "is-done" : undefined}
            />
          );
        })}
      </svg>
      <ol className="cp-path-list" aria-label={PREP_HOME_COPY.path}>
        {points.map(({ node, x, y }) => {
          const meta = PLAN_NODE_META[node.kind];
          const readinessNote =
            node.kind === "readiness" && readinessClaim === true
              ? ", ölçülen verilere göre hazırsın"
              : node.kind === "readiness" && readinessClaim === false
                ? ", eksikler bu ekranda"
                : "";
          return (
            <li
              key={node.id}
              className="cp-exam-trail-item"
              style={{ left: x, top: y }}
            >
              <button
                type="button"
                className={cn(
                  "cp-exam-trail-node",
                  `cp-exam-trail-node--${node.status}`,
                  `cp-path-node--${nodeShape(node.kind)}`,
                  node.kind === "podcast" && "cp-exam-trail-node--podcast",
                  node.id === currentId && "is-current",
                )}
                aria-label={`${nodeHeading(node)} · ${meta.title}, ${studyNodeAria(node.status)}${readinessNote}`}
                title={`${nodeHeading(node)} · ${meta.title}`}
                onClick={() => onOpen(node)}
              >
                <NodeGlyph node={node} />
              </button>
            </li>
          );
        })}
      </ol>
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
