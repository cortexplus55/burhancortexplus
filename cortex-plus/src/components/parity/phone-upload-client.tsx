"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { compressImageForUpload } from "@/lib/documents/image-compress";
import { buildPhotoSet, splitSelection } from "@/lib/documents/photo-set-client";
import { createClient } from "@/lib/supabase/client";
import "@/styles/parity-shell.css";

/** Telefondan aynı anda kaç dosya gönderilir: mobil ağı boğmadan sırayı hızlandırır. */
const PHONE_SEND_LANES = 3;
/** "Yoğun" (429) cevabında imzalı yüklemenin yeniden denenmesi. */
const PREPARE_RETRIES = 5;

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [encoding, setEncoding] = useState<{ done: number; total: number } | null>(null);

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

  /** Büyük dosya (fotoğraf seti PDF'i) imzalı yüklemeyle: bayt doğrudan depoya, uç yalnız imzalar ve doğrular. */
  async function sendSigned(file: File): Promise<"ok" | "failed" | "stop"> {
    try {
      let prepareRes: Response;
      for (let attempt = 0; ; attempt += 1) {
        prepareRes = await fetch(`/api/uploads/phone/${token}/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        if (prepareRes.status !== 429 || attempt >= PREPARE_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
      }
      const prepared = (await prepareRes.json().catch(() => ({}))) as {
        documentId?: string; path?: string; token?: string; mimeType?: string; error?: string;
      };
      if (prepared.error === "expired") {
        setStatus("expired");
        return "stop";
      }
      if (prepared.error === "used") {
        setStatus("used");
        return "stop";
      }
      if (!prepareRes.ok || !prepared.documentId || !prepared.path || !prepared.token || !prepared.mimeType) return "failed";
      const { error } = await createClient().storage.from("documents").uploadToSignedUrl(prepared.path, prepared.token, file, {
        contentType: prepared.mimeType,
        upsert: false,
      });
      if (error) return "failed";
      const completeRes = await fetch(`/api/uploads/phone/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: prepared.documentId }),
      });
      const completed = (await completeRes.json().catch(() => ({}))) as { fileName?: string; error?: string };
      if (completeRes.ok) {
        setSent((current) => [...current, completed.fileName ?? file.name]);
        return "ok";
      }
      if (completed.error === "expired") {
        setStatus("expired");
        return "stop";
      }
      if (completed.error === "used") {
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
    // Hazırlıkta fotoğraflar tek belgede birleşir; ödevde (sohbet) her görsel ayrı gider.
    const { photos, others } = purpose === "hazirlik" ? splitSelection(files) : { photos: [] as File[], others: files };
    // Eski şemada kod tek dosya alır: fotoğraf seti varsa o (tek PDF), yoksa ilk dosya.
    const loose = many ? others : photos.length ? [] : others.slice(0, 1);
    setBusy(true);
    setFailed([]);
    let done = 0;
    let total = loose.length;
    let stopped = false;
    const report = () => setProgress({ done, total });
    report();
    const tally = (name: string, outcome: "ok" | "failed" | "stop") => {
      if (outcome === "stop") stopped = true;
      if (outcome === "failed") setFailed((current) => [...current, name]);
      done += 1;
      report();
    };
    const sendQueue = async (queue: File[]) => {
      let next = 0;
      const lane = async () => {
        while (!stopped && next < queue.length) {
          const file = queue[next]!;
          next += 1;
          tally(file.name, await sendFile(file));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PHONE_SEND_LANES, queue.length) }, lane));
    };
    const sendSet = async () => {
      if (!photos.length) return;
      const parts: Promise<void>[] = [];
      setEncoding({ done: 0, total: photos.length });
      const { leftovers } = await buildPhotoSet(photos, {
        // Hızlı başlatma: ilk sayfalar ayrı parça (bilgisayarda öğrenci onlarla hemen ilerler). Eski şemada tek parça.
        fastStart: many,
        onEncoded: (encoded, count) => setEncoding({ done: encoded, total: count }),
        onPart: (part) => {
          total += 1;
          report();
          parts.push((stopped ? Promise.resolve("stop" as const) : sendSigned(part.file)).then((outcome) => tally(part.file.name, outcome)));
        },
      });
      setEncoding(null);
      await Promise.all(parts);
      // Telefonun çözemediği fotoğraf (nadiren) tek dosya olarak gider; eski şemada set kurulamadıysa yalnız ilki.
      const rest = many ? leftovers : parts.length ? [] : leftovers.slice(0, 1);
      if (rest.length && !stopped) {
        total += rest.length;
        report();
        await sendQueue(rest);
      }
    };
    try {
      await Promise.all([sendSet(), sendQueue(loose)]);
      if (!many && !stopped) setStatus("used");
    } finally {
      setBusy(false);
      setProgress(null);
      setEncoding(null);
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
              {busy && encoding
                ? `📸 Fotoğraflar hazırlanıyor… ${encoding.done}/${encoding.total}`
                : busy && progress
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
