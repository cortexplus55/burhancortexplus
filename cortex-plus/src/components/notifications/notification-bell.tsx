"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { InAppNotification } from "@/lib/notifications/in-app";
import { NOTIFICATIONS_CHANGED_EVENT, type NotificationsChangedDetail } from "@/lib/notifications/client-events";
import { relativeTimeTr, sameOriginPath } from "@/lib/notifications/relative-time";
import { NotificationKindIcon } from "@/components/notifications/kind-icon";
import { cn } from "@/lib/utils";
import "@/styles/notification-bell.css";

/**
 * Bildirim çanı (Faz 6, 20 Kasım 2026): öğrenci kabuğunun üst çubuğunda, profil kapsülünün solunda; telefonda da.
 *
 * - Okunmamış sayısı açılışta, sekme öne gelince ve görünürken en çok dakikada bir sorulur (`?limit=0`, liste yok).
 *   Liste yalnız çan açılınca istenir. Sıkı yoklama yok; arka plandaki sekme hiç sormaz.
 * - Açılan pencere masaüstünde çanın altında 360 px, telefonda alttan tam genişlik. Esc ve dışarıya dokunuş kapatır;
 *   Esc'te odak çana döner. Pencere düğmenin hemen ardında: Tab sırası çandan pencereye geçer.
 * - Bildirime basınca okundu işaretlenir; bağlantısı varsa (yalnız sitenin kendi yolu) oraya gidilir.
 * - Okuma ve yazım sunucu uçlarından (`/api/notifications`, `/api/notifications/read`); tarayıcı tabloya dokunmaz.
 */

/** Okunmamış sayısının en sık yenilenme aralığı. */
export const UNREAD_REFRESH_MS = 60_000;
/** Aralık sayacı ile odak yenilemesi arasındaki küçük pay (zamanlayıcı birkaç ms erken çalışabilir). */
const REFRESH_SLACK_MS = 2_000;
const LIST_LIMIT = 20;

export function bellLabel(unread: number): string {
  return unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler";
}

export function badgeText(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}

/** Ekran okuyucunun okuduğu ad: başlık, gövde, zaman ve okunmamışsa bunu da söyler. */
export function itemLabel(item: InAppNotification, now: number): string {
  const parts = [item.title, item.body, relativeTimeTr(item.createdAt, now)].filter(Boolean);
  return `${parts.join(". ")}${item.isRead ? "" : ". Okunmamış"}`;
}

type ListState = "idle" | "loading" | "ready" | "error";

/**
 * Sekme içi son sayım: kabuk her sayfa geçişinde yeniden kurulur; sayı 60 sn içinde ikinci kez sorulmaz ve yeni sayfada
 * rozet hemen görünür. Yalnız tarayıcıda (etki ve olay işleyicilerinde) yazılır; tam sayfa yüklemesinde boştur.
 */
let tabCount: { unread: number; at: number } | null = null;

/** Testler için: sekme içi sayımı boşaltır. */
export function resetBellCountForTests() {
  tabCount = null;
}

const MARK_ERROR = "Okundu işaretlenemedi. Biraz sonra yeniden dene.";

