"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { PageShell } from "@/components/parity/page-shell";
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

  /*
    6 Kasım 2026: `window.prompt` / `window.confirm` Instagram, WhatsApp gibi uygulama içi tarayıcılarda
    açılmıyor ya da hemen `null` dönüyordu; ad değiştirme ve silme orada hiç çalışmıyordu. Şimdi satırın
    içinde: kalem → yazı alanı (Enter kaydeder, Esc vazgeçer), çöp kutusu → "Silinsin mi? Evet / Vazgeç".
  */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  function startRename(id: string, current: string | null) {
    setConfirmingId(null);
    setRowError(null);
    setEditingId(id);
    setDraft(current ?? "Yeni sohbet");
  }

  function cancelRename() {
    setEditingId(null);
    setDraft("");
  }

  async function saveRename(id: string) {
    const title = draft.trim();
    if (!title || busyId) return;
    setBusyId(id);
    setRowError(null);
    const failed = "Ad değiştirilemedi. Tekrar deneyebilirsin.";
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, title }),
      });
      if (!res.ok) {
        setRowError({ id, message: failed });
        toast.error(failed);
        return;
      }
      setRows((list) => list.map((row) => (row.id === id ? { ...row, title } : row)));
      cancelRename();
      router.refresh();
    } catch {
      const message = "Bağlantı sorunu; ad değiştirilemedi. Tekrar deneyebilirsin.";
      setRowError({ id, message });
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    setBusyId(id);
    setRowError(null);
    const failed = "Sohbet silinemedi. Tekrar deneyebilirsin.";
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, deleted: true }),
      });
      if (!res.ok) {
        setRowError({ id, message: failed });
        toast.error(failed);
        return;
      }
      setConfirmingId(null);
      setRows((list) => list.filter((row) => row.id !== id));
      router.refresh();
    } catch {
      const message = "Bağlantı sorunu; sohbet silinemedi. Tekrar deneyebilirsin.";
      setRowError({ id, message });
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell
      title="Geçmiş konuşmalar"
      actions={
        <Link href="/ogretmen" className="cx-page-btn cx-brand">
          Yeni sohbet
        </Link>
      }
    >
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
                  {group.rows.map((conversation) => {
                    const editing = editingId === conversation.id;
                    const confirming = confirmingId === conversation.id;
                    const busy = busyId === conversation.id;
                    const error = rowError?.id === conversation.id ? rowError.message : null;
                    return (
                      <li
                        key={conversation.id}
                        className="cs-pay-card mb-2 flex min-h-[52px] flex-wrap items-center gap-2 px-3 py-2"
                      >
                        {editing ? (
                          <input
                            autoFocus
                            value={draft}
                            disabled={busy}
                            maxLength={120}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveRename(conversation.id);
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            aria-label="Sohbet adı"
                            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-transparent px-2 py-1.5 text-sm text-[var(--cs-text)]"
                          />
                        ) : (
                          <Link
                            href={`/ogretmen?sohbet=${conversation.id}`}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--cs-text)]"
                          >
                            {conversation.title ?? "Başlıksız sohbet"}
                          </Link>
                        )}
                        {editing ? (
                          <>
                            <button
                              type="button"
                              disabled={busy || !draft.trim()}
                              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-[var(--cs-text)] hover:bg-white/5 disabled:opacity-50"
                              onClick={() => void saveRename(conversation.id)}
                            >
                              {busy ? "Kaydediliyor…" : "Kaydet"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs text-[var(--cs-muted)] hover:bg-white/5"
                              onClick={cancelRename}
                            >
                              Vazgeç
                            </button>
                          </>
                        ) : confirming ? (
                          <>
                            <span className="text-xs text-[var(--cs-muted)]">Silinsin mi?</span>
                            <button
                              type="button"
                              disabled={busy}
                              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-red-300 hover:bg-white/5 disabled:opacity-50"
                              onClick={() => void remove(conversation.id)}
                            >
                              {busy ? "Siliniyor…" : "Evet"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs text-[var(--cs-muted)] hover:bg-white/5"
                              onClick={() => setConfirmingId(null)}
                            >
                              Vazgeç
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="inline-grid size-10 place-items-center rounded-full text-[var(--cs-muted)] hover:bg-white/5"
                              aria-label="Yeniden adlandır"
                              onClick={() => startRename(conversation.id, conversation.title)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="inline-grid size-10 place-items-center rounded-full text-[var(--cs-muted)] hover:bg-white/5"
                              aria-label="Sohbeti sil"
                              onClick={() => {
                                cancelRename();
                                setRowError(null);
                                setConfirmingId(conversation.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </>
                        )}
                        {error ? (
                          <p role="alert" className="w-full text-xs text-red-300">
                            {error}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
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
    </PageShell>
  );
}
