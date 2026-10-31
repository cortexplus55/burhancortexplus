"use client";

import { FirstTopicLockCard } from "@/components/parity/first-topic-lock";
import type { FirstTopicSummary } from "@/components/parity/exam-node/gates";
import Link from "next/link";
import { HOLIDAY_BADGE, turkishHolidayOn } from "@/lib/learning/tr-calendar";
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
  Camera,
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
  examPrepNodeResultHref,
  examPrepReviewsHref,
  examPrepSavedReviewHref,
} from "@/lib/learning/exam-prep-hrefs";
import {
  topicProgressFromNodes,
} from "@/lib/learning/exam-prep-ui-path";
import { STUDY_PATH_HINT, mockExamSetupHref, nodeNeedsStudentUnlock, studentMayStartNode, studyNodeAria, studySketchVideoHref, type StudyToolGroup } from "@/lib/learning/study-tools";
import { chooseStudyNode } from "@/lib/learning/choose-study-node";
import { FreeActivityPicker } from "@/components/parity/free-activity-picker";
import { PATH_FAR_NOTE, farNodeIds } from "@/lib/learning/study-path-window";
import { buildPathSections, sectionMasteryPct, sectionStatusLine } from "@/lib/learning/path-sections";
import {
  applyDisplayDates,
  isShortPlan,
  pathNodeWhenLabel,
  pathOriginDay,
  sectionDoneLabel,
  sectionHolidayNotes,
  sectionWhenLabel,
} from "@/lib/learning/path-dates";
import { examDayLabel } from "@/lib/learning/exam-time";
import { isLevelNode, LEVEL_NODE_ID, levelNodeAria } from "@/lib/learning/path-level";
import { StudyToolsHub } from "@/components/parity/study-tools-hub";
import { ExamPrepProgress } from "@/components/parity/exam-prep-progress";
import { PrepDueReviewCard } from "@/components/parity/prep-review-card";
import {
  buildPrepProgressView,
  type PrepProgressView,
} from "@/lib/learning/prep-progress-view";
import { METRIC_HINT, METRIC_LABEL } from "@/lib/learning/prep-metrics";
import { ALL_TOPICS_KINDS, ALL_TOPICS_LABEL } from "@/lib/learning/prep-wide-target";
import { groupNodesByPhase } from "@/lib/learning/exam-plan-phases";
import { cn } from "@/lib/utils";
import { formatDayLong } from "@/lib/format";
import { PrepBasicsPanel } from "@/components/parity/prep-basics-panel";
import {
  buildPrepRadarView,
  tempoFromProgress,
} from "@/lib/learning/prep-radar";
import { prepStars } from "@/lib/stars/rules";
import { activityDurationMinutes, LESSON_MIN_MINUTES } from "@/lib/learning/activity-duration";
import { TOPIC_ONLY_NOTICE } from "@/lib/learning/prep-source";
import { PREP_HOME_COPY } from "@/lib/learning/exam-wizard-copy";
import { PrepMaterialAdder } from "@/components/parity/prep-add-material";
import { PendingMaterialsBanner } from "@/components/parity/pending-materials-banner";
import { PrepShareTools } from "@/components/parity/prep-share-tools";
import { ExamResultCard, type ExamResultCardProps } from "@/components/parity/exam-result-card";
import {
  ExamPrepSettingsPanel,
  type PrepSettingsInitial,
} from "@/components/parity/exam-prep-settings-panel";

/** Kabuğun "focus" başlığındaki simge yeri (sor-shell). */
export const PREP_TOP_SLOT_ID = "cp-sor-top-slot";
const INTRO_NODE_ID = LEVEL_NODE_ID;

export type HomeNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
  status: NodeStatus;
  /** Ücretsiz hesapta 1. konunun dışında (Paket J takip #1): tıklayınca Plus kartı anında açılır. */
  planLocked?: boolean;
  sessionMeta?: {
    objective?: string;
    sourcePages?: number[];
    durationMinutes?: number;
    /** İçerikten ölçülen süre (`activityDurationMinutes`); öğrenciye yazılan tek süre. */
    activityMinutes?: number;
    role?: string;
    calendarDate?: string;
    topicId?: string;
    topicTitle?: string;
    /** Uzun planın tarihe bağlı tekrarı (30 Ekim 2026); yolda "Aralıklı Tekrar ve Kontrol" bölümünde. */
    longReview?: number;
    checkpoint?: string;
  } | null;
};

/**
 * Düğümün simgesi — Astra'daki gibi etkinlik türünü söylüyor, sıra numarasını
 * değil. Kilitli düğümde tür yerine kilit: "bu daha açılmadı" tek bakışta
 * okunuyor. Test düğümleri harfle (AB / ABCD), podcast altıgenle ayrılıyor.
 */
