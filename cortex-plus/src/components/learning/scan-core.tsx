"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { formatFileSize } from "@/lib/documents/guest-handoff";
import { startMoment, type MomentHandle } from "@/lib/ui/moment";
import "@/styles/scan-core.css";

/**
 * Tarama çekirdeği, uygulamanın içi (C1 kurulumun materyal adımı, C2 ana ekranın "Not yükle" kapısı; 13 Kasım 2026).
 *
 * Misafir turundaki çekirdeğin (`landing-journey.css`, sıcak siyah palet) uygulama paletindeki karşılığı: ortada
 * logo (`CortexMark`), çevresinde halkalar. Durağan hâlde yalnız çekirdek ve soluk bir halka durur; hiçbir şey
 * kendiliğinden hareket etmez. Öğrenci dosya bırakınca ya da seçince bir "an" oynar (depo kararı 11): halkalar bir kez
 * dışa atar, çekirdeğin üstünden ışın geçer, seçilen dosyalar sırayla belirir. An en çok 2,5 sn; tıklama ya da
 * Enter / Space / Escape hemen bitirir; hareket azaltmada hiç oynamaz. An yalnız görseldir: yükleme anla aynı anda
 * başlar, hiçbir işlem anı beklemez.
 */

/** Tarama anının süresi (ms): `MOMENT_MAX_MS` (2,5 sn) altında. */
export const SCAN_CORE_MS = 2200;

/** "file": seçilen dosya (henüz okunmadı, dosya simgesi); "done": okunup hazır olan (onay işareti). */
export type ScanFinding = { id: string; text: string; kind?: "file" | "done" };

/** Anın bulguları: seçilen dosyaların adı ve boyutu (en çok üçü adıyla, kalanı sayıyla). Yeni söz yok. */
export function fileFindings(files: readonly Pick<File, "name" | "size">[], shown = 3): ScanFinding[] {
  const items: ScanFinding[] = files
    .slice(0, shown)
    .map((file, at) => ({ id: `${at}:${file.name}`, text: `${file.name} · ${formatFileSize(file.size)}`, kind: "file" }));
  if (files.length > shown) items.push({ id: "more", text: `ve ${files.length - shown} dosya daha`, kind: "file" });
  return items;
}

/** Çekirdeğin görseli; erişilebilirlik ağacında yok (anlamı yanındaki metin taşır). */
export function ScanCore({ playing, size = "m" }: { playing: boolean; size?: "s" | "m" }) {
  return (
    <span className="cx-scan-core" data-size={size} data-playing={playing ? "" : undefined} aria-hidden>
      <span className="cx-scan-core-rings">
        <span />
        <span />
        <span />
      </span>
      <span className="cx-scan-core-heart">
        <CortexMark size={size === "s" ? 28 : 34} />
        <span className="cx-scan-core-beam" />
      </span>
    </span>
  );
}

/**
 * Anın bulguları: yalnız elimizdeki gerçek değerler (dosya adı, boyutu, sayısı). Sırayla belirir; an bitince
 * çağıran yer bugünkü ilerleme satırlarına döner.
 */
export function ScanFindings({ items }: { items: ScanFinding[] }) {
  if (!items.length) return null;
  return (
    <ul className="cx-scan-finds" role="status" aria-live="polite" data-scan-findings>
      {items.map((item, at) => (
        <li key={item.id} className="cx-scan-find" style={{ ["--cx-scan-i" as string]: at }}>
          {item.kind === "file" ? (
            <FileText className="cx-scan-find-icon" data-kind="file" aria-hidden />
          ) : (
            <Check className="cx-scan-find-icon" strokeWidth={3} aria-hidden />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tarama anının durumu. `play(onDone)` anı başlatır; `onDone(skipped)` an bitince bir kez çağrılır (süre dolunca,
 * atlanınca ya da başka bir an başlayınca). Bileşen ekrandan kalkarsa an sessizce kapanır, `onDone` çağrılmaz.
 */
export function useScanMoment(durationMs: number = SCAN_CORE_MS) {
  const [playing, setPlaying] = useState(false);
  const handle = useRef<MomentHandle | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handle.current?.end();
      handle.current = null;
    };
  }, []);

  const play = useCallback(
    (onDone?: (skipped: boolean) => void) => {
      seq.current += 1;
      const run = seq.current;
      setPlaying(true);
      const started = startMoment(durationMs, (skipped) => {
        if (seq.current === run) {
          handle.current = null;
          if (alive.current) setPlaying(false);
        }
        if (alive.current) onDone?.(skipped);
      });
      if (!started.instant && seq.current === run) handle.current = started;
    },
    [durationMs],
  );

  const end = useCallback(() => handle.current?.end(), []);

  return { playing, play, end };
}
