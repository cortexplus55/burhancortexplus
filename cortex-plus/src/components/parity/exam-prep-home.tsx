"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AudioLines,
  Check,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Crosshair,
  FileText,
  Flag,
  Flame,
  FolderOpen,
  Layers,
  LineChart,
  Lock,
  MessageCircle,
  MessagesSquare,
  Mic,
  MoreVertical,
  Swords,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  Share2,
  Target,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PLAN_NODE_META,
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
import { STUDY_PATH_HINT, studyNodeAria, type StudyToolGroup } from "@/lib/learning/study-tools";
import { StudyToolsHub } from "@/components/parity/study-tools-hub";
import { ExamPrepProgress } from "@/components/parity/exam-prep-progress";
import {
  buildPrepProgressView,
  type PrepProgressView,
} from "@/lib/learning/prep-progress-view";
import { groupNodesByPhase } from "@/lib/learning/exam-plan-phases";
import { cn } from "@/lib/utils";
import { formatDayLong } from "@/lib/format";
import { PrepBasicsPanel } from "@/components/parity/prep-basics-panel";
import { TOPIC_ONLY_NOTICE } from "@/lib/learning/prep-source";
import { PREP_HOME_COPY } from "@/lib/learning/exam-wizard-copy";
import { PrepMaterialAdder } from "@/components/parity/prep-add-material";
import {
  ExamPrepSettingsPanel,
  type PrepSettingsInitial,
} from "@/components/parity/exam-prep-settings-panel";

/** Kabuğun "focus" başlığındaki simge yeri (sor-shell). */
export const PREP_TOP_SLOT_ID = "cp-sor-top-slot";
const INTRO_NODE_ID = "__intro";

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

function labelsFor(topicLabels: string[], rows: { title: string }[]): string[] {
  return topicLabels.length ? topicLabels : rows.map((row) => row.title);
}

