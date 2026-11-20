"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Trash2 } from "lucide-react";
import {
  TRAY_COPY,
  trayCountLabel,
  trayHint,
  trayPageLabels,
  trayUploadLabel,
} from "@/lib/upload/photo-tray";
import type { PhotoTray } from "@/lib/upload/use-photo-tray";
import "@/styles/photo-page-tray.css";

/**
 * Kamera girişi (20 Kasım 2026): arka kamerayı açar, her çekim tepsiye bir sayfa ekler. Gizli; düğmeler `ref` ile
 * tıklatır. Aynı anda tek fotoğraf (kamerada çoklu seçim tarayıcıya göre seçiciyi açabiliyor).
 */
export const CameraCaptureInput = forwardRef<HTMLInputElement, { onFiles: (files: File[]) => void }>(
  function CameraCaptureInput({ onFiles }, ref) {
    return (
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-camera-input
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    );
  },
);

/**
 * Sayfa tepsisi (20 Kasım 2026, ürün sahibi: öğrenci 5-15 defter sayfasını telefonla çekiyor). Yükleme başlamadan
 * önce: küçük önizlemeler, sayfa numaraları, sıra düzeltme (önceye / sonraya), silme, "Bir sayfa daha ekle". "Sayfaları
 * yükle" tepsiyi sırasıyla ortak yükleme motoruna verir (`onUpload`): fotoğraf seti, bulanık fotoğraf sorusu, hızlı
 * başlatma ve otomatik devam olduğu gibi çalışır. Kurulum sihirbazı ve telefondan yükleme aynı bileşeni çizer.
 */
export function PhotoPageTray({
  tray,
  onAddPage,
  onUpload,
  busy = false,
}: {
  tray: PhotoTray;
  /** Kamerayı yeniden açar (`CameraCaptureInput`). */
  onAddPage: () => void;
  /** Tepsideki fotoğraflar sırasıyla; tepsi bu çağrıdan önce boşalır. */
  onUpload: (files: File[]) => void;
  busy?: boolean;
}) {
  const headingId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [announce, setAnnounce] = useState("");
  const count = tray.pages.length;
  const lastCount = useRef(count);

  // Yeni sayfa eklenince şerit sona kayar: çekilen sayfa görünsün (sayfanın kendisi kaymaz).
  useEffect(() => {
    if (count > lastCount.current) {
      const list = listRef.current;
      if (list && typeof list.scrollTo === "function") list.scrollTo({ left: list.scrollWidth, behavior: "smooth" });
      setAnnounce(trayCountLabel(count));
    }
    lastCount.current = count;
  }, [count]);

  if (!count) return null;

  /** Sıra değişince ya da sayfa silinince odak aynı yerde kalsın (klavye ve ekran okuyucu kaybolmasın). */
  function focusAfter(selector: string, fallback?: string) {
    requestAnimationFrame(() => {
      const list = listRef.current;
      const target = list?.querySelector<HTMLButtonElement>(selector);
      if (target && !target.disabled) return target.focus();
      const other = fallback ? list?.querySelector<HTMLButtonElement>(fallback) : null;
      if (other && !other.disabled) return other.focus();
      list?.closest("[data-photo-tray]")?.querySelector<HTMLButtonElement>("[data-tray-add]")?.focus();
    });
  }

  function move(id: string, delta: -1 | 1, from: number) {
    tray.move(id, delta);
    setAnnounce(`${from + 1}. sayfa ${from + 1 + delta}. sıraya taşındı`);
    const own = delta < 0 ? "earlier" : "later";
    const opposite = delta < 0 ? "later" : "earlier";
    focusAfter(`[data-page-id="${id}"] [data-tool="${own}"]`, `[data-page-id="${id}"] [data-tool="${opposite}"]`);
  }

  function remove(id: string, index: number) {
    const after = tray.pages[index + 1] ?? tray.pages[index - 1];
    tray.remove(id);
    setAnnounce(`${index + 1}. sayfa kaldırıldı. ${trayCountLabel(count - 1)}`);
    if (after) focusAfter(`[data-page-id="${after.id}"] [data-tool="remove"]`);
  }

  return (
    <section className="cx-ptray" aria-labelledby={headingId} data-photo-tray>
      <div className="cx-ptray-head">
        <h2 id={headingId} className="cx-ptray-title">
          {TRAY_COPY.title}
        </h2>
        <span className="cx-ptray-count">{trayCountLabel(count)}</span>
      </div>
      <p className="cx-ptray-hint">{trayHint(count)}</p>
      <ol className="cx-ptray-list" ref={listRef}>
        {tray.pages.map((page, index) => {
          const labels = trayPageLabels(index + 1);
          return (
            <li key={page.id} className="cx-ptray-page" data-page-id={page.id}>
              <div className="cx-ptray-thumb" data-ready={page.thumb ? "" : undefined}>
                {page.thumb && !page.broken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.thumb} alt={labels.image} onError={() => tray.markBroken(page.id)} />
                ) : (
                  <span className="cx-ptray-ph" role="img" aria-label={labels.image}>
                    <ImageIcon aria-hidden />
                  </span>
                )}
                <span className="cx-ptray-num" aria-hidden>
                  {index + 1}
                </span>
              </div>
              <div className="cx-ptray-tools">
                <button
                  type="button"
                  className="cx-ptray-tool"
                  data-tool="earlier"
                  aria-label={labels.earlier}
                  disabled={index === 0}
                  onClick={() => move(page.id, -1, index)}
                >
                  <ChevronLeft aria-hidden />
                </button>
                <button
                  type="button"
                  className="cx-ptray-tool"
                  data-tool="later"
                  aria-label={labels.later}
                  disabled={index === count - 1}
                  onClick={() => move(page.id, 1, index)}
                >
                  <ChevronRight aria-hidden />
                </button>
                <button
                  type="button"
                  className="cx-ptray-tool cx-ptray-tool--remove"
                  data-tool="remove"
                  aria-label={labels.remove}
                  onClick={() => remove(page.id, index)}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="cx-ptray-actions">
        <button type="button" className="cx-ptray-add" data-tray-add onClick={onAddPage}>
          {TRAY_COPY.addPage}
        </button>
        <button
          type="button"
          className="cx-ptray-upload"
          data-tray-upload
          disabled={busy}
          onClick={() => onUpload(tray.take())}
        >
          {busy ? TRAY_COPY.uploading : trayUploadLabel(count)}
        </button>
      </div>
      <button type="button" className="cx-ptray-cancel" onClick={tray.clear}>
        {TRAY_COPY.cancel}
      </button>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
