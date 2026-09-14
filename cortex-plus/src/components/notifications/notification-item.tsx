"use client";

import { useState, useTransition } from "react";
import { markNotificationRead } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationItem({
  id,
  title,
  body,
  readAt,
  createdAt,
  tone = "default",
}: {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  tone?: "default" | "parity";
}) {
  const [read, setRead] = useState(Boolean(readAt));
  const [, startTransition] = useTransition();
  const parity = tone === "parity";

  return (
    <li
      className={cn(
        parity ? "cs-pay-card p-4" : "px-4 py-3",
        read && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {body ? (
            <p
              className={cn(
                "mt-1 text-sm",
                parity ? "text-[var(--cs-muted)]" : "text-muted-foreground",
              )}
            >
              {body}
            </p>
          ) : null}
          <p
            className={cn(
              "mt-1 text-xs",
              parity ? "text-[var(--cs-muted)]" : "text-muted-foreground",
            )}
          >
            {formatDate(createdAt)}
          </p>
        </div>
        {!read ? (
          <button
            type="button"
            className={
              parity
                ? "rounded-full border border-[var(--cs-border)] px-3 py-1.5 text-xs text-[var(--cs-muted)] hover:bg-[var(--cs-pill)]"
                : "rounded-md border px-3 py-1.5 text-xs"
            }
            onClick={() => {
              setRead(true);
              startTransition(async () => {
                await markNotificationRead(id);
              });
            }}
          >
            Okundu
          </button>
        ) : null}
      </div>
    </li>
  );
}

