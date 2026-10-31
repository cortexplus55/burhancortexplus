"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  runUploadPipeline,
  type FileProgress,
  type PhotoProgress,
  type PipelineConfig,
  type PipelineHandlers,
  type PipelineResult,
} from "@/lib/documents/upload-engine";
import type { PhotoQualityChoice } from "@/lib/documents/photo-quality";

/** Ekrandaki bulanık / karanlık fotoğraf sorusu: işaretlenen fotoğrafların adları ve seçimdeki dosya sayısı. */
export type PhotoQualityRequest = { flagged: string[]; total: number };

type WakeLockLike = { released: boolean; release: () => Promise<void> };

/**
 * Yükleme ve okuma sürerken ekran kararmasın (31 Ekim 2026): telefon 30 sn'de ekranı kapatınca tarayıcı sekmeyi
 * dondurur, 100 fotoğraflık yükleme yarıda kalır. Tarayıcı izin vermezse (desteklemiyor, pil tasarrufu) sessizce
 * geçilir; sekme geri gelince kilit yeniden istenir (tarayıcı gizlenen sekmenin kilidini bırakır).
 */
export function useScreenAwake(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const wake = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } }).wakeLock;
    if (!wake) return;
    let lock: WakeLockLike | null = null;
    let done = false;
    const acquire = async () => {
      try {
        const next = await wake.request("screen");
        if (done) await next.release().catch(() => {});
        else lock = next;
      } catch {
        // İzin yok ya da sekme görünmüyor: yükleme yine sürer.
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !done && (!lock || lock.released)) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

/**
 * Ortak yükleme kancası: bütün yükleme kapıları (kurulum, telefon, materyal ekle, stüdyo) bunu kullanır. Motor
 * `upload-engine.ts`; kanca ilerleme durumunu tutar ve yükleme sürerken ekranı uyanık tutar. Yüzey yalnız
 * `process`'i (belgeyi okutmak, haritalamak, bağlamak) ve kendi sınırlarını verir.
 */
export function useUniversalDocumentUpload(
  config: PipelineConfig,
  handlers: PipelineHandlers,
  options: {
    /**
     * Bulanık / karanlık fotoğraf sorusu (31 Ekim 2026, Paket J3 #13): kanca soruyu açar, yüzey `PhotoQualityPrompt`'u
     * çizer. Soruyu çizmeyen yüzey bunu açmaz — yükleme cevabı bekler.
     */
    photoQuality?: boolean;
  } = {},
) {
  const [running, setRunning] = useState(0);
  const [photoProgress, setPhotoProgress] = useState<PhotoProgress | null>(null);
  const [fileProgress, setFileProgress] = useState<FileProgress | null>(null);
  const [photoQuality, setPhotoQuality] = useState<PhotoQualityRequest | null>(null);
  const answerRef = useRef<((choice: PhotoQualityChoice) => void) | null>(null);
  const configRef = useRef(config);
  const handlersRef = useRef(handlers);
  const qualityRef = useRef(options.photoQuality === true);
  configRef.current = config;
  handlersRef.current = handlers;
  qualityRef.current = options.photoQuality === true;
  useScreenAwake(running > 0);

  /** Öğrencinin "Yeniden çek" / "Yine de kullan" cevabı: bekleyen yükleme sürer. */
  const answerPhotoQuality = useCallback((choice: PhotoQualityChoice) => {
    const resolve = answerRef.current;
    answerRef.current = null;
    setPhotoQuality(null);
    resolve?.(choice);
  }, []);

  const run = useCallback(async (files: File[]): Promise<PipelineResult> => {
    setRunning((count) => count + 1);
    try {
      return await runUploadPipeline(
        files,
        configRef.current,
        {
          validate: (file) => handlersRef.current.validate?.(file) ?? null,
          upload: handlersRef.current.upload ? (file) => handlersRef.current.upload!(file) : undefined,
          onUploadStart: (item) => handlersRef.current.onUploadStart?.(item) ?? (() => {}),
          process: (input) => handlersRef.current.process(input),
          // Bulanık / karanlık fotoğraf sorusu (Paket J3 #13): yalnız soruyu çizen yüzeyde.
          reviewPhotos: qualityRef.current
            ? (flagged, all) =>
                new Promise<PhotoQualityChoice>((resolve) => {
                  // Önceki seçimin sorusu cevapsız kaldıysa o yükleme kilitlenmesin: olduğu gibi sürer.
                  answerRef.current?.("use");
                  answerRef.current = resolve;
                  setPhotoQuality({ flagged: flagged.map((file) => file.name), total: all.length });
                })
            : undefined,
        },
        { photos: setPhotoProgress, files: setFileProgress },
      );
    } finally {
      setRunning((count) => count - 1);
    }
  }, []);

  return { run, busy: running > 0, photoProgress, fileProgress, photoQuality, answerPhotoQuality };
}