function NodeGlyph({ node }: { node: HomeNode }) {
  if (isLevelNode(node.id)) return <Flag className="h-6 w-6" aria-hidden />;
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
function nodeShape(node: Pick<HomeNode, "id" | "kind">): "hex" | "square" | "round" {
  if (isLevelNode(node.id)) return "round";
  if (node.kind === "podcast") return "hex";
  if (node.kind === "quiz" || node.kind === "true_false") return "square";
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
  const heading = parts[0] || raw;
  // Bütün konuları kapsayan adım (son kontrol, yazılı deneme, Hazırsın) devraldığı 1. konunun adını yazmaz
  // (30 Ekim 2026, Paket I #8): kart "1. konu" derken sorular bütün konulardan geliyordu.
  if (ALL_TOPICS_KINDS.has(node.kind)) return heading === PLAN_NODE_META[node.kind].title ? `${heading} · ${ALL_TOPICS_LABEL}` : heading;
  // Başlık yalnız etkinliğin türüyse ("Podcast Dinle") konunun adı yazılır; tür zaten
  // etiketinde. Astra'da "SIRADAKİ · AKILLI METİN · Büyüme Eğrileri…" (18 Ekim 2026).
  const topic = node.sessionMeta?.topicTitle?.trim();
  return topic && heading === PLAN_NODE_META[node.kind].title ? topic : heading;
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
  coveragePct?: number;
  measuredSuccessPct?: number | null;
  mockPct?: number | null;
  retentionPct?: number | null;
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
  joinedFromSchool = false,
  joinCount = 0,
  lastResult = null,
  nodeScores = {},
  topicPercents = {},
  lockedPickId = null,
  dueReviews = 0,
  pendingMaterials = 0,
  createdAt = null,
  examTime = null,
  examPlace = null,
  nodeDoneOn = {},
  shareTools = null,
  examResult = null,
  firstTopicLock = null,
}: {
  prepId: string;
  /** 1. konu özeti; ücretsiz hesapta kilitli adım varsa dolu (`freeTopicLocks`). */
  firstTopicLock?: FirstTopicSummary | null;
  /** Sınav sabahı kâğıdı + sınıf paylaşımı (Paket J3 #14); bağlantı sunucuda imzalı ve mutlak. Yoksa kâğıt düğmesi yine görünür. */
  shareTools?: { inviteUrl: string | null; whatsappHref: string | null } | null;
  /** Sınav günü geçince not sorusu ya da başarı kartı (Paket J3 #14). */
  examResult?: ExamResultCardProps | null;
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
  /** Podcast rotasının konu kimliği. Etiket listesinden ayrıdır. Belgeli hazırlıkta ikinci kimlik de (düğümler onu taşır). */
  topicOptions?: { id: string; label: string; documentTopicNodeId?: string | null }[];
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
  /**
   * Hazırlık okuldan katılındı mı. Okul adı yalnız hazırlık okula bağlıyken yazılır (okulla
   * paylaşıldı ya da okuldan katılındı); öğrencinin profilindeki okul her hazırlıkta görünmez
   * (30 Ekim 2026, Paket I #12).
   */
  joinedFromSchool?: boolean;
  /** Okulda paylaşıldıysa katılım sayısı. */
  joinCount?: number;
  /** Son biten etkinlik ve yüzdesi; Astra yolun üstünde kart olarak gösteriyor. */
  lastResult?: { nodeId: string; pct: number | null } | null;
  /** Biten adımların son yüzdesi; yolda adımın altında yazar (Astra "30% Podcast"). */
  nodeScores?: Record<string, number>;
  /** Konu başlığı (küçük harf) → topicMasteryPercent. Yol bölümü bu sayıyı gösterir. */
  topicPercents?: Record<string, number>;
  /** Kilitli adımın adresi açıldıysa o adım seçili gelir. */
  lockedPickId?: string | null;
  /** Bu hazırlıkta bugün sorulacak tekrar (20 Ekim 2026); yolu kilitlemez. */
  dueReviews?: number;
  /** Hızlı başlatmanın hazırlığa bağlı, henüz eklenmemiş belgeleri (31 Ekim 2026); 0 ise şerit yok. */
  pendingMaterials?: number;
  /** Yol etiketlerinin hafta başlangıcı. Yoksa bugün. */
  createdAt?: string | null;
  /** İsteğe bağlı sınav saati ve yeri (30 Ekim 2026): yolun sonunda "31 Eki 10:00 · Sınav". */
  examTime?: string | null;
  examPlace?: string | null;
  /** Biten adımın bitiş günü (İstanbul, YYYY-MM-DD): yolda "Tamamlandı · 29 Eki". */
  nodeDoneOn?: Record<string, string>;
}) {
  const router = useRouter();
  /** Yolda seçilen kilitli adım: kart "şimdi başlat" der. */
  const [lockedPick, setLockedPick] = useState<HomeNode | null>(
    () => nodes.find((node) => node.id === lockedPickId && nodeNeedsStudentUnlock(node.status)) ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  /** Bitmiş adım: kayıtlı içeriği aç ya da sıradaki etkinliğe geç. */
  const [donePick, setDonePick] = useState<HomeNode | null>(null);
  const doneCardRef = useRef<HTMLDivElement | null>(null);
  const ready = nodes.find((node) => node.status === "ready");
  const hasProgress = nodes.some((node) => node.status === "done");
  const firstPlayable = nodes.find((node) => node.status !== "locked");
  const beginHref =
    hasTopic && !needsIntro && firstPlayable
      ? examPrepNodeHref(prepId, firstPlayable.id)
      : startHref;
  const primaryHref = hasProgress ? startHref : beginHref;
  /*
    Alt karttaki etkinlik "Devam et"in gerçekten açtığı düğüm olmalı. 18 Ekim 2026 canlı
    deneme: etiket "Soru-Cevap · Büyüme ve Gelişme" derken bağlantı Beslenme'nin tekrar
    kartlarını açıyordu — sunucu "sıradaki"yi seçilen konuya göre, bu kart ise yoldaki ilk
    açık düğüme göre buluyordu. Bağlantı düğüme gidiyorsa etiket de o düğümden; gitmiyorsa
    (tanı/başlangıç sayfası) eski kural: sıradaki, yoksa bitmemiş ilk düğüm.
  */
  const primaryNodeId = primaryHref.match(/\/dugum\/([^/?#]+)/)?.[1] ?? null;
  const nextNode =
    nodes.find((node) => node.id === primaryNodeId) ??
    ready ??
    nodes.find((node) => node.status !== "done") ??
    null;
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
  /** Pencerenin açılacağı sekme ("Deneme sınavı oluştur" 30 Ekim'den beri doğrudan kuruluma gider). */
  const [hubGroup, setHubGroupState] = useState<StudyToolGroup | undefined>(undefined);
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
  const radar = useMemo(
    () =>
      buildPrepRadarView({
        readinessPct: progress.scorePct,
        targetScore: targetScore ?? progress.targetPct,
        coveragePct:
          learningTracking?.coveragePct ??
          (topicCount > 0 ? Math.round((topicsDone / topicCount) * 100) : progress.scorePct),
        accuracyPct: learningTracking?.measuredSuccessPct ?? learningTracking?.topicMasteryPct,
        mockPct: learningTracking?.mockPct ?? progress.mocks[0]?.pct ?? null,
        retentionPct: learningTracking?.retentionPct,
        tempoPct: tempoFromProgress({
          programPct: learningTracking?.programProgressPct ?? progress.scorePct,
          thisWeekMinutes: progress.tempo.thisWeekMinutes,
          dailyGoalMinutes: progress.tempo.dailyGoalMinutes,
          weekActivities: progress.weekActivities,
        }),
      }),
    [learningTracking, progress, targetScore, topicCount, topicsDone],
  );
  const nextMinutes = nextNode
    ? activityDurationMinutes(nextNode.kind, { known: nextNode.sessionMeta?.activityMinutes })
    : LESSON_MIN_MINUTES;
  const nextStars = nextNode ? prepStars(nextNode.kind, null, null) : 10;

  useEffect(() => {
    if (!optionsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [optionsOpen]);

  useEffect(() => {
    if (!donePick) return;
    doneCardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [donePick]);

  function openOptions(pane: "menu" | "kaynaklar" | "ayarlar" = "menu") {
    setOptionsPane(pane);
    setOptionsOpen(true);
  }

  const pickTopics = useMemo(() => {
    const seen = new Set<string>();
    // `id` seçicinin anahtarı; gerçek kimlik yoksa (`labelOnly`) eşleşme adla yapılır — ad kimlik sanılmasın
    // (30 Ekim 2026, `topic-identity.ts`: iki tarafta kimlik varsa kimlik karar verir).
    const list: { id: string; label: string; documentTopicNodeId?: string | null; labelOnly?: boolean }[] = [];
    function add(id: string | null | undefined, label: string, documentTopicNodeId: string | null = null) {
      const key = label.trim().toLocaleLowerCase("tr-TR");
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(id ? { id, label: label.trim(), documentTopicNodeId } : { id: key, label: label.trim(), labelOnly: true });
    }
    for (const topic of topicOptions) add(topic.id, topic.label, topic.documentTopicNodeId ?? null);
    for (const label of topicLabels) add(null, label);
    for (const node of nodes) {
      const label = node.sessionMeta?.topicTitle;
      if (label) add(node.sessionMeta?.topicId || null, label);
    }
    return list;
  }, [topicOptions, topicLabels, nodes]);

  const [lockCardOpen, setLockCardOpen] = useState(false);

  async function startNode(nodeId: string, href: string) {
    if (starting) return;
    if (nodes.some((node) => node.id === nodeId && node.planLocked)) {
      setLockCardOpen(true);
      return;
    }
    setStarting(true);
    await chooseStudyNode(prepId, nodeId);
    router.push(href);
  }

  function openNode(node: HomeNode) {
    if (node.id === INTRO_NODE_ID) {
      router.push(examPrepIntroHref(prepId));
      return;
    }
    // Beklemesiz kilit: sayfaya gidilmez, kart burada açılır.
    if (node.planLocked && node.status !== "done") {
      setDonePick(null);
      setLockedPick(null);
      setLockCardOpen(true);
      return;
    }
    if (!studentMayStartNode(node.status, node.kind) || nodeNeedsStudentUnlock(node.status)) {
      setDonePick(null);
      setLockedPick(node);
      return;
    }
    setLockedPick(null);
    if (node.status === "done") {
      setDonePick(node);
      return;
    }
    setDonePick(null);
    if (!hasTopic) {
      router.push(`/deneme-sinavlari/${prepId}/konu`);
      return;
    }
    if (needsIntro) {
      router.push(`/deneme-sinavlari/${prepId}/tanisma`);
      return;
    }
    router.push(examPrepNodeHref(prepId, node.id));
  }

  function savedHref(node: HomeNode) {
    if (node.kind === "written_exam") return examPrepNodeResultHref(prepId, node.id);
    return examPrepSavedReviewHref(prepId, node.id);
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
        {/* Soru çöz (23 Ekim 2026): fotoğraf ya da yazılı soru; şıklı soru bu hazırlığın tekrar listesine eklenebilir. */}
        <Link
          href={`/soru-coz?hazirlik=${prepId}`}
          className="cp-prep-icon"
          aria-label="Soru çöz"
          title="Soru çöz"
        >
          <Camera className="h-4 w-4" aria-hidden />
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
            {/* Sekmenin sayısı içindeki "Hazırlık puanı"nın kendisi; ayrı bir konu oranı yazılmaz (Paket I #7). */}
            <span className="cp-prep-tabs-pct">%{progress.scorePct}</span>
          </button>
        </div>
      </div>

      <header className="cp-prep-hero" ref={heroRef}>
        {examType && examType !== "Serbest" ? <p className="cp-prep-hero-kicker">{examType}</p> : null}
        <h1>{title}</h1>
        {/* Üç ölçü, üç ad, tek kaynak (30 Ekim 2026, Paket I #7, prep-metrics.ts): Hazırlık ölçülen başarı
            (yanlışla düşebilir), ders sayısı İlerleme'deki "ders" ile aynı ("Hazırsın" ekranı ders değil),
            Tamamlama biten adım oranı (düşmez). Eskiden burada bütün biten düğümler "ders" diye sayılıyordu. */}
        <p className="cp-prep-hero-meta">
          <span title={METRIC_HINT.readiness}>
            <CircleDashed className="h-4 w-4" aria-hidden />
            {METRIC_LABEL.readiness}: %{progress.scorePct}
          </span>
          <span>
            <Check className="h-4 w-4" aria-hidden />
            {progress.lessonsDone ? `${progress.lessonsDone} ders tamamlandı` : "Henüz ders tamamlanmadı"}
          </span>
          <span title={METRIC_HINT.completion}>
            {METRIC_LABEL.completion}: %{progress.completionPct}
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
      {/* Hızlı başlatma (31 Ekim 2026): kurulumdan sonra okunmakta olan belgeler arkada okunup yoluna eklenir. */}
      {/* Her zaman bağlı: ekleme bitince sayfa yenilense de "eklendi" bildirimi görünür kalsın; bekleyen yoksa çizmez. */}
      <PendingMaterialsBanner prepId={prepId} initialPending={pendingMaterials} />
      {examResult ? <ExamResultCard {...examResult} /> : null}
      {view === "yol" && lastNode ? (
        <section className="cp-prep-last" aria-label="Son etkinlik">
          <div className="cp-prep-badges">
            {lastResult?.pct != null ? <span className="cp-prep-badge cp-prep-badge--score">%{lastResult.pct}</span> : null}
            <span className="cp-prep-badge">{PLAN_NODE_META[lastNode.kind].title}</span>
          </div>
          <h2 className="cp-prep-last-title">{nodeHeading(lastNode)}</h2>
          <Link href={examPrepNodeResultHref(prepId, lastNode.id)} className="cp-prep-last-go">
            Sonuçları gör
          </Link>
        </section>
      ) : null}

      {view === "yol" ? <PrepDueReviewCard prepId={prepId} count={dueReviews} /> : null}
      {view === "yol" ? (
        <PrepShareTools
          prepId={prepId}
          inviteUrl={shareTools?.inviteUrl ?? null}
          whatsappHref={shareTools?.whatsappHref ?? null}
        />
      ) : null}

      {view === "ilerleme" ? (
        <ExamPrepProgress
          view={progress}
          daysLabel={daysLabel}
          warnings={topicWarnings}
          reviewsHref={uiV2 ? examPrepReviewsHref(prepId) : null}
          mockHref={mockNode ? examPrepNodeHref(prepId, mockNode.id) : null}
          onCreate={(label) => setHubTopic(label)}
          radar={radar}
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
          <PathSections
            nodes={nodes}
            lead={introPending ? introNode : null}
            currentId={nextNode?.id ?? null}
            pickedId={lockedPick?.id ?? donePick?.id ?? null}
            scores={nodeScores}
            topicPercents={topicPercents}
            onOpen={openNode}
            readinessClaim={readinessClaim}
            examDate={examDate}
            examTime={examTime}
            examPlace={examPlace}
            doneOn={nodeDoneOn}
            pathOrigin={pathOriginDay(createdAt)}
            prepId={prepId}
            topics={topicOptions}
          />
          <section className="cp-prep-goal" aria-label="Hazırlık düzeyi">
            <h2>Gerçek sınavda nasıl yapacağını merak ediyor musun?</h2>
            <p>Hazır olduğunda öğren.</p>
            {/* Düğme doğrudan deneme kurulumuna gider (30 Ekim 2026, Paket I #12): eskiden "Ders oluştur"
                penceresini açıyordu, öğrenci denemeyi orada ikinci kez aramak zorunda kalıyordu. */}
            <Link href={mockExamSetupHref(prepId)} className="cp-prep-goal-go">
              <Timer className="h-4 w-4" aria-hidden />
              Deneme sınavı oluştur
            </Link>
          </section>
        </>
      ) : null}

      {/* Astra'nın alt kartı (18 Ekim 2026, yan yana bakıldı): kilitli adım seçiliyse neden
          açılmadığı; değilse "SIRADAKİ" + tür etiketi, başlık, "Başka birini seç" ve "Devam et". */}
      {view === "yol" && nodes.length && donePick ? (
        <div
          ref={doneCardRef}
          className="cp-exam-start-card cp-path-next cp-path-next--focus"
          role="region"
          aria-label="Tamamlanan adım"
        >
          <div className="cp-prep-badges">
            <span className="cp-prep-badge">Tamamlandı</span>
            <span className="cp-prep-badge">{PLAN_NODE_META[donePick.kind].title}</span>
          </div>
          <h2 className="cp-path-next-title">{nodeHeading(donePick)}</h2>
          <p className="cp-path-next-note">Kayıtlı içerik yeniden açılır; kredi düşmez.</p>
          <div className="cp-path-next-actions cp-path-next-actions--stack">
            <Link href={savedHref(donePick)} className="cp-exam-continue cp-exam-continue--primary">
              📖 Dersi / İçeriği Tekrar İncele (Kredisiz)
            </Link>
            <Link href={primaryHref} className="cp-path-next-custom">
              ⏭️ Sıradaki Etkinliğe Git
            </Link>
          </div>
        </div>
      ) : view === "yol" && nodes.length && lockedPick ? (
        <div className="cp-exam-start-card cp-path-next cp-path-next--locked" role="status">
          <div className="cp-prep-badges">
            <span className="cp-prep-badge">
              <Lock className="h-3 w-3" aria-hidden /> Kilitli
            </span>
            <span className="cp-prep-badge">{PLAN_NODE_META[lockedPick.kind].title}</span>
          </div>
          <h2 className="cp-path-next-title">{nodeHeading(lockedPick)}</h2>
          {nodeNeedsStudentUnlock(lockedPick.status) ? (
            <p className="cp-path-next-note">Bu adım sıranın önünde. İstersen şimdi açılır.</p>
          ) : (
            <p className="cp-path-next-note">Bu adım, öncekileri bitirince açılır.</p>
          )}
          <div className="cp-path-next-actions">
            {nodeNeedsStudentUnlock(lockedPick.status) ? (
              <button
                type="button"
                className="cp-exam-continue cp-exam-continue--primary"
                disabled={starting}
                onClick={() => void startNode(lockedPick.id, examPrepNodeHref(prepId, lockedPick.id))}
              >
                Bu Etkinliği Şimdi Başlat
              </button>
            ) : null}
            <button type="button" className="cp-path-next-custom" onClick={() => setPickerOpen(true)}>
              Başka Bir Konu veya Etkinlik Seç
            </button>
            <button
              type="button"
              className="cp-exam-continue"
              onClick={() => setLockedPick(null)}
            >
              Sıradakine dön
            </button>
          </div>
        </div>
      ) : view === "yol" && nodes.length ? (
        <div className="cp-exam-start-card cp-path-next cp-path-next--focus">
          {nextNode ? (
            <div className="cp-prep-badges">
              <span className="cp-prep-badge cp-prep-badge--next">Sıradaki adım</span>
              <span className="cp-prep-badge">{PLAN_NODE_META[nextNode.kind].title}</span>
            </div>
          ) : null}
          <h2 className="cp-path-next-title">
            {nextNode ? nodeHeading(nextNode) : "Tüm etkinlikler bitti"}
          </h2>
          {nextNode ? (
            <p className="cp-path-next-meta">
              <span>~{nextMinutes} dk</span>
              <span aria-hidden>·</span>
              <span>+{nextStars} ⭐</span>
            </p>
          ) : null}
          <div className="cp-path-next-actions">
            <button
              type="button"
              className="cp-path-next-custom"
              onClick={() => setHubTopic(nextNode?.sessionMeta?.topicTitle ?? null)}
            >
              Başka birini seç
            </button>
            <button type="button" className="cp-path-next-custom" onClick={() => setPickerOpen(true)}>
              Başka Bir Konu veya Etkinlik Seç
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
                    {schoolName && (shared || joinedFromSchool) ? <span> · 🏛️ {schoolName}</span> : null}
                    {shared && joinCount > 0 ? <span> · {joinCount} katılım</span> : null}
                  </p>
                  <p className="cp-prep-sheet-kicker">{examType}</p>
                  <p className="cp-prep-sheet-title">{title}</p>
                  <p className="cp-prep-sheet-meta">
                    {topicCount > 0 ? `${topicsDone} / ${topicCount} konu` : `${METRIC_LABEL.completion} %${progressPct}`}
                    {examDate ? ` · sınav ${formatDayLong(examDate)}${examTime ? ` ${examTime}` : ""}` : ""}
                    {examPlace ? ` · ${examPlace}` : ""}
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

      <FirstTopicLockCard
        prepId={prepId}
        summary={firstTopicLock}
        open={lockCardOpen}
        onClose={() => setLockCardOpen(false)}
      />

      {pickerOpen ? (
        <FreeActivityPicker
          prepId={prepId}
          nodes={nodes}
          topics={pickTopics}
          busy={starting}
          onClose={() => setPickerOpen(false)}
          onOpen={(pick) => {
            setPickerOpen(false);
            if (pick.nodeId) void startNode(pick.nodeId, pick.href);
            else router.push(pick.href);
          }}
        />
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

function PathSections({
  nodes,
  lead = null,
  currentId,
  pickedId = null,
  scores = {},
  topicPercents = {},
  onOpen,
  readinessClaim,
  examDate = null,
  examTime = null,
  examPlace = null,
  doneOn = {},
  pathOrigin,
  prepId,
  topics = [],
}: {
  nodes: HomeNode[];
  lead?: HomeNode | null;
  currentId: string | null;
  pickedId?: string | null;
  scores?: Record<string, number>;
  topicPercents?: Record<string, number>;
  onOpen: (node: HomeNode) => void;
  readinessClaim: boolean | null;
  examDate?: string | null;
  examTime?: string | null;
  examPlace?: string | null;
  doneOn?: Record<string, string>;
  pathOrigin: string;
  prepId: string;
  topics?: { id: string; label: string }[];
}) {
  const today = pathOriginDay(null);
  // 7 günden kısa plan (30 Ekim 2026): hafta yok, gün var ("Bugün", "Yarın", "Cum 31 Eki").
  const shortPlan = isShortPlan(pathOrigin, examDate);
  const dated = useMemo(
    () => applyDisplayDates(nodes, { origin: pathOrigin, examDate }),
    [nodes, pathOrigin, examDate],
  );
  const sections = useMemo(() => buildPathSections(dated, currentId), [dated, currentId]);
  // Bölümün tarih aralığındaki resmî tatiller: uzun planda düğüm tatile düşmese de Nisan–Haziran
  // tatilleri görünür (30 Ekim 2026). Tatil yine esnek gün.
  const holidayNotes = useMemo(
    () =>
      sectionHolidayNotes(
        sections.map((section) => section.nodes.map((node) => node.sessionMeta?.calendarDate ?? "")),
        pathOrigin,
        examDate,
      ),
    [sections, pathOrigin, examDate],
  );
  const examDayLine = examDate ? examDayLabel({ date: examDate, time: examTime, place: examPlace }) : "";
  const far = useMemo(
    () => farNodeIds([...dated].sort((a, b) => a.sortOrder - b.sortOrder), currentId),
    [dated, currentId],
  );
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [tailOpen, setTailOpen] = useState(false);
  const activeIndex = sections.findIndex((section) => section.active);
  const tailAt = activeIndex < 0 ? sections.length : activeIndex + 1 + 2;
  const hidden = tailOpen ? [] : sections.slice(tailAt);
  function isOpen(section: (typeof sections)[number], index: number) {
    if (Object.prototype.hasOwnProperty.call(opened, section.id)) return opened[section.id]!;
    if (section.active) return true;
    if (lead && index === 0) return true;
    if (!sections.some((item) => item.active) && index === sections.length - 1) return true;
    return false;
  }
  return (
    <div className="cp-path-sections">
      {sections.map((section, index) => {
        if (index >= tailAt && !tailOpen) return null;
        const open = isOpen(section, index);
        const topicKey = section.title.trim().toLocaleLowerCase("tr-TR");
        const topicPct = Object.prototype.hasOwnProperty.call(topicPercents, topicKey)
          ? topicPercents[topicKey]
          : null;
        const mastery =
          typeof topicPct === "number"
            ? topicPct
            : section.complete
              ? sectionMasteryPct(section.nodes, scores)
              : null;
        const line = sectionStatusLine(section, mastery);
        // Bitmiş bölüm bitiş günlerini yazar, "Yarın" değil; süren bölüm kalan adımların planlı günlerini.
        const when = section.complete
          ? sectionDoneLabel(section.nodes.map((node) => doneOn[node.id] ?? ""))
          : sectionWhenLabel(
              section.nodes
                .filter((node) => node.status !== "done")
                .map((node) => node.sessionMeta?.calendarDate ?? ""),
              pathOrigin,
              today,
              { examDate },
            );
        const holidayNote = holidayNotes[index] ?? null;
        const topicId =
          section.nodes.find((node) => node.sessionMeta?.topicId)?.sessionMeta?.topicId ||
          topics.find((topic) => topic.label.trim().toLocaleLowerCase("tr-TR") === section.title.trim().toLocaleLowerCase("tr-TR"))?.id ||
          "";
        const sketchHref = topicId && !section.review ? studySketchVideoHref(prepId, section.title, topics.some((topic) => topic.id === topicId) ? topics : [...topics, { id: topicId, label: section.title }]) : "";
        return (
          <section
            key={section.id}
            className={cn(
              "cp-path-section",
              section.active && "is-active",
              section.complete && "is-done",
              section.locked && "is-locked",
              open && "is-open",
            )}
          >
            <button
              type="button"
              className="cp-path-section-toggle"
              aria-expanded={open}
              onClick={() => setOpened((current) => ({ ...current, [section.id]: !open }))}
            >
              <span className="cp-path-section-copy">
                <strong>{section.title}</strong>
                <span className="cp-path-section-meta">
                  {when ? <span className="cp-path-section-when">{when}</span> : null}
                  {when ? " · " : null}
                  {line}
                </span>
                {holidayNote ? <span className="cp-path-section-holiday">{holidayNote}</span> : null}
              </span>
              <ChevronDown className={cn("cp-path-section-chevron", open && "is-open")} aria-hidden />
            </button>
            {sketchHref ? (
              <Link href={sketchHref} className="cp-path-sketch">
                🎬 1 Dk Çizimli Video Özeti
              </Link>
            ) : null}
            {open ? (
              <StudyPath
                nodes={section.nodes}
                lead={index === 0 ? lead : null}
                currentId={currentId}
                pickedId={pickedId}
                scores={scores}
                onOpen={onOpen}
                readinessClaim={readinessClaim}
                farIds={far}
                keepOrder
                today={today}
                doneOn={doneOn}
                weekday={shortPlan}
              />
            ) : null}
          </section>
        );
      })}
      {hidden.length ? (
        <button type="button" className="cp-path-section-more" onClick={() => setTailOpen(true)}>
          {hidden.every((section) => section.locked)
            ? `Kalan kilitli konular (${hidden.length} konu)`
            : `Kalan konular (${hidden.length} konu)`}
        </button>
      ) : null}
      {examDayLine ? (
        <p className="cp-path-exam-day" aria-label={`Sınav günü: ${examDayLine}`}>
          🎯 {examDayLine}
        </p>
      ) : null}
    </div>
  );
}

function StudyPath({
  nodes,
  lead = null,
  currentId,
  pickedId = null,
  scores = {},
  onOpen,
  readinessClaim,
  farIds,
  keepOrder = false,
  today,
  doneOn = {},
  weekday = false,
}: {
  nodes: HomeNode[];
  /** Yolun başındaki seviye tespiti (tanı bitmemişse). */
  lead?: HomeNode | null;
  currentId: string | null;
  /** Seçilen kilitli adım (Astra'da çerçeveyle işaretli). */
  pickedId?: string | null;
  /** Biten adımın yüzdesi. */
  scores?: Record<string, number>;
  onOpen: (node: HomeNode) => void;
  readinessClaim: boolean | null;
  /** Yolun tamamına göre uzak adımlar. Bölüm yalnız kendi düğümlerini çizer. */
  farIds?: Set<string>;
  /** Konu kartı düğümleri zaten yürüme sırasında. */
  keepOrder?: boolean;
  today: string;
  /** Biten adımın bitiş günü; etiket "Tamamlandı · 29 Eki". */
  doneOn?: Record<string, string>;
  /** Kısa planda gün adı da yazılır ("Cum 31 Eki"). */
  weekday?: boolean;
}) {
  // Önerilen sıra aşamalardan geliyor (tanı → öğren → pekiştir); yol aynı
  // sırayı tek bir zikzak olarak çiziyor, aşama başlıkları Astra'daki gibi yok.
  const ordered = useMemo(
    () => [
      ...(lead ? [lead] : []),
      ...(keepOrder ? nodes : groupNodesByPhase(nodes).flatMap((group) => group.nodes)),
    ],
    [nodes, lead, keepOrder],
  );
  const points = ordered.map((node, index) => ({
    node,
    x: PATH_WIDTH / 2 + PATH_PATTERN[index % PATH_PATTERN.length] * PATH_STEP,
    y: PATH_ROW / 2 + index * PATH_ROW,
  }));
  const height = ordered.length * PATH_ROW;
  // 2 adım ileri (20 Ekim 2026): sonrası sonuçlara göre değişebilir, soluk çizilir; not ilkinde.
  // Pencere kilidin açıldığı sırayla (sort_order, konu konu) sayılır; yol aşamaya göre çiziliyor.
  const far = useMemo(
    () => farIds ?? farNodeIds([...nodes].sort((a, b) => a.sortOrder - b.sortOrder), currentId),
    [farIds, nodes, currentId],
  );
  const firstFarId = ordered.find((node) => far.has(node.id))?.id ?? null;
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

  const currentIndex = ordered.findIndex((node) => node.id === currentId);

  return (
    <div className="cp-zpath" style={{ height }}>
      <p className="sr-only">{STUDY_PATH_HINT}</p>
      {points.length > 1 ? (
        <svg className="cp-path-lines" viewBox={`0 0 ${PATH_WIDTH} ${height}`} aria-hidden>
          {points.slice(1).map((point, index) => {
            const prev = points[index]!;
            const midY = (prev.y + point.y) / 2;
            const pastCurrent = currentIndex >= 0 && index >= currentIndex;
            const toCurrent = point.node.id === currentId;
            const fromDone = prev.node.status === "done";
            return (
              <path
                key={`${prev.node.id}-${point.node.id}`}
                className={cn(
                  fromDone && !pastCurrent && "is-done",
                  toCurrent && "is-next",
                  pastCurrent && !toCurrent && "is-upcoming",
                )}
                d={`M ${prev.x} ${prev.y} C ${prev.x} ${midY}, ${point.x} ${midY}, ${point.x} ${point.y}`}
              />
            );
          })}
        </svg>
      ) : null}
      <ol className="cp-path-list" aria-label={PREP_HOME_COPY.path}>
        {points.map(({ node, x, y }) => {
          const meta = PLAN_NODE_META[node.kind];
          const level = isLevelNode(node.id);
          // Bitmiş adım "Yarın" değil "Tamamlandı · 29 Eki" (30 Ekim 2026).
          const dayLabel = pathNodeWhenLabel(
            { status: node.status, calendarDate: node.sessionMeta?.calendarDate },
            { today, doneOn: doneOn[node.id], weekday },
          );
          // Resmî tatil esnek gündür (28 Ekim 2026): yük yarıya iner, rozet söyler. Bitmiş adımda yok.
          const holiday =
            node.status !== "done" && node.sessionMeta?.calendarDate
              ? turkishHolidayOn(node.sessionMeta.calendarDate)
              : null;
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
              className={cn("cp-exam-trail-item", x > PATH_WIDTH / 2 && "is-right", far.has(node.id) && "is-far")}
              style={{ left: x, top: y }}
            >
              <button
                type="button"
                className={cn(
                  "cp-exam-trail-node",
                  `cp-exam-trail-node--${node.status}`,
                  `cp-path-node--${nodeShape(node)}`,
                  node.kind === "podcast" && "cp-exam-trail-node--podcast",
                  node.id === currentId && "is-current",
                  node.id === pickedId && "is-picked",
                )}
                aria-pressed={node.id === pickedId ? true : undefined}
                aria-label={
                  level
                    ? `${levelNodeAria(studyNodeAria(node.status))}${dayLabel ? `, ${dayLabel}` : ""}`
                    : `${nodeHeading(node)} · ${meta.title}, ${studyNodeAria(node.status)}${
                        node.status === "done" && scores[node.id] != null ? `, %${scores[node.id]}` : ""
                      }${readinessNote}${node.planLocked ? ", Plus'ta" : ""}${far.has(node.id) ? `, ${PATH_FAR_NOTE.toLocaleLowerCase("tr")}` : ""}${
                        dayLabel ? `, ${dayLabel}` : ""
                      }`
                }
                title={level ? "Seviye tespiti" : `${nodeHeading(node)} · ${meta.title}`}
                onClick={() => onOpen(node)}
              >
                <PathPuck state={node.status === "done" ? "done" : node.id === currentId ? "current" : node.status === "locked" ? "locked" : "ready"} />
                {/* Astra: bitmişte onay, kilitlide kilit, sıradakinde simge huzmede, açıkta tür. */}
                {node.id === currentId ? null : (
                  <span
                    className={cn("cp-puck-glyph", node.status === "done" && "cp-puck-glyph--gold")}
                    aria-hidden
                  >
                    {node.status === "done" ? <Check className="h-6 w-6" strokeWidth={2.5} /> : <NodeGlyph node={node} />}
                  </span>
                )}
                {node.planLocked ? (
                  <span className="cp-path-plan-lock" data-testid="path-plan-lock" aria-hidden>
                    🔒
                  </span>
                ) : null}
                {node.id === currentId ? (
                  <span className="cp-path-beam">
                    <span className="cp-path-beam-icon">
                      <NodeGlyph node={node} />
                    </span>
                  </span>
                ) : null}
              </button>
              {dayLabel && node.id !== currentId ? (
                <span className="cp-path-when" aria-hidden title={holiday ?? undefined}>
                  {dayLabel}
                  {holiday ? " · 🇹🇷 Esnek gün" : null}
                </span>
              ) : null}
              {node.status === "done" && node.id !== currentId ? (
                <span className="cp-path-done-label" aria-hidden>
                  {scores[node.id] != null ? <b className="cp-path-done-pct">%{scores[node.id]}</b> : null}
                  {meta.title}
                </span>
              ) : null}
              {node.id === firstFarId ? (
                <span className="cp-path-far-note" aria-hidden>
                  {PATH_FAR_NOTE}
                </span>
              ) : null}
              {/* Astra: sıradaki düğümün yanında "SIRADAKİ" ve konunun adı. */}
              {node.id === currentId ? (
                <span className="cp-path-current-label" aria-hidden>
                  <span className="cp-prep-badge cp-prep-badge--next">Sıradaki</span>
                  <span className="cp-path-current-title">{nodeHeading(node)}</span>
                  <span className="cp-path-current-meta">
                    {holiday ? (
                      <span className="cp-prep-badge cp-prep-badge--holiday" title={holiday}>
                        {HOLIDAY_BADGE}
                      </span>
                    ) : null}
                    {dayLabel ? `${dayLabel} · ` : null}~
                    {activityDurationMinutes(node.kind, { known: node.sessionMeta?.activityMinutes })} dk · +
                    {prepStars(node.kind, null, null)} ⭐
                  </span>
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
