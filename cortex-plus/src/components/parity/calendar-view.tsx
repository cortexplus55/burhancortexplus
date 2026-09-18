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
    <div className="cp-exam-page space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Takvimim</h1>
        <button
          type="button"
          className="cp-cal-add"
          onClick={() => setAdding(true)}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Etkinlik ekle
        </button>
      </div>

      <div className="cp-cal-filters" role="tablist" aria-label="Takvim filtresi">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className="cp-cal-filter"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="cp-cal-card">
        <header className="cp-cal-month">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="cp-cal-weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="cp-cal-grid">
          {grid.map((iso) => {
            const dayItems = byDate.get(iso) ?? [];
            const inMonth = Number(iso.slice(5, 7)) - 1 === cursor.month;
            const isToday = iso === todayIso;
            const hasExam = dayItems.some((i) => i.kind === "exam");
            return (
              <div
                key={iso}
                className={[
                  "cp-cal-day",
                  inMonth ? "" : "cp-cal-day--muted",
                  isToday ? "cp-cal-day--today" : "",
                  dayItems.length ? "cp-cal-day--has" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={dayItems.map((i) => i.title).join(", ") || undefined}
              >
                <span>{Number(iso.slice(8, 10))}</span>
                {dayItems.length ? (
                  <em
                    className={hasExam ? "cp-cal-dot cp-cal-dot--exam" : "cp-cal-dot"}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="cp-cal-section-title">Yaklaşan</h2>
        {next.length ? (
          <ul className="cp-cal-list">
            {next.map((item) => (
              <li key={item.id} className="cp-cal-item">
                <span className="cp-cal-date">
                  <strong>{Number(item.date.slice(8, 10))}</strong>
                  <em>
                    {new Date(`${item.date}T00:00:00`).toLocaleDateString("tr-TR", {
                      month: "short",
                    })}
                  </em>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="cp-cal-item-title">
                    {item.prepId ? (
                      <Link href={`/deneme-sinavlari/${item.prepId}`}>{item.title}</Link>
                    ) : (
                      item.title
                    )}
                  </span>
                  <span className="cp-cal-item-meta">
                    {item.kind === "exam" ? "Sınav" : "Etkinlik"}
                    {item.subject ? ` · ${item.subject}` : ""} ·{" "}
                    {formatDayLabel(item.date, today)}
                  </span>
                </span>
                {item.kind === "personal" ? (
                  <button
                    type="button"
                    className="cp-cal-remove"
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
          <p className="cp-upload-hint">
            Yaklaşan etkinlik yok. Sınav hazırlığı oluşturduğunda tarihi burada
            görünür.
          </p>
        )}
      </section>

      {adding ? (
        <div
          className="cp-hub-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Etkinlik ekle"
          onClick={() => setAdding(false)}
        >
          <div className="cp-upload-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cp-hub-head">
              <h2 className="cp-hub-title">Etkinlik ekle</h2>
              <button
                type="button"
                className="cp-hub-close"
                aria-label="Kapat"
                onClick={() => setAdding(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="cp-field">
              <span>Başlık</span>
              <input
                autoFocus
                value={form.title}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Örn. Matematik yazılısı"
              />
            </label>
            <label className="cp-field">
              <span>Tarih</span>
              <input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              />
            </label>
            <label className="cp-field">
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
              className="cp-exam-continue cp-exam-continue--primary"
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
