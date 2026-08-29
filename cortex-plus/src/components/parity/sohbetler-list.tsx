"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { EmptyState } from "@/components/ui-kit/empty-state";

export type ConversationRow = {
  id: string;
  title: string | null;
  updatedAt: string;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function groupLabel(iso: string, now: number) {
  const time = new Date(iso).getTime();
  const today = startOfDay(new Date(now));
  const yesterday = today - 24 * 60 * 60 * 1000;
  if (time >= today) return "BUGÜN";
  if (time >= yesterday) return "DÜN";
  return "DAHA ESKİ";
}

export function SohbetlerList({ items }: { items: ConversationRow[] }) {
  const [query, setQuery] = useState("");
  const now = Date.now();

  const grouped = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const filtered = items.filter((item) =>
      (item.title ?? "Başlıksız sohbet").toLocaleLowerCase("tr").includes(q),
    );
    const buckets: { label: string; rows: ConversationRow[] }[] = [];
    for (const item of filtered) {
      const label = groupLabel(item.updatedAt, now);
      const last = buckets[buckets.length - 1];
      if (last?.label === label) last.rows.push(item);
      else buckets.push({ label, rows: [item] });
    }
    return buckets;
  }, [items, query, now]);

  return (
    <div className="ap-exam-page">
      <h1 className="mb-5 text-xl font-semibold">Geçmiş konuşmalar</h1>
      {items.length ? (
        <>
          <label className="ap-search">
            <Search className="h-4 w-4 opacity-70" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sohbet ara"
              aria-label="Sohbet ara"
            />
          </label>
          {grouped.length ? (
            grouped.map((group) => (
              <section key={group.label} className="ap-chat-group">
                <h2>{group.label}</h2>
                <ul>
                  {group.rows.map((conversation) => (
                    <li key={conversation.id}>
                      <Link
                        href={`/ogretmen?sohbet=${conversation.id}`}
                        className="astra-pay-card flex min-h-[52px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--astra-pill)]"
                      >
                        <span className="truncate text-sm font-medium text-[var(--astra-text)]">
                          {conversation.title ?? "Başlıksız sohbet"}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                          {new Intl.DateTimeFormat("tr-TR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(conversation.updatedAt))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="mt-6 text-sm text-[var(--astra-muted)]">Eşleşen sohbet yok.</p>
          )}
        </>
      ) : (
        <EmptyState
          variant="astra"
          icon={MessageCircle}
          title="Henüz sohbetin yok"
          description="AI öğretmenle ilk sorunu sorduğunda burada listelenir."
          actionHref="/ogretmen"
          actionLabel="Sohbet başlat"
        />
      )}
    </div>
  );
}
