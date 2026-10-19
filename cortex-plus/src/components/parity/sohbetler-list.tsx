"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { addDays, istanbulDay } from "@/lib/istanbul-day";

export type ConversationRow = {
  id: string;
  title: string | null;
  updatedAt: string;
};

/*
  Gün Türkiye takvimiyle ve sunucunun verdiği tek "şimdi"yle hesaplanır (20 Ekim 2026). Eskiden
  `setHours(0, 0, 0, 0)` sunucuda UTC gününü, tarayıcıda Türkiye gününü veriyordu; 00:00–03:00
  arasında güncellenen sohbette iki taraf farklı başlık yazınca React sayfayı hata verip baştan
  çiziyordu (#418).
*/
export function groupLabel(iso: string, nowIso: string): "BUGÜN" | "DÜN" | "DAHA ESKİ" {
  const day = istanbulDay(new Date(iso));
  const today = istanbulDay(new Date(nowIso));
  if (day >= today) return "BUGÜN";
  if (day === addDays(today, -1)) return "DÜN";
  return "DAHA ESKİ";
}

export function SohbetlerList({ items, now }: { items: ConversationRow[]; now: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(items);

  const grouped = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const filtered = rows.filter((item) =>
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
  }, [rows, query, now]);

  async function rename(id: string, current: string | null) {
    const next = window.prompt("Sohbet adı", current ?? "Yeni sohbet");
    if (next == null) return;
    const title = next.trim();
    if (!title) return;
    const res = await fetch("/api/ai/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id, title }),
    });
    if (!res.ok) {
      toast.error("Ad değiştirilemedi. Tekrar deneyebilirsin.");
      return;
    }
    setRows((list) =>
      list.map((row) => (row.id === id ? { ...row, title } : row)),
    );
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Bu sohbeti silmek istiyor musun?")) return;
    const res = await fetch("/api/ai/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id, deleted: true }),
    });
    if (!res.ok) {
      toast.error("Sohbet silinemedi. Tekrar deneyebilirsin.");
      return;
    }
    setRows((list) => list.filter((row) => row.id !== id));
    router.refresh();
  }

  return (
    <div className="cp-exam-page">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Geçmiş konuşmalar</h1>
        <Link
          href="/ogretmen"
          className="rounded-xl bg-action px-4 py-2 text-sm font-bold text-action-foreground"
        >
          Yeni sohbet
        </Link>
      </div>
      {rows.length ? (
        <>
          <label className="cp-search">
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
              <section key={group.label} className="cp-chat-group">
                <h2>{group.label}</h2>
                <ul>
                  {group.rows.map((conversation) => (
                    <li
                      key={conversation.id}
                      className="cs-pay-card mb-2 flex min-h-[52px] items-center gap-2 px-3 py-2"
                    >
                      <Link
                        href={`/ogretmen?sohbet=${conversation.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--cs-text)]"
                      >
                        {conversation.title ?? "Başlıksız sohbet"}
                      </Link>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-[var(--cs-muted)] hover:bg-white/5"
                        aria-label="Yeniden adlandır"
                        onClick={() =>
                          void rename(conversation.id, conversation.title)
                        }
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-[var(--cs-muted)] hover:bg-white/5"
                        aria-label="Sohbeti sil"
                        onClick={() => void remove(conversation.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="mt-6 text-sm text-[var(--cs-muted)]">
              Aramanla eşleşen sohbet yok.
            </p>
          )}
        </>
      ) : (
        <EmptyState
          variant="parity"
          icon={MessageCircle}
          illustration="bos-sohbet"
          title="Henüz sohbetin yok"
          description="AI Öğretmen ile ilk sorununu sor."
          actionHref="/ogretmen"
          actionLabel="Yeni sohbet"
        />
      )}
    </div>
  );
}
