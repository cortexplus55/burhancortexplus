"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import {
  clearGuestDocuments,
  formatFileSize,
  readGuestMarker,
  takeGuestDocuments,
  type GuestMarker,
} from "@/lib/documents/guest-handoff";

/**
 * Ana sayfada (kayıttan önce) bırakılan dosyanın kurulumdaki karşılığı (11 Kasım 2026, kokpit).
 *
 * Misafir ana sayfanın tarama çekirdeğine kendi notunu bırakır; dosya sunucuya gitmez, tarayıcıda bekler
 * (`guest-handoff.ts`). Kayıt bitince öğrenci buraya gelir ve dosyasını burada bulur.
 *
 * - `variant="hint"`: materyal adımından önceki adımlarda tek satır: dosya kaybolmadı, materyal adımında bekliyor.
 * - `variant="offer"`: materyal adımında kart. "Bu dosyayı ekle" dosyayı sihirbazın bildiğimiz yükleme yoluna
 *   verir (`onTake`): hak, sayfa sınırı ve okuma başka her dosyayla aynı. Öğrencinin dokunuşu olmadan hiçbir şey
 *   yüklenmez (ortak bilgisayarda başkasının dosyası kendiliğinden hesaba girmesin).
 *
 * Tarayıcı dosyayı saklayamadıysa (gizli sekme, kota) kart bunu söyler: dosya aşağıdan yeniden seçilir. Bekleyen
 * dosya yoksa bileşen hiçbir şey çizmez.
 */
export function GuestDocumentOffer({
  variant,
  onTake,
  disabled = false,
}: {
  variant: "hint" | "offer";
  onTake?: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [marker, setMarker] = useState<GuestMarker | null>(null);
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    setMarker(readGuestMarker());
  }, []);

  if (!marker) return null;

  const label = marker.names.length === 1 ? `“${marker.names[0]}”` : `${marker.names.length} dosya`;

  if (variant === "hint") {
    return (
      <p className="apw-guest-hint" role="status" data-guest-document="hint">
        <FileText className="h-4 w-4" aria-hidden />
        <span>
          Ana sayfada seçtiğin {label} kaybolmadı: <strong>materyal adımında</strong> seni bekliyor.
        </span>
      </p>
    );
  }

  function dismiss() {
    setMarker(null);
    void clearGuestDocuments();
  }

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const files = await takeGuestDocuments();
      if (!files?.length) {
        setLost(true);
        return;
      }
      // Tek kullanımlık: dosya sihirbaza verildi, tarayıcıdaki kopya silinir.
      await clearGuestDocuments();
      setMarker(null);
      await onTake?.(files);
    } finally {
      setBusy(false);
    }
  }

  const unreadable = lost || !marker.stored;

  return (
    <div className="apw-guest-doc" role="group" aria-label="Ana sayfada seçtiğin dosya" data-guest-document="offer">
      <p className="apw-guest-doc-title">
        <FileText className="h-5 w-5" aria-hidden />
        <span>Ana sayfada seçtiğin {label} burada</span>
      </p>
      {marker.names.length > 1 || !unreadable ? (
        <ul className="apw-guest-doc-files">
          {marker.names.slice(0, 4).map((name, at) => (
            <li key={`${name}-${at}`}>
              <span>{name}</span>
              <span className="apw-guest-doc-size">{formatFileSize(marker.sizes[at] ?? 0)}</span>
            </li>
          ))}
          {marker.names.length > 4 ? <li>ve {marker.names.length - 4} dosya daha</li> : null}
        </ul>
      ) : null}
      {unreadable ? (
        <p className="apw-guest-doc-hint" role="status">
          Tarayıcın dosyayı saklayamadı; aşağıdan bir kez daha seçmen yeterli.
        </p>
      ) : (
        <p className="apw-guest-doc-hint">Dosya şu ana kadar cihazından çıkmadı; eklediğinde yüklenir ve okunur.</p>
      )}
      <div className="apw-guest-doc-row">
        {unreadable ? null : (
          <button type="button" className="apw-drop-pick apw-drop-pick--main" disabled={busy || disabled} onClick={() => void add()}>
            {busy ? "Ekleniyor…" : "Bu dosyayı ekle"}
          </button>
        )}
        <button type="button" className="apw-guest-doc-skip" onClick={dismiss}>
          {unreadable ? "Tamam" : "Vazgeç"}
        </button>
      </div>
    </div>
  );
}
