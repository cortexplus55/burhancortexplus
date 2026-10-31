"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { compressImageForUpload } from "@/lib/documents/image-compress";
import { UploadError } from "@/lib/documents/upload-client";
import { useUniversalDocumentUpload } from "@/lib/documents/use-universal-upload";
import { photoSetProgressLine } from "@/lib/learning/exam-wizard-copy";
import { PhotoQualityPrompt } from "@/components/parity/photo-quality-prompt";
import { createClient } from "@/lib/supabase/client";
import "@/styles/parity-shell.css";

/** Telefondan aynı anda kaç dosya gönderilir: mobil ağı boğmadan sırayı hızlandırır. */
const PHONE_SEND_LANES = 3;
/** "Yoğun" (429) cevabında imzalı yüklemenin yeniden denenmesi. */
const PREPARE_RETRIES = 5;
/** Bundan büyük dosya imzalı yüklemeyle gider (Vercel istek gövdesi 4,5 MB). */
const FORM_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Telefondan yükleme sayfası (QR). 31 Ekim 2026: kod artık çok dosya alır (göç `20261031120000_phone_upload_many`);
 * öğrenci galeriden onlarca fotoğrafı birden seçer, her fotoğraf göndermeden önce küçültülür (`image-compress.ts`:
 * 3,5 MB → ~0,5 MB; sunucu gövde sınırı 4,5 MB) ve sayfa açık kaldıkça yenileri eklenebilir. Sunucu eski şemadaysa
 * ilk dosyadan sonra "kullanıldı" der; sayfa bunu eskisi gibi gösterir.
 *
 * Fotoğraf seti (31 Ekim 2026): hazırlık için seçilen fotoğraflar telefonda tek taranmış PDF'e girer
 * ("Ders Notu Fotoğrafları (N Sayfa)"); çok fotoğrafta ilk sayfalar ayrı küçük parça olarak hemen gider, bilgisayarda
 * öğrenci onlarla hemen ilerler. PDF 4,5 MB gövde sınırını aştığı için imzalı yüklemeyle doğrudan depoya gider.
 * Ödev (sohbet) amacında fotoğraflar eskisi gibi tek tek gider: sohbet görsel bekliyor.
 */
