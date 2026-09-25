"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isPhotoQuotaError } from "@/lib/documents/process-errors";
import {
  Check,
  ChevronLeft,
  FileText,
  MessageSquare,
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
} from "@/lib/learning/exam-wizard-copy";
import { freeMaterialLimitLine, materialDetailLine } from "@/lib/learning/prep-material-copy";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { CreditGate } from "@/components/paywall/credit-gate";
import { COMMON_SUBJECTS } from "@/lib/learning/subjects";
import {
  DOCUMENT_MATERIAL_HINT,
  DOCUMENT_PICK_REJECTED,
  DOCUMENT_UPLOAD_HINT,
} from "@/lib/documents/upload-labels";
import { PhoneUploadPanel } from "@/components/parity/phone-upload-panel";
import "@/styles/exam-create-wizard.css";

type Step =
  | "start"
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
  const freePdfCap = account?.audience === "free" ? PHOTO_PAGE_LIMITS.free : null;
  // İlk soru "materyalin var mı?" — elinde dosya olmayan öğrenci eskiden üç
  // adım yürüyüp materyal adımının altındaki ince yazıyı bulmak zorundaydı.
  // Belgeyle gelen öğrenci (deep link) o adımı atlar.
  //
  // Ders adımı hâlâ ikinci: ders atlanırsa hazırlık "Serbest" olarak
  // kaydediliyor ve listede ayırt edilemiyordu.
  const [step, setStep] = useState<Step>(initialDocumentId ? "subject" : "start");

  const [subject, setSubject] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [examDate, setExamDate] = useState("");
  const [target, setTarget] = useState(75);
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [modality, setModality] = useState<StudyModality>("auto");
  /** true: tüm konulara eşit. false: focusTopics seçili. */
  const [equalFocus, setEqualFocus] = useState(true);

  const [materials, setMaterials] = useState<WizardMaterial[]>(
    initialDocumentId
      ? [{ id: initialDocumentId, fileName: "Seçili materyal", sizeBytes: null, pageCount: null }]
      : [],
  );
  const [docs, setDocs] = useState<WizardMaterial[]>([]);
  const [uploading, setUploading] = useState(false);
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
  /** Öğrenci oklarla sırayı değiştirdiyse önkoşul sırası ezilmez. */
  const [orderEdited, setOrderEdited] = useState(false);
  const [focusTopics, setFocusTopics] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const planTimer = useRef<number | null>(null);
  const shapeTimer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    void fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((data: { documents?: WizardMaterial[] }) => {
        const listed = (data.documents ?? []).map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          sizeBytes: doc.sizeBytes ?? null,
          pageCount: doc.pageCount ?? null,
        }));
        setDocs(listed);
        if (initialDocumentId) {
          const hit = listed.find((doc) => doc.id === initialDocumentId);
          if (hit) {
            setMaterials((current) =>
              current.map((item) => (item.id === hit.id ? { ...item, ...hit } : item)),
            );
          }
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
      setStep("building");
      setBuildStage(0);
      const ticker = setInterval(
        () => setBuildStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1)),
        1400,
      );
      try {
        const res = await fetch("/api/learning/exam-prep/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: primary,
            documentIds: ids,
            probeOnly: true,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        const found: string[] = payload?.draft?.topics ?? [];
        setTopics(found);
        setTopicPages(payload?.draft?.topicPages ?? []);
        setTopicFiles(Array.isArray(payload?.draft?.topicFiles) ? payload.draft.topicFiles : []);
        setTopicWarnings(
          Array.isArray(payload?.draft?.topicWarnings) ? payload.draft.topicWarnings : [],
        );
        setOrderEdited(false);
        setTitle(payload?.draft?.title || `${subject} sınav hazırlığı`);
      } catch {
        setTopics([]);
      } finally {
        clearInterval(ticker);
        if (!alive.current) return;
        setBuildStage(BUILD_STAGES.length - 1);
        setStep("shaping");
        if (shapeTimer.current) window.clearTimeout(shapeTimer.current);
        shapeTimer.current = window.setTimeout(() => {
          if (alive.current) setStep("topics");
        }, 700);
      }
    },
    [materials, subject],
  );

  function rememberMaterial(material: WizardMaterial) {
    let stored = false;
    setMaterials((current) => {
      if (current.some((item) => item.id === material.id)) {
        stored = true;
        return current.map((item) => (item.id === material.id ? { ...item, ...material } : item));
      }
      if (current.length >= PREP_SOURCE_DOCUMENT_CAP) return current;
      stored = true;
      return [...current, material];
    });
    return stored;
  }

  async function processAndRemember(input: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
  }): Promise<boolean> {
    const processRes = await fetch("/api/documents/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: input.documentId }),
    });
    const processed = await processRes.json().catch(() => ({}));
    if (processRes.status === 402) {
      if (isPhotoQuotaError(processed)) {
        toast.error(processed.error ?? "Bu ayki fotoğraf hakkın doldu.", {
          description:
            freePdfCap !== null
              ? `Plus ile daha yüksek fotoğraf ve PDF limiti (${PHOTO_PAGE_LIMITS.plus} sayfa).`
              : undefined,
        });
        return false;
      }
      setPaywall(true);
      return false;
    }
    if (!processRes.ok) {
      toast.error(processed.error ?? "Dosya işlenemedi.");
      return false;
    }
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
      description: processed.notice ?? undefined,
    });
    return true;
  }

  async function takeFile(file: File | undefined, enforceCap = true): Promise<boolean> {
    if (!file) return false;
    if (enforceCap && materials.length >= PREP_SOURCE_DOCUMENT_CAP) {
      toast.error(WIZARD_COPY.fileCap);
      return false;
    }
    if (!acceptedUpload(file)) {
      toast.error(DOCUMENT_PICK_REJECTED);
      return false;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dosya en fazla 15 MB olabilir.");
      return false;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const uploaded = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        toast.error(uploaded.error ?? "Yükleme başarısız.");
        return false;
      }
      return await processAndRemember({
        documentId: uploaded.documentId,
        fileName: file.name,
        sizeBytes: file.size,
      });
    } catch {
      toast.error("Bağlantı hatası.");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function takeFiles(list: FileList | File[] | undefined) {
    const files = list ? [...list] : [];
    let room = PREP_SOURCE_DOCUMENT_CAP - materials.length;
    for (const file of files) {
      if (room <= 0) {
        toast.error(WIZARD_COPY.fileCap);
        break;
      }
      const added = await takeFile(file, false);
      if (!added) break;
      room -= 1;
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

  return (
    <div className="apw">
      <div className="apw-progress" aria-hidden>
        <div className="apw-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {stepIndex > 0 && step !== "building" && step !== "shaping" ? (
        <button type="button" className="apw-back" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Geri
        </button>
      ) : null}

      {step === "start" ? (
        <section className="apw-step">
          <h1>Nasıl çalışalım?</h1>
          <p className="apw-lead">
            Ders notun varsa konular, sorular ve podcast senin materyalinden
            çıkar. Yoksa da olur — sınavında ne olduğunu anlat, yeter.
          </p>

          <div className="apw-picks">
            <button
              type="button"
              className="apw-pick"
              onClick={() => setStep("subject")}
            >
              <FileText className="h-6 w-6" aria-hidden />
              <span className="apw-pick-title">Ders notum var</span>
              <span className="apw-pick-hint">
                {DOCUMENT_MATERIAL_HINT}
              </span>
            </button>

            <button
              type="button"
              className="apw-pick"
              onClick={onUseChat}
            >
              <MessageSquare className="h-6 w-6" aria-hidden />
              <span className="apw-pick-title">Belgem yok, konudan çalışayım</span>
              <span className="apw-pick-hint">
                Sınavında ne var söyle; konuları birlikte çıkarıp planı kuralım.
              </span>
            </button>
          </div>
        </section>
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
          <h1>Neyden çalışacaksın?</h1>
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
            {freePdfCap !== null ? (
              <p className="apw-drop-hint">{freeMaterialLimitLine()}</p>
            ) : null}
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

          {docs.length ? (
            <>
              <h2 className="apw-group">Daha önce yüklediklerin</h2>
              <div className="apw-doc-list">
                {docs.map((doc) => {
                  const selected = documentIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      className={selected ? "apw-doc-row apw-doc-row--on" : "apw-doc-row"}
                      onClick={() => {
                        if (selected) {
                          setMaterials((current) => current.filter((item) => item.id !== doc.id));
                          return;
                        }
                        if (materials.length >= PREP_SOURCE_DOCUMENT_CAP) {
                          toast.error(WIZARD_COPY.fileCap);
                          return;
                        }
                        rememberMaterial({
                          id: doc.id,
                          fileName: doc.fileName,
                          sizeBytes: doc.sizeBytes,
                          pageCount: doc.pageCount,
                        });
                      }}
                    >
                      <FileText className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{doc.fileName}</span>
                      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </>
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
            Materyalim yok — konuşarak kuralım
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
          <button
            type="button"
            className="apw-cta"
            onClick={() => void runIntake()}
            disabled={!documentIds.length}
          >
            {WIZARD_COPY.continue}
          </button>
        </section>
      ) : null}

      {step === "building" ? (
        <section className="apw-step apw-step--center">
          <h1>{WIZARD_COPY.analyzing}</h1>
          <p className="apw-lead">Konular materyalinin kapsamından çıkarılıyor.</p>
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
          <TopicEditor
            topics={topics}
            topicPages={topicPages}
            topicFiles={topicFiles}
            topicWarnings={topicWarnings}
            documentIds={documentIds}
            onTopics={setTopics}
            onPages={setTopicPages}
            onFiles={setTopicFiles}
            onWarnings={setTopicWarnings}
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
            documentIds={documentIds}
            onTopics={setTopics}
            onPages={setTopicPages}
            onFiles={setTopicFiles}
            onWarnings={setTopicWarnings}
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
        message="Materyali işlemek için kredin kalmadı."
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
  documentIds,
  onTopics,
  onPages,
  onFiles,
  onWarnings,
  onOrderEdited,
  onRename,
  onRemove,
}: {
  topics: string[];
  topicPages: number[][];
  topicFiles: string[][];
  topicWarnings: string[];
  documentIds: string[];
  onTopics: (next: string[]) => void;
  onPages: (next: number[][]) => void;
  onFiles: (next: string[][]) => void;
  onWarnings: (next: string[]) => void;
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
    onTopics([...topics, title]);
    onPages([...topicPages, result.pageNumbers]);
    onFiles([...topicFiles, []]);
    onWarnings([...topicWarnings, ""]);
    close();
  }

  function removeAt(index: number) {
    const title = topics[index];
    if (!title) return;
    onRemove(title);
    onTopics(topics.filter((_, item) => item !== index));
    onPages(topicPages.filter((_, item) => item !== index));
    onFiles(topicFiles.filter((_, item) => item !== index));
    onWarnings(topicWarnings.filter((_, item) => item !== index));
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
    onTopics(reordered);
    onPages(pages);
    onFiles(files);
    onWarnings(warnings);
    onOrderEdited();
  }

  return (
    <>
      <ul className="apw-topics">
        {topics.map((topic, index) => (
          <li key={`${index}-${topic}`}>
            <span className="apw-topic-field">
              <strong>{topic}</strong>
              {topicFiles[index]?.length ? (
                <em>Kaynak: {topicFiles[index].join(", ")}</em>
              ) : topicPages[index]?.length ? (
                <em>Kaynak: s.{topicPages[index].join(", ")}</em>
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
        ))}
      </ul>
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