async function postRead(body: { ids: string[] } | { all: true }): Promise<number | null> {
  const response = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`read_${response.status}`);
  const data = (await response.json().catch(() => null)) as { unread?: unknown } | null;
  return typeof data?.unread === "number" ? Math.max(0, data.unread) : null;
}

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const panelId = useId();
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Tam sayfa yüklemesinde sekme sayımı boştur (sunucu ile aynı ilk çizim); sayfa geçişinde son sayım hemen görünür.
  const [unread, setUnread] = useState(() => tabCount?.unread ?? 0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [state, setState] = useState<ListState>("idle");
  const [marking, setMarking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const remember = useCallback((value: number) => {
    const clean = Math.max(0, value);
    tabCount = { unread: clean, at: Date.now() };
    setUnread(clean);
  }, []);

  const refreshCount = useCallback(async () => {
    if (tabCount && Date.now() - tabCount.at < UNREAD_REFRESH_MS - REFRESH_SLACK_MS) return;
    // Aynı anda gelen odak ve sayaç tetiklemeleri ikinci istek açmasın.
    tabCount = { unread: tabCount?.unread ?? 0, at: Date.now() };
    try {
      const response = await fetch("/api/notifications?limit=0", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as { unread?: unknown } | null;
      if (typeof body?.unread === "number") remember(body.unread);
    } catch {
      /* ağ yoksa rozet son bilinen sayıda kalır */
    }
  }, [remember]);

  useEffect(() => {
    void refreshCount();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    const onChanged = (event: Event) => {
      const value = (event as CustomEvent<NotificationsChangedDetail>).detail?.unread;
      if (typeof value === "number") remember(value);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    const timer = window.setInterval(onVisible, UNREAD_REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.clearInterval(timer);
    };
  }, [refreshCount, remember]);

  const loadList = useCallback(async () => {
    setState("loading");
    setNotice(null);
    try {
      const response = await fetch(`/api/notifications?limit=${LIST_LIMIT}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`list_${response.status}`);
      const body = (await response.json()) as { items?: unknown; unread?: unknown };
      setItems(Array.isArray(body.items) ? (body.items as InAppNotification[]) : []);
      if (typeof body.unread === "number") remember(body.unread);
      setNow(Date.now());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [remember]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close(true);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  function toggle() {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    void loadList();
  }

  async function markAll() {
    const before = { items, unread };
    setMarking(true);
    setNotice(null);
    setItems((list) => list.map((item) => ({ ...item, isRead: true })));
    remember(0);
    try {
      const fresh = await postRead({ all: true });
      if (fresh !== null) remember(fresh);
    } catch {
      setItems(before.items);
      remember(before.unread);
      setNotice(MARK_ERROR);
    } finally {
      setMarking(false);
    }
  }

  function openItem(item: InAppNotification) {
    const target = sameOriginPath(item.actionUrl);
    if (!item.isRead) {
      const before = unread;
      setItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      remember(before - 1);
      postRead({ ids: [item.id] })
        .then((fresh) => {
          if (fresh !== null) remember(fresh);
        })
        .catch(() => {
          // Sayfa değişmediyse geri al; değiştiyse bir sonraki sayım doğrusunu getirir.
          if (target) return;
          setItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, isRead: false } : entry)));
          remember(before);
          setNotice(MARK_ERROR);
        });
    }
    if (target) {
      close(false);
      router.push(target);
    }
  }

  const hasUnread = unread > 0 || items.some((item) => !item.isRead);

  return (
    <div className={cn("cx-bell", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={cn("cx-bell-btn cx-glass", open && "is-open")}
        aria-label={bellLabel(unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <Bell aria-hidden />
        {unread > 0 ? (
          <span className="cx-bell-badge" aria-hidden data-testid="bell-badge">
            {badgeText(unread)}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="cx-bell-scrim" aria-hidden onClick={() => close(false)} />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="cx-bell-panel cx-popover cx-surface-2"
          >
            <div className="cx-bell-head">
              <h2 id={titleId} className="cx-bell-title">
                Bildirimler
              </h2>
              <button
                type="button"
                className="cx-bell-markall cx-weak"
                onClick={() => void markAll()}
                disabled={marking || !hasUnread}
                aria-label="Tümünü okundu işaretle"
              >
                <CheckCheck aria-hidden />
                <span>Tümünü okundu işaretle</span>
              </button>
            </div>

            {notice ? (
              <p role="alert" className="cx-bell-notice">
                {notice}
              </p>
            ) : null}

            <div className="cx-bell-body">
              {state === "error" && !items.length ? (
                <div className="cx-bell-empty">
                  <p>Bildirimler yüklenemedi.</p>
                  <button
                    type="button"
                    className="cx-bell-retry cx-glass"
                    onClick={() => void loadList()}
                    aria-label="Bildirimleri yeniden yükle"
                  >
                    Yeniden dene
                  </button>
                </div>
              ) : state === "loading" && !items.length ? (
                <ul className="cx-bell-list" aria-busy="true" aria-label="Bildirimler yükleniyor">
                  {[0, 1, 2].map((index) => (
                    <li key={index} className="cx-bell-skeleton cx-skeleton" />
                  ))}
                </ul>
              ) : items.length ? (
                <ul className="cx-bell-list">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn("cx-bell-item", !item.isRead && "is-unread")}
                        aria-label={itemLabel(item, now)}
                        onClick={() => openItem(item)}
                      >
                        <span className="cx-bell-item-icon">
                          <NotificationKindIcon kind={item.kind} />
                        </span>
                        <span className="cx-bell-item-text">
                          <span className="cx-bell-item-title">{item.title}</span>
                          {item.body ? <span className="cx-bell-item-body">{item.body}</span> : null}
                          <span className="cx-bell-item-time">{relativeTimeTr(item.createdAt, now)}</span>
                        </span>
                        {!item.isRead ? <span className="cx-bell-dot" aria-hidden /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="cx-bell-empty">
                  <BellOff aria-hidden />
                  <p className="cx-bell-empty-title">Bildirimin yok</p>
                  <p>Hesabınla ilgili güncellemeler burada görünecek.</p>
                </div>
              )}
            </div>

            <Link
              href="/bildirimler"
              className="cx-bell-all"
              aria-label="Bütün bildirimleri gör"
              onClick={() => close(false)}
            >
              Tümünü gör
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
