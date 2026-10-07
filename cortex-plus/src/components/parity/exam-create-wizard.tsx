"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isPhotoQuotaError } from "@/lib/documents/process-errors";
import {
  clampExamLabel,
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import {
  Check,
  ChevronLeft,
  FileText,
  Plus,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import type { StudyModality } from "@/lib/learning/exam-prep-ui-path";
import {
  DOCUMENT_ANALYSIS_STAGES,
  PREP_HOME_COPY,
  STUDY_MODALITY_CHOICES,
  WIZARD_COPY,
  WIZARD_STEP_ORDER,
  fileProgressLine,
} from "@/lib/learning/exam-wizard-copy";
import {
  clearExamWizardDraft,
  readExamWizardDraft,
  writeExamWizardDraft,
  type ExamWizardDraft,
  type WizardDraftStep,
} from "@/lib/learning/exam-wizard-draft";
import { setFocusPrepCookieClient } from "@/lib/learning/focus-prep";
import { WizardProcessingPanel } from "@/components/parity/wizard-processing-panel";
import { freeMaterialLimitLine, materialDetailLine } from "@/lib/learning/prep-material-copy";
import { filesAcceptedFromSelection } from "@/lib/learning/prep-file-cap";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import {
  formatDocumentProcessProgress,
  processProgressRatio,
} from "@/lib/documents/process-progress-label";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import {
  clearPendingDocProcess,
  readPendingDocProcess,
  writePendingDocProcess,
} from "@/lib/documents/pending-doc-process";
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
import { uploadDocumentFile } from "@/lib/documents/upload-client";
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
  | "focus"
  | "plan";

const STEP_ORDER: Step[] = [...WIZARD_STEP_ORDER];
const BUILD_STAGES = [...DOCUMENT_ANALYSIS_STAGES];
const MODALITIES: { id: StudyModality; label: string }[] = STUDY_MODALITY_CHOICES;

type WizardMaterial = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  pageCount: number | null;
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
const MAX_BYTES = 15 * 1024 * 1024;
const PDF_MAX_BYTES = 50 * 1024 * 1024;

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
}: {
  initialDocumentId?: string | null;
  /** Öğrencinin daha önce çalıştığı dersler — en üstte önerilir. */
  recentSubjects?: string[];
  /** "Materyalim yok" yolu: sohbetle kurulum. */
  onUseChat: () => void;
}) {
  const router = useRouter();
  const account = useStudentShellAccount();
  const { isAdmin } = useDocumentLimits();
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
  const [examDate, setExamDate] = useState("");
  const [target, setTarget] = useState(75);
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [modality, setModality] = useState<StudyModality>("auto");
  /** true: tüm konulara eşit. false: focusTopics seçili. */
  const [equalFocus, setEqualFocus] = useState(true);

  const [materials, setMaterialsState] = useState<WizardMaterial[]>(
    initialDocumentId
      ? [{ id: initialDocumentId, fileName: "Seçili materyal", sizeBytes: null, pageCount: null }]
      : [],
  );
  const materialsRef = useRef(materials);
  const reservedSlots = useRef(0);
  function setMaterials(
    next: WizardMaterial[] | ((current: WizardMaterial[]) => WizardMaterial[]),
  ) {
    const resolved = typeof next === "function" ? next(materialsRef.current) : next;
    materialsRef.current = resolved;
    setMaterialsState(resolved);
  }
  const [uploading, setUploading] = useState(false);
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
  const [dragOver, setDragOver] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const documentIds = materials.map((item) => item.id);

  const [buildStage, setBuildStage] = useState(0);
  const [topics, setTopics] = useState<string[]>([]);
  /** Her konunun dayandığı sayfalar; öğrenci neye dayandığını görsün. */
  const [topicPages, setTopicPages] = useState<number[][]>([]);
  const [topicFiles, setTopicFiles] = useState<string[][]>([]);
  const [topicWarnings, setTopicWarnings] = useState<string[]>([]);
  const [topicMeta, setTopicMeta] = useState<TopicMeta[]>([]);
  const [topicUnits, setTopicUnits] = useState<TopicUnit[]>([]);
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
  const draftHydrated = useRef(false);
  const draftWriteTimer = useRef<number | null>(null);

  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const planTimer = useRef<number | null>(null);
  const shapeTimer = useRef<number | null>(null);
  const alive = useRef(true);

  const resetWizard = useCallback(() => {
    clearExamWizardDraft();
    clearPendingDocProcess();
    setStep("subject");
    setSubject("");
    setSubjectQuery("");
    setExamDate("");
    setTarget(75);
    setLanguage("tr");
    setModality("auto");
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
    setExcludedTopics([]);
    setMissingTopics([]);
    setSuggestedExamDate(null);
    setOrderEdited(false);
    setFocusTopics([]);
    setTitle("");
    setIntakeAlert(null);
    setDraftResumeBanner(false);
  }, [initialDocumentId]);

  useEffect(() => {
    if (draftHydrated.current) return;
    draftHydrated.current = true;
    const pending = readPendingDocProcess();
    const draft = readExamWizardDraft();
    if (!draft && !pending) return;

    if (draft) {
      setDraftResumeBanner(true);
      setStep(draft.step as Step);
      setSubject(draft.subject);
      setExamDate(draft.examDate);
      setTarget(draft.target);
      setLanguage(draft.language);
      setModality(draft.modality as StudyModality);
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
    } else if (pending?.surface === "exam-wizard") {
      setStep("material");
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated.current) return;
    if (draftWriteTimer.current) window.clearTimeout(draftWriteTimer.current);
    draftWriteTimer.current = window.setTimeout(() => {
      const pending = readPendingDocProcess();
      const payload: ExamWizardDraft = {
        v: 1,
        step: step as WizardDraftStep,
        subject,
        examDate,
        target,
        language,
        modality,
        equalFocus,
        focusTopics,
        materials,
        failedMaterials,
        processing:
          pending?.surface === "exam-wizard"
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
    modality,
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
    step === "building" || step === "shaping" ? "language" : step;
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
      setStep("language");
      return;
    }
    const index = STEP_ORDER.indexOf(step);
    if (index <= 0) return;
    setStep(STEP_ORDER[index - 1]);
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
    async () => {
      const ids = materials.map((item) => item.id);
      const primary = ids[0];
      if (!primary) return;
      setIntakeAlert(null);
      setMapRetry(false);
      setStep("building");
      setBuildStage(0);
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
        if (res?.status === 409) {
          // A map was pending (e.g. an old flat map) — outline once more, then read.
          course = await buildCourseMap();
          if (course.ok) ({ res, payload } = await probe());
        }
        setProcessDetail(null);
        if (!res) {
          intakeFailed = true;
          const processed = course.body;
          if (processed.canRetry === true) {
            setMapRetry(true);
            setStep("language");
            return;
          }
          if (course.status === 402 && !isPhotoQuotaError(processed)) setPaywall(true);
          else setIntakeAlert(messageFromProcessBody(processed));
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
        if (!alive.current) return;
        if (intakeFailed) return;
        setBuildStage(BUILD_STAGES.length - 1);
        setStep("shaping");
        if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
        shapeTimer.current = window.setTimeout(() => {
          if (alive.current) setStep("topics");
        }, 700);
      }
    },
    [materials, subject, examDate],
  );

  function rememberMaterial(material: WizardMaterial) {
    const current = materialsRef.current;
    if (current.some((item) => item.id === material.id)) {
      setMaterials(current.map((item) => (item.id === material.id ? { ...item, ...material } : item)));
      return true;
    }
    const { accepted } = filesAcceptedFromSelection({
      committedCount: current.length,
      selectedCount: 1,
      cap: PREP_SOURCE_DOCUMENT_CAP,
    });
    if (accepted < 1) return false;
    setMaterials([...current, material]);
    return true;
  }

  async function processAndRemember(input: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
  }): Promise<boolean> {
    writePendingDocProcess({
      documentId: input.documentId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      startedAt: new Date().toISOString(),
      surface: "exam-wizard",
    });
    setProcessDetail("Belge işleniyor…");
    setProcessPercent(4);
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
        }),
      onProgress: (progress) => {
        const line = formatDocumentProcessProgress(progress);
        if (line) setProcessDetail(line);
        const ratio = processProgressRatio(progress);
        if (ratio != null) setProcessPercent(Math.round(ratio * 100));
      },
    });
    const processed = result.body;
    // Silent mid-flight retries — toast/retry UI only after exhaustion below.
    if (result.status === 402) {
      clearPendingDocProcess();
      setProcessDetail(null);
      setProcessPercent(null);
      if (isPhotoQuotaError(processed)) {
        const description = materialLimitLine ?? undefined;
        toast.error(
          typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.",
          { description },
        );
        setProcessAlert(
          typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.",
        );
        return false;
      }
      setPaywall(true);
      return false;
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
        return false;
      }
      clearPendingDocProcess();
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
    clearPendingDocProcess();
    setProcessAlert(null);
    setProcessDetail(null);
    setProcessPercent(null);
    setFailedMaterials((current) =>
      current.filter((item) => item.documentId !== input.documentId),
    );
    const stored = rememberMaterial({
      id: input.documentId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      pageCount: typeof processed.pageCount === "number" ? processed.pageCount : null,
    });
    if (!stored) {
      toast.error(WIZARD_COPY.fileCap);
      return false;
    }
    toast.success("Materyalin hazır.", {
      description: typeof processed.notice === "string" ? processed.notice : undefined,
    });
    if (typeof processed.notice === "string" && processed.notice.trim()) {
      toast.message(processed.notice.trim());
    }
    return true;
  }

  useEffect(() => {
    const pending = readPendingDocProcess();
    if (!pending || pending.surface !== "exam-wizard" || resumePendingRef.current) return;
    resumePendingRef.current = true;
    setUploading(true);
    void processAndRemember({
      documentId: pending.documentId,
      fileName: pending.fileName,
      sizeBytes: pending.sizeBytes,
    }).finally(() => {
      setUploading(false);
      resumePendingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount resume once
  }, []);

  async function takeFile(file: File | undefined, enforceCap = true): Promise<boolean> {
    if (!file) return false;
    if (enforceCap) {
      const { accepted } = filesAcceptedFromSelection({
        committedCount: materialsRef.current.length + reservedSlots.current,
        selectedCount: 1,
        cap: PREP_SOURCE_DOCUMENT_CAP,
      });
      if (accepted < 1) {
        toast.error(WIZARD_COPY.fileCap);
        return false;
      }
    }
    if (!acceptedUpload(file)) {
      toast.error(DOCUMENT_PICK_REJECTED);
      return false;
    }
    if (file.size > (file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? PDF_MAX_BYTES : MAX_BYTES)) {
      toast.error("PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir.");
      return false;
    }
    setUploading(true);
    try {
      const uploaded = await uploadDocumentFile(file);
      // Authoritative server page/quota check before the long OCR wait.
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        try {
          const preflightRes = await fetch("/api/documents/preflight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: uploaded.documentId }),
          });
          const preflight = (await preflightRes.json().catch(() => ({}))) as {
            fits?: boolean;
            scannedPages?: number;
            textPages?: number;
            scannedPagesNote?: string;
            quota?: { unlimited?: boolean; remaining?: number | null; tier?: string };
            error?: string;
          };
          if (preflightRes.ok && preflight.fits === false && !preflight.quota?.unlimited) {
            const remaining = preflight.quota?.remaining ?? 0;
            const scanned = preflight.scannedPages ?? 0;
            const note =
              preflight.scannedPagesNote ??
              "Gerçekten boş sayfalar kota düşmez.";
            const message =
              `Bu PDF'in ${scanned} sayfası taranmış görünüyor. Bu ay kalan taranmış sayfa hakkın: ${remaining}. ${note}`;
            setProcessAlert(message);
            toast.error(message);
            return false;
          }
        } catch {
          // Preflight is advisory — process path still enforces quota.
        }
      }
      return await processAndRemember({
        documentId: uploaded.documentId,
        fileName: file.name,
        sizeBytes: file.size,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bağlantı hatası.");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function takeFiles(list: FileList | File[] | undefined) {
    const files = list ? [...list] : [];
    if (!files.length) return;
    const { accepted, overflow } = filesAcceptedFromSelection({
      committedCount: materialsRef.current.length + reservedSlots.current,
      selectedCount: files.length,
      cap: PREP_SOURCE_DOCUMENT_CAP,
    });
    if (accepted === 0) {
      toast.error(WIZARD_COPY.fileCap);
      return;
    }
    if (overflow > 0) toast.error(WIZARD_COPY.fileCap);
    reservedSlots.current += accepted;
    setFileProgress({ done: 0, total: accepted, current: null });
    try {
      let done = 0;
      for (const file of files.slice(0, accepted)) {
        setFileProgress({ done, total: accepted, current: file.name });
        const added = await takeFile(file, false);
        if (!added) break;
        done += 1;
        setFileProgress({ done, total: accepted, current: null });
      }
    } finally {
      setFileProgress(null);
      reservedSlots.current = Math.max(0, reservedSlots.current - accepted);
    }
  }

  async function startPlan() {
    if (!examDate || !topics.length) return;
    setStarting(true);
    try {
      const res = await fetch("/api/learning/exam-prep/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || `${subject} sınav hazırlığı`,
          examType: subject || "Serbest",
          topics,
          examDate,
          targetScore: target,
          documentId: documentIds[0],
          documentIds,
          topicOrderManual: orderEdited,
          hardTopics: equalFocus ? [] : focusTopics,
          learningPreferences: {
            style:
              modality === "reading"
                ? "theory"
                : modality === "practice"
                  ? "examples"
                  : "mixed",
            modality,
            language,
          },
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Plan kurulamadı.");
        return;
      }
      clearExamWizardDraft();
      if (typeof payload.prepId === "string") {
        setFocusPrepCookieClient(payload.prepId);
      }
      router.push(`/deneme-sinavlari/${payload.prepId}`);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setStarting(false);
    }
  }

  const subjectMatches = useMemo(() => {
    const q = subjectQuery.trim().toLocaleLowerCase("tr");
    const pool = [...new Set([...recentSubjects, ...COMMON_SUBJECTS])];
    if (!q) return pool;
    return pool.filter((s) => s.toLocaleLowerCase("tr").includes(q));
  }, [subjectQuery, recentSubjects]);

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
        if (readPendingDocProcess()?.documentId === failed.documentId) {
          clearPendingDocProcess();
        }
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
          <span>Kaldığın yerden devam ediyorsun.</span>
          <button
            type="button"
            className="apw-ghost"
            onClick={() => {
              if (window.confirm("Sihirbazı sıfırlamak istediğine emin misin?")) {
                resetWizard();
              }
            }}
          >
            Baştan başla
          </button>
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
                setSubject(subjectQuery.trim());
                setStep("date");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              &ldquo;{subjectQuery.trim()}&rdquo; dersini ekle
            </button>
          ) : null}
          {recentSubjects.length ? (
            <>
              <h2 className="apw-group">Devam ettiklerin</h2>
              <div className="apw-grid">
                {recentSubjects
                  .filter((s) => subjectMatches.includes(s))
                  .map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="apw-tile"
                      onClick={() => {
                        setSubject(item);
                        setStep("date");
                      }}
                    >
                      {item}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
          <h2 className="apw-group">Dersler</h2>
          <div className="apw-grid">
            {COMMON_SUBJECTS.filter((s) => subjectMatches.includes(s)).map((item) => (
              <button
                key={item}
                type="button"
                className="apw-tile"
                onClick={() => {
                  setSubject(item);
                  setStep("date");
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === "date" ? (
        <DateStep
          value={examDate}
          onPick={(iso) => setExamDate(iso)}
          onNext={() => setStep("target")}
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
            {fileProgress ? (
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
              accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif,.docx,.pptx,image/heic,image/heif"
              onChange={(e) => {
                void takeFiles(e.target.files ?? undefined);
                e.target.value = "";
              }}
            />
          </div>

          {materials.length ? (
            <ul className="apw-materials">
              {materials.map((material) => {
                const detail = materialDetailLine(material);
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
                disabled={uploading || materials.length >= PREP_SOURCE_DOCUMENT_CAP}
                onClick={() => fileRef.current?.click()}
              >
                {WIZARD_COPY.addMore}
              </button>
            ) : null}
            <button
              type="button"
              className="apw-drop-pick"
              disabled={uploading || materials.length >= PREP_SOURCE_DOCUMENT_CAP}
              onClick={() => setPhoneOpen(true)}
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              {WIZARD_COPY.uploadFromPhone}
            </button>
          </div>

          {phoneOpen ? (
            <PhoneUploadPanel
              onClose={() => setPhoneOpen(false)}
              onReady={(remote) => {
                setPhoneOpen(false);
                void processAndRemember({
                  documentId: remote.documentId,
                  fileName: remote.fileName,
                  sizeBytes: null,
                });
              }}
            />
          ) : null}

          <button
            type="button"
            className="apw-cta"
            disabled={!documentIds.length || uploading}
            onClick={() => setStep("language")}
          >
            {WIZARD_COPY.continue}
          </button>
          <button type="button" className="apw-ghost" onClick={onUseChat}>
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
            onClick={() => void runIntake()}
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
                className={index <= buildStage ? "is-done" : undefined}
              >
                <span className="apw-stage-dot" aria-hidden>
                  {index <= buildStage ? <Check className="h-3 w-3" /> : null}
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
            onClick={() => setStep("modality")}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {!planning && step === "modality" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.modalityTitle}</h1>
          <p className="apw-lead">
            Ders, podcast ve pratik bu tercihe göre sıralanır.
          </p>
          <div className="apw-choices" role="radiogroup" aria-label="Çalışma biçimi">
            {MODALITIES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={modality === option.id}
                className={
                  modality === option.id ? "apw-choice apw-choice--on" : "apw-choice"
                }
                onClick={() => setModality(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="apw-cta"
            onClick={() => setStep("focus")}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {!planning && step === "focus" ? (
        <section className="apw-step">
          <h1>{WIZARD_COPY.focusTitle}</h1>
          <p className="apw-lead">
            Eşit odak tüm konulara aynı yeri ayırır. İstersen birkaçı öne çıksın.
          </p>
          <div className="apw-choices">
            <button
              type="button"
              className={equalFocus ? "apw-choice apw-choice--on" : "apw-choice"}
              aria-pressed={equalFocus}
              onClick={() => {
                setEqualFocus(true);
                setFocusTopics([]);
              }}
            >
              {WIZARD_COPY.equalFocus}
            </button>
            {topics.map((topic) => {
              const on = !equalFocus && focusTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  className={on ? "apw-choice apw-choice--on" : "apw-choice"}
                  aria-pressed={on}
                  onClick={() => {
                    setEqualFocus(false);
                    setFocusTopics((prev) => {
                      const next = prev.includes(topic)
                        ? prev.filter((item) => item !== topic)
                        : [...prev, topic];
                      if (!next.length) setEqualFocus(true);
                      return next;
                    });
                  }}
                >
                  {topic}
                </button>
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
        </section>
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Materyali işlemek için kullanım hakkın doldu."
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

  function renderTopicRow(index: number) {
    const topic = topics[index];
    const meta = topicMeta[index] ?? EMPTY_META;
    if (!topic) return null;
    return (
      <li key={`${index}-${topic}`}>
        <span className="apw-topic-field">
          <strong>{topic}</strong>
          {meta.examHeavy ? <em className="apw-topic-heavy">{WIZARD_COPY.examHeavy}</em> : null}
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
          ? unitHeaders.map((unit) => (
              <li key={unit.title} className="apw-topic-unit">
                <h3 className="apw-group">{unit.title}</h3>
                <ul className="apw-topics">
                  {unit.topicIndexes.map((index) => renderTopicRow(index))}
                </ul>
              </li>
            ))
          : topics.map((_, index) => renderTopicRow(index))}
        {orphanIndexes.length ? (
          <li className="apw-topic-unit">
            {unitHeaders.length ? <h3 className="apw-group">Diğer</h3> : null}
            <ul className="apw-topics">
              {orphanIndexes.map((index) => renderTopicRow(index))}
            </ul>
          </li>
        ) : null}
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
}: {
  value: string;
  onPick: (iso: string) => void;
  onNext: () => void;
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
  ];

  const todayIso = isoOf(new Date());
  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  return (
    <section className="apw-step">
      <h1>Sınav ne zaman?</h1>
      <p className="apw-lead">Kalan güne göre planın sıkışır ya da rahatlar.</p>

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

      <button type="button" className="apw-cta" disabled={!value} onClick={onNext}>
        {WIZARD_COPY.continue}
      </button>
    </section>
  );
}
