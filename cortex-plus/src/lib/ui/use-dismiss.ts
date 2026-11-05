"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Kendi çizdiğimiz pencereler için ortak kapanış davranışı (6 Kasım 2026, UX akış turu): on bir pencere
 * Esc'e tepki vermiyordu ve kapanınca odak sayfanın başına düşüyordu (klavye ve ekran okuyucu kullanıcısı
 * açtığı düğmeyi yeniden arıyordu).
 *
 * - `open` iken Esc `onClose`'u çağırır (geri çağrı her çizimde güncel tutulur).
 * - Açılış anında odaktaki öğe saklanır; pencere kapanınca (ya da bileşen kalkınca) odak ona döner.
 * - `initialFocus` verilirse açılışta o öğeye odaklanılır.
 *
 * Görünüme dokunmaz; yalnız klavye ve odak.
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  options: { initialFocus?: RefObject<HTMLElement | null>; escape?: boolean } = {},
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const initialFocus = options.initialFocus;
  const escape = options.escape ?? true;

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null;

    if (initialFocus?.current) {
      initialFocus.current.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (!escape || event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open, initialFocus, escape]);
}
