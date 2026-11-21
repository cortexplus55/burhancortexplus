"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { EllipsisVertical } from "lucide-react";
import { MORE_COMMANDS } from "@/lib/teacher/more-commands";

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
}

/**
 * "⋮ Daha fazla" (öğretmen v3): yazma kapsülünün sol üstündeki küçük hap. Dokununca yukarı doğru sade bir menü açılır:
 * altı özel ders komutu (dokunulan komutun metni öğrencinin mesajı olarak gider). "Yanıtları sesli oku" anahtarı üst
 * çubukta (21 Kasım 2026). Esc ve dışarı dokunuş kapatır, odak hapa döner; ok tuşları, Home ve End ile gezilir.
 */
export function TeacherV3More({
  disabled,
  onCommand,
}: {
  disabled?: boolean;
  onCommand: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menuItems(menuRef.current)[0]?.focus());
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function onMenuKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const list = menuItems(menuRef.current);
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % list.length;
    else if (event.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    list[next]?.focus();
  }

  return (
    <div className="cx-v3-more-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="cx-v3-more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <EllipsisVertical aria-hidden />
        <span>Daha fazla</span>
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} className="cx-v3-menu" role="menu" aria-label="Daha fazla" onKeyDown={onMenuKey}>
          {MORE_COMMANDS.map((command) => (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="cx-v3-menu-item"
              onClick={() => {
                close();
                onCommand(command.prompt);
              }}
            >
              <span>{command.label}</span>
              <span className="cx-v3-menu-go" aria-hidden>
                ▸
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
