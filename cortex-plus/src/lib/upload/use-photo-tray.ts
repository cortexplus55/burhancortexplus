"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeImage } from "@/lib/upload/compress-image";
import { TRAY_THUMB_QUALITY, TRAY_THUMB_SIDE, movePage } from "@/lib/upload/photo-tray";

/** Tepsideki sayfa: özgün fotoğraf (yükleme onu küçültür) ve önizleme adresi. `thumb` null: önizleme hazırlanıyor. */
export type TrayPage = { id: string; file: File; thumb: string | null; broken: boolean };

export type PhotoTray = {
  pages: TrayPage[];
  add: (files: readonly File[]) => void;
  remove: (id: string) => void;
  move: (id: string, delta: -1 | 1) => void;
  /** Önizleme gösterilemedi (tarayıcı biçimi açamadı): yerine simge çizilir. */
  markBroken: (id: string) => void;
  /** Tepsideki fotoğraflar sırasıyla; tepsi boşalır, önizleme adresleri bırakılır. */
  take: () => File[];
  clear: () => void;
};

async function smallPreview(file: File): Promise<Blob | null> {
  const encoded = await encodeImage(file, { maxSide: TRAY_THUMB_SIDE, quality: TRAY_THUMB_QUALITY });
  return encoded?.blob ?? null;
}

function objectUrl(blob: Blob): string | null {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
}

function revoke(url: string) {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

/**
 * Sayfa tepsisinin durumu (20 Kasım 2026). Önizlemeler sırayla, küçük JPEG olarak hazırlanır (tam boy 12 MB
 * fotoğrafları aynı anda açmak telefonun belleğini taşırıyordu); tarayıcı fotoğrafı açamazsa (HEIC) dosyanın kendi
 * adresi denenir. Her adres sayfa kaldırılınca, tepsi yüklenince ya da bileşen kapanınca bırakılır.
 */
export function usePhotoTray(options: { preview?: (file: File) => Promise<Blob | null> } = {}): PhotoTray {
  const [pages, setPages] = useState<TrayPage[]>([]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  /** Bu kancanın açtığı adresler (sayfa kimliğiyle); başka hiçbir yer bırakmaz. */
  const urlsRef = useRef(new Map<string, string>());
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const counterRef = useRef(0);
  const previewRef = useRef(options.preview ?? smallPreview);
  previewRef.current = options.preview ?? smallPreview;

  const release = useCallback((id: string) => {
    const url = urlsRef.current.get(id);
    if (url) revoke(url);
    urlsRef.current.delete(id);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const urls = urlsRef.current;
    return () => {
      aliveRef.current = false;
      for (const url of urls.values()) revoke(url);
      urls.clear();
    };
  }, []);

  // Önizlemeler tek tek: sıradaki hazırlanmamış sayfa alınır, bitince durum yenilenir ve sıradakine geçilir.
  useEffect(() => {
    if (busyRef.current) return;
    const next = pages.find((page) => page.thumb === null && !page.broken);
    if (!next) return;
    busyRef.current = true;
    void (async () => {
      let url: string | null = null;
      try {
        const blob = await previewRef.current(next.file);
        url = objectUrl(blob ?? next.file);
      } catch {
        url = null;
      }
      busyRef.current = false;
      if (!aliveRef.current) {
        if (url) revoke(url);
        return;
      }
      const kept = pagesRef.current.some((page) => page.id === next.id);
      if (url && kept) urlsRef.current.set(next.id, url);
      else if (url) revoke(url);
      // Sayfa bu arada kaldırıldıysa da durum yenilenir: sıradaki sayfanın önizlemesi başlasın.
      setPages((current) =>
        current.map((page) => (page.id === next.id ? { ...page, thumb: kept ? url : null, broken: !url } : page)),
      );
    })();
  }, [pages]);

  const add = useCallback((files: readonly File[]) => {
    if (!files.length) return;
    setPages((current) => [
      ...current,
      ...files.map((file) => {
        counterRef.current += 1;
        return { id: `sayfa-${counterRef.current}`, file, thumb: null, broken: false };
      }),
    ]);
  }, []);

  const remove = useCallback(
    (id: string) => {
      release(id);
      setPages((current) => current.filter((page) => page.id !== id));
    },
    [release],
  );

  const move = useCallback((id: string, delta: -1 | 1) => {
    setPages((current) => movePage(current, id, delta));
  }, []);

  const markBroken = useCallback(
    (id: string) => {
      release(id);
      setPages((current) => current.map((page) => (page.id === id ? { ...page, thumb: null, broken: true } : page)));
    },
    [release],
  );

  const clear = useCallback(() => {
    for (const page of pagesRef.current) release(page.id);
    pagesRef.current = [];
    setPages([]);
  }, [release]);

  const take = useCallback(() => {
    const files = pagesRef.current.map((page) => page.file);
    clear();
    return files;
  }, [clear]);

  return { pages, add, remove, move, markBroken, take, clear };
}
