"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { compressImageForUpload } from "@/lib/documents/image-compress";
import "@/styles/parity-shell.css";

/** Telefondan aynı anda kaç dosya gönderilir: mobil ağı boğmadan sırayı hızlandırır. */
const PHONE_SEND_LANES = 3;

/**
 * Telefondan yükleme sayfası (QR). 31 Ekim 2026: kod artık çok dosya alır (göç `20261031120000_phone_upload_many`);
 * öğrenci galeriden onlarca fotoğrafı birden seçer, her fotoğraf göndermeden önce küçültülür (`image-compress.ts`:
 * 3,5 MB → ~0,5 MB; sunucu gövde sınırı 4,5 MB) ve sayfa açık kaldıkça yenileri eklenebilir. Sunucu eski şemadaysa
 * ilk dosyadan sonra "kullanıldı" der; sayfa bunu eskisi gibi gösterir.
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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

  /** Bir dosyayı gönderir; kod kapandıysa (süre, eski şema) "stop". */
  async function sendFile(original: File): Promise<"ok" | "failed" | "stop"> {
    const file = await compressImageForUpload(original);
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch(`/api/uploads/phone/${token}`, { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent((current) => [...current, payload.fileName ?? original.name]);
        return "ok";
      }
      if (payload.error === "expired") {
        setStatus("expired");
        return "stop";
      }
      if (payload.error === "used") {
        setStatus("used");
        return "stop";
      }
      return "failed";
    } catch {
      return "failed";
    }
  }

  async function sendFiles(list: FileList | null) {
    const files = list ? [...list] : [];
    if (!files.length) return;
    // Eski şemada kod tek dosya alır: yalnız ilki gider.
    const queue = many ? files : files.slice(0, 1);
    setBusy(true);
    setFailed([]);
    let done = 0;
    let next = 0;
    let stopped = false;
    setProgress({ done, total: queue.length });
    const lane = async () => {
      while (!stopped && next < queue.length) {
        const file = queue[next]!;
        next += 1;
        const outcome = await sendFile(file);
        if (outcome === "stop") stopped = true;
        if (outcome === "failed") setFailed((current) => [...current, file.name]);
        done += 1;
        setProgress({ done, total: queue.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PHONE_SEND_LANES, queue.length) }, lane));
      if (!many && !stopped) setStatus("used");
    } finally {
      setBusy(false);
      setProgress(null);
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
              {busy && progress
                ? `Gönderiliyor… ${progress.done}/${progress.total}`
                : sent.length
                  ? "Daha fazla dosya seç"
                  : "Dosya seç"}
            </button>
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
