"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import {
  filterCalendar,
  formatDayLabel,
  monthGrid,
  toIsoDate,
  upcoming,
  type CalendarFilter,
  type CalendarItem,
} from "@/lib/learning/calendar";

const FILTERS: { id: CalendarFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "mine", label: "Etkinliklerim" },
  { id: "exams", label: "Sınavlar" },
];

const WEEKDAYS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

export function CalendarView({ items }: { items: CalendarItem[] }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    eventDate: toIsoDate(today),
    subject: "",
  });

  const visible = useMemo(() => filterCalendar(items, filter), [items, filter]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visible) {
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    }
    return map;
  }, [visible]);

  const grid = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );
  const next = useMemo(() => upcoming(visible, today).slice(0, 8), [visible, today]);
  const todayIso = toIsoDate(today);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  async function addEvent() {
    if (!form.title.trim()) {
      toast.error("Etkinliğe bir ad ver.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          eventDate: form.eventDate,
          subject: form.subject.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setAdding(false);
      setForm({ title: "", eventDate: toIsoDate(today), subject: "" });
      router.refresh();
    } catch {
      toast.error("Etkinlik eklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Etkinlik silinemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-exam-page space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Takvimim</h1>
        <button
          type="button"
          className="ap-cal-add"
          onClick={() => setAdding(true)}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Etkinlik ekle
        </button>
      </div>

      <div className="ap-cal-filters" role="tablist" aria-label="Takvim filtresi">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className="ap-cal-filter"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="ap-cal-card">
        <header className="ap-cal-month">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="ap-cal-weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="ap-cal-grid">
          {grid.map((iso) => {
            const dayItems = byDate.get(iso) ?? [];
            const inMonth = Number(iso.slice(5, 7)) - 1 === cursor.month;
            const isToday = iso === todayIso;
            const hasExam = dayItems.some((i) => i.kind === "exam");
            return (
              <div
                key={iso}
                className={[
                  "ap-cal-day",
                  inMonth ? "" : "ap-cal-day--muted",
                  isToday ? "ap-cal-day--today" : "",
                  dayItems.length ? "ap-cal-day--has" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={dayItems.map((i) => i.title).join(", ") || undefined}
              >
                <span>{Number(iso.slice(8, 10))}</span>
                {dayItems.length ? (
                  <em
                    className={hasExam ? "ap-cal-dot ap-cal-dot--exam" : "ap-cal-dot"}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="ap-cal-section-title">Yaklaşan</h2>
        {next.length ? (
          <ul className="ap-cal-list">
            {next.map((item) => (
              <li key={item.id} className="ap-cal-item">
                <span className="ap-cal-date">
                  <strong>{Number(item.date.slice(8, 10))}</strong>
                  <em>
                    {new Date(`${item.date}T00:00:00`).toLocaleDateString("tr-TR", {
                      month: "short",
                    })}
                  </em>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="ap-cal-item-title">
                    {item.prepId ? (
                      <Link href={`/deneme-sinavlari/${item.prepId}`}>{item.title}</Link>
                    ) : (
                      item.title
                    )}
                  </span>
                  <span className="ap-cal-item-meta">
                    {item.kind === "exam" ? "Sınav" : "Etkinlik"}
                    {item.subject ? ` · ${item.subject}` : ""} ·{" "}
                    {formatDayLabel(item.date, today)}
                  </span>
                </span>
                {item.kind === "personal" ? (
                  <button
                    type="button"
                    className="ap-cal-remove"
                    disabled={busy}
                    aria-label={`${item.title} etkinliğini sil`}
                    onClick={() => void removeEvent(item.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ap-upload-hint">
            Yaklaşan etkinlik yok. Sınav hazırlığı oluşturduğunda tarihi burada
            görünür.
          </p>
        )}
      </section>

      {adding ? (
        <div
          className="ap-hub-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Etkinlik ekle"
          onClick={() => setAdding(false)}
        >
          <div className="ap-upload-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ap-hub-head">
              <h2 className="ap-hub-title">Etkinlik ekle</h2>
              <button
                type="button"
                className="ap-hub-close"
                aria-label="Kapat"
                onClick={() => setAdding(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="ap-field">
              <span>Başlık</span>
              <input
                autoFocus
                value={form.title}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Örn. Matematik yazılısı"
              />
            </label>
            <label className="ap-field">
              <span>Tarih</span>
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              />
            </label>
            <label className="ap-field">
              <span>Ders (isteğe bağlı)</span>
              <input
                value={form.subject}
                maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Matematik"
              />
            </label>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              disabled={busy}
              onClick={() => void addEvent()}
            >
              {busy ? "Ekleniyor…" : "Ekle"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
