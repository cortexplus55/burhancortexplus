"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { BookmarkPlus, Check } from "lucide-react";
import { Markdown } from "@/components/markdown";

/** "Eklendi" yazısı okunsun diye pencere bu kadar bekleyip kapanır. */
export const RECAP_ADDED_CLOSE_MS = 1100;
export const RECAP_DECK_ENDPOINT = "/api/review/deck";

type AddState = { kind: "idle" } | { kind: "saving" } | { kind: "added"; line: string } | { kind: "error"; line: string };

/**
 * Ders sonu özeti (öğretmen v3): sohbetten çıkarken açılan kısa alt pencere. "Bugün öğrendiklerin", en çok üç madde,
 * "Tekrar desteme ekle" ve "Kapat". Pencere çıkışı engellemez: nasıl kapanırsa kapansın (Kapat, Esc, dışarı dokunuş,
 * eklendikten sonra) çıkış sürer (`onClosed`). Hareket azaltmada animasyonsuz (CSS).
 */
export function TeacherV3Recap({ items, onClosed }: { items: string[]; onClosed: () => void }) {
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<AddState>({ kind: "idle" });
  const closedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function finish() {
    if (closedRef.current) return;
    closedRef.current = true;
    setOpen(false);
    onClosed();
  }

  async function add() {
    if (state.kind === "saving" || state.kind === "added") return;
    setState({ kind: "saving" });
    try {
      const response = await fetch(RECAP_DECK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: items }),
      });
      const data = (await response.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!response.ok) {
        setState({ kind: "error", line: data.error ?? "Şu an eklenemedi; biraz sonra yeniden dene." });
        return;
      }
      setState({ kind: "added", line: (data.added ?? 0) > 0 ? "Eklendi" : "Zaten destende" });
      timerRef.current = window.setTimeout(finish, RECAP_ADDED_CLOSE_MS);
    } catch {
      setState({ kind: "error", line: "Bağlantı hatası; yeniden dene." });
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) finish();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="cx-v3-sheet-backdrop" />
        <Dialog.Popup className="cx-v3-sheet" data-testid="teacher-v3-recap">
          <Dialog.Title className="cx-v3-sheet-title">Bugün öğrendiklerin</Dialog.Title>
          <ol className="cx-v3-sheet-list">
            {items.map((item, index) => (
              <li key={`${index}-${item.slice(0, 24)}`}>
                <span className="cx-v3-sheet-num" aria-hidden>
                  {index + 1}
                </span>
                <div className="cx-v3-md">
                  <Markdown content={item} variant="parity" />
                </div>
              </li>
            ))}
          </ol>
          <div className="cx-v3-sheet-actions">
            <button
              type="button"
              className="cx-v3-sheet-add"
              disabled={state.kind === "saving" || state.kind === "added"}
              aria-busy={state.kind === "saving" || undefined}
              onClick={() => void add()}
            >
              {state.kind === "added" ? <Check aria-hidden /> : <BookmarkPlus aria-hidden />}
              <span>{state.kind === "added" ? state.line : state.kind === "saving" ? "Ekleniyor…" : "Tekrar desteme ekle"}</span>
            </button>
            <Dialog.Close className="cx-v3-sheet-close">Kapat</Dialog.Close>
          </div>
          {state.kind === "added" ? (
            <p className="sr-only" role="status">
              {state.line}
            </p>
          ) : null}
          {state.kind === "error" ? (
            <p className="cx-v3-sheet-error" role="alert">
              {state.line}
            </p>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
