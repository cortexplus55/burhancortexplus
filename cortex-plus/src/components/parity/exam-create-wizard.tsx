"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isFreePageLimitError, isPhotoQuotaError } from "@/lib/documents/process-errors";
import { FREE_PREP_LIMIT_CODE, FREE_PREP_LIMIT_MESSAGE, freePageCapLine } from "@/lib/billing/free-tier-copy";
import {
  clampExamLabel,
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import { clampText } from "@/lib/text/clamp-text";
import {
  Check,
  ChevronLeft,
  FileText,
  Plus,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import {
  DAILY_MINUTE_CHOICES,
  DEFAULT_EXAM_LEAD_DAYS,
  EXAM_OCCASIONS,
  STUDY_BANDS,
  DOCUMENT_ANALYSIS_STAGES,
  EXAM_TRACKS,
  PREP_HOME_COPY,
  STUDY_MODALITY_CHOICES,
  WIZARD_COPY,
  examHeavyBadgeVisible,
  WIZARD_STEP_ORDER,
  AUTO_CONTINUE_HOLD,
  AUTO_CONTINUE_SECONDS,
  autoContinueLine,
  batchUploadFailedLine,
  fileProgressLine,
  headMaterialLine,
  photoSetProgressLine,
  readingNow,
  listSegments,
  redundantUnitHeader,
  topicSourcesChip,
} from "@/lib/learning/exam-wizard-copy";
import {
  dropExamWizardDraft,
  fetchExamWizardDraft,
  pickNewerDraft,
  pushExamWizardDraft,
  readExamWizardDraft,
  startedDraft,
  writeExamWizardDraft,
  type ExamWizardDraft,
  type WizardDraftStep,
} from "@/lib/learning/exam-wizard-draft";
import { setFocusPrepCookieClient } from "@/lib/learning/focus-prep";
import { targetPlanHint } from "@/lib/learning/target-plan";
import { WizardProcessingPanel } from "@/components/parity/wizard-processing-panel";
import { freeMaterialLimitLine, materialDetailLine } from "@/lib/learning/prep-material-copy";
import {
  formatDocumentProcessProgress,
  processProgressRatio,
} from "@/lib/documents/process-progress-label";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import {
  clearPendingDocProcess,
  readPendingDocProcesses,
  writePendingDocProcess,
} from "@/lib/documents/pending-doc-process";
import { PARALLEL_UPLOADS, createLimiter, inSelectionOrder, runPool, type PoolOutcome } from "@/lib/documents/upload-batch";
import {
  useDocumentLimits,
  useStudentShellAccount,
} from "@/lib/student/student-shell-context";
import { CreditGate } from "@/components/paywall/credit-gate";
import { COMMON_SUBJECTS } from "@/lib/learning/subjects";
import {
  DOCUMENT_PICK_REJECTED,
  DOCUMENT_UPLOAD_HINT,
} from "@/lib/documents/upload-labels";
import { PhoneUploadPanel } from "@/components/parity/phone-upload-panel";
import { useScreenAwake, useUniversalDocumentUpload } from "@/lib/documents/use-universal-upload";
import type { PipelineItem } from "@/lib/documents/upload-engine";
import {
  DEFAULT_FAMILIARITY,
  FAMILIARITY_OPTIONS,
  parseFamiliarity,
  type Familiarity,
} from "@/lib/learning/session-signals";
import { DOCUMENT_UPLOAD_ACCEPT, uploadSizeProblem } from "@/lib/documents/upload-accept";
import { isPdfSplitTail } from "@/lib/documents/pdf-split-client";
import { PasteTextPanel } from "@/components/parity/paste-text-panel";
import { UrlImportPanel } from "@/components/parity/url-import-panel";
import { upcomingOfficialExams } from "@/lib/curriculum/calendar";
import { OfficialCurriculumPanel, type OfficialCurriculumPick } from "@/components/parity/official-curriculum-panel";
import type { CurriculumRef } from "@/lib/curriculum/types";
import { PhotoQualityPrompt } from "@/components/parity/photo-quality-prompt";
import { EXAM_PLACE_MAX, parseExamPlace, parseExamTime } from "@/lib/learning/exam-time";
import {
  MaterialNotesCard,
  freshMaterialNotes,
  materialNoteKeys,
  type MaterialNotes,
} from "@/components/parity/material-notes-card";
import "@/styles/exam-create-wizard.css";

type Step =
  | "subject"
  | "date"
  | "target"
  | "material"
  | "language"
  | "building"
  | "shaping"
  | "topics"
  | "modality"
  | "familiarity"
  | "focus"
  | "plan";

const STEP_ORDER: Step[] = [...WIZARD_STEP_ORDER];
const BUILD_STAGES = [...DOCUMENT_ANALYSIS_STAGES];
/*
  Birden çok dosyanın ortak konu haritası birkaç turda biter. 18 Ekim 2026'da iki
  dosyalı kurulumda ilk iki deneme "konular hâlâ hazırlanıyor" (409) aldı ve öğrenci
  açıklamasız materyal ekranına düştü; üçüncü "Devam et" ancak geçti. Harita
  hazırlanıyor dedikçe aynı ekranda bekleyip yeniden sorarız; kota ve gerçek hatalar
  yine aşağıdaki dallarda.
*/
const COURSE_MAP_RETRIES = 6;
const COURSE_MAP_RETRY_DELAY_MS = 2_500;
/** Kurulumda yüklemesi süren dosyanın kimliği bu kadar beklenir (okuması değil); gelmezse kurulum onsuz sürer. */
const UPLOAD_SETTLE_MS = 45_000;
const MODALITIES = STUDY_MODALITY_CHOICES;
type ChosenModality = (typeof STUDY_MODALITY_CHOICES)[number]["id"];

/** Eski taslakta tek seçim vardı ("auto" ya da bir biçim); yenisinde liste. */
function draftModalities(draft: { modality: string; modalities?: string[] }): ChosenModality[] {
  const known = new Set<string>(MODALITIES.map((option) => option.id));
  const list = draft.modalities ?? (draft.modality === "auto" ? [] : [draft.modality]);
  return [...new Set(list.filter((item): item is ChosenModality => known.has(item)))];
}

/** Eski "style" alanı: yalnız okuyorsa kuram, yalnız pratik yapıyorsa örnek, yoksa karışık. */
function modalityStyle(modalities: ChosenModality[]): "theory" | "examples" | "mixed" {
  if (modalities.length === 1 && modalities[0] === "reading") return "theory";
  if (modalities.length === 1 && modalities[0] === "practice") return "examples";
  return "mixed";
}

type WizardMaterial = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  pageCount: number | null;
  /** Büyük belgenin baş kopyası (document-head.ts): belgenin toplam sayfası; kalanı arkada okunuyor. */
  ofPages?: number | null;
};

type TopicMeta = {
  sourceCount: number;
  examHeavy: boolean;
  important: boolean;
  sections: string[];
  /** Short student-facing why/what line from oneshot outline. */
  description?: string | null;
  unitTitle?: string | null;
};

type TopicUnit = { title: string; topicIndexes: number[] };

function unitTitleForIndex(units: TopicUnit[], index: number): string | null {
  for (const unit of units) {
    if (unit.topicIndexes.includes(index)) return unit.title;
  }
  return null;
}

function remapUnitIndexes(units: TopicUnit[], from: number, to: number): TopicUnit[] {
  return units.map((unit) => ({
    ...unit,
    topicIndexes: unit.topicIndexes.map((index) => {
      if (index === from) return to;
      if (from < to && index > from && index <= to) return index - 1;
      if (from > to && index >= to && index < from) return index + 1;
      return index;
    }),
  }));
}

function dropUnitIndex(units: TopicUnit[], removed: number): TopicUnit[] {
  return units
    .map((unit) => ({
      ...unit,
      topicIndexes: unit.topicIndexes
        .filter((index) => index !== removed)
        .map((index) => (index > removed ? index - 1 : index)),
    }))
    .filter((unit) => unit.topicIndexes.length > 0);
}

type ExcludedNote = { title: string; reason: string };
type MissingTopic = { title: string; weightPercent: number | null; examHeavy: boolean };

const EMPTY_META: TopicMeta = {
  sourceCount: 0,
  examHeavy: false,
  important: false,
  sections: [],
  description: null,
};

function formatSyllabusDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const names = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  const name = names[Number(month) - 1];
  if (!name || !day || !year) return iso;
  return `${Number(day)} ${name} ${year}`;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

const FILE_EXTENSIONS = [".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".docx", ".pptx"];

function acceptedUpload(file: File): boolean {
  if (ALLOWED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function isoOf(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

const WEEKDAYS_LONG = [
  "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
];

/** Kısa görünür etiket: "17 Eylül Per". */
function longLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${d} ${MONTHS[m - 1]} ${WEEKDAYS[(date.getDay() + 6) % 7]}`;
}

/** Ekran okuyucu için tam tarih: "17 Eylül 2026 Perşembe". */
function fullLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${d} ${MONTHS[m - 1]} ${y} ${WEEKDAYS_LONG[(date.getDay() + 6) % 7]}`;
}

export function ExamCreateWizard({
  initialDocumentId = null,
  recentSubjects = [],
  onUseChat,
  prepLimitReached = false,
  gradeLevel = null,
}: {
  initialDocumentId?: string | null;
  /** Profilde sınıf yoksa tarih adımında bant ve sınav türü sorulur. */
  gradeLevel?: string | null;
  /**
   * Ücretsiz hesabın tek hazırlık hakkı dolu (3 Ekim 2026). Astra'daki gibi
   * ders seçilince yükseltme kapısı açılır; sunucu da kurulumu reddeder.
   */
  prepLimitReached?: boolean;
  /** Öğrencinin daha önce çalıştığı dersler — en üstte önerilir. */
  recentSubjects?: string[];
  /** "Materyalim yok" yolu: sohbetle kurulum. */
  /** "Belgem yok": seçilen ders, tarih ve hedef sohbete taşınır (yeniden sorulmaz). */
  /** `prompt`: hazır müfredat seçiminden gelen ilk mesaj; sohbet onu kendiliğinden gönderir (29 Ekim 2026). */
  onUseChat: (picked: { subject: string; examDate: string; target: number; prompt?: string }) => void;
}) {
  const router = useRouter();
  const account = useStudentShellAccount();
  const { isAdmin } = useDocumentLimits();
  // Kurucu da ücretli sayılır (31 Ekim 2026); önizlemede ("ücretsiz gibi gör") isAdmin false, sıra korunur.
  const paidUploads = account?.audience === "plus" || account?.audience === "sigma" || isAdmin;
  const materialLimitLine = freeMaterialLimitLine({
    isAdmin,
    tier:
      account?.audience === "plus" || account?.audience === "sigma"
        ? account.audience
        : "free",
  });
  // 3 Ekim 2026, Astra sırası: ders → tarih → hedef → o dersin materyali.
  // Her hazırlık bir derse ve kendi materyaline bağlı; başka derslerin
  // belgeleri bu yola karışmaz. Materyali olmayan öğrenci sohbete geçer
  // (materyal adımının altındaki düğme).
  const [step, setStep] = useState<Step>("subject");

  const [subject, setSubject] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [examTrack, setExamTrack] = useState<(typeof EXAM_TRACKS)[number]["id"] | null>(null);
  const [examDate, setExamDate] = useState(() => isoOf(addDays(DEFAULT_EXAM_LEAD_DAYS)));
  const [dailyMinutes, setDailyMinutes] = useState(45);
  /** İsteğe bağlı sınav saati ve yeri (30 Ekim 2026): planda ve Takvimim'de "31 Eki 10:00 · Sınav". */
  const [examTime, setExamTime] = useState("");
  const [examPlace, setExamPlace] = useState("");
  const [studyBand, setStudyBand] = useState<(typeof STUDY_BANDS)[number]["id"] | null>(null);
  const [examOccasion, setExamOccasion] = useState<(typeof EXAM_OCCASIONS)[number]["id"]>("okul");
  const [target, setTarget] = useState(75);
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [modalities, setModalities] = useState<ChosenModality[]>([]);
  const [familiarity, setFamiliarity] = useState<Familiarity>(DEFAULT_FAMILIARITY);
  /** true: tüm konulara eşit. false: focusTopics seçili. */
  const [equalFocus, setEqualFocus] = useState(true);

  const [materials, setMaterialsState] = useState<WizardMaterial[]>(
    initialDocumentId
      ? [{ id: initialDocumentId, fileName: "Seçili materyal", sizeBytes: null, pageCount: null }]
      : [],
  );
  const materialsRef = useRef(materials);
  function setMaterials(
    next: WizardMaterial[] | ((current: WizardMaterial[]) => WizardMaterial[]),
  ) {
    const resolved = typeof next === "function" ? next(materialsRef.current) : next;
    materialsRef.current = resolved;
    setMaterialsState(resolved);
  }
  const [uploading, setUploading] = useState(false);
  // Telefondan gelenler okunurken de ekran kararmasın (seçilen dosyalarda kanca kendisi tutar).
  useScreenAwake(uploading);
  const [processDetail, setProcessDetail] = useState<string | null>(null);
  const [processPercent, setProcessPercent] = useState<number | null>(null);
  const [processAlert, setProcessAlert] = useState<string | null>(null);
  const [failedMaterials, setFailedMaterials] = useState<
    { documentId: string; fileName: string; sizeBytes: number | null; error: string }[]
  >([]);
  const [fileProgress, setFileProgress] = useState<{
    done: number;
    total: number;
    current: string | null;
  } | null>(null);
  /**
   * Yolda olan yüklemeler (hızlı başlatma, 31 Ekim 2026): öğrenci hazır olanlarla ilerlerken bunlar sürer; kurulumda
   * kimliği bilinenler hazırlığa bekleyen olarak bağlanır, hazırlık sayfası okutup ekler.
   */
  const inFlightRef = useRef(new Map<unknown, { documentId: string | null; uploaded: Promise<string | null> }>());
  /** Büyük belgenin baş kopyası → ana belge (document-head.ts). */
  const headOfRef = useRef(new Map<string, string>());
  /**
   * Okuması pencere işçisine devredilen büyük belgeler (31 Ekim 2026): baş kopyası haritada, kendisi hazırlığa bekleyen
   * olarak bağlanır; kurulum onun okunmasını beklemez.
   */
  const windowedRef = useRef(new Set<string>());
  /** Okuması ağ / zaman aşımıyla yarıda kalan belgeler: kurulumda bekleyen olarak gider, hazırlık sayfası sürdürür. */
  const stalledRef = useRef(new Set<string>());
  /** Konu haritasının kurulduğu belgeler: kurulum yalnız bunlarla; sonradan bitenler bekleyen. */
  const mappedIdsRef = useRef<string[] | null>(null);
  const [startNote, setStartNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  /** Genişlik panelleri (29 Ekim 2026): metin yapıştır, bağlantı ekle, hazır müfredat. */
  const [importPanel, setImportPanel] = useState<"none" | "paste" | "url" | "curriculum">("none");
  const fileRef = useRef<HTMLInputElement>(null);
  const documentIds = materials.map((item) => item.id);
  /**
   * Arkadaki konu haritası (31 Ekim 2026): dil adımına girilince başlar, öğrenci dil / çalışma tarzı / aşinalık
   * sorularını cevaplarken çıkar. `key` haritanın çıkarıldığı belge kümesi; küme değişince yeniden çıkarılır.
   */
  const intakeRef = useRef<{ key: string; state: "running" | "done" | "failed" } | null>(null);
  const stepRef = useRef<Step>("subject");
  /** Yeni seçilen dosyalar için bir kez kendiliğinden devam (geri sayım); "Bekle" ya da devam sonrası kapanır. */
  const autoArmedRef = useRef(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  /** Belge kümesi denetimi (Paket I): sürüm ve ilgisiz belge notu, materyal adımından çıkarken bir kez. */
  const [materialNotes, setMaterialNotes] = useState<MaterialNotes | null>(null);
  const [checkingMaterials, setCheckingMaterials] = useState(false);
  const materialCheckSeen = useRef<{ set: string | null; notes: string[] }>({ set: null, notes: [] });

  async function continueFromMaterial() {
    const ids = materialsRef.current.map((item) => item.id);
    const setKey = [...ids].sort().join(",");
    if (ids.length < 2 || materialCheckSeen.current.set === setKey) {
      setStep("language");
      return;
    }
    setCheckingMaterials(true);
    let notes: MaterialNotes = { versions: [], unrelated: [] };
    try {
      const response = await fetch("/api/learning/exam-prep/material-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: ids, subject: subject || undefined }),
      });
      if (response.ok) notes = freshMaterialNotes(await response.json().catch(() => null), ids, materialCheckSeen.current.notes);
    } catch {
      // Denetim isteğe bağlı: okunamazsa uyarısız devam.
    } finally {
      setCheckingMaterials(false);
    }
    materialCheckSeen.current.set = setKey;
    if (!notes.versions.length && !notes.unrelated.length) {
      setStep("language");
      return;
    }
    setMaterialNotes(notes);
  }

  function applyMaterialNotes(dropIds: string[]) {
    if (materialNotes) materialCheckSeen.current.notes.push(...materialNoteKeys(materialNotes));
    const next = materialsRef.current.filter((item) => !dropIds.includes(item.id));
    setMaterials(next);
    materialCheckSeen.current.set = next.map((item) => item.id).sort().join(",");
    setMaterialNotes(null);
    if (next.length) setStep("language");
  }

  const [buildStage, setBuildStage] = useState(-1);
  const [topics, setTopics] = useState<string[]>([]);
  /** Her konunun dayandığı sayfalar; öğrenci neye dayandığını görsün. */
  const [topicPages, setTopicPages] = useState<number[][]>([]);
  const [topicFiles, setTopicFiles] = useState<string[][]>([]);
  const [topicWarnings, setTopicWarnings] = useState<string[]>([]);
  const [topicMeta, setTopicMeta] = useState<TopicMeta[]>([]);
  const [topicUnits, setTopicUnits] = useState<TopicUnit[]>([]);
  /** Resmî müfredattan kurulduysa program / yazılı / senaryo: kotalar sunucuda kayıttan yeniden hesaplanır. */
  const [curriculumRef, setCurriculumRef] = useState<CurriculumRef | null>(null);
  const [excludedTopics, setExcludedTopics] = useState<ExcludedNote[]>([]);
  const [missingTopics, setMissingTopics] = useState<MissingTopic[]>([]);
  const [suggestedExamDate, setSuggestedExamDate] = useState<string | null>(null);
  /** Öğrenci oklarla sırayı değiştirdiyse önkoşul sırası ezilmez. */
  const [orderEdited, setOrderEdited] = useState(false);
  const [focusTopics, setFocusTopics] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [intakeAlert, setIntakeAlert] = useState<string | null>(null);
  /** The course map ran out of attempts: offer a calm "Tekrar dene". */
  const [mapRetry, setMapRetry] = useState(false);
  const [draftResumeBanner, setDraftResumeBanner] = useState(false);
  const draftResetAt = useRef(0);
  // "Baştan başla" sayfa içinde onaylanır (19 Ekim 2026): tarayıcının onay penceresi tasarıma uymuyor,
  // canlıda sekmeyi de kilitledi.
  const [confirmReset, setConfirmReset] = useState(false);
  const draftHydrated = useRef(false);
  const draftWriteTimer = useRef<number | null>(null);
  const draftPushTimer = useRef<number | null>(null);

  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState(
    "Materyali işlemek için kullanım hakkın doldu.",
  );
  const openPaywall = (message?: string) => {
    if (message) setPaywallMessage(message);
    setPaywall(true);
  };
  const pickSubject = (value: string) => {
    setSubject(value);
    if (prepLimitReached) {
      openPaywall(FREE_PREP_LIMIT_MESSAGE);
      return;
    }
    setStep("date");
  };
  const planTimer = useRef<number | null>(null);
  const shapeTimer = useRef<number | null>(null);
  const alive = useRef(true);

  const resetWizard = useCallback(() => {
    // 1 Kasım 2026: "Baştan başla" sonrası bekleyen kayıt zamanlayıcıları eski seçimleri geri yazıyor,
    // geç dönen sunucu taslağı da "Kaldığın yerden devam ediyorsun" bandını geri açıyordu.
    draftResetAt.current = Date.now();
    if (draftWriteTimer.current) window.clearTimeout(draftWriteTimer.current);
    if (draftPushTimer.current) window.clearTimeout(draftPushTimer.current);
    void dropExamWizardDraft();
    clearPendingDocProcess({ surface: "exam-wizard" });
    setStep("subject");
    setSubject("");
    setSubjectQuery("");
    setExamDate("");
    setExamTime("");
    setExamPlace("");
    setTarget(75);
    setLanguage("tr");
    setModalities([]);
    setEqualFocus(true);
    setMaterials(
      initialDocumentId
        ? [{ id: initialDocumentId, fileName: "Seçili materyal", sizeBytes: null, pageCount: null }]
        : [],
    );
    setProcessDetail(null);
    setProcessAlert(null);
    setFailedMaterials([]);
    setTopics([]);
    setTopicPages([]);
    setTopicFiles([]);
    setTopicWarnings([]);
    setTopicMeta([]);
    setTopicUnits([]);
    setCurriculumRef(null);
    setExcludedTopics([]);
    setMissingTopics([]);
    setSuggestedExamDate(null);
    setOrderEdited(false);
    setFocusTopics([]);
    setTitle("");
    setIntakeAlert(null);
    setDraftResumeBanner(false);
  }, [initialDocumentId]);

  const applyDraft = useCallback((draft: ExamWizardDraft) => {
    setDraftResumeBanner(true);
    setStep(draft.step as Step);
    setSubject(draft.subject);
    setExamDate(draft.examDate);
    setTarget(draft.target);
    setLanguage(draft.language);
    setModalities(draftModalities(draft));
    setFamiliarity(parseFamiliarity(draft.familiarity));
    setEqualFocus(draft.equalFocus);
    setFocusTopics(draft.focusTopics);
    setMaterials(draft.materials);
    setFailedMaterials(draft.failedMaterials);
    setTitle(draft.title);
    setOrderEdited(draft.orderEdited);
    if (draft.topicsDraft) {
      setTopics(draft.topicsDraft.topics);
      setTopicPages(draft.topicsDraft.topicPages ?? []);
      setTopicFiles(draft.topicsDraft.topicFiles ?? []);
      setTopicWarnings(draft.topicsDraft.topicWarnings ?? []);
      setTopicUnits(draft.topicsDraft.units ?? []);
      setTopicMeta(
        draft.topicsDraft.meta ??
          draft.topicsDraft.topics.map((_, index) => ({
            ...EMPTY_META,
            unitTitle: unitTitleForIndex(draft.topicsDraft?.units ?? [], index),
          })),
      );
    }
    if (draft.processing) {
      setProcessDetail(`Belge işleniyor: ${draft.processing.fileName}`);
    }
  }, []);

  useEffect(() => {
    if (draftHydrated.current) return;
    draftHydrated.current = true;
    const pending = readPendingDocProcesses("exam-wizard")[0];
    const local = readExamWizardDraft();

    if (local) {
      applyDraft(local);
    } else if (pending) {
      setStep("material");
    }

    // Başka cihazda bırakılan kurulum (18 Ekim 2026): sunucudaki kopya yeniyse onu aç.
    // Buradaki boş tarayıcı kopyası kıyasa girmez; girerse dolu sunucu kopyasını yener.
    let cancelled = false;
    void fetchExamWizardDraft().then((remote) => {
      if (cancelled || draftResetAt.current || !startedDraft(remote)) return;
      if (pickNewerDraft(startedDraft(local), remote) !== remote) return;
      applyDraft(remote!);
      writeExamWizardDraft(remote!);
    });
    return () => {
      cancelled = true;
    };
  }, [applyDraft]);

  useEffect(() => {
    if (!draftHydrated.current) return;
    if (draftWriteTimer.current) window.clearTimeout(draftWriteTimer.current);
    draftWriteTimer.current = window.setTimeout(() => {
      // Taslak yalnız ekrandaki "işleniyor" satırı için ilk dosyayı taşır; sürdürme bu cihazın kaydından.
      const pending = readPendingDocProcesses("exam-wizard")[0];
      const payload: ExamWizardDraft = {
        v: 1,
        step: step as WizardDraftStep,
        subject,
        examDate,
        target,
        language,
        modality: modalities[0] ?? "auto",
        modalities,
        familiarity,
        equalFocus,
        focusTopics,
        materials,
        failedMaterials,
        processing:
          pending
            ? {
                documentId: pending.documentId,
                fileName: pending.fileName,
                sizeBytes: pending.sizeBytes,
                startedAt: pending.startedAt,
              }
            : null,
        topicsDraft: topics.length
          ? {
              topics,
              units: topicUnits.length ? topicUnits : undefined,
              topicPages,
              topicFiles,
              topicWarnings,
              meta: topicMeta,
            }
          : undefined,
        title,
        orderEdited,
        updatedAt: new Date().toISOString(),
      };
      writeExamWizardDraft(payload);
      // Sunucu kopyası daha seyrek: her tuşta değil, el durunca. Boş taslak satırı siler.
      if (draftPushTimer.current) window.clearTimeout(draftPushTimer.current);
      draftPushTimer.current = window.setTimeout(() => {
        void pushExamWizardDraft(payload);
      }, 1200);
    }, 300);
    return () => {
      if (draftWriteTimer.current) window.clearTimeout(draftWriteTimer.current);
    };
  }, [
    step,
    subject,
    examDate,
    target,
    language,
    modalities,
    familiarity,
    equalFocus,
    focusTopics,
    materials,
    failedMaterials,
    topics,
    topicUnits,
    topicPages,
    topicFiles,
    topicWarnings,
    topicMeta,
    title,
    orderEdited,
    processDetail,
  ]);

  // Belgeler sayfasından gelen belgenin adı. Öğrencinin bütün belgeleri
  // eskiden burada seçilebilir listeydi; başka dersin belgesi bu yola
  // karışıyordu (3 Ekim 2026) — Astra'da da yok.
  useEffect(() => {
    if (!initialDocumentId) return;
    void fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((data: { documents?: WizardMaterial[] }) => {
        const hit = (data.documents ?? []).find((doc) => doc.id === initialDocumentId);
        if (hit) {
          setMaterials((current) =>
            current.map((item) =>
              item.id === hit.id
                ? { ...item, fileName: hit.fileName, sizeBytes: hit.sizeBytes ?? null, pageCount: hit.pageCount ?? null }
                : item,
            ),
          );
        }
      })
      .catch(() => {});
  }, [initialDocumentId]);

  useEffect(
    () => () => {
      alive.current = false;
      if (planTimer.current) window.clearTimeout(planTimer.current);
      if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
    },
    [],
  );

  const resumePendingRef = useRef(false);

  const progressStep =
    step === "building" || step === "shaping" ? "topics" : step;
  const stepIndex = Math.max(0, STEP_ORDER.indexOf(progressStep));
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  function goBack() {
    if (planning) {
      if (planTimer.current) window.clearTimeout(planTimer.current);
      setPlanning(false);
      return;
    }
    if (step === "building" || step === "shaping") {
      if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
      setStep("familiarity");
      return;
    }
    const index = STEP_ORDER.indexOf(step);
    if (index <= 0) return;
    setStep(STEP_ORDER[index - 1]);
  }

  /** Aşinalıktan sonra: harita hazırsa konular, sürüyorsa bekleme ekranı, yoksa (küme değiştiyse) şimdi çıkar. */
  function openTopics() {
    const key = documentIds.join(",");
    const run = intakeRef.current;
    if (run && run.key === key && run.state === "done") {
      setStep("shaping");
      if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
      shapeTimer.current = window.setTimeout(() => {
        if (alive.current) setStep("topics");
      }, 700);
      return;
    }
    if (run && run.key === key && run.state === "running") {
      setStep("building");
      return;
    }
    void runIntake();
  }

  function holdAutoContinue() {
    autoArmedRef.current = false;
    setAutoCountdown(null);
  }

  function openPlan() {
    setPlanning(true);
    if (planTimer.current) window.clearTimeout(planTimer.current);
    planTimer.current = window.setTimeout(() => {
      setPlanning(false);
      setStep("plan");
    }, 700);
  }

  const runIntake = useCallback(
    async (options?: { background?: boolean }) => {
      const ids = materials.map((item) => item.id);
      const primary = ids[0];
      if (!primary) return;
      mappedIdsRef.current = ids;
      const run = { key: ids.join(","), state: "running" as "running" | "done" | "failed" };
      intakeRef.current = run;
      setIntakeAlert(null);
      setMapRetry(false);
      // Arkada başlayınca öğrenci dil / çalışma tarzı / aşinalık adımlarında kalır; bekleme ekranı yalnız beklerken.
      if (!options?.background) setStep("building");
      setBuildStage(-1);
      const ticker = setInterval(
        () => setBuildStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1)),
        1400,
      );
      let intakeFailed = false;
      const examType = clampExamLabel(subject);
      const examDay = examDate.trim() || undefined;
      // ONE outline over every file of the course (silent retries, progress only).
      const buildCourseMap = () =>
        requestDocumentProcessing({
          documentId: primary,
          post: (body) =>
            // Started by the student, so a map that ran out of attempts starts fresh.
            postDocumentProcess({ ...body, courseDocumentIds: ids, examType, examDate: examDay, retryMap: true }),
          onProgress: (progress) => {
            const line = formatDocumentProcessProgress(progress);
            if (line) setProcessDetail(line);
          },
        });
      const probe = async () => {
        const response = await fetch("/api/learning/exam-prep/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: primary,
            documentIds: ids,
            probeOnly: true,
            examType,
            examDate: examDay,
          }),
        });
        return { res: response, payload: await response.json().catch(() => ({})) };
      };
      try {
        let course = await buildCourseMap();
        let { res, payload } = course.ok ? await probe() : { res: null, payload: {} };
        // A map was pending (old flat map, or a course outline still in its rounds):
        // outline again and read, a bounded number of times, without leaving this screen.
        for (
          let attempt = 0;
          attempt < COURSE_MAP_RETRIES && course.ok && res?.status === 409;
          attempt += 1
        ) {
          setProcessDetail("Konular birleştiriliyor…");
          await new Promise((resolve) => setTimeout(resolve, COURSE_MAP_RETRY_DELAY_MS));
          course = await buildCourseMap();
          if (course.ok) ({ res, payload } = await probe());
        }
        setProcessDetail(null);
        // Öğrenci bu sırada belge kümesini değiştirdiyse (geri dönüp dosya ekledi) yeni harita çıkıyor: bu sonucu yazma.
        if (intakeRef.current !== run) {
          intakeFailed = true;
          return;
        }
        if (!res) {
          intakeFailed = true;
          const processed = course.body;
          if (processed.canRetry === true) {
            setMapRetry(true);
            setStep("language");
            return;
          }
          if (course.status === 402 && isFreePageLimitError(processed)) {
            openPaywall(typeof processed.error === "string" ? processed.error : undefined);
          } else if (course.status === 402 && !isPhotoQuotaError(processed)) {
            openPaywall("Materyali işlemek için kullanım hakkın doldu.");
          } else {
            setIntakeAlert(messageFromProcessBody(processed));
          }
          setStep("material");
          return;
        }
        if (res.status === 409) {
          intakeFailed = true;
          setIntakeAlert(
            (payload.error as string | undefined) ??
              "Belgenin konuları hâlâ hazırlanıyor. Devam ediyoruz…",
          );
          setStep("material");
          for (const material of materialsRef.current) {
            void processAndRemember({
              documentId: material.id,
              fileName: material.fileName,
              sizeBytes: material.sizeBytes,
            });
          }
          return;
        }
        if (res.status === 422) {
          intakeFailed = true;
          setIntakeAlert(
            (payload.error as string | undefined) ?? "Konu listesi bu materyal için uygun değil.",
          );
          setTopics([]);
          setTopicUnits([]);
          setTopicMeta([]);
          setStep("topics");
          return;
        }
        if (!res.ok) {
          intakeFailed = true;
          setIntakeAlert("Konular alınamadı. Tekrar dene.");
          setTopics([]);
          setStep("topics");
          return;
        }
        const found: string[] = payload?.draft?.topics ?? [];
        if (!found.length) {
          intakeFailed = true;
          setIntakeAlert("Materyalden konu çıkarılamadı. Başka bir dosya dene veya konuşarak kur.");
          setTopics([]);
          setTopicUnits([]);
          setTopicMeta([]);
          setStep("topics");
          return;
        }
        const units: TopicUnit[] = Array.isArray(payload?.draft?.units)
          ? payload.draft.units.flatMap((unit: unknown) => {
              if (!unit || typeof unit !== "object") return [];
              const row = unit as { title?: unknown; topicIndexes?: unknown };
              if (typeof row.title !== "string" || !Array.isArray(row.topicIndexes)) return [];
              return [
                {
                  title: row.title,
                  topicIndexes: row.topicIndexes.filter(
                    (index: unknown): index is number => typeof index === "number",
                  ),
                },
              ];
            })
          : [];
        setTopicUnits(units);
        setTopics(found);
        setTopicPages(payload?.draft?.topicPages ?? []);
        setTopicFiles(Array.isArray(payload?.draft?.topicFiles) ? payload.draft.topicFiles : []);
        setTopicWarnings(
          Array.isArray(payload?.draft?.topicWarnings) ? payload.draft.topicWarnings : [],
        );
        const counts: unknown[] = Array.isArray(payload?.draft?.topicSourceCounts)
          ? payload.draft.topicSourceCounts
          : [];
        const heavy: unknown[] = Array.isArray(payload?.draft?.topicHeavy)
          ? payload.draft.topicHeavy
          : [];
        const important: unknown[] = Array.isArray(payload?.draft?.topicImportant)
          ? payload.draft.topicImportant
          : [];
        const sections: unknown[] = Array.isArray(payload?.draft?.topicSections)
          ? payload.draft.topicSections
          : [];
        const descriptions: unknown[] = Array.isArray(payload?.draft?.topicDescriptions)
          ? payload.draft.topicDescriptions
          : [];
        setTopicMeta(
          found.map((_, index) => ({
            sourceCount: typeof counts[index] === "number" ? counts[index] : 0,
            examHeavy: heavy[index] === true,
            important: important[index] === true && heavy[index] !== true,
            sections: Array.isArray(sections[index])
              ? sections[index].filter((item: unknown) => typeof item === "string")
              : [],
            description:
              typeof descriptions[index] === "string" && descriptions[index].trim()
                ? String(descriptions[index]).trim()
                : null,
            unitTitle: unitTitleForIndex(units, index),
          })),
        );
        setExcludedTopics(
          Array.isArray(payload?.draft?.excluded)
            ? payload.draft.excluded.flatMap((item: unknown) => {
                if (!item || typeof item !== "object") return [];
                const row = item as { title?: unknown; reason?: unknown };
                if (typeof row.title !== "string" || typeof row.reason !== "string") return [];
                return [{ title: row.title, reason: row.reason }];
              })
            : [],
        );
        setMissingTopics(
          Array.isArray(payload?.draft?.missingTopics)
            ? payload.draft.missingTopics.flatMap((item: unknown) => {
                if (!item || typeof item !== "object") return [];
                const row = item as {
                  title?: unknown;
                  weightPercent?: unknown;
                  examHeavy?: unknown;
                };
                if (typeof row.title !== "string") return [];
                return [
                  {
                    title: row.title,
                    weightPercent: typeof row.weightPercent === "number" ? row.weightPercent : null,
                    examHeavy: row.examHeavy === true,
                  },
                ];
              })
            : [],
        );
        const suggested =
          typeof payload?.draft?.suggestedExamDate === "string"
            ? payload.draft.suggestedExamDate
            : null;
        setSuggestedExamDate(suggested);
        if (suggested) setExamDate((current) => current || suggested);
        setOrderEdited(false);
        setTitle(payload?.draft?.title || `${subject} sınav hazırlığı`);
      } catch {
        intakeFailed = true;
        setIntakeAlert("Konular alınamadı. Tekrar dene.");
        setTopics([]);
        setStep("topics");
      } finally {
        clearInterval(ticker);
        run.state = intakeFailed ? "failed" : "done";
        if (!alive.current) return;
        if (intakeFailed) return;
        setBuildStage(BUILD_STAGES.length);
        // Öğrenci henüz soruları cevaplıyorsa konular aşinalıktan sonra açılır (`openTopics`).
        if (stepRef.current !== "building") return;
        setStep("shaping");
        if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
        shapeTimer.current = window.setTimeout(() => {
          if (alive.current) setStep("topics");
        }, 700);
      }
    },
    [materials, subject, examDate],
  );

  const documentKey = documentIds.join(",");

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Dil adımına girilince konu haritası arkada başlar: öğrenci dil, çalışma tarzı ve aşinalığı seçerken çıkar.
  useEffect(() => {
    if (step !== "language" || mapRetry || !documentKey) return;
    if (intakeRef.current?.key === documentKey) return;
    void runIntake({ background: true });
  }, [step, mapRetry, documentKey, runIntake]);

  // İlk materyal hazır olunca kısa geri sayımla kendiliğinden devam (yeni seçilen dosyalarda bir kez; "Bekle" durdurur).
  const continueFromMaterialRef = useRef(continueFromMaterial);
  useEffect(() => {
    continueFromMaterialRef.current = continueFromMaterial;
  });
  useEffect(() => {
    const armed = step === "material" && autoArmedRef.current && Boolean(documentKey) && !materialNotes && !checkingMaterials;
    if (!armed) {
      if (autoCountdown != null) setAutoCountdown(null);
      return;
    }
    if (autoCountdown == null) {
      setAutoCountdown(AUTO_CONTINUE_SECONDS);
      return;
    }
    if (autoCountdown <= 0) {
      autoArmedRef.current = false;
      setAutoCountdown(null);
      void continueFromMaterialRef.current();
      return;
    }
    const timer = window.setTimeout(() => setAutoCountdown((current) => (current == null ? null : current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [step, documentKey, materialNotes, checkingMaterials, autoCountdown]);

  function rememberMaterial(material: WizardMaterial) {
    // Ana belge bitti: harita henüz kurulmadıysa baş kopyası yerine belgenin tamamı kullanılır; kurulduysa baş
    // kopyası haritada kalır, ana belge bekleyen olarak hazırlığa eklenir (pendingUploadIds).
    const head = [...headOfRef.current.entries()].find(([, parent]) => parent === material.id)?.[0];
    if (head && !mappedIdsRef.current?.includes(head) && materialsRef.current.some((item) => item.id === head)) {
      setMaterials(materialsRef.current.map((item) => (item.id === head ? material : item)));
      return true;
    }
    const current = materialsRef.current;
    if (current.some((item) => item.id === material.id)) {
      setMaterials(current.map((item) => (item.id === material.id ? { ...item, ...material } : item)));
      return true;
    }
    // Belge sayısında ürün sınırı yok (31 Ekim 2026): sayfa, fotoğraf ve kredi hakkı sınırlar.
    setMaterials([...current, material]);
    return true;
  }

  async function processAndRemember(
    input: {
      documentId: string;
      fileName: string;
      sizeBytes: number | null;
    },
    /** Paralel toplu yüklemede dosya başına ilerleme satırı yazılmaz; "3/7 dosya hazır" satırı yeter. */
    options: { quiet?: boolean; onPages?: (done: number, total: number) => void; fastStart?: boolean } = {},
  ): Promise<PoolOutcome> {
    const quiet = options.quiet === true;
    writePendingDocProcess({
      documentId: input.documentId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      startedAt: new Date().toISOString(),
      surface: "exam-wizard",
    });
    if (!quiet) {
      setProcessDetail("Belge işleniyor…");
      setProcessPercent(4);
    }
    const processExamType = clampExamLabel(subject);
    const processExamDate = examDate.trim() || undefined;
    const result = await requestDocumentProcessing({
      documentId: input.documentId,
      post: (body) =>
        postDocumentProcess({
          ...body,
          examType: processExamType,
          examDate: processExamDate,
          // Extract now; the one course outline runs when topics are requested.
          deferMap: true,
          ...(options.fastStart ? { fastStart: true } : {}),
        }),
      // Baş kopyası çıktı ve okuma pencere işçisine devredildi: yoklama burada biter.
      stopWhen: (progress) => progress.windowed === true,
      onProgress: (progress) => {
        takeHead(progress.head, input.documentId, Number(progress.pageCount) || null);
        if (options.onPages) {
          const total = Number(progress.pageCount);
          const next = Number(progress.nextPage);
          if (Number.isFinite(total) && total > 0 && Number.isFinite(next)) options.onPages(Math.max(0, next - 1), total);
        }
        if (quiet) return;
        const line = formatDocumentProcessProgress(progress);
        if (line) setProcessDetail(line);
        const ratio = processProgressRatio(progress);
        if (ratio != null) setProcessPercent(Math.round(ratio * 100));
      },
    });
    const processed = result.body;
    // Silent mid-flight retries — toast/retry UI only after exhaustion below.
    if (result.status === 402) {
      clearPendingDocProcess({ documentId: input.documentId });
      setProcessDetail(null);
      setProcessPercent(null);
      // Hak doldu: toplu yüklemede yeni dosya başlamaz ("stop"), süren dosyalar biter.
      if (isFreePageLimitError(processed)) {
        openPaywall(typeof processed.error === "string" ? processed.error : undefined);
        return "stop";
      }
      if (isPhotoQuotaError(processed)) {
        const description = materialLimitLine ?? undefined;
        toast.error(
          typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.",
          { description },
        );
        setProcessAlert(
          typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.",
        );
        return "stop";
      }
      openPaywall("Materyali işlemek için kullanım hakkın doldu.");
      return "stop";
    }
    if (!result.ok) {
      const code = typeof processed.code === "string" ? processed.code : "";
      const keepPending =
        result.status === 0 ||
        code === "processing_timeout" ||
        code === "retryable_exhausted" ||
        (result.status >= 500 && result.status < 600);
      const message = messageFromProcessBody(processed);
      // Exhaustion only: show retry screen, keep progress (pending doc).
      setProcessAlert(message);
      setProcessDetail(keepPending ? "İlerlemen duruyor — kaldığın yerden devam edebilirsin." : null);
      setProcessPercent(null);
      if (keepPending) {
        stalledRef.current.add(input.documentId);
        return false;
      }
      clearPendingDocProcess({ documentId: input.documentId });
      setFailedMaterials((current) => {
        const rest = current.filter((item) => item.documentId !== input.documentId);
        return [
          ...rest,
          {
            documentId: input.documentId,
            fileName: input.fileName,
            sizeBytes: input.sizeBytes,
            error: message,
          },
        ];
      });
      return false;
    }
    clearPendingDocProcess({ documentId: input.documentId });
    stalledRef.current.delete(input.documentId);
    setProcessAlert(null);
    setProcessDetail(null);
    setProcessPercent(null);
    if (result.status === 202 && processed.windowed === true) {
      windowedRef.current.add(input.documentId);
      return true;
    }
    setFailedMaterials((current) =>
      current.filter((item) => item.documentId !== input.documentId),
    );
    rememberMaterial({
      id: input.documentId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      pageCount: typeof processed.pageCount === "number" ? processed.pageCount : null,
    });
    // Toplu yüklemede dosya başına "hazır" bildirimi yok ("3/7 dosya hazır" satırı söylüyor); belgenin
    // kendi notu (ör. "ilk 5 sayfa işlendi") yine gösterilir.
    if (!quiet) {
      toast.success("Materyalin hazır.", {
        description: typeof processed.notice === "string" ? processed.notice : undefined,
      });
    }
    if (typeof processed.notice === "string" && processed.notice.trim()) {
      toast.message(quiet ? `${input.fileName}: ${processed.notice.trim()}` : processed.notice.trim());
    }
    return true;
  }

  useEffect(() => {
    const pending = readPendingDocProcesses("exam-wizard");
    if (!pending.length || resumePendingRef.current) return;
    resumePendingRef.current = true;
    setUploading(true);
    // Sekme kapanınca yarım kalan dosyaların hepsi sürer (paralel toplu yükleme birden çok bırakabilir).
    const many = pending.length > 1;
    void runPool(pending, many ? PARALLEL_UPLOADS : 1, (entry) =>
      processAndRemember(
        { documentId: entry.documentId, fileName: entry.fileName, sizeBytes: entry.sizeBytes },
        { quiet: many },
      ),
    ).finally(() => {
      setUploading(false);
      resumePendingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount resume once
  }, []);

  /**
   * Büyük belgenin baş kopyası geldi (document-head.ts): harita henüz kurulmadıysa hemen materyal olur, öğrenci
   * "Hazır olanlarla devam et" ile ilerler. Harita kurulduysa yok sayılır: ana belge bekleyen olarak eklenir.
   */
  function takeHead(raw: unknown, parentId: string, totalPages: number | null) {
    if (!raw || typeof raw !== "object") return;
    const head = raw as { documentId?: unknown; fileName?: unknown; pageCount?: unknown };
    if (typeof head.documentId !== "string" || headOfRef.current.has(head.documentId)) return;
    headOfRef.current.set(head.documentId, parentId);
    if (mappedIdsRef.current) return;
    rememberMaterial({
      id: head.documentId,
      fileName: typeof head.fileName === "string" && head.fileName ? head.fileName : "Belge",
      sizeBytes: null,
      pageCount: typeof head.pageCount === "number" ? head.pageCount : null,
      ofPages: totalPages,
    });
  }

  /** Sunucunun sayfa/hak ön kontrolü (yalnız bilgi verir); ücretsiz sayfa hakkı dolduysa "stop". */
  async function preflightPdf(documentId: string): Promise<PoolOutcome | null> {
    try {
      const preflightRes = await fetch("/api/documents/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const preflight = (await preflightRes.json().catch(() => ({}))) as {
        code?: string;
        pageCount?: number;
        freePages?: { total: number; remaining: number } | null;
        creditUse?: { percent: number; pagesAffordable: number | null } | null;
        fits?: boolean;
        scannedPages?: number;
        textPages?: number;
        scannedPagesNote?: string;
        quota?: { unlimited?: boolean; remaining?: number | null; tier?: string };
        error?: string;
      };
      if (preflightRes.status === 402 && isFreePageLimitError(preflight)) {
        openPaywall(preflight.error);
        return "stop";
      }
      const free = preflight.freePages;
      if (free && typeof preflight.pageCount === "number" && preflight.pageCount > free.remaining) {
        toast.message(freePageCapLine(preflight.pageCount, free.remaining));
      }
      // Ücretlide belge sayfa başına haktan düşer (kredi sistemi v2): önceden söyle.
      const use = preflight.creditUse;
      if (use?.pagesAffordable != null && typeof preflight.pageCount === "number") {
        toast.message(
          use.pagesAffordable > 0
            ? `Kalan hakkın bu belgenin ilk ${use.pagesAffordable} sayfasına yetiyor; kalanı için ek paket alabilirsin.`
            : "Bu belge için hakkın kalmadı; ek paket alabilir ya da dönem yenilenince yükleyebilirsin.",
        );
      } else if (use && use.percent >= 3) {
        toast.message(`Bu belge dönem hakkının yaklaşık %${use.percent}'ini kullanacak.`);
      }
      // Taranmış sayfa hakkı yetmese de belge reddedilmiyor (3 Ekim 2026):
      // metinli sayfalar işlenir, hakkı aşan resim sayfaları atlanır.
      if (preflightRes.ok && preflight.fits === false && !preflight.quota?.unlimited) {
        const remaining = preflight.quota?.remaining ?? 0;
        const scanned = preflight.scannedPages ?? 0;
        toast.message(
          `Bu PDF'in ${scanned} sayfası resim. Bu ay kalan taranmış sayfa hakkın: ${remaining}; hakkı aşan resim sayfaları okunmayacak, metinli sayfalar işlenecek.`,
        );
      }
    } catch {
      // Preflight is advisory — process path still enforces quota.
    }
    return null;
  }

  const isPdfFile = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  /** Toplu seçimde dosya başına "hazır" bildirimi ve ilerleme satırı yazılmaz; tek dosyada yazılır. */
  const quietUploadRef = useRef(true);

  /*
    Ortak yükleme motoru (31 Ekim 2026, use-universal-upload.ts): fotoğraf seti (ücretli hesapta ilk sayfalar ayrı
    parça), şeritler, dosya başına 3 yeniden deneme, ekranı uyanık tutma. Büyük PDF'te (fotoğraf seti parçası değilse)
    sunucu ilk sayfaların baş kopyasını hemen döndürür.
  */
  const upload = useUniversalDocumentUpload(
    { lanes: paidUploads ? PARALLEL_UPLOADS : 1, photoSet: true, fastStart: paidUploads },
    {
      validate: (file) => {
        if (!acceptedUpload(file)) return DOCUMENT_PICK_REJECTED;
        // 50 MB'tan büyük PDF motorda parçalarına bölündü (31 Ekim 2026); Word/sunu 50 MB'a kadar.
        return uploadSizeProblem(file);
      },
      onUploadStart: (item: PipelineItem) => {
        let settle: (id: string | null) => void = () => {};
        const flight = {
          documentId: null as string | null,
          uploaded: new Promise<string | null>((resolve) => {
            settle = resolve;
          }),
        };
        inFlightRef.current.set(item.file, flight);
        return (documentId) => {
          flight.documentId = documentId;
          settle(documentId);
          if (!documentId) inFlightRef.current.delete(item.file);
        };
      },
      process: async ({ documentId, item, onPages }) => {
        try {
          if (isPdfFile(item.file)) {
            const stop = await preflightPdf(documentId);
            if (stop) return stop;
          }
          return await processAndRemember(
            { documentId, fileName: item.file.name, sizeBytes: item.file.size },
            {
              quiet: quietUploadRef.current || Boolean(item.part),
              onPages,
              // Büyük tek PDF'te baş kopyası; fotoğraf seti zaten istemcide bölündü. Bölünmüş kitapta yalnız ilk parça
              // (sonraki parçalar bekleyen olarak pencere pencere eklenir).
              fastStart: paidUploads && !item.part && isPdfFile(item.file) && !isPdfSplitTail(item.file),
            },
          );
        } finally {
          inFlightRef.current.delete(item.file);
        }
      },
    },
    // Bulanık / karanlık fotoğraf sorusu (Paket J3 #13): `PhotoQualityPrompt` materyal adımında çizilir.
    { photoQuality: true },
  );

  async function takeFiles(list: FileList | File[] | undefined) {
    // Belge sayısında ürün sınırı yok (31 Ekim 2026): seçilen her dosya alınır; hak dolunca durulur.
    const batch = list ? [...list] : [];
    if (!batch.length) return;
    const existing = new Set(materialsRef.current.map((material) => material.id));
    quietUploadRef.current = batch.length > 1;
    autoArmedRef.current = true;
    setUploading(true);
    try {
      const result = await upload.run(batch);
      // Seçim sırası: fotoğraf seti seçimdeki ilk fotoğrafın yerinde (kursun ilk belgesi sırayla belirlenir).
      setMaterials((current) => inSelectionOrder(current, existing, result.order));
      // Tek bildirim: yüklenemeyen dosyalar (okunamayanlar "Tekrar dene" listesinde ayrıca durur).
      if (batch.length === 1 && result.failed.length) toast.error(result.firstError ?? "Bağlantı hatası.");
      else if (result.failed.length) toast.error(batchUploadFailedLine(result.failed));
    } finally {
      setUploading(false);
    }
  }

  /*
    Telefondan gelen dosyalar (31 Ekim 2026: QR kodu artık çok dosya alır). Pencere açık kalır; her dosya geldiği
    anda sıraya girer ve toplu yüklemeyle aynı şerit sayısıyla işlenir. Sayaç seçilen dosyalarınkiyle aynı satırda.
  */
  const phoneLimiter = useRef<ReturnType<typeof createLimiter> | null>(null);
  const phoneBatch = useRef({ total: 0, done: 0, finished: 0, failed: [] as string[] });

  function takePhoneDocument(remote: { documentId: string; fileName: string }) {
    autoArmedRef.current = true;
    phoneLimiter.current ??= createLimiter(paidUploads ? PARALLEL_UPLOADS : 1);
    const run = phoneLimiter.current;
    const batch = phoneBatch.current;
    batch.total += 1;
    setUploading(true);
    setFileProgress({ done: batch.done, total: batch.total, current: null });
    const flightKey = `phone:${remote.documentId}`;
    inFlightRef.current.set(flightKey, { documentId: remote.documentId, uploaded: Promise.resolve(remote.documentId) });
    void run(() =>
      processAndRemember({ documentId: remote.documentId, fileName: remote.fileName, sizeBytes: null }, { quiet: true }),
    )
      .then((outcome) => {
        if (outcome === true) batch.done += 1;
        else batch.failed.push(remote.fileName);
      })
      .catch(() => batch.failed.push(remote.fileName))
      .finally(() => {
        inFlightRef.current.delete(flightKey);
        batch.finished += 1;
        setFileProgress({ done: batch.done, total: batch.total, current: null });
        if (batch.finished < batch.total) return;
        if (batch.failed.length) toast.error(batchUploadFailedLine(batch.failed));
        phoneBatch.current = { total: 0, done: 0, finished: 0, failed: [] };
        setUploading(false);
        setFileProgress(null);
      });
  }

  /**
   * Hızlı başlatma: kurulum haritanın belgeleriyle; o anda yolda olan ya da sonradan biten belgeler hazırlığa bekleyen
   * olarak bağlanır. Yüklemesi süren dosyanın kimliği gelene kadar kısa süre beklenir (okuması beklenmez).
   */
  async function pendingUploadIds(mapped: readonly string[]): Promise<string[]> {
    const waiting = [...inFlightRef.current.values()].filter((flight) => !flight.documentId);
    if (waiting.length) {
      setStartNote(WIZARD_COPY.waitingUploads);
      await Promise.race([
        Promise.all(waiting.map((flight) => flight.uploaded)),
        new Promise((resolve) => setTimeout(resolve, UPLOAD_SETTLE_MS)),
      ]);
      setStartNote(null);
    }
    const known = new Set(mapped);
    const failedIds = new Set(failedMaterials.map((item) => item.documentId));
    const ids = [
      ...materialsRef.current.map((material) => material.id),
      ...[...inFlightRef.current.values()].map((flight) => flight.documentId),
      ...stalledRef.current,
      ...windowedRef.current,
    ].filter((id): id is string => typeof id === "string" && !known.has(id) && !failedIds.has(id) && !headOfRef.current.has(id));
    return [...new Set(ids)];
  }

  /** Resmî programdan anında konu haritası: materyal okunmaz, model çağrılmaz; doğrudan konu adımı. */
  function takeOfficialCurriculum(pick: OfficialCurriculumPick) {
    const { map, program, ref } = pick;
    setImportPanel("none");
    setCurriculumRef(ref);
    setTopics(map.topics);
    setTopicUnits(map.units);
    setTopicPages([]);
    setTopicFiles([]);
    setTopicWarnings([]);
    setTopicMeta(
      map.topics.map((_, index) => {
        const quota = map.quotaByCode[map.codes[index] ?? ""] ?? 0;
        return {
          sourceCount: 0,
          examHeavy: false,
          important: false,
          sections: [],
          description: quota ? `Resmî tabloda ${quota} soru${map.averaged ? " (ortalama)" : ""}` : null,
          unitTitle: unitTitleForIndex(map.units, index),
        };
      }),
    );
    setExcludedTopics([]);
    setMissingTopics([]);
    setOrderEdited(true);
    setIntakeAlert(null);
    setTitle(clampText(`${program.label} sınav hazırlığı`, 120));
    setStep("topics");
  }

  async function startPlan() {
    if (!examDate || !topics.length) return;
    setStarting(true);
    try {
      const mappedIds = mappedIdsRef.current?.length ? mappedIdsRef.current : documentIds;
      const pendingDocumentIds = await pendingUploadIds(mappedIds);
      const res = await fetch("/api/learning/exam-prep/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clampText(title.trim() || `${subject} sınav hazırlığı`, 120),
          examType: clampExamLabel(subject) ?? "Serbest",
          topics,
          examDate,
          targetScore: target,
          dailyMinutes,
          documentId: mappedIds[0],
          documentIds: mappedIds,
          ...(pendingDocumentIds.length ? { pendingDocumentIds } : {}),
          topicOrderManual: orderEdited,
          hardTopics: equalFocus ? [] : focusTopics,
          familiarity,
          learningPreferences: {
            style: modalityStyle(modalities),
            modality: modalities[0] ?? "auto",
            modalities,
            language,
            ...(examTrack ? { examTrack } : {}),
            ...(!gradeLevel && studyBand ? { studyBand } : {}),
            ...(!gradeLevel ? { examOccasion } : {}),
            ...(parseExamTime(examTime) ? { examTime: parseExamTime(examTime) } : {}),
            ...(parseExamPlace(examPlace) ? { examPlace: parseExamPlace(examPlace) } : {}),
            ...(curriculumRef ? { curriculum: curriculumRef } : {}),
          },
        }),
      });
      if (res.status === 402) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        openPaywall(body.code === FREE_PREP_LIMIT_CODE ? FREE_PREP_LIMIT_MESSAGE : body.error);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Plan kurulamadı.");
        return;
      }
      if (draftPushTimer.current) window.clearTimeout(draftPushTimer.current);
      void dropExamWizardDraft();
      // Bekleyen belgeler artık hazırlığın (hazırlık sayfası okutup ekler): sihirbazın yarım kalan kaydı silinir,
      // yoksa bir sonraki kurulum onları kendi materyali sanar.
      for (const id of pendingDocumentIds) clearPendingDocProcess({ documentId: id });
      if (typeof payload.prepId === "string") {
        setFocusPrepCookieClient(payload.prepId);
      }
      router.push(`/deneme-sinavlari/${payload.prepId}`);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setStarting(false);
      setStartNote(null);
    }
  }

  const subjectMatches = useMemo(() => {
    const q = subjectQuery.trim().toLocaleLowerCase("tr");
    const pool = [...new Set([...recentSubjects, ...COMMON_SUBJECTS])];
    if (!q) return pool;
    return pool.filter((s) => s.toLocaleLowerCase("tr").includes(q));
  }, [subjectQuery, recentSubjects]);
  const recentMatches = recentSubjects.filter((s) => subjectMatches.includes(s));
  const commonMatches = COMMON_SUBJECTS.filter((s) => subjectMatches.includes(s));

  const removeFailedMaterial = useCallback((failed: { documentId: string }) => {
    void fetch(`/api/documents/${failed.documentId}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) {
          toast.error("Kaldırılamadı.");
          return;
        }
        setFailedMaterials((current) =>
          current.filter((item) => item.documentId !== failed.documentId),
        );
        clearPendingDocProcess({ documentId: failed.documentId });
      })
      .catch(() => toast.error("Bağlantı hatası."));
  }, []);

  const showProcessingPanel =
    uploading ||
    Boolean(processDetail) ||
    Boolean(processAlert) ||
    failedMaterials.length > 0;

  return (
    <div className="apw">
      <div className="apw-progress" aria-hidden>
        <div className="apw-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {draftResumeBanner ? (
        <div className="apw-draft-resume" role="status">
          <span>{confirmReset ? "Seçimlerin silinsin mi?" : "Kaldığın yerden devam ediyorsun."}</span>
          {confirmReset ? (
            <>
              <button
                type="button"
                className="apw-ghost"
                onClick={() => {
                  setConfirmReset(false);
                  resetWizard();
                }}
              >
                Evet, baştan başla
              </button>
              <button type="button" className="apw-ghost" onClick={() => setConfirmReset(false)}>
                Vazgeç
              </button>
            </>
          ) : (
            <button type="button" className="apw-ghost" onClick={() => setConfirmReset(true)}>
              Baştan başla
            </button>
          )}
        </div>
      ) : null}

      {showProcessingPanel ? (
        <WizardProcessingPanel
          processDetail={processDetail}
          processAlert={processAlert}
          processPercent={processPercent}
          failedMaterials={failedMaterials}
          uploading={uploading}
          onDismissAlert={() => setProcessAlert(null)}
          onContinue={(failed) => {
            setUploading(true);
            void processAndRemember(failed).finally(() => setUploading(false));
          }}
          onRetry={(failed) => {
            setUploading(true);
            void processAndRemember(failed).finally(() => setUploading(false));
          }}
          onRemove={removeFailedMaterial}
        />
      ) : null}

      {stepIndex > 0 && step !== "building" && step !== "shaping" ? (
        <button type="button" className="apw-back" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Geri
        </button>
      ) : null}

      {step === "subject" ? (
        <section className="apw-step">
          <h1>Hangi ders?</h1>
          <p className="apw-lead">Sınav hazırlığın bu dersin altında toplanır.</p>
          <div className="apw-quick" role="group" aria-label="Sınav türü">
            {EXAM_TRACKS.map((track) => (
              <button
                key={track.id}
                type="button"
                className={examTrack === track.id ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
                aria-pressed={examTrack === track.id}
                onClick={() => setExamTrack(track.id)}
              >
                {track.label}
              </button>
            ))}
          </div>
          <input
            className="apw-search"
            value={subjectQuery}
            onChange={(e) => setSubjectQuery(e.target.value)}
            placeholder="Ders ara ya da kendi dersini yaz"
            aria-label="Ders ara"
          />
          {subjectQuery.trim() && !subjectMatches.includes(subjectQuery.trim()) ? (
            <button
              type="button"
              className="apw-add-own"
              onClick={() => {
                pickSubject(subjectQuery.trim());
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              &ldquo;{subjectQuery.trim()}&rdquo; dersini ekle
            </button>
          ) : null}
          {/* Aramayla eşleşen yoksa başlık da durmaz (19 Ekim 2026: "Farmakoloji" yazınca iki boş başlık kalıyordu). */}
          {recentMatches.length ? (
            <>
              <h2 className="apw-group">Devam ettiklerin</h2>
              <div className="apw-grid">
                {recentMatches
                  .map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="apw-tile"
                      onClick={() => {
                        pickSubject(item);
                      }}
                    >
                      {item}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
          {commonMatches.length ? (
            <>
              <h2 className="apw-group">Dersler</h2>
              <div className="apw-grid">
                {commonMatches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="apw-tile"
                    onClick={() => {
                      pickSubject(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {step === "date" ? (
        <DateStep
          value={examDate}
          onPick={(iso) => setExamDate(iso)}
          onNext={() => setStep("target")}
          askLevel={!gradeLevel}
          studyBand={studyBand}
          onStudyBand={setStudyBand}
          examOccasion={examOccasion}
          onExamOccasion={setExamOccasion}
          dailyMinutes={dailyMinutes}
          onDailyMinutes={setDailyMinutes}
          examTime={examTime}
          onExamTime={setExamTime}
          examPlace={examPlace}
          onExamPlace={setExamPlace}
        />
      ) : null}

      {step === "target" ? (
        <section className="apw-step">
          <h1>Hedefin ne?</h1>
          <p className="apw-lead">
            Plan bu hedefe göre sıkılaşır. Sonradan değiştirebilirsin.
          </p>
          <div className="apw-target">
            <span className="apw-target-value">%{target}</span>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              aria-label="Hedef ustalık yüzdesi"
            />
            <div className="apw-target-scale">
              <span>%50</span>
              <span>%100</span>
            </div>
            <p className={`apw-target-hint apw-target-hint--${targetPlanHint(target).mode}`} role="status">
              {targetPlanHint(target).badge}
            </p>
          </div>
          <button
            type="button"
            className="apw-cta"
            onClick={() => setStep("material")}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {step === "material" ? (
        <section className="apw-step">
          <h1>Çalışma materyalini ekle</h1>
          {subject ? <p className="apw-scope">Yalnızca {subject} materyali</p> : null}
          <p className="apw-lead">
            PDF, Word, slayt ya da fotoğraf yükle. El yazısı not, basılı sayfa
            ve slayt fotoğrafı (JPG, PNG, HEIC) de olur. Konular senin
            materyalinden çıkar.
          </p>
          {/* Konu çıkarma bu ekrana geri düşürdüyse nedeni burada da görünsün;
              eskiden yalnız konular adımında çiziliyordu ve öğrenci açıklamasız
              materyal ekranına dönüyordu (18 Ekim 2026). */}
          {intakeAlert ? (
            <div
              className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
              role="alert"
            >
              <p>{intakeAlert}</p>
              <button
                type="button"
                className="mt-2 text-xs underline underline-offset-2"
                onClick={() => setIntakeAlert(null)}
              >
                Kapat
              </button>
            </div>
          ) : null}

          <div
            className={dragOver ? "apw-drop apw-drop--over" : "apw-drop"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void takeFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="h-7 w-7 opacity-70" aria-hidden />
            <p className="apw-drop-title">Dosyanı buraya bırak</p>
            <p className="apw-drop-hint">{DOCUMENT_UPLOAD_HINT}</p>
            <PhotoQualityPrompt request={upload.photoQuality} onAnswer={upload.answerPhotoQuality} />
            {upload.photoProgress ? (
              <p className="apw-drop-hint" role="status" aria-live="polite">
                {photoSetProgressLine(upload.photoProgress)}
              </p>
            ) : null}
            {upload.fileProgress && upload.fileProgress.total > 1 ? (
              <p className="apw-drop-hint" role="status" aria-live="polite">
                {fileProgressLine(upload.fileProgress.done, upload.fileProgress.total, readingNow(upload.fileProgress.reading))}
              </p>
            ) : null}
            {fileProgress && fileProgress.total > 0 ? (
              <p className="apw-drop-hint" role="status" aria-live="polite">
                {fileProgressLine(fileProgress.done, fileProgress.total, fileProgress.current)}
              </p>
            ) : null}
            {materialLimitLine ? (
              <p className="apw-drop-hint">{materialLimitLine}</p>
            ) : null}
            <p className="apw-drop-hint">
              Sekmeyi kapatırsan geri geldiğinde kaldığı yerden devam eder.
            </p>
            <button
              type="button"
              className="apw-drop-pick"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Yükleniyor…" : "Dosya seç"}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept={DOCUMENT_UPLOAD_ACCEPT}
              onChange={(e) => {
                void takeFiles(e.target.files ?? undefined);
                e.target.value = "";
              }}
            />
          </div>

          {materials.length ? (
            <ul className="apw-materials">
              {materials.map((material) => {
                const detail = material.ofPages
                  ? headMaterialLine(material.pageCount ?? 0, material.ofPages)
                  : materialDetailLine(material);
                return (
                  <li key={material.id} className="apw-doc-chip">
                    <FileText className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="apw-doc-main">
                      <strong>{material.fileName}</strong>
                      {detail ? <small>{detail}</small> : null}
                    </span>
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                    <button
                      type="button"
                      aria-label="Materyali kaldır"
                      onClick={() =>
                        setMaterials((current) => current.filter((item) => item.id !== material.id))
                      }
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="apw-file-actions">
            {materials.length ? (
              <button
                type="button"
                className="apw-drop-pick"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {WIZARD_COPY.addMore}
              </button>
            ) : null}
            <button
              type="button"
              className="apw-drop-pick"
              disabled={uploading}
              onClick={() => setPhoneOpen(true)}
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              {WIZARD_COPY.uploadFromPhone}
            </button>
            {/* Genişlik (29 Ekim 2026): dosyası olmayan öğrenci de materyal ekler. */}
            <button
              type="button"
              className="apw-drop-pick"
              disabled={uploading}
              aria-expanded={importPanel === "paste"}
              onClick={() => setImportPanel((current) => (current === "paste" ? "none" : "paste"))}
            >
              {WIZARD_COPY.pasteText}
            </button>
            <button
              type="button"
              className="apw-drop-pick"
              disabled={uploading}
              aria-expanded={importPanel === "url"}
              onClick={() => setImportPanel((current) => (current === "url" ? "none" : "url"))}
            >
              {WIZARD_COPY.addUrl}
            </button>
          </div>

          {phoneOpen ? (
            <PhoneUploadPanel
              onClose={() => setPhoneOpen(false)}
              onReady={(remote) => takePhoneDocument(remote)}
            />
          ) : null}
          {importPanel === "paste" ? (
            <PasteTextPanel onClose={() => setImportPanel("none")} onFile={(file) => void takeFiles([file])} />
          ) : null}
          {importPanel === "url" ? (
            <UrlImportPanel
              onClose={() => setImportPanel("none")}
              onReady={(remote) =>
                void processAndRemember({ documentId: remote.documentId, fileName: remote.fileName, sizeBytes: remote.sizeBytes })
              }
            />
          ) : null}
          {importPanel === "curriculum" ? (
            <OfficialCurriculumPanel
              gradeLevel={gradeLevel}
              examLabel={subject}
              onClose={() => setImportPanel("none")}
              onPick={takeOfficialCurriculum}
              onChatFallback={(pick) => onUseChat({ subject: pick.subject, examDate, target, prompt: pick.prompt })}
            />
          ) : null}

          {materialNotes && [...materialNotes.versions.flatMap((note) => [note.currentId, note.olderId]), ...materialNotes.unrelated.map((note) => note.documentId)].every((id) => documentIds.includes(id)) ? (
            <MaterialNotesCard
              notes={materialNotes}
              nameOf={(id) => materials.find((item) => item.id === id)?.fileName ?? "Belge"}
              onApply={applyMaterialNotes}
            />
          ) : (
            <>
              {/* Hızlı başlatma (31 Ekim 2026): okunmuş materyal varken kalanı beklemeden ilerlenir; kalan sayfalar
                  hazırlığa bekleyen olarak bağlanır ve hazırlık sayfasında arkada eklenir. */}
              {autoCountdown != null ? (
                <p className="apw-drop-hint apw-auto-continue" role="status">
                  {autoContinueLine(autoCountdown)}{" "}
                  <button type="button" className="apw-link" onClick={holdAutoContinue}>
                    {AUTO_CONTINUE_HOLD}
                  </button>
                </p>
              ) : uploading && documentIds.length ? (
                <p className="apw-drop-hint" role="note">{WIZARD_COPY.continueEarlyHint}</p>
              ) : null}
              <button
                type="button"
                className="apw-cta"
                disabled={!documentIds.length || checkingMaterials}
                onClick={() => void continueFromMaterial()}
              >
                {checkingMaterials
                  ? "Belgeler karşılaştırılıyor…"
                  : uploading
                    ? WIZARD_COPY.continueEarly
                    : WIZARD_COPY.continue}
              </button>
            </>
          )}
          <button
            type="button"
            className="apw-drop-pick"
            aria-expanded={importPanel === "curriculum"}
            onClick={() => setImportPanel((current) => (current === "curriculum" ? "none" : "curriculum"))}
          >
            {WIZARD_COPY.pickCurriculum}
          </button>
          <button type="button" className="apw-ghost" onClick={() => onUseChat({ subject, examDate, target })}>
            Belgem yok, konudan çalışayım
          </button>
        </section>
      ) : null}

      {step === "language" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.languageTitle}</h1>
          <p className="apw-lead">
            Dersler, sorular ve podcast bu dilde hazırlanır.
          </p>
          <div className="apw-lang">
            {(
              [
                { id: "tr", label: "Türkçe" },
                { id: "en", label: "İngilizce" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={
                  language === option.id ? "apw-tile apw-tile--on" : "apw-tile"
                }
                aria-pressed={language === option.id}
                onClick={() => setLanguage(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {mapRetry ? (
            <p className="apw-lead" role="status">
              Konuları hazırlamak için bir kez daha deneyelim.
            </p>
          ) : null}
          <button
            type="button"
            className="apw-cta"
            onClick={() => (mapRetry ? void runIntake() : setStep("modality"))}
            disabled={!documentIds.length}
          >
            {mapRetry ? "Tekrar dene" : WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {step === "building" ? (
        <section className="apw-step apw-step--center">
          <h1>{WIZARD_COPY.analyzing}</h1>
          <p className="apw-lead">{processDetail ?? "Konular materyalinin kapsamından çıkarılıyor."}</p>
          <ul className="apw-stages">
            {BUILD_STAGES.map((label, index) => (
              <li
                key={label}
                className={index < buildStage ? "is-done" : undefined}
              >
                <span className="apw-stage-dot" aria-hidden>
                  {index < buildStage ? <Check className="h-3 w-3" /> : null}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step === "shaping" ? (
        <section className="apw-step apw-step--center">
          <h1>{WIZARD_COPY.shapingTitle}</h1>
          <p className="apw-lead">{WIZARD_COPY.shapingLead}</p>
        </section>
      ) : null}

      {planning ? (
        <section className="apw-step apw-step--center">
          <h1>{WIZARD_COPY.planningTitle}</h1>
          <p className="apw-lead">{WIZARD_COPY.planningLead}</p>
        </section>
      ) : null}

      {!planning && step === "topics" ? (
        <section className="apw-step">
          <h1>
            {topics.length ? "Konuları düzenle" : "Konuları birlikte yazalım"}
          </h1>
          <p className="apw-lead">
            Yanlış olanı değiştir, eksik olanı ekle.
          </p>
          {intakeAlert ? (
            <div
              className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
              role="alert"
            >
              <p>{intakeAlert}</p>
              <button
                type="button"
                className="mt-2 text-xs underline underline-offset-2"
                onClick={() => setIntakeAlert(null)}
              >
                Kapat
              </button>
            </div>
          ) : null}
          {suggestedExamDate && suggestedExamDate !== examDate ? (
            <p className="apw-syllabus-date">
              Müfredatta sınav tarihi {formatSyllabusDate(suggestedExamDate)}.
              <button type="button" onClick={() => setExamDate(suggestedExamDate)}>
                {WIZARD_COPY.useSyllabusDate}
              </button>
            </p>
          ) : null}
          <TopicEditor
            topics={topics}
            topicPages={topicPages}
            topicFiles={topicFiles}
            topicWarnings={topicWarnings}
            topicMeta={topicMeta}
            topicUnits={topicUnits}
            excluded={excludedTopics}
            missing={missingTopics}
            documentIds={documentIds}
            onTopics={setTopics}
            onPages={setTopicPages}
            onFiles={setTopicFiles}
            onWarnings={setTopicWarnings}
            onMeta={setTopicMeta}
            onUnits={setTopicUnits}
            onMissing={setMissingTopics}
            onOrderEdited={() => setOrderEdited(true)}
            onRename={(from, to) =>
              setFocusTopics((prev) =>
                prev
                  .map((item) => (item === from ? to : item))
                  .filter((item) => item.trim().length > 0),
              )
            }
            onRemove={(title) =>
              setFocusTopics((prev) => prev.filter((item) => item !== title))
            }
          />
          <button
            type="button"
            className="apw-cta"
            disabled={!topics.length}
            onClick={() => setStep("focus")}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {!planning && step === "modality" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.modalityTitle}</h1>
          <p className="apw-lead">{WIZARD_COPY.modalityLead}</p>
          <div className="apw-choices" role="group" aria-label="Çalışma biçimi">
            {MODALITIES.map((option) => {
              const on = modalities.includes(option.id);
              return (
                <CheckRow
                  key={option.id}
                  on={on}
                  title={option.label}
                  blurb={option.blurb}
                  onToggle={() =>
                    setModalities((prev) =>
                      on ? prev.filter((item) => item !== option.id) : [...prev, option.id],
                    )
                  }
                />
              );
            })}
          </div>
          <button
            type="button"
            className="apw-cta"
            onClick={() => setStep("familiarity")}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {!planning && step === "familiarity" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.familiarityTitle}</h1>
          <p className="apw-lead">{WIZARD_COPY.familiarityLead}</p>
          <div className="apw-choices" role="radiogroup" aria-label="Aşinalık">
            {FAMILIARITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={familiarity === option.id}
                className={familiarity === option.id ? "apw-choice apw-choice--on" : "apw-choice"}
                onClick={() => {
                  setFamiliarity(option.id);
                  openTopics();
                }}
              >
                <span aria-hidden>{option.emoji}</span> {option.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!planning && step === "focus" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.focusTitle}</h1>
          <p className="apw-lead">{WIZARD_COPY.focusLead}</p>
          {/* Astra'daki gibi: eşit odakta bütün konular işaretli; birinin işaretini kaldırınca
              işaretli kalanlar öne çıkar. Hepsi ya da hiçbiri işaretliyse eşit odak. */}
          <div className="apw-choices" role="group" aria-label="Odak konular">
            <CheckRow
              on={equalFocus}
              title={WIZARD_COPY.equalFocus}
              onToggle={() => {
                setEqualFocus(true);
                setFocusTopics([]);
              }}
            />
            {topics.map((topic) => {
              const on = equalFocus || focusTopics.includes(topic);
              return (
                <CheckRow
                  key={topic}
                  on={on}
                  title={topic}
                  onToggle={() => {
                    const current = equalFocus ? topics : focusTopics;
                    const next = current.includes(topic)
                      ? current.filter((item) => item !== topic)
                      : [...current, topic];
                    const equal = !next.length || next.length >= topics.length;
                    setEqualFocus(equal);
                    setFocusTopics(equal ? [] : next);
                  }}
                />
              );
            })}
          </div>
          <button type="button" className="apw-cta" onClick={openPlan}>
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {!planning && step === "plan" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.planReady}</h1>
          <p className="apw-lead">{WIZARD_COPY.planLead}</p>
          <TopicEditor
            topics={topics}
            topicPages={topicPages}
            topicFiles={topicFiles}
            topicWarnings={topicWarnings}
            topicMeta={topicMeta}
            topicUnits={topicUnits}
            excluded={excludedTopics}
            missing={missingTopics}
            documentIds={documentIds}
            onTopics={setTopics}
            onPages={setTopicPages}
            onFiles={setTopicFiles}
            onWarnings={setTopicWarnings}
            onMeta={setTopicMeta}
            onUnits={setTopicUnits}
            onMissing={setMissingTopics}
            onOrderEdited={() => setOrderEdited(true)}
            onRename={(from, to) =>
              setFocusTopics((prev) =>
                prev
                  .map((item) => (item === from ? to : item))
                  .filter((item) => item.trim().length > 0),
              )
            }
            onRemove={(title) =>
              setFocusTopics((prev) => prev.filter((item) => item !== title))
            }
          />
          <button
            type="button"
            className="apw-cta"
            disabled={starting || !topics.length}
            onClick={() => void startPlan()}
          >
            {starting ? WIZARD_COPY.creating : PREP_HOME_COPY.startLearning}
          </button>
          {startNote ? (
            <p className="apw-drop-hint" role="status" aria-live="polite">
              {startNote}
            </p>
          ) : null}
        </section>
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message={paywallMessage}
        returnPath="/deneme-sinavlari/olustur"
      />
    </div>
  );
}

function TopicEditor({
  topics,
  topicPages,
  topicFiles,
  topicWarnings,
  topicMeta,
  topicUnits,
  excluded,
  missing,
  documentIds,
  onTopics,
  onPages,
  onFiles,
  onWarnings,
  onMeta,
  onUnits,
  onMissing,
  onOrderEdited,
  onRename,
  onRemove,
}: {
  topics: string[];
  topicPages: number[][];
  topicFiles: string[][];
  topicWarnings: string[];
  topicMeta: TopicMeta[];
  topicUnits: TopicUnit[];
  excluded: ExcludedNote[];
  missing: MissingTopic[];
  documentIds: string[];
  onTopics: (next: string[]) => void;
  onPages: (next: number[][]) => void;
  onFiles: (next: string[][]) => void;
  onWarnings: (next: string[]) => void;
  onMeta: (next: TopicMeta[]) => void;
  onUnits: (next: TopicUnit[]) => void;
  onMissing: (next: MissingTopic[]) => void;
  onOrderEdited: () => void;
  onRename: (from: string, to: string) => void;
  onRemove: (title: string) => void;
}) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = editIndex == null ? "" : topics[editIndex] ?? "";
  const changeDirty = draft.trim().length > 0 && draft.trim() !== original.trim();
  const addDirty = draft.trim().length > 0;

  function close() {
    setEditIndex(null);
    setAdding(false);
    setDraft("");
    setError(null);
    setChecking(false);
  }

  function duplicate(title: string, ignore: number | null) {
    const key = title.toLocaleLowerCase("tr");
    return topics.some(
      (item, index) => index !== ignore && item.toLocaleLowerCase("tr") === key,
    );
  }

  async function ground(title: string) {
    if (!documentIds.length) {
      return { ok: false as const, message: WIZARD_COPY.topicCheckFailed, pageNumbers: [] as number[] };
    }
    try {
      const res = await fetch("/api/learning/exam-prep/ground-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds, title }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false as const,
          message: (payload.error as string | undefined) ?? WIZARD_COPY.topicCheckFailed,
          pageNumbers: [] as number[],
        };
      }
      const pageNumbers = Array.isArray(payload.pageNumbers)
        ? payload.pageNumbers.filter((page: unknown) => typeof page === "number")
        : [];
      return { ok: true as const, message: "", pageNumbers };
    } catch {
      return { ok: false as const, message: WIZARD_COPY.topicCheckFailed, pageNumbers: [] as number[] };
    }
  }

  async function saveChange() {
    if (editIndex == null || !changeDirty || checking) return;
    const next = draft.trim();
    if (duplicate(next, editIndex)) {
      setError(WIZARD_COPY.topicDuplicate);
      return;
    }
    setChecking(true);
    setError(null);
    const result = await ground(next);
    setChecking(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onRename(original, next);
    onTopics(topics.map((item, index) => (index === editIndex ? next : item)));
    onPages(
      topicPages.map((pages, index) =>
        index === editIndex ? (result.pageNumbers.length ? result.pageNumbers : pages) : pages,
      ),
    );
    close();
  }

  async function saveAdd() {
    const title = draft.trim();
    if (!title || checking) return;
    if (duplicate(title, null)) {
      setError(WIZARD_COPY.topicDuplicate);
      return;
    }
    setChecking(true);
    setError(null);
    const result = await ground(title);
    setChecking(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const nextIndex = topics.length;
    onTopics([...topics, title]);
    onPages([...topicPages, result.pageNumbers]);
    onFiles([...topicFiles, []]);
    onWarnings([...topicWarnings, ""]);
    const lastUnitTitle =
      topicUnits.length > 0 ? topicUnits[topicUnits.length - 1]?.title ?? null : null;
    onMeta([...topicMeta, { ...EMPTY_META, unitTitle: lastUnitTitle }]);
    if (topicUnits.length) {
      onUnits(
        topicUnits.map((unit, unitIndex) =>
          unitIndex === topicUnits.length - 1
            ? { ...unit, topicIndexes: [...unit.topicIndexes, nextIndex] }
            : unit,
        ),
      );
    }
    onMissing(missing.filter((item) => item.title !== title));
    close();
  }

  async function addMissing(item: MissingTopic) {
    if (checking) return;
    if (duplicate(item.title, null)) {
      onMissing(missing.filter((row) => row.title !== item.title));
      return;
    }
    setChecking(true);
    const result = await ground(item.title);
    setChecking(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onTopics([...topics, item.title]);
    onPages([...topicPages, result.pageNumbers]);
    onFiles([...topicFiles, []]);
    onWarnings([...topicWarnings, ""]);
    onMeta([
      ...topicMeta,
      { sourceCount: 0, examHeavy: item.examHeavy, important: false, sections: [] },
    ]);
    onMissing(missing.filter((row) => row.title !== item.title));
  }

  function removeAt(index: number) {
    const title = topics[index];
    if (!title) return;
    onRemove(title);
    onTopics(topics.filter((_, item) => item !== index));
    onPages(topicPages.filter((_, item) => item !== index));
    onFiles(topicFiles.filter((_, item) => item !== index));
    onWarnings(topicWarnings.filter((_, item) => item !== index));
    onMeta(topicMeta.filter((_, item) => item !== index));
    onUnits(dropUnitIndex(topicUnits, index));
  }

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= topics.length) return;
    const reordered = [...topics];
    const [title] = reordered.splice(index, 1);
    reordered.splice(next, 0, title);
    const pages = [...topicPages];
    const [page] = pages.splice(index, 1);
    pages.splice(next, 0, page ?? []);
    const files = [...topicFiles];
    const [file] = files.splice(index, 1);
    files.splice(next, 0, file ?? []);
    const warnings = [...topicWarnings];
    const [warning] = warnings.splice(index, 1);
    warnings.splice(next, 0, warning ?? "");
    const meta = [...topicMeta];
    const [metaRow] = meta.splice(index, 1);
    meta.splice(next, 0, metaRow ?? { ...EMPTY_META });
    onTopics(reordered);
    onPages(pages);
    onFiles(files);
    onWarnings(warnings);
    onMeta(meta);
    onUnits(remapUnitIndexes(topicUnits, index, next));
    onOrderEdited();
  }

  const unitHeaders =
    topicUnits.length > 0
      ? topicUnits
      : topicMeta.some((meta) => meta.unitTitle)
        ? topicMeta.reduce<TopicUnit[]>((acc, meta, index) => {
            const title = meta.unitTitle?.trim();
            if (!title) return acc;
            const existing = acc.find((unit) => unit.title === title);
            if (existing) {
              existing.topicIndexes.push(index);
              return acc;
            }
            acc.push({ title, topicIndexes: [index] });
            return acc;
          }, [])
        : [];

  const listedIndexes = new Set(unitHeaders.flatMap((unit) => unit.topicIndexes));
  const orphanIndexes = topics.map((_, index) => index).filter((index) => !listedIndexes.has(index));

  const showHeavyBadge = examHeavyBadgeVisible(topics.map((_, index) => Boolean(topicMeta[index]?.examHeavy)));

  function renderTopicRow(index: number) {
    const topic = topics[index];
    const meta = topicMeta[index] ?? EMPTY_META;
    if (!topic) return null;
    const sources = topicSourcesChip(topicFiles[index]);
    return (
      <li key={`${index}-${topic}`}>
        <span className="apw-topic-field">
          <strong>{topic}</strong>
          {showHeavyBadge && meta.examHeavy ? <em className="apw-topic-heavy">{WIZARD_COPY.examHeavy}</em> : null}
          {sources ? (
            <em className="apw-topic-sources" title={sources.title}>
              {sources.label}
            </em>
          ) : null}
          {meta.important && !meta.examHeavy ? (
            <em className="apw-topic-important">{WIZARD_COPY.important}</em>
          ) : null}
          {meta.description ? (
            <em className="apw-topic-desc">{meta.description}</em>
          ) : null}
          {topicWarnings[index] ? (
            <em className="apw-topic-warning">{topicWarnings[index]}</em>
          ) : null}
        </span>
        <span className="apw-topic-actions">
          <button
            type="button"
            className="apw-topic-edit"
            aria-label={WIZARD_COPY.moveUp}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="apw-topic-edit"
            aria-label={WIZARD_COPY.moveDown}
            disabled={index === topics.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="apw-topic-edit"
            onClick={() => {
              setAdding(false);
              setError(null);
              setEditIndex(index);
              setDraft(topic);
            }}
          >
            {WIZARD_COPY.editTopic}
          </button>
          <button
            type="button"
            className="apw-topic-edit"
            aria-label={WIZARD_COPY.removeTopic}
            onClick={() => removeAt(index)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </li>
    );
  }

  return (
    <>
      {excluded.length ? (
        <ul className="apw-excluded">
          {excluded.map((note) => (
            <li key={note.title}>
              <strong>{note.title}</strong>
              <em className="apw-topic-warning">{note.reason}</em>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="apw-topics">
        {unitHeaders.length
          ? listSegments(unitHeaders, orphanIndexes).map((segment) =>
              segment.kind === "topic" ? (
                renderTopicRow(segment.index)
              ) : redundantUnitHeader(
                  segment.unit.title,
                  segment.unit.topicIndexes.map((index) => topics[index] ?? ""),
                ) ? (
                renderTopicRow(segment.unit.topicIndexes[0]!)
              ) : (
                <li key={segment.unit.title} className="apw-topic-unit">
                  <h3 className="apw-group">{segment.unit.title}</h3>
                  <ul className="apw-topics">
                    {segment.unit.topicIndexes.map((index) => renderTopicRow(index))}
                  </ul>
                </li>
              ),
            )
          : topics.map((_, index) => renderTopicRow(index))}
      </ul>
      {missing.length ? (
        <ul className="apw-missing">
          {missing.map((item) => (
            <li key={item.title}>
              <span>
                <strong>{item.title}</strong>
                <em>{WIZARD_COPY.missingMaterial}</em>
                {item.examHeavy ? <em className="apw-topic-heavy">{WIZARD_COPY.examHeavy}</em> : null}
              </span>
              <button type="button" disabled={checking} onClick={() => void addMissing(item)}>
                {WIZARD_COPY.addMissing}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="apw-topic-add-btn"
        onClick={() => {
          setEditIndex(null);
          setError(null);
          setAdding(true);
          setDraft("");
        }}
      >
        <Plus className="h-4 w-4" aria-hidden /> {WIZARD_COPY.addTopic}
      </button>

      {editIndex != null || adding ? (
        <div className="apw-modal-backdrop" role="presentation" onClick={close}>
          <div
            className="apw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apw-topic-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="apw-topic-dialog-title">
              {adding ? WIZARD_COPY.addTopic : WIZARD_COPY.editTopic}
            </h2>
            <input
              value={draft}
              aria-label={adding ? "Yeni konu" : "Konu adı"}
              autoFocus
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (adding) void saveAdd();
                else void saveChange();
              }}
            />
            {error ? (
              <p className="apw-modal-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="apw-modal-actions">
              <button type="button" className="apw-ghost" onClick={close}>
                {WIZARD_COPY.cancel}
              </button>
              <button
                type="button"
                className="apw-cta"
                disabled={checking || (adding ? !addDirty : !changeDirty)}
                onClick={() => void (adding ? saveAdd() : saveChange())}
              >
                {checking ? "Bakılıyor…" : WIZARD_COPY.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Hızlı seçenekler + ay takvimi. Referans üründeki gibi tarih ayrı bir adım. */
function DateStep({
  value,
  onPick,
  onNext,
  askLevel,
  studyBand,
  onStudyBand,
  examOccasion,
  onExamOccasion,
  dailyMinutes,
  onDailyMinutes,
  examTime,
  onExamTime,
  examPlace,
  onExamPlace,
}: {
  value: string;
  onPick: (iso: string) => void;
  onNext: () => void;
  askLevel: boolean;
  studyBand: (typeof STUDY_BANDS)[number]["id"] | null;
  onStudyBand: (id: (typeof STUDY_BANDS)[number]["id"]) => void;
  examOccasion: (typeof EXAM_OCCASIONS)[number]["id"];
  onExamOccasion: (id: (typeof EXAM_OCCASIONS)[number]["id"]) => void;
  dailyMinutes: number;
  onDailyMinutes: (minutes: number) => void;
  examTime: string;
  onExamTime: (time: string) => void;
  examPlace: string;
  onExamPlace: (place: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const base = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const quick = [
    { label: "Yarın", days: 1 },
    { label: "3 gün sonra", days: 3 },
    { label: "1 hafta sonra", days: 7 },
    { label: "2 hafta sonra", days: 14 },
    { label: "30 gün sonra", days: DEFAULT_EXAM_LEAD_DAYS },
  ];

  const todayIso = isoOf(new Date());
  const officialExams = upcomingOfficialExams(todayIso, 8);
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  return (
    <section className="apw-step">
      <h1>Sınav ne zaman?</h1>
      <p className="apw-lead">Kalan güne göre planın sıkışır ya da rahatlar. 30 gün sonrası seçili gelir.</p>
      {askLevel ? (
        <>
          <h2 className="apw-group">Sınıf / seviye</h2>
          <div className="apw-quick" role="group" aria-label="Sınıf veya seviye">
            {STUDY_BANDS.map((band) => (
              <button
                key={band.id}
                type="button"
                className={studyBand === band.id ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
                aria-pressed={studyBand === band.id}
                onClick={() => onStudyBand(band.id)}
              >
                {band.label}
              </button>
            ))}
          </div>
          <h2 className="apw-group">Sınav türü</h2>
          <div className="apw-quick" role="group" aria-label="Sınav türü">
            {EXAM_OCCASIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={examOccasion === item.id ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
                aria-pressed={examOccasion === item.id}
                onClick={() => onExamOccasion(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <h2 className="apw-group">Günlük çalışma süresi</h2>
      <div className="apw-quick" role="group" aria-label="Günlük çalışma süresi">
        {DAILY_MINUTE_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={dailyMinutes === minutes ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
            aria-pressed={dailyMinutes === minutes}
            onClick={() => onDailyMinutes(minutes)}
          >
            {minutes} dk
          </button>
        ))}
      </div>

      <div className="apw-quick">
        {quick.map((option) => {
          const iso = isoOf(addDays(option.days));
          return (
            <button
              key={option.label}
              type="button"
              className={value === iso ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
              aria-pressed={value === iso}
              onClick={() => onPick(iso)}
            >
              <span>{option.label}</span>
              <small>{longLabel(iso)}</small>
            </button>
          );
        })}
      </div>

      {officialExams.length ? (
        <>
          <h2 className="apw-group">Resmî sınav tarihleri (ÖSYM / MEB)</h2>
          <div className="apw-quick" role="group" aria-label="Resmî sınav tarihleri" data-testid="official-exam-dates">
            {officialExams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                className={value === exam.date ? "apw-quick-btn apw-quick-btn--on" : "apw-quick-btn"}
                aria-pressed={value === exam.date}
                title={exam.sourceUrl ? `Belge: ${exam.sourceUrl}` : undefined}
                onClick={() => {
                  onPick(exam.date);
                  const at = new Date(`${exam.date}T12:00:00`);
                  setCursor(new Date(at.getFullYear(), at.getMonth(), 1));
                }}
              >
                <span>{exam.label}</span>
                <small>{longLabel(exam.date)}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="apw-cal">
        <div className="apw-cal-head">
          <button
            type="button"
            aria-label="Önceki ay"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <strong>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </strong>
          <button
            type="button"
            aria-label="Sonraki ay"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>
        <div className="apw-cal-grid">
          {WEEKDAYS.map((day) => (
            <span key={day} className="apw-cal-dow">
              {day}
            </span>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const iso = isoOf(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
            const disabled = iso <= todayIso;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-pressed={value === iso}
                // Ekran okuyucuya yalnızca "10" demek hangi ay/gün olduğunu
                // gizliyordu; tam tarih okunsun.
                aria-label={fullLabel(iso)}
                className={value === iso ? "apw-cal-day apw-cal-day--on" : "apw-cal-day"}
                onClick={() => onPick(iso)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <h2 className="apw-group">Sınav saati ve yeri (isteğe bağlı)</h2>
      <div className="apw-exam-time">
        <label>
          <span>Saat</span>
          <input
            type="time"
            value={examTime}
            onChange={(e) => onExamTime(e.target.value)}
            aria-label="Sınav saati"
          />
        </label>
        <label>
          <span>Yer</span>
          <input
            type="text"
            value={examPlace}
            maxLength={EXAM_PLACE_MAX}
            placeholder="Örn. Amfi 2"
            onChange={(e) => onExamPlace(e.target.value)}
            aria-label="Sınav yeri"
          />
        </label>
      </div>

      <button type="button" className="apw-cta" disabled={!value} onClick={onNext}>
        {WIZARD_COPY.continue}
      </button>
    </section>
  );
}

/** Astra'nın kurulumundaki onay kutulu satır: solda kutu, başlık ve altında kısa açıklama. */
function CheckRow({
  on,
  title,
  blurb,
  onToggle,
}: {
  on: boolean;
  title: string;
  blurb?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={on ? "apw-choice apw-check apw-choice--on" : "apw-choice apw-check"}
      onClick={onToggle}
    >
      <span className="apw-check-box" aria-hidden="true">
        {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="apw-check-text">
        <span className="apw-check-title">{title}</span>
        {blurb ? <span className="apw-check-blurb">{blurb}</span> : null}
      </span>
    </button>
  );
}