/** "Birim Çember · Ders · notlar s.10–18" → "Birim Çember". */
function nodeHeading(node: HomeNode): string {
  const raw = node.title || PLAN_NODE_META[node.kind].title;
  const parts = raw.split(" · ").map((part) => part.trim());
  // Kavram birimli ders: "Konu · Ders 2/9: Hukukun kaynakları · dosya s.…" → dersin
  // kendi adı. Astra kartta ana konuyu değil dersin adını yazar (3 Ekim 2026).
  const unit = parts.find((part) => /^Ders \d+\/\d+: /.test(part));
  if (unit) return unit.replace(/^Ders \d+\/\d+: /, "");
  return parts[0] || raw;
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
  progressView = null,
  targetScore = null,
  creatorLabel = "Sen",
  schoolName = null,
  joinCount = 0,
  lastResult = null,
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
  /** İlerleme sekmesi; sayfa kayıtlardan kurar. Yoksa düğümlerden hesaplanır. */
  progressView?: PrepProgressView | null;
  /** Ayarlar'da düzenlenir (Astra, 1 Ekim 2026). */
  targetScore?: number | null;
  /** Menü kartında "Oluşturan": "Sen" ya da okuldan katılınan hazırlığın sahibi. */
  creatorLabel?: string;
  schoolName?: string | null;
  /** Okulda paylaşıldıysa katılım sayısı. */
  joinCount?: number;
  /** Son biten etkinlik ve yüzdesi; Astra yolun üstünde kart olarak gösteriyor. */
  lastResult?: { nodeId: string; pct: number | null } | null;
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
  const pathPct =
    topicCount > 0 ? Math.round((topicsDone / topicCount) * 100) : progressPct;
  const [shared, setShared] = useState(initialShared);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<"yol" | "ilerleme">("yol");
  const [topSlot, setTopSlot] = useState<HTMLElement | null>(null);
  // Sunucu çiziminde simgeler gizli: yoksa açılışta bir an ayrı satırda
  // görünüp üst çubuğa zıplıyorlardı.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setTopSlot(document.getElementById(PREP_TOP_SLOT_ID));
    setMounted(true);
  }, []);
  // Astra: büyük başlık kaydırılıp gidince adı yapışkan şeritte görünür.
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(Boolean(entry?.isIntersecting)), {
      rootMargin: "-64px 0px 0px 0px",
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  /**
   * Seviye tespiti yolun ilk düğümü (3 Ekim 2026). Eskiden yolun üstünde
   * "Seviyeni henüz ölçmedik" bandıydı; Astra'nın yolunda bant yok.
   */
  const introNode: HomeNode = {
    id: INTRO_NODE_ID,
    kind: "quiz",
    title: "Seviye tespiti",
    dayIndex: 0,
    sortOrder: -1,
    status: "ready",
  };
  /** "⋮" — Astra'nın hazırlık menüsü: paylaş, ders oluştur, kaynaklar, ayarlar. */
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsPane, setOptionsPane] = useState<"menu" | "kaynaklar" | "ayarlar">("menu");
  const [hubTopic, setHubTopic] = useState<string | null | undefined>(undefined);
  /** "Deneme sınavı oluştur" pencereyi Sınav sekmesinde açar. */
  const [hubGroup, setHubGroupState] = useState<StudyToolGroup | undefined>(undefined);
  function setHubGroup(group: StudyToolGroup) {
    setHubGroupState(group);
    setHubTopic(nextNode?.sessionMeta?.topicTitle ?? null);
  }
  const topicRows = useMemo(() => topicProgressFromNodes(nodes), [nodes]);
  const mockNode = nodes.find((node) => node.kind === "written_exam") ?? null;
  const progress = useMemo(
    () =>
      progressView ??
      buildPrepProgressView({
        nodes,
        attempts: [],
        topicLabels: labelsFor(topicLabels, topicRows),
        gaps: [],
        examDate,
        targetScore: null,
        dailyMinutes: null,
        measuredReadinessPct: learningTracking?.examReadinessPct ?? null,
      }),
    [progressView, nodes, topicLabels, topicRows, examDate, learningTracking],
  );
  const labels = labelsFor(topicLabels, topicRows);

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
    if (node.id === INTRO_NODE_ID) {
      router.push(examPrepIntroHref(prepId));
      return;
    }
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

  // Astra'nın üst çubuğunda yalnız sohbet ve "+" (ders oluştur) var; düello, paylaş ve
  // menü başlığın altında etiketli düğmeler (17 Ekim 2026, yan yana bakıldı). Kabuk
  // "focus" başlığında yer açıyor; yer yoksa (test ortamı) simgeler sayfanın başında kalır.
  const toolbar = (
      <div
        className={cn("cp-prep-actions", !mounted && "cp-prep-actions--pending")}
        role="toolbar"
        aria-label="Hazırlık işlemleri"
      >
        <Link
          href={`/deneme-sinavlari/${prepId}/sohbet`}
          className="cp-prep-icon"
          aria-label="Bu sınav için sor"
          title="Bu sınav için sor"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </Link>
        <button
          type="button"
          className="cp-prep-icon"
          aria-label="Etkinlik oluştur"
          title="Etkinlik oluştur"
          onClick={() => setHubTopic(nextNode?.sessionMeta?.topicTitle ?? null)}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
  );

  const lastNode = lastResult ? nodes.find((node) => node.id === lastResult.nodeId) ?? null : null;
  const doneCount = nodes.filter((node) => node.status === "done").length;

  return (
    <div className="cp-exam-page cp-exam-trail-page cp-prep-layout">
      {topSlot ? createPortal(toolbar, topSlot) : toolbar}

      {/* Astra (17 Ekim 2026): geniş ekranda solda sabit bilgi kartı (başlık, özet, sekmeler,
          düğmeler), sağda yol. Telefonda sıra bugünkü gibi: sekmeler üstte yapışkan. */}
      <aside className="cp-prep-aside">

      {/* Astra: sekmeler en üstte ve yapışkan; başlık kaydırınca bu şeridin üstünde kalır. */}
      <div className="cp-prep-tabbar">
        <p className={cn("cp-prep-tabbar-title", heroVisible && "is-hidden")} aria-hidden={heroVisible}>
          {title}
        </p>
        <div className="cp-prep-tabs" role="tablist" aria-label="Hazırlık görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={view === "yol"}
            className={cn(view === "yol" && "is-active")}
            onClick={() => setView("yol")}
          >
            <Route className="cp-prep-tab-icon" aria-hidden />
            {PREP_HOME_COPY.path}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "ilerleme"}
            className={cn(view === "ilerleme" && "is-active")}
            onClick={() => setView("ilerleme")}
          >
            <LineChart className="cp-prep-tab-icon" aria-hidden />
            {PREP_HOME_COPY.progress}
            <span className="cp-prep-tabs-pct">%{pathPct}</span>
          </button>
        </div>
      </div>

      <header className="cp-prep-hero" ref={heroRef}>
        {examType && examType !== "Serbest" ? <p className="cp-prep-hero-kicker">{examType}</p> : null}
        <h1>{title}</h1>
        <p className="cp-prep-hero-meta">
          <span>
            <CircleDashed className="h-4 w-4" aria-hidden />
            Hazırlık: %{progress.scorePct}
          </span>
          <span>
            <Check className="h-4 w-4" aria-hidden />
            {doneCount ? `${doneCount} ders tamamlandı` : "Henüz ders tamamlanmadı"}
          </span>
        </p>
        {/* Belgesiz hazırlıkta içerik konunun genel bilgisinden geliyor.
            Öğrenci bunu bilmezse "notumda bu varmış" diye okur. */}
        {documentId ? null : (
          <p className="cp-exam-source-note">{TOPIC_ONLY_NOTICE}</p>
        )}
        <div className="cp-prep-hero-actions">
          <button
            type="button"
            className="cp-prep-hero-action cp-prep-hero-action--lesson"
            onClick={() => setHubTopic(nextNode?.sessionMeta?.topicTitle ?? null)}
          >
            <span className="cp-prep-hero-icon" aria-hidden>
              <Plus className="h-4 w-4" />
            </span>
            Ders
          </button>
          <Link href={`/deneme-sinavlari/${prepId}/duello`} className="cp-prep-hero-action">
            <span className="cp-prep-hero-icon" aria-hidden>
              <Swords className="h-4 w-4" />
            </span>
            Düello
          </Link>
          {canShare ? (
            <button
              type="button"
              className={cn("cp-prep-hero-action", shared && "is-on")}
              aria-pressed={shared}
              aria-label={shared ? "Okulunla paylaşıldı" : "Okulunla paylaş"}
              disabled={sharing}
              onClick={() => void toggleShare()}
            >
              <span className="cp-prep-hero-icon" aria-hidden>
                <Share2 className="h-4 w-4" />
              </span>
              {shared ? "Paylaşıldı" : "Paylaş"}
            </button>
          ) : null}
          <button
            type="button"
            className="cp-prep-hero-action"
            aria-haspopup="dialog"
            aria-label="Hazırlık seçenekleri"
            onClick={() => openOptions("menu")}
          >
            <span className="cp-prep-hero-icon" aria-hidden>
              <MoreVertical className="h-4 w-4" />
            </span>
            Daha fazla
          </button>
        </div>
      </header>
      </aside>

      <div className="cp-prep-main">
      {view === "yol" && lastNode ? (
        <section className="cp-prep-last" aria-label="Son etkinlik">
          <div className="cp-prep-badges">
            {lastResult?.pct != null ? <span className="cp-prep-badge cp-prep-badge--score">%{lastResult.pct}</span> : null}
            <span className="cp-prep-badge">{PLAN_NODE_META[lastNode.kind].title}</span>
          </div>
          <h2 className="cp-prep-last-title">{nodeHeading(lastNode)}</h2>
          <Link href={examPrepNodeHref(prepId, lastNode.id)} className="cp-prep-last-go">
            Sonuçları gör
          </Link>
        </section>
      ) : null}

      {view === "ilerleme" ? (
        <ExamPrepProgress
          view={progress}
          daysLabel={daysLabel}
          warnings={topicWarnings}
          reviewsHref={uiV2 ? examPrepReviewsHref(prepId) : null}
          mockHref={mockNode ? examPrepNodeHref(prepId, mockNode.id) : null}
          onCreate={(label) => setHubTopic(label)}
        />
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
        <>
          <StudyPath
            nodes={nodes}
            lead={introPending ? introNode : null}
            currentId={nextNode?.id ?? null}
            onOpen={openNode}
            readinessClaim={readinessClaim}
          />
          {/* Astra'da yolun sonu: beşgen "hazırlık düzeyi" ve deneme sınavı çağrısı. */}
          <section className="cp-prep-goal" aria-label="Hazırlık düzeyi">
            <div className="cp-prep-goal-badge">
              <span className="cp-prep-goal-spark" aria-hidden>
                ✦
              </span>
              <strong>%{progress.scorePct}</strong>
              <span>Hazırlık düzeyi</span>
            </div>
            <h2>Gerçek sınavda nasıl yapacağını merak ediyor musun?</h2>
            <p>Hazır olduğunda öğren.</p>
            <button type="button" className="cp-prep-goal-go" onClick={() => setHubGroup("exam")}>
              <Timer className="h-4 w-4" aria-hidden />
              Deneme sınavı oluştur
            </button>
          </section>
        </>
      ) : null}

      {/* Astra'nın alt kartı: "SIRADAKİ" ve etkinlik türü etiketi, başlık, "Dersi
          özelleştir" ve "Devam et". */}
      {view === "yol" && nodes.length ? (
        <div className="cp-exam-start-card cp-path-next">
          {nextNode ? (
            <div className="cp-prep-badges">
              <span className="cp-prep-badge cp-prep-badge--next">Sıradaki</span>
              <span className="cp-prep-badge">{PLAN_NODE_META[nextNode.kind].title}</span>
            </div>
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
      </div>

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
                  <p className="cp-prep-sheet-owner">
                    Oluşturan: <strong>{creatorLabel}</strong>
                    {schoolName ? <span> · 🏛️ {schoolName}</span> : null}
                    {shared && joinCount > 0 ? <span> · {joinCount} katılım</span> : null}
                  </p>
                  <p className="cp-prep-sheet-kicker">{examType}</p>
                  <p className="cp-prep-sheet-title">{title}</p>
                  <p className="cp-prep-sheet-meta">
                    {topicCount > 0 ? `${topicsDone} / ${topicCount} konu` : `%${progressPct}`}
                    {examDate ? ` · sınav ${formatDayLong(examDate)}` : ""}
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
                  <li>
                    <button type="button" onClick={() => setOptionsPane("ayarlar")}>
                      <Settings className="h-4 w-4" aria-hidden />
                      Ayarlar
                    </button>
                  </li>
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

            {optionsPane === "ayarlar" ? (
              <div className="cp-prep-sheet-pane">
                <PrepBasicsPanel prepId={prepId} title={title} targetScore={targetScore} />
                {settings ? <ExamPrepSettingsPanel prepId={prepId} initial={settings} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hubTopic !== undefined ? (
        <StudyToolsHub
          prepId={prepId}
          nodes={nodes}
          openMisconceptions={openMisconceptions}
          preferred={settings?.preferences.modalities ?? []}
          topics={labels}
          topicOptions={topicOptions}
          topicLabel={hubTopic}
          onTopic={setHubTopic}
          initialGroup={hubGroup}
          onClose={() => {
            setHubTopic(undefined);
            setHubGroupState(undefined);
          }}
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
/**
 * Yol düğümü: üç boyutlu disk (Astra'daki gibi basılabilir düğme; 17 Ekim 2026). Üstte
 * elips yüzey, yanda gövde, altta gölge; renk duruma göre: bitmiş beyaz, sıradaki mavi
 * ışıklı, açık koyu mavi gri, kilitli koyu gri ve iç halkalı. Çizim bize ait.
 */
const PUCK_FILL: Record<"done" | "current" | "ready" | "locked", { top: [string, string]; side: [string, string]; ring?: boolean; gloss: number }> = {
  done: { top: ["#ffffff", "#d3d6dd"], side: ["#a9adb6", "#7c818b"], gloss: 0.55 },
  current: { top: ["#a3abff", "#4353f3"], side: ["#3341d8", "#232fa6"], gloss: 0.45 },
  ready: { top: ["#353846", "#262833"], side: ["#1d1f28", "#14151b"], ring: true, gloss: 0.08 },
  locked: { top: ["#2c2c2c", "#202020"], side: ["#171717", "#101010"], ring: true, gloss: 0.06 },
};

function PathPuck({ state }: { state: keyof typeof PUCK_FILL }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fill = PUCK_FILL[state];
  return (
    <svg className={`cp-puck cp-puck--${state}`} viewBox="0 0 92 62" aria-hidden>
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fill.top[0]} />
          <stop offset="1" stopColor={fill.top[1]} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={fill.side[1]} />
          <stop offset="0.5" stopColor={fill.side[0]} />
          <stop offset="1" stopColor={fill.side[1]} />
        </linearGradient>
      </defs>
      <ellipse cx="46" cy="50" rx="44" ry="11" fill="rgba(0,0,0,0.45)" />
      <path d="M2 26 V36 A44 16 0 0 0 90 36 V26 Z" fill={`url(#s${id})`} />
      <ellipse cx="46" cy="26" rx="44" ry="17" fill={`url(#t${id})`} />
      {fill.ring ? <ellipse cx="46" cy="25" rx="31" ry="11" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" /> : null}
      <ellipse cx="40" cy="19" rx="24" ry="6" fill="#fff" opacity={fill.gloss * 0.35} />
    </svg>
  );
}

const PATH_ROW = 96;
const PATH_STEP = 56;
const PATH_WIDTH = 280;
const PATH_PATTERN = [0, 1, 0, -1] as const;

function StudyPath({
  nodes,
  lead = null,
  currentId,
  onOpen,
  readinessClaim,
}: {
  nodes: HomeNode[];
  /** Yolun başındaki seviye tespiti (tanı bitmemişse). */
  lead?: HomeNode | null;
  currentId: string | null;
  onOpen: (node: HomeNode) => void;
  readinessClaim: boolean | null;
}) {
  // Önerilen sıra aşamalardan geliyor (tanı → öğren → pekiştir); yol aynı
  // sırayı tek bir zikzak olarak çiziyor, aşama başlıkları Astra'daki gibi yok.
  const ordered = useMemo(
    () => [...(lead ? [lead] : []), ...groupNodesByPhase(nodes).flatMap((group) => group.nodes)],
    [nodes, lead],
  );
  const points = ordered.map((node, index) => ({
    node,
    x: PATH_WIDTH / 2 + PATH_PATTERN[index % PATH_PATTERN.length] * PATH_STEP,
    y: PATH_ROW / 2 + index * PATH_ROW,
  }));
  const height = ordered.length * PATH_ROW;
  // Astra'daki aşağı ok: sıradaki düğüm ekranın dışındaysa oraya kaydırır.
  const currentRef = useRef<HTMLLIElement | null>(null);
  const [currentVisible, setCurrentVisible] = useState(true);
  useEffect(() => {
    const item = currentRef.current;
    if (!item || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCurrentVisible(Boolean(entry?.isIntersecting)));
    observer.observe(item);
    return () => observer.disconnect();
  }, [currentId]);

  return (
    <div className="cp-zpath" style={{ height }}>
      <p className="sr-only">{STUDY_PATH_HINT}</p>
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
              ref={node.id === currentId ? currentRef : undefined}
              className={cn("cp-exam-trail-item", x > PATH_WIDTH / 2 && "is-right")}
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
                <PathPuck state={node.status === "done" ? "done" : node.id === currentId ? "current" : node.status === "locked" ? "locked" : "ready"} />
                {/* Astra: bitmişte onay, kilitlide kilit, sıradakinde simge huzmede, açıkta tür. */}
                {node.id === currentId ? null : (
                  <span className="cp-puck-glyph" aria-hidden>
                    {node.status === "done" ? <Check className="h-6 w-6" strokeWidth={2.5} /> : <NodeGlyph node={node} />}
                  </span>
                )}
              </button>
              {node.id === currentId ? (
                <span className="cp-path-beam" aria-hidden>
                  <span className="cp-path-beam-icon">
                    <NodeGlyph node={node} />
                  </span>
                </span>
              ) : null}
              {node.status === "done" && node.id !== currentId ? (
                <span className="cp-path-done-label" aria-hidden>
                  {meta.title}
                </span>
              ) : null}
              {/* Astra: sıradaki düğümün yanında "SIRADAKİ" ve konunun adı. */}
              {node.id === currentId ? (
                <span className="cp-path-current-label" aria-hidden>
                  <span className="cp-prep-badge cp-prep-badge--next">Sıradaki</span>
                  <span className="cp-path-current-title">{nodeHeading(node)}</span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {currentId && !currentVisible ? (
        <button
          type="button"
          className="cp-path-jump"
          aria-label="Sıradaki etkinliğe git"
          onClick={() => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        >
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
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
