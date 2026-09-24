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
  Upload,
  X,
} from "lucide-react";
import { STUDY_PATH_SKELETON } from "@/lib/learning/exam-plan-phases";
import type { StudyModality } from "@/lib/learning/exam-prep-ui-path";
import { CreditGate } from "@/components/paywall/credit-gate";
import { COMMON_SUBJECTS } from "@/lib/learning/subjects";
import "@/styles/exam-create-wizard.css";

type Step =
  | "start"
  | "subject"
  | "date"
  | "target"
  | "material"
  | "language"
  | "building"
  | "topics"
  | "modality"
  | "focus"
  | "plan";

const STEP_ORDER: Step[] = [
  "start",
  "subject",
  "date",
  "target",
  "material",
  "language",
  "building",
  "topics",
  "modality",
  "focus",
  "plan",
];

const BUILD_STAGES = [
  "Ekler okunuyor",
  "Kullanılabilirlik kontrol ediliyor",
  "Konular düzenleniyor",
];

const MODALITIES: { id: StudyModality; label: string }[] = [
  { id: "reading", label: "Okuyarak" },
  { id: "listening", label: "Dinleyerek" },
  { id: "watching", label: "İzleyerek" },
  { id: "practice", label: "Pratik yaparak" },
  { id: "auto", label: "Sen karar ver" },
];

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
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

  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [documentBytes, setDocumentBytes] = useState<number | null>(null);
  const [docs, setDocs] = useState<{ id: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [buildStage, setBuildStage] = useState(0);
  const [topics, setTopics] = useState<string[]>([]);
  /** Her konunun dayandığı sayfalar; öğrenci neye dayandığını görsün. */
  const [topicPages, setTopicPages] = useState<number[][]>([]);
  const [focusTopics, setFocusTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [title, setTitle] = useState("");

  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const planTimer = useRef<number | null>(null);

  useEffect(() => {
    void fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((data: { documents?: { id: string; fileName: string }[] }) => {
        setDocs(data.documents ?? []);
        if (initialDocumentId) {
          const hit = (data.documents ?? []).find((d) => d.id === initialDocumentId);
          if (hit) setDocumentName(hit.fileName);
        }
      })
      .catch(() => {});
  }, [initialDocumentId]);

  useEffect(
    () => () => {
      if (planTimer.current) window.clearTimeout(planTimer.current);
    },
    [],
  );

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  function goBack() {
    if (planning) {
      if (planTimer.current) window.clearTimeout(planTimer.current);
      setPlanning(false);
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
    async (docId: string) => {
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
          body: JSON.stringify({ documentId: docId, probeOnly: true }),
        });
        const payload = await res.json().catch(() => ({}));
        const found: string[] = payload?.draft?.topics ?? [];
        setTopics(found);
        setTopicPages(payload?.draft?.topicPages ?? []);
        setTitle(payload?.draft?.title || `${subject} sınav hazırlığı`);
      } catch {
        setTopics([]);
      } finally {
        clearInterval(ticker);
        setBuildStage(BUILD_STAGES.length - 1);
        setStep("topics");
      }
    },
    [subject],
  );

  async function takeFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("PDF, görsel veya TXT yükleyebilirsin.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dosya en fazla 15 MB olabilir.");
      return;
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
        return;
      }
      const processRes = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: uploaded.documentId }),
      });
      const processed = await processRes.json().catch(() => ({}));
      if (processRes.status === 402) {
        // Fotoğraf kotası bittiyse kredi satın almak işe yaramıyor.
        if (isPhotoQuotaError(processed)) {
          toast.error(processed.error ?? "Bu ayki fotoğraf hakkın doldu.");
          return;
        }
        setPaywall(true);
        return;
      }
      if (!processRes.ok) {
        toast.error(processed.error ?? "Dosya işlenemedi.");
        return;
      }
      setDocumentId(uploaded.documentId);
      setDocumentName(file.name);
      setDocumentBytes(file.size);
      toast.success("Materyalin hazır.", {
        description: processed.notice ?? undefined,
      });
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setUploading(false);
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
          documentId: documentId ?? undefined,
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

      {stepIndex > 0 && step !== "building" ? (
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
                PDF, görsel ya da metin yükle; her şey senin belgenden üretilsin.
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
            Devam et
          </button>
        </section>
      ) : null}

      {step === "material" ? (
        <section className="apw-step">
          <h1>Neyden çalışacaksın?</h1>
          <p className="apw-lead">
            Ders notunu yükle; konular, sorular ve podcast senin materyalinden
            çıkar.
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
              void takeFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload className="h-7 w-7 opacity-70" aria-hidden />
            <p className="apw-drop-title">Dosyanı buraya bırak</p>
            <p className="apw-drop-hint">PDF, görsel veya TXT · en fazla 15 MB</p>
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
              className="hidden"
              accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                void takeFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {documentId ? (
            <div className="apw-doc-chip">
              <FileText className="h-4 w-4" aria-hidden />
              <span>
                {documentName ?? "Seçili materyal"}
                {documentBytes ? ` · ${formatBytes(documentBytes)}` : ""}
              </span>
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              <button
                type="button"
                aria-label="Materyali kaldır"
                onClick={() => {
                  setDocumentId(null);
                  setDocumentName(null);
                  setDocumentBytes(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}

          {docs.length ? (
            <>
              <h2 className="apw-group">Daha önce yüklediklerin</h2>
              <div className="apw-doc-list">
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={
                      documentId === doc.id
                        ? "apw-doc-row apw-doc-row--on"
                        : "apw-doc-row"
                    }
                    onClick={() => {
                      setDocumentId(doc.id);
                      setDocumentName(doc.fileName);
                    }}
                  >
                    <FileText className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{doc.fileName}</span>
                    {documentId === doc.id ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="apw-cta"
            disabled={!documentId || uploading}
            onClick={() => setStep("language")}
          >
            Devam et
          </button>
          <button type="button" className="apw-ghost" onClick={onUseChat}>
            Materyalim yok — konuşarak kuralım
          </button>
        </section>
      ) : null}

      {step === "language" ? (
        <section className="apw-step">
          <h1>İçerik dili</h1>
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
            onClick={() => documentId && void runIntake(documentId)}
          >
            Devam et
          </button>
        </section>
      ) : null}

      {step === "building" ? (
        <section className="apw-step apw-step--center">
          <h1>Dosyaların inceleniyor...</h1>
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

      {planning ? (
        <section className="apw-step apw-step--center">
          <h1>Sıradaki soruyu hazırlıyor...</h1>
          <p className="apw-lead">Planın {topics.length} konuyla kuruluyor.</p>
        </section>
      ) : null}

      {!planning && step === "topics" ? (
        <section className="apw-step">
          <h1>
            {topics.length
              ? `Materyalinde ${topics.length} konu buldum`
              : "Konuları birlikte yazalım"}
          </h1>
          <p className="apw-lead">
            Yanlış olanı düzelt, eksik olanı ekle. Bu adım yalnızca düzenleme.
          </p>
          <TopicEditor
            topics={topics}
            topicPages={topicPages}
            newTopic={newTopic}
            onTopics={setTopics}
            onPages={setTopicPages}
            onNewTopic={setNewTopic}
            onRename={(from, to) =>
              setFocusTopics((prev) =>
                prev
                  .map((item) => (item === from ? to : item))
                  .filter((item) => item.trim().length > 0),
              )
            }
          />
          <button
            type="button"
            className="apw-cta"
            disabled={!topics.length}
            onClick={() => setStep("modality")}
          >
            Devam et
          </button>
        </section>
      ) : null}

      {!planning && step === "modality" ? (
        <section className="apw-step">
          <h1>Nasıl çalışmayı seversin?</h1>
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
            Devam et
          </button>
        </section>
      ) : null}

      {!planning && step === "focus" ? (
        <section className="apw-step">
          <h1>En çok neye odaklanalım?</h1>
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
              Tüm konulara eşit odaklan
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
            Devam et
          </button>
        </section>
      ) : null}

      {!planning && step === "plan" ? (
        <section className="apw-step">
          <p className="apw-kicker">Planın {topics.length}</p>
          <h1>Plan hazır</h1>
          <p className="apw-lead">
            Son bir kez düzenleyebilirsin. Çalışma yolu her hazırlıkta aynı
            iskelet; konu sayısı materyalinin kapsamından gelir.
          </p>
          <TopicEditor
            topics={topics}
            topicPages={topicPages}
            newTopic={newTopic}
            onTopics={setTopics}
            onPages={setTopicPages}
            onNewTopic={setNewTopic}
            onRename={(from, to) =>
              setFocusTopics((prev) =>
                prev
                  .map((item) => (item === from ? to : item))
                  .filter((item) => item.trim().length > 0),
              )
            }
          />
          <ol className="apw-phases">
            {STUDY_PATH_SKELETON.map((phase) => (
              <li key={phase.title}>
                <h2>{phase.title}</h2>
                <ul>
                  {phase.items.map((item) => (
                    <li key={item.label}>
                      {item.label}
                      {item.hint ? ` (${item.hint})` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="apw-cta"
            disabled={starting || !topics.length}
            onClick={() => void startPlan()}
          >
            {starting ? "Kuruluyor…" : "Sınav hazırlığı oluştur"}
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TopicEditor({
  topics,
  topicPages,
  newTopic,
  onTopics,
  onPages,
  onNewTopic,
  onRename,
}: {
  topics: string[];
  topicPages: number[][];
  newTopic: string;
  onTopics: (next: string[]) => void;
  onPages: (next: number[][]) => void;
  onNewTopic: (value: string) => void;
  onRename: (from: string, to: string) => void;
}) {
  function add() {
    const title = newTopic.trim();
    if (!title) return;
    onTopics([...topics, title]);
    onNewTopic("");
  }

  return (
    <>
      <ul className="apw-topics">
        {topics.map((topic, index) => (
          <li key={index}>
            <span className="apw-topic-field">
              <input
                id={`apw-topic-${index}`}
                value={topic}
                aria-label={`${index + 1}. konu`}
                onChange={(e) => {
                  const next = e.target.value;
                  onRename(topic, next);
                  onTopics(topics.map((item, i) => (i === index ? next : item)));
                }}
              />
              {topicPages[index]?.length ? (
                <em>Kaynak: s.{topicPages[index].join(", ")}</em>
              ) : null}
            </span>
            <button
              type="button"
              className="apw-topic-edit"
              onClick={() => document.getElementById(`apw-topic-${index}`)?.focus()}
            >
              Konuyu değiştir
            </button>
            <button
              type="button"
              aria-label={`${topic} konusunu kaldır`}
              onClick={() => {
                onRename(topic, "");
                onTopics(topics.filter((_, i) => i !== index));
                onPages(topicPages.filter((_, i) => i !== index));
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="apw-topic-add">
        <input
          value={newTopic}
          placeholder="Konu ekle"
          aria-label="Yeni konu"
          onChange={(e) => onNewTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <button type="button" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden /> Konu ekle
        </button>
      </div>
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
        Devam et
      </button>
    </section>
  );
}
