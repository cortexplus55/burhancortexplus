"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationRead } from "@/app/actions";
import { formatDate } from "@/lib/format";

export function NotificationItem({
  id,
  title,
  body,
  readAt,
  createdAt,
}: {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}) {
  const [read, setRead] = useState(Boolean(readAt));
  const [, startTransition] = useTransition();

  return (
    <li className={`px-4 py-3 ${read ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {body ? (
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(createdAt)}
          </p>
        </div>
        {!read ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setRead(true);
              startTransition(async () => {
                await markNotificationRead(id);
              });
            }}
          >
            Okundu
          </Button>
        ) : null}
      </div>
    </li>
  );
}
