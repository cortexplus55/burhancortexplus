"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Printer, Smartphone, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatDayLong } from "@/lib/format";
import { PAPER_LETTERS, PAPER_MAX_PHOTOS, isChoiceQuestion, type PaperQuestion } from "@/lib/learning/paper-exam";
import "@/styles/paper-exam.css";

type Stage = "sheet" | "solve" | "upload" | "reading";

/** Bir fotoğrafı 1600 piksele indirip JPEG'e çevirir; gövde 4,5 MB sınırının altında kalsın. */
async function compressPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const attempt = (edge: number, quality: number) => {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };
  let url = attempt(1600, 0.72);
  if (url.length > 850_000) url = attempt(1280, 0.6);
  if (url.length > 850_000) url = attempt(1024, 0.5);
  bitmap.close?.();
  return url;
}

function clock(sec: number): string {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Kâğıtta çöz (17 Ekim 2026, Astra'daki gibi). Çalışma kâğıdı → yazdır → Başla →
 * halka sayaç → "Bitir ve çözümlerini yükle" → fotoğraflar → okuma + not.
 */
export function PaperExamRunner({
  examId,
  prepId,
  title,
  questions,
  startAtUpload = false,
}: {
  examId: string;
  prepId: string;
  title: string;
  questions: PaperQuestion[];
  /** Telefonda QR'dan açıldıysa doğrudan yükleme adımı. */
  startAtUpload?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(startAtUpload ? "upload" : "sheet");
  const [printed, setPrinted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const [untimed, setUntimed] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const done = () => setPrinted(true);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  function print() {
    window.print();
    // Bazı tarayıcılar afterprint göndermiyor; yazdırma penceresi kapanınca Başla açılsın.
    window.setTimeout(() => setPrinted(true), 1500);
  }

  async function begin() {
    try {
      const res = await fetch("/api/learning/exam/session?action=start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setUntimed(payload.untimed === true);
      const left = typeof payload.timeLeftSec === "number" ? payload.timeLeftSec : null;
      setTimeLeft(left);
      setTotalTime(left);
      setStage("solve");
    } catch {
      toast.error("Deneme başlatılamadı. Yeniden dene.");
    }
  }

  useEffect(() => {
    if (stage !== "solve" || timeLeft == null || untimed) return;
    if (timeLeft <= 0) {
      toast.message("Süre doldu. Çözümlerini yükle.");
      setStage("upload");
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((value) => (value == null ? value : value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [stage, timeLeft, untimed]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files].filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;
    setAdding(true);
    try {
      const room = PAPER_MAX_PHOTOS - photos.length;
      if (list.length > room) toast.message(`En fazla ${PAPER_MAX_PHOTOS} fotoğraf; ilk ${Math.max(room, 0)} tanesi eklendi.`);
      const next: { id: string; url: string }[] = [];
      for (const file of list.slice(0, Math.max(room, 0))) {
        next.push({ id: crypto.randomUUID(), url: await compressPhoto(file) });
      }
      setPhotos((prev) => [...prev, ...next].slice(0, PAPER_MAX_PHOTOS));
    } catch {
      toast.error("Fotoğraf eklenemedi.");
    } finally {
      setAdding(false);
    }
  }, [photos.length]);

  async function phone() {
    try {
      const QRCode = (await import("qrcode")).default;
      const url = `${window.location.origin}/deneme-sinavlari/${prepId}/deneme/${examId}?kagit=1&yukle=1`;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
    } catch {
      toast.error("Kod oluşturulamadı.");
    }
  }

  async function submit() {
    setStage("reading");
    try {
      const read = await fetch("/api/learning/exam/paper-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, photos: photos.map((item) => item.url) }),
      });
      const body = (await read.json().catch(() => ({}))) as { answers?: Record<string, string | string[]>; unread?: number[] };
      if (!read.ok || !body.answers) throw new Error("read");
      if (body.unread?.length) {
        toast.message(`${body.unread.length} sorunun cevabı okunamadı; boş sayıldı (${body.unread.slice(0, 6).join(", ")}).`);
      }
      const graded = await fetch("/api/learning/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, answers: body.answers }),
      });
      if (!graded.ok) throw new Error("grade");
      router.push(`/deneme-sinavlari/${prepId}/sonuc?examId=${examId}`);
    } catch {
      toast.error("Fotoğraflar okunamadı. Daha net, tam sayfa fotoğraflarla yeniden dene.");
      setStage("upload");
    }
  }

  const ring = totalTime && timeLeft != null ? Math.max(0, Math.min(1, timeLeft / totalTime)) : 1;

  return (
    <div className="cp-paper">
      <Worksheet title={title} questions={questions} />

      {stage === "sheet" ? (
        <section className="cp-paper-step" aria-labelledby="paper-ready-title">
          <h1 id="paper-ready-title">Çalışma kâğıdın hazır</h1>
          <article className="cp-paper-preview" aria-label="Çalışma kâğıdı önizlemesi">
            <p className="cp-paper-preview-kicker">Çalışma kâğıdı</p>
            <h2>{title}</h2>
            <ol>
              {questions.slice(0, 3).map((question) => (
                <li key={question.id}>{question.text.slice(0, 90)}</li>
              ))}
            </ol>
            {questions.length > 3 ? <p className="cp-paper-preview-more">+ {questions.length - 3} soru daha</p> : null}
          </article>
          <button type="button" className="cp-paper-secondary" onClick={print}>
            <Printer className="h-4 w-4" aria-hidden />
            Yazdır
          </button>
          {printed ? null : <p className="cp-paper-hint">Önce çalışma kâğıdını yazdır.</p>}
          <button type="button" className="cp-paper-primary" disabled={!printed} onClick={() => void begin()}>
            Başla
          </button>
        </section>
      ) : null}

      {stage === "solve" ? (
        <section className="cp-paper-step" aria-labelledby="paper-solve-title">
          <h1 id="paper-solve-title" className="cp-paper-quiet">Kâğıt üzerinde çözüm</h1>
          <p className="cp-paper-lead">Bitirdiğinde çözümlerini değerlendirme için gönder.</p>
          <div className="cp-paper-ring" role="timer" aria-live="off">
            <svg viewBox="0 0 120 120" aria-hidden>
              <circle cx="60" cy="60" r="52" className="cp-paper-ring-track" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="cp-paper-ring-fill"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={(1 - ring) * 2 * Math.PI * 52}
              />
            </svg>
            <span>
              <strong>{untimed || timeLeft == null ? "Süresiz" : clock(timeLeft)}</strong>
              {untimed || timeLeft == null ? null : <small>kaldı</small>}
            </span>
          </div>
          <button type="button" className="cp-paper-primary" onClick={() => setStage("upload")}>
            Bitir ve çözümlerini yükle
          </button>
        </section>
      ) : null}

      {stage === "upload" || stage === "reading" ? (
        <section className="cp-paper-step" aria-labelledby="paper-upload-title">
          <h1 id="paper-upload-title">Çözdüğün çalışma kâğıdını yükle</h1>
          <p className="cp-paper-lead">
            Çözdüğün kâğıdın her sayfasının fotoğrafını çek. El yazını okuyup çözümlerini değerlendirir ve not veririz.
            En fazla {PAPER_MAX_PHOTOS} fotoğraf.
          </p>
          <div
            className={`cp-paper-drop${dragging ? " is-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <ImagePlus className="h-6 w-6" aria-hidden />
            <p>Fotoğrafları buraya bırak</p>
            <span>Sayfa başına bir fotoğraf, en fazla {PAPER_MAX_PHOTOS}.</span>
            <div className="cp-paper-drop-actions">
              <button type="button" className="cp-paper-secondary" disabled={adding || stage === "reading"} onClick={() => fileInput.current?.click()}>
                Dosya seç
              </button>
              <button type="button" className="cp-paper-secondary" disabled={adding || stage === "reading"} onClick={() => cameraInput.current?.click()}>
                <Camera className="h-4 w-4" aria-hidden />
                Fotoğraf çek
              </button>
              <button type="button" className="cp-paper-secondary" onClick={() => void phone()}>
                <Smartphone className="h-4 w-4" aria-hidden />
                Telefonundan yükle
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          {photos.length ? (
            <ul className="cp-paper-photos" aria-label="Eklenen fotoğraflar">
              {photos.map((item, index) => (
                <li key={item.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- yerel veri adresi */}
                  <img src={item.url} alt={`${index + 1}. sayfa`} />
                  <button
                    type="button"
                    aria-label={`${index + 1}. sayfayı kaldır`}
                    disabled={stage === "reading"}
                    onClick={() => setPhotos((prev) => prev.filter((photo) => photo.id !== item.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {adding ? <p className="cp-paper-hint">Fotoğraflar hazırlanıyor…</p> : null}
          <button
            type="button"
            className="cp-paper-primary"
            disabled={!photos.length || adding || stage === "reading"}
            onClick={() => void submit()}
          >
            {stage === "reading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Çözümlerin okunuyor…
              </>
            ) : photos.length ? (
              "Değerlendir"
            ) : (
              "En az bir fotoğraf ekle"
            )}
          </button>
        </section>
      ) : null}

      {qr ? (
        <div className="cp-paper-qr-back" role="dialog" aria-modal="true" aria-labelledby="paper-qr-title" onClick={() => setQr(null)}>
          <div className="cp-paper-qr" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="cp-paper-qr-close" aria-label="Kapat" onClick={() => setQr(null)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
            <h2 id="paper-qr-title">Telefonundan yükle</h2>
            <p>Kodu telefonunla tara; aynı hesapla açılan sayfada fotoğrafları çekip gönder.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR veri adresi */}
            <img src={qr} alt="Telefonda açılacak yükleme bağlantısının kodu" width={220} height={220} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Yalnız baskıda görünen çalışma kâğıdı (Astra'nın kâğıdı: başlık, tarih · soru sayısı,
 * Ad soyad / Tarih / Puan, yönerge, numaralı sorular; şıklı soruda kutucuk, yazılı
 * cevapta satır).
 */
function Worksheet({ title, questions }: { title: string; questions: PaperQuestion[] }) {
  return (
    <div className="cp-paper-sheet" aria-hidden>
      <header>
        <p className="cp-paper-sheet-brand">cortex</p>
        <h1>{title}</h1>
        <p>
          {formatDayLong(new Date().toISOString().slice(0, 10))} · {questions.length} soru
        </p>
        <div className="cp-paper-sheet-fields">
          <span>Ad soyad:</span>
          <span>Tarih:</span>
          <span>Puan:</span>
        </div>
      </header>
      <p className="cp-paper-sheet-rule">
        Tüm soruları cevapla. Aksi belirtilmedikçe her çoktan seçmeli soruda tek kutucuğu işaretle. Yer kalmazsa kendi
        kâğıdında devam et ve cevabının yanına soru numarasını yaz.
      </p>
      <ol>
        {questions.map((question) => (
          <li key={question.id}>
            <p className="cp-paper-sheet-q">{question.text}</p>
            {question.question_type === "multi_mcq" ? <p className="cp-paper-sheet-note">Birden fazla kutucuk işaretleyebilirsin.</p> : null}
            {isChoiceQuestion(question) ? (
              <ul className="cp-paper-sheet-options">
                {question.options.map((option, index) => (
                  <li key={`${question.id}-${index}`}>
                    <span className="cp-paper-sheet-box" />
                    <strong>{PAPER_LETTERS[index]}.</strong> {option}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={question.question_type === "open" ? "cp-paper-sheet-lines is-long" : "cp-paper-sheet-lines"} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
