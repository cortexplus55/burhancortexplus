"use client";

import Link from "next/link";
import { useState } from "react";
import { BellOff, CheckCheck, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { NotificationKindIcon } from "@/components/notifications/kind-icon";
import type { InAppNotification } from "@/lib/notifications/in-app";
import { announceUnread } from "@/lib/notifications/client-events";
import { relativeTimeTr, sameOriginPath } from "@/lib/notifications/relative-time";
import { cn } from "@/lib/utils";
import "@/styles/notifications-page.css";

/**
 * /bildirimler listesi (Faz 6, 20 Kasım 2026): türün simgesi, başlık, gövde, zaman, bağlantı ve "okundu" işareti.
 * Liste sunucuda okunur (`listInAppNotifications`); okundu işareti `/api/notifications/read` ucundan. Zaman metni
 * sunucunun saatiyle (`now`) çizilir: tarayıcı aynı metni üretir.
 */

const MARK_ERROR = "Okundu işaretlenemedi. Biraz sonra yeniden dene.";

/** Okundu ucunu çağırır; çan rozeti aynı anda güncellensin diye güncel sayıyı duyurur. */
async function postRead(body: { ids: string[] } | { all: true }) {
  const response = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`read_${response.status}`);
  const data = (await response.json().catch(() => null)) as { unread?: unknown } | null;
  if (typeof data?.unread === "number") announceUnread(data.unread);
}

export function NotificationsList({
  initialItems,
  initialUnread,
  now,
}: {
  initialItems: InAppNotification[];
  initialUnread: number;
  now: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRead(ids: ReadonlySet<string> | "all", value: boolean) {
    setItems((list) => list.map((item) => (ids === "all" || ids.has(item.id) ? { ...item, isRead: value } : item)));
  }

  async function markAll() {
    const before = { items, unread };
    setBusy(true);
    setError(null);
    setRead("all", true);
    setUnread(0);
    try {
      await postRead({ all: true });
    } catch {
      setItems(before.items);
      setUnread(before.unread);
      setError(MARK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function markOne(item: InAppNotification) {
    if (item.isRead) return;
    setError(null);
    setRead(new Set([item.id]), true);
    setUnread((count) => Math.max(0, count - 1));
    try {
      await postRead({ ids: [item.id] });
    } catch {
      setRead(new Set([item.id]), false);
      setUnread((count) => count + 1);
      setError(MARK_ERROR);
    }
  }

  if (!items.length) {
    return <EmptyState title="Bildirimin yok" description="Hesabınla ilgili güncellemeler burada görünecek." icon={BellOff} />;
  }

  const hasUnread = unread > 0 || items.some((item) => !item.isRead);

  return (
    <div className="cx-nl">
      <div className="cx-nl-bar">
        <span className="cx-nl-count" aria-live="polite">
          {hasUnread ? `${Math.max(unread, items.filter((item) => !item.isRead).length)} okunmamış` : "Hepsi okundu"}
        </span>
        <button
          type="button"
          className="cx-nl-markall cx-glass"
          aria-label="Tümünü okundu işaretle"
          disabled={busy || !hasUnread}
          onClick={() => void markAll()}
        >
          <CheckCheck aria-hidden />
          Tümünü okundu işaretle
        </button>
      </div>
      {error ? (
        <p role="alert" className="cx-nl-error">
          {error}
        </p>
      ) : null}
      <ul className="cx-nl-list">
        {items.map((item) => {
          const target = sameOriginPath(item.actionUrl);
          return (
            <li key={item.id} className={cn("cx-nl-item", !item.isRead && "is-unread")}>
              <span className="cx-nl-icon">
                <NotificationKindIcon kind={item.kind} />
              </span>
              <div className="cx-nl-text">
                <p className="cx-nl-title">
                  {!item.isRead ? <span className="sr-only">Okunmamış: </span> : null}
                  {item.title}
                </p>
                {item.body ? <p className="cx-nl-body">{item.body}</p> : null}
                <p className="cx-nl-time">{relativeTimeTr(item.createdAt, now)}</p>
                {target || !item.isRead ? (
                  <div className="cx-nl-actions">
                    {target ? (
                      <Link
                        href={target}
                        className="cx-nl-open cx-weak"
                        aria-label={`Aç: ${item.title}`}
                        onClick={() => void markOne(item)}
                      >
                        Aç
                        <ChevronRight aria-hidden />
                      </Link>
                    ) : null}
                    {!item.isRead ? (
                      <button
                        type="button"
                        className="cx-nl-read cx-weak"
                        aria-label={`Okundu işaretle: ${item.title}`}
                        onClick={() => void markOne(item)}
                      >
                        Okundu işaretle
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {!item.isRead ? <span className="cx-nl-dot" aria-hidden /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
