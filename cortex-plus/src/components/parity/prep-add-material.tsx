"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { PhoneUploadPanel } from "@/components/parity/phone-upload-panel";
import { PhotoQualityPrompt } from "@/components/parity/photo-quality-prompt";
import { PENDING_MATERIALS_EVENT } from "@/lib/learning/pending-materials-copy";
import { SINGLE_WINDOW_MAX_PAGES } from "@/lib/documents/document-windows";
import { CreditGate } from "@/components/paywall/credit-gate";
import { isFreePageLimitError, isPhotoQuotaError } from "@/lib/documents/process-errors";
import { attachedLine, mapAndAttach } from "@/lib/documents/prep-attach-client";
import {
  clearPendingDocProcess,
  readPendingDocProcesses,
  writePendingDocProcess,
} from "@/lib/documents/pending-doc-process";
import {
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import { PARALLEL_UPLOADS, runPool, type PoolOutcome } from "@/lib/documents/upload-batch";
import { PREP_HOME_COPY, WIZARD_COPY, batchUploadFailedLine, fileProgressLine, photoSetProgressLine, readingNow } from "@/lib/learning/exam-wizard-copy";
import { freeMaterialLimitLine } from "@/lib/learning/prep-material-copy";
import {
  useDocumentLimits,
  useStudentShellAccount,
} from "@/lib/student/student-shell-context";
import { useScreenAwake, useUniversalDocumentUpload } from "@/lib/documents/use-universal-upload";
import { DOCUMENT_UPLOAD_ACCEPT, uploadSizeProblem } from "@/lib/documents/upload-accept";
import "@/styles/exam-create-wizard.css";

const EXTENSIONS = [".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".docx", ".pptx"];

function accepted(file: File): boolean {
  if (file.type.startsWith("image/") || file.type === "application/pdf" || file.type === "text/plain") {
    return true;
  }
  if (file.type.includes("wordprocessingml") || file.type.includes("presentationml")) return true;
  const name = file.name.toLowerCase();
  return EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Toplu eklemenin bir öğesi: seçilen dosya ya da (telefondan / yarım kalmış) yüklenmiş belge. */
type AddEntry = { file?: File; documentId?: string; fileName: string; sizeBytes: number | null };

/** Telefondan gelen dosyalar bu kadar sessizlikten sonra tek toplu eklemeyle işlenir. */
const PHONE_BATCH_SETTLE_MS = 2_500;

/**
 * Var olan hazırlığa sonradan belge ekleme (31 Ekim 2026, ürün sahibi: "kullanıcı bir derse kaç tane döküman yüklemek
 * isterse yükleyebilir; sonradan da"). Önce tek dosya seçilebiliyordu, hazırlık başına en çok 8 dosya vardı ve her
 * dosya kendi konu haritasını çıkarıyordu. Şimdi: çoklu seçim → dosyalar paralel okunur (ücretli hesapta ve kurucuda
 * altı şerit, ücretsizde sıra) → yeni dosyaların hepsine hazırlığın konu adlarıyla yönlendirilen TEK konu haritası →
 * tek ekleme isteği. Okunamayan dosya ötekileri durdurmaz; yalnız hak dolunca yenisi başlamaz.
 */
export function PrepMaterialAdder({
  prepId,
}: {
  prepId: string;
  /** Eski çağıranlar için; belge sayısında sınır yok. */
  count?: number;
}) {
  const router = useRouter();
  const account = useStudentShellAccount();
  const { isAdmin } = useDocumentLimits();
  const paidUploads = account?.audience === "plus" || account?.audience === "sigma" || isAdmin;
  const materialLimitLine = freeMaterialLimitLine({
    isAdmin,
    tier:
      account?.audience === "plus" || account?.audience === "sigma"
        ? account.audience
        : "free",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState("Materyali işlemek için kullanım hakkın doldu.");
  const [processDetail, setProcessDetail] = useState<string | null>(null);
  const [processAlert, setProcessAlert] = useState<string | null>(null);
  /** Okundu ama haritası ya da eklemesi düşen belgeler: "Tekrar dene" yalnız bu adımı yeniden yapar. */
  const [pendingAttach, setPendingAttach] = useState<{ documentIds: string[]; error: string } | null>(null);
  const resumeRef = useRef(false);
  /** Büyük belge (tek pencereye sığmayan): pencere işçisine devredilir, şerit pencere pencere ekler. */
  const handoffRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const phoneQueue = useRef<AddEntry[]>([]);
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Büyük belgeler hazırlığa bekleyen olarak bağlanır; sunucudaki pencere işçisi onları pencere pencere ekler. */
  async function handOff(documentIds: string[]): Promise<void> {
    if (!documentIds.length) return;
    const res = await fetch("/api/learning/exam-prep/pending-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, documentIds }),
    }).catch(() => null);
    if (!res?.ok) {
      setPendingAttach({ documentIds, error: "Dosyalar hazırlığa eklenemedi." });
      return;
    }
    window.dispatchEvent(new Event(PENDING_MATERIALS_EVENT));
    toast.success(PREP_HOME_COPY.windowedHandoff);
  }

  /** Yeni belgelerin tek konu haritası (hazırlığın konu adları yön verir), sonra tek ekleme isteği. */
  async function mapThenAttach(documentIds: string[]): Promise<void> {
    if (!documentIds.length) return;
    setProcessDetail(documentIds.length > 1 ? `${documentIds.length} dosyanın konuları çıkarılıyor…` : "Konular çıkarılıyor…");
    const outcome = await mapAndAttach({ prepId, documentIds, onProgress: setProcessDetail });
    setProcessDetail(null);
    if (!outcome.ok) {
      if (outcome.paywall) {
        setPaywall(true);
        return;
      }
      setPendingAttach({ documentIds, error: outcome.error });
      if (!outcome.canRetry) toast.error(outcome.error);
      return;
    }
    toast.success(attachedLine(outcome));
    if (outcome.warnings[0]) toast.warning(outcome.warnings[0]);
    for (const id of documentIds) clearPendingDocProcess({ documentId: id });
    setPendingAttach(null);
    router.refresh();
  }

  /** Bir belgeyi okur; konu haritası toplu eklemede bir kez çıkarılır (`deferMap`). */
  async function extract(entry: { documentId: string; fileName: string; sizeBytes: number | null }): Promise<PoolOutcome> {
    writePendingDocProcess({
      documentId: entry.documentId,
      fileName: entry.fileName,
      sizeBytes: entry.sizeBytes,
      startedAt: new Date().toISOString(),
      surface: "prep-add",
    });
    // Pencereli işleme (31 Ekim 2026): sayfa sayısı tek pencereyi aşan belge beklenmez; pencere işçisine devredilir.
    const big = (body: Record<string, unknown>) => Number(body.pageCount) > SINGLE_WINDOW_MAX_PAGES;
    const result = await requestDocumentProcessing({
      documentId: entry.documentId,
      post: (body) => postDocumentProcess({ ...body, prepId, deferMap: true }),
      stopWhen: big,
    });
    const processed = result.body;
    if (result.ok && big(processed)) {
      clearPendingDocProcess({ documentId: entry.documentId });
      handoffRef.current.push(entry.documentId);
      return true;
    }
    if (result.status === 402) {
      clearPendingDocProcess({ documentId: entry.documentId });
      if (isFreePageLimitError(processed)) {
        if (typeof processed.error === "string") setPaywallMessage(processed.error);
        setPaywall(true);
        return "stop";
      }
      if (isPhotoQuotaError(processed)) {
        const message = typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.";
        toast.error(message, { description: materialLimitLine ?? undefined });
        setProcessAlert(message);
        return "stop";
      }
      setPaywall(true);
      return "stop";
    }
    if (!result.ok) {
      const code = typeof processed.code === "string" ? processed.code : "";
      // Ağ / zaman aşımı: kayıt kalır, sekme yeniden açılınca sürer.
      const keepPending =
        result.status === 0 || code === "processing_timeout" || code === "retryable_exhausted" || (result.status >= 500 && result.status < 600);
      if (!keepPending) clearPendingDocProcess({ documentId: entry.documentId });
      return false;
    }
    return true;
  }

  /** Okunan belgelerin kimliği ve adı (motorun sırası adla verilir). */
  const readyRef = useRef<{ documentId: string; fileName: string }[]>([]);

  /*
    Ortak yükleme motoru (31 Ekim 2026, use-universal-upload.ts): fotoğraflar tek belgede (hazırlık kurulu, hızlı
    başlatma bölmesi yok), şeritler, dosya başına 3 yeniden deneme, ekranı uyanık tutma.
  */
  const upload = useUniversalDocumentUpload(
    { lanes: paidUploads ? PARALLEL_UPLOADS : 1, photoSet: true, fastStart: false },
    {
      // 50 MB'tan büyük PDF motorda parçalarına bölündü (31 Ekim 2026); Word/sunu 50 MB'a kadar.
      validate: (file) => (!accepted(file) ? `${file.name} eklenemiyor: türü uygun değil.` : uploadSizeProblem(file)),
      process: async ({ documentId, item }) => {
        const outcome = await extract({ documentId, fileName: item.file.name, sizeBytes: item.file.size });
        if (outcome === true) readyRef.current.push({ documentId, fileName: item.file.name });
        return outcome;
      },
    },
    // Bulanık / karanlık fotoğraf sorusu (Paket J3 #13): `PhotoQualityPrompt` düğmelerin altında.
    { photoQuality: true },
  );
  useScreenAwake(busy);

  async function runBatch(entries: AddEntry[]) {
    if (!entries.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProcessAlert(null);
    readyRef.current = [];
    handoffRef.current = [];
    // Ücretli hesapta ve kurucuda en çok altı dosya aynı anda; ücretsizde sırayla (upload-batch.ts).
    const lanes = paidUploads ? PARALLEL_UPLOADS : 1;
    const files = entries.flatMap((entry) => (entry.file ? [entry.file] : []));
    const remote = entries.filter((entry) => !entry.file && entry.documentId);
    const reading: string[] = [];
    const failed: string[] = [];
    let done = 0;
    const report = () => {
      if (remote.length > 1) setProcessDetail(fileProgressLine(done, remote.length, readingNow(reading)));
      else setProcessDetail(reading.length ? "Belge işleniyor…" : null);
    };
    try {
      const [picked] = await Promise.all([
        files.length ? upload.run(files) : null,
        remote.length
          ? runPool(remote, lanes, async (entry) => {
              reading.push(entry.fileName);
              report();
              try {
                const outcome = await extract({ documentId: entry.documentId!, fileName: entry.fileName, sizeBytes: entry.sizeBytes });
                if (outcome === true) {
                  readyRef.current.push({ documentId: entry.documentId!, fileName: entry.fileName });
                  done += 1;
                } else if (outcome === false) {
                  failed.push(entry.fileName);
                }
                return outcome;
              } catch {
                failed.push(entry.fileName);
                return false;
              } finally {
                reading.splice(reading.indexOf(entry.fileName), 1);
                report();
              }
            })
          : null,
      ]);
      setProcessDetail(null);
      failed.push(...(picked?.failed ?? []));
      if (failed.length) toast.error(failed.length > 1 ? batchUploadFailedLine(failed) : `${failed[0]} okunamadı. Yeniden seçebilirsin.`);
      // Seçim sırası korunur: kurs haritası ve belge listesi öğrencinin sırasıyla.
      const rank = new Map([...(picked?.order ?? []), ...remote.map((entry) => entry.fileName)].map((name, index) => [name, index]));
      const ready = [...readyRef.current].sort(
        (a, b) => (rank.get(a.fileName) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.fileName) ?? Number.MAX_SAFE_INTEGER),
      );
      const handed = new Set(handoffRef.current);
      await handOff(ready.filter((item) => handed.has(item.documentId)).map((item) => item.documentId));
      await mapThenAttach(ready.filter((item) => !handed.has(item.documentId)).map((item) => item.documentId));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProcessDetail(null);
    }
  }

  useEffect(() => {
    const pending = readPendingDocProcesses("prep-add");
    if (!pending.length || resumeRef.current) return;
    resumeRef.current = true;
    // Sekme kapanınca yarım kalan dosyaların hepsi sürer; okunmuş olanlar hemen haritaya geçer.
    void runBatch(
      pending.map((entry) => ({ documentId: entry.documentId, fileName: entry.fileName, sizeBytes: entry.sizeBytes })),
    ).finally(() => {
      resumeRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount resume once
  }, []);

  useEffect(
    () => () => {
      if (phoneTimer.current) clearTimeout(phoneTimer.current);
    },
    [],
  );

  /** Fotoğraflar ortak motorda tek belgede birleşir ("Ders Notu Fotoğrafları (N Sayfa)"). */
  async function takeFiles(list: FileList | null) {
    const files = list ? [...list] : [];
    if (!files.length || busyRef.current) return;
    void runBatch(files.map((file) => ({ file, fileName: file.name, sizeBytes: file.size })));
  }

  /** Telefondan art arda gelen dosyalar biriktirilir, sessizlikten sonra tek toplu eklemeyle işlenir. */
  function queuePhoneDocument(remote: { documentId: string; fileName?: string | null }) {
    phoneQueue.current.push({ documentId: remote.documentId, fileName: remote.fileName ?? "Telefon yüklemesi", sizeBytes: null });
    setProcessDetail(`Telefondan ${phoneQueue.current.length} dosya geldi…`);
    if (phoneTimer.current) clearTimeout(phoneTimer.current);
    phoneTimer.current = setTimeout(function flush() {
      if (busyRef.current) {
        phoneTimer.current = setTimeout(flush, PHONE_BATCH_SETTLE_MS);
        return;
      }
      const batch = phoneQueue.current.splice(0);
      void runBatch(batch);
    }, PHONE_BATCH_SETTLE_MS);
  }

  return (
    <div className="cp-exam-add">
      <button
        type="button"
        className="cp-back-pill"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {busy ? "Ekleniyor…" : PREP_HOME_COPY.addFile}
      </button>
      <button
        type="button"
        className="cp-back-pill"
        disabled={busy}
        onClick={() => setPhoneOpen(true)}
      >
        <Smartphone className="h-4 w-4" aria-hidden />
        {WIZARD_COPY.uploadFromPhone}
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        onChange={(event) => {
          void takeFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <PhotoQualityPrompt request={upload.photoQuality} onAnswer={upload.answerPhotoQuality} />
      {upload.photoProgress ? (
        <p className="text-xs text-[var(--cp-muted)]" role="status" aria-live="polite">
          {photoSetProgressLine(upload.photoProgress)}
        </p>
      ) : null}
      {upload.fileProgress && upload.fileProgress.total > 1 ? (
        <p className="text-xs text-[var(--cp-muted)]" role="status" aria-live="polite">
          {fileProgressLine(upload.fileProgress.done, upload.fileProgress.total, readingNow(upload.fileProgress.reading))}
        </p>
      ) : null}
      {processDetail ? (
        <p className="text-xs text-[var(--cp-muted)]" role="status" aria-live="polite">
          {processDetail}
        </p>
      ) : null}
      {materialLimitLine ? (
        <p className="text-xs text-[var(--cp-muted)]">{materialLimitLine}</p>
      ) : null}
      <p className="text-xs text-[var(--cp-muted)]">
        Birden çok dosya seçebilirsin. Sekmeyi kapatırsan geri geldiğinde kaldığı yerden devam eder.
      </p>
      {processAlert ? (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          <p>{processAlert}</p>
          <button
            type="button"
            className="mt-2 text-xs underline underline-offset-2"
            onClick={() => setProcessAlert(null)}
          >
            Kapat
          </button>
        </div>
      ) : null}
      {pendingAttach ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--cp-muted)]">
          <span>
            {pendingAttach.documentIds.length > 1 ? `${pendingAttach.documentIds.length} dosya okundu, eklenemedi` : "Dosya okundu, eklenemedi"} —{" "}
            {pendingAttach.error}
          </span>
          <button
            type="button"
            className="cp-back-pill"
            disabled={busy}
            onClick={() => {
              const ids = pendingAttach.documentIds;
              busyRef.current = true;
              setBusy(true);
              void mapThenAttach(ids).finally(() => {
                busyRef.current = false;
                setBusy(false);
              });
            }}
          >
            Tekrar dene
          </button>
        </div>
      ) : null}
      {phoneOpen ? (
        <PhoneUploadPanel
          onClose={() => setPhoneOpen(false)}
          onReady={(remote) => queuePhoneDocument(remote)}
        />
      ) : null}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message={paywallMessage}
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