export function PhoneUploadClient({
  token,
  purpose = "odev",
}: {
  token: string;
  purpose?: "odev" | "hazirlik";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "used" | "expired" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [many, setMany] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/uploads/phone/${token}`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        setMany(payload.many === true);
        if (payload.valid) setStatus("ready");
        else if (payload.reason === "used") setStatus("used");
        else if (payload.reason === "expired") setStatus("expired");
        else setStatus("error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** Kod kapandıysa (süre, eski şema) gönderim durur; yeniden denenmez. */
  function closed(error: unknown): UploadError {
    if (error === "expired") setStatus("expired");
    if (error === "used") setStatus("used");
    return new UploadError(error === "expired" ? "Kodun süresi doldu." : "Bu kod kullanıldı.", 410, true);
  }

  /** Küçük dosya (küçültülmüş fotoğraf, belge) gövdeyle; kod kapandıysa duran hata. */
  async function sendForm(original: File): Promise<{ documentId: string }> {
    const file = await compressImageForUpload(original);
    const form = new FormData();
    form.set("file", file);
    let res: Response;
    try {
      res = await fetch(`/api/uploads/phone/${token}`, { method: "POST", body: form });
    } catch {
      throw new UploadError("Bağlantı koptu.", 0);
    }
    const payload = (await res.json().catch(() => ({}))) as { documentId?: string; fileName?: string; error?: string };
    if (res.ok && payload.documentId) {
      setSent((current) => [...current, payload.fileName ?? original.name]);
      return { documentId: payload.documentId };
    }
    if (payload.error === "expired" || payload.error === "used") throw closed(payload.error);
    throw new UploadError(payload.error ?? "Gönderilemedi.", res.status);
  }

  /** Büyük dosya (fotoğraf seti PDF'i, büyük PDF) imzalı yüklemeyle: bayt doğrudan depoya, uç yalnız imzalar. */
  async function sendSigned(file: File): Promise<{ documentId: string }> {
    let prepareRes: Response;
    try {
      for (let attempt = 0; ; attempt += 1) {
        prepareRes = await fetch(`/api/uploads/phone/${token}/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        if (prepareRes.status !== 429 || attempt >= PREPARE_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
      }
    } catch {
      throw new UploadError("Bağlantı koptu.", 0);
    }
    const prepared = (await prepareRes.json().catch(() => ({}))) as {
      documentId?: string; path?: string; token?: string; mimeType?: string; error?: string;
    };
    if (prepared.error === "expired" || prepared.error === "used") throw closed(prepared.error);
    if (!prepareRes.ok || !prepared.documentId || !prepared.path || !prepared.token || !prepared.mimeType) {
      throw new UploadError(prepared.error ?? "Gönderilemedi.", prepareRes.status);
    }
    let storageError = false;
    try {
      const { error } = await createClient().storage.from("documents").uploadToSignedUrl(prepared.path, prepared.token, file, {
        contentType: prepared.mimeType,
        upsert: false,
      });
      storageError = Boolean(error);
    } catch {
      storageError = true;
    }
    if (storageError) throw new UploadError("Dosya deposuna gönderilemedi.", 0);
    let completeRes: Response;
    try {
      completeRes = await fetch(`/api/uploads/phone/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: prepared.documentId }),
      });
    } catch {
      throw new UploadError("Bağlantı koptu.", 0);
    }
    const completed = (await completeRes.json().catch(() => ({}))) as { fileName?: string; error?: string };
    if (completeRes.ok) {
      setSent((current) => [...current, completed.fileName ?? file.name]);
      return { documentId: prepared.documentId };
    }
    if (completed.error === "expired" || completed.error === "used") throw closed(completed.error);
    throw new UploadError(completed.error ?? "Gönderilemedi.", completeRes.status);
  }

  /*
    Ortak yükleme motoru (31 Ekim 2026, use-universal-upload.ts): hazırlıkta fotoğraflar tek belgede (ilk sayfalar
    ayrı parça olarak hemen), 3 şerit, dosya başına 3 yeniden deneme, gönderim sürerken ekran uyanık. Ödevde (sohbet)
    görseller tek tek. Eski şemada kod tek dosya alır: set varsa o, yoksa ilk dosya. Belgeyi bilgisayar okutur.
  */
  const engine = useUniversalDocumentUpload(
    { lanes: PHONE_SEND_LANES, photoSet: purpose === "hazirlik", fastStart: many, single: !many },
    {
      upload: (file) => (file.size > FORM_UPLOAD_MAX_BYTES ? sendSigned(file) : sendForm(file)),
      process: async () => true,
    },
    // Bulanık / karanlık fotoğraf sorusu (Paket J3 #13): fotoğraf çoğunlukla burada, telefonda çekiliyor.
    { photoQuality: true },
  );

  async function sendFiles(list: FileList | null) {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setBusy(true);
    setFailed([]);
    try {
      const result = await engine.run(files);
      setFailed(result.failed);
      if (!many && !result.stopped && result.succeeded) setStatus("used");
    } finally {
      setBusy(false);
    }
  }

  const target = purpose === "hazirlik" ? "hazırlıkta" : "sohbette";

  return (
    <div className="cp-phone-page">
      <div className="cp-phone-card">
        <p className="cp-phone-brand">cortex Plus</p>
        <h1>{purpose === "hazirlik" ? "Ders notunu yükle" : "Ödev resmini yükle"}</h1>
        {status === "loading" ? <p>Bağlantı kontrol ediliyor…</p> : null}
        {status === "expired" ? (
          <p>
            {sent.length
              ? `${sent.length} dosya gönderildi. Kodun süresi doldu; daha fazlası için bilgisayardan yeniden aç.`
              : "Bu kodun süresi doldu. Bilgisayardan yeniden aç."}
          </p>
        ) : null}
        {status === "error" ? <p>Yükleme bağlantısı geçersiz.</p> : null}
        {status === "used" ? (
          <p>
            {sent.length
              ? `${sent[0]} gönderildi. Bilgisayarındaki ${target} görünecek.`
              : "Bu kod zaten kullanıldı."}
          </p>
        ) : null}
        {status === "ready" ? (
          <>
            <p>
              {purpose === "hazirlik"
                ? "PDF, Word, PowerPoint, JPG, PNG veya HEIC seç; istediğin kadar dosyayı birden seçebilirsin, bilgisayardaki hazırlığa eklenir."
                : "Kameradan veya galeriden görseli seç; masaüstündeki sohbete düşer."}
            </p>
            <button
              type="button"
              className="cp-upload-pick"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-2 inline h-4 w-4" aria-hidden />
              {busy && engine.photoProgress
                ? photoSetProgressLine(engine.photoProgress)
                : busy && engine.fileProgress
                ? `Gönderiliyor… ${engine.fileProgress.done}/${engine.fileProgress.total}`
                : busy
                ? "Gönderiliyor…"
                : sent.length
                  ? "Daha fazla dosya seç"
                  : "Dosya seç"}
            </button>
            <PhotoQualityPrompt request={engine.photoQuality} onAnswer={engine.answerPhotoQuality} />
            {sent.length ? (
              <p role="status" aria-live="polite">
                {`${sent.length} dosya gönderildi. Bilgisayarındaki ${target} görünecek.`}
              </p>
            ) : null}
            {failed.length ? (
              <p role="alert">{`${failed.length} dosya gönderilemedi: ${failed.slice(0, 3).join(", ")}. Yeniden seçebilirsin.`}</p>
            ) : null}
          </>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple={many}
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.heic,.heif,application/pdf,text/plain,.docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={(event) => {
            const files = event.target.files;
            void sendFiles(files).finally(() => {
              event.target.value = "";
            });
          }}
        />
      </div>
    </div>
  );
}
