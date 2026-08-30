"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Route,
  Target,
} from "lucide-react";
import { PlanTasks } from "@/components/learning/plan-tasks";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import "@/styles/study-plan.css";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
};

type Plan = {
  id: string;
  title: string;
  status?: string | null;
  tasks: Task[];
};

type TabId = "plan" | "yol" | "hedef" | "takvim";

const TABS: { id: TabId; label: string; icon: typeof ListChecks }[] = [
  { id: "plan", label: "Plan", icon: ListChecks },
  { id: "yol", label: "Yol", icon: Route },
  { id: "hedef", label: "Hedef", icon: Target },
  { id: "takvim", label: "Takvim", icon: CalendarDays },
];

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

function startOfMonday(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const pad = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - pad);
  return next;
}

function sameDay(value: string | Date | null | undefined, day: Date) {
  if (!value) return false;
  const date = typeof value === "string" ? new Date(value) : value;
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function monthCells(anchor: Date) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: startPad }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return { year, month, cells };
}

function ProgressRing({
  value,
  size = 76,
  stroke = 7,
}: {
  value: number;
  size?: number;
  stroke?: number;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ap-plan-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f4ae0b"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="ap-plan-ring-label">{pct}%</span>
    </div>
  );
}

export function StudyWorkspace({
  plans,
  generateSlot,
  targetScore,
}: {
  plans: Plan[];
  generateSlot: React.ReactNode;
  targetScore: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);
  const tab = (["plan", "yol", "hedef", "takvim"].includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")
    : "plan") as TabId;
  const [goal, setGoal] = useState(String(targetScore ?? 80));
  const [saving, setSaving] = useState(false);
  const [calScope, setCalScope] = useState<"all" | "events">("all");
  const [anchor, setAnchor] = useState(() => new Date());
  const allTasks = plans.flatMap((plan) => plan.tasks);
  const doneCount = allTasks.filter((task) => task.completed).length;
  const progress = allTasks.length ? (doneCount / allTasks.length) * 100 : 0;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  const weekStart = startOfMonday(now ?? new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    return day;
  });
  const thisWeekDue = now
    ? allTasks.filter((task) => {
        if (!task.dueDate || task.completed) return false;
        const due = new Date(task.dueDate);
        const end = new Date(weekStart);
        end.setDate(weekStart.getDate() + 7);
        return due >= weekStart && due < end;
      }).length
    : 0;
  const calendarTasks =
    calScope === "events"
      ? allTasks.filter((task) => task.dueDate && !task.completed)
      : allTasks.filter((task) => task.dueDate);
  const calendar = useMemo(() => monthCells(anchor), [anchor]);
  const dueDays = new Set(
    calendarTasks
      .map((task) => (task.dueDate ? new Date(task.dueDate) : null))
      .filter((day): day is Date => day != null)
      .filter((day) => day.getFullYear() === calendar.year && day.getMonth() === calendar.month)
      .map((day) => day.getDate()),
  );
  const doneDays = new Set(
    allTasks
      .filter((task) => task.completed && task.dueDate)
      .map((task) => new Date(task.dueDate as string))
      .filter((day) => day.getFullYear() === calendar.year && day.getMonth() === calendar.month)
      .map((day) => day.getDate()),
  );
  const todayDay =
    now && now.getFullYear() === calendar.year && now.getMonth() === calendar.month
      ? now.getDate()
      : null;
  const goalValue = Math.min(100, Math.max(1, Number(goal) || 0));

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "plan") params.delete("tab");
    else params.set("tab", next);
    const q = params.toString();
    router.replace(q ? `?${q}` : "/calisma-plani", { scroll: false });
  }

  async function saveGoal() {
    setSaving(true);
    try {
      const res = await fetch("/api/learning/exam-prep/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetScore: Number(goal) }),
      });
      if (!res.ok) toast.error("Hedef kaydedilemedi.");
      else {
        toast.success("Hedef puan güncellendi.");
        router.refresh();
      }
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("ap-plan-page", isPlus && "ap-plan-page--plus")}>
      <div className="ap-plan-ambient" aria-hidden />

      <header className="ap-plan-hero">
        <div>
          <div className="ap-plan-world" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p className="ap-plan-kicker">Çalışma planı</p>
          <h1 className="ap-plan-title">Haftanı yönet. Hedefini tut.</h1>
          <p className="ap-plan-lead">
            Görevlerini üret, yolu takip et, takvimde işaretle — sınav hazırlığı tek sahnede.
          </p>
        </div>
        <aside className="ap-plan-score">
          <ProgressRing value={progress} />
          <div className="ap-plan-score-copy">
            <strong>{allTasks.length ? "Plan ilerliyor" : "Sahne boş"}</strong>
            <span>
              {allTasks.length
                ? `${doneCount} / ${allTasks.length} görev tamamlandı`
                : "İlk planını üretince halka dolmaya başlar."}
            </span>
          </div>
        </aside>
      </header>

      <div className="ap-plan-stats">
        <div className="ap-plan-stat">
          <em>Plan</em>
          <strong>{plans.length}</strong>
        </div>
        <div className="ap-plan-stat">
          <em>Bu hafta</em>
          <strong>{thisWeekDue}</strong>
        </div>
        <div className="ap-plan-stat">
          <em>Hedef</em>
          <strong>{targetScore ?? "—"}</strong>
        </div>
      </div>

      <div className="ap-plan-weekstrip" aria-label="Bu hafta" suppressHydrationWarning>
        {weekDays.map((day) => {
          const has = allTasks.some((task) => sameDay(task.dueDate, day));
          const done = allTasks.some((task) => task.completed && sameDay(task.dueDate, day));
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "ap-plan-weekday",
                Boolean(now) && sameDay(now, day) && "is-today",
                has && "has-due",
                done && "is-done",
              )}
            >
              <span>{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
              <strong>{day.getDate()}</strong>
            </div>
          );
        })}
      </div>

      <div className="ap-plan-tabs" role="tablist" aria-label="Çalışma görünümü">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn("ap-plan-tab", tab === item.id && "ap-plan-tab--on")}
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "plan" ? (
        <>
          <section className="ap-plan-compose">
            <div className="ap-plan-compose-head">
              <div>
                <h2>Yeni plan oluştur</h2>
                <p>Hedefini yaz; haftalara bölünmüş, ölçülebilir görevler oluşsun.</p>
              </div>
            </div>
            {generateSlot}
          </section>
          {plans.length ? (
            plans.map((plan) => (
              <PlanTasks
                key={plan.id}
                title={plan.title}
                status={plan.status}
                tasks={plan.tasks}
              />
            ))
          ) : (
            <div className="ap-plan-empty">
              <div className="ap-plan-world" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <h2>Henüz planın yok</h2>
              <p>Hedefini yazarak ilk çalışma planını oluştur.</p>
            </div>
          )}
        </>
      ) : null}

      {tab === "yol" ? (
        <section className="ap-plan-card ap-plan-path">
          {allTasks.length ? (
            allTasks.map((task, index) => (
              <div
                key={task.id}
                className={cn("ap-plan-node", task.completed && "is-done")}
              >
                <i>{index + 1}</i>
                <div>
                  <strong>{task.title}</strong>
                  <em>{task.completed ? "Tamamlandı" : "Sırada"}</em>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--ap-muted)]">
              Önce bir plan veya sınav hazırlığı oluştur.
            </p>
          )}
        </section>
      ) : null}

      {tab === "hedef" ? (
        <section className="ap-plan-goal">
          <h2>Hedef puan</h2>
          <p>Sınav hazırlığı çubuğundaki işaret bu puana göre konumlanır.</p>
          <div className="ap-plan-goal-stage">
            <div className="ap-plan-goal-dial" aria-hidden>
              <svg viewBox="0 0 168 168">
                <circle
                  cx="84"
                  cy="84"
                  r="70"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="12"
                />
                <circle
                  cx="84"
                  cy="84"
                  r="70"
                  fill="none"
                  stroke="#f4ae0b"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 70}
                  strokeDashoffset={2 * Math.PI * 70 * (1 - goalValue / 100)}
                />
              </svg>
              <b>{goalValue}</b>
            </div>
            <div className="space-y-3">
              <label className="sr-only" htmlFor="plan-goal">
                Hedef puan
              </label>
              <input
                id="plan-goal"
                className="ap-goal-input"
                type="number"
                min={1}
                max={100}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
              <button
                type="button"
                className="ap-plan-cta w-full"
                disabled={saving}
                onClick={() => void saveGoal()}
              >
                {saving ? "Kaydediliyor…" : "Hedefi kaydet"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "takvim" ? (
        <section className="ap-plan-cal">
          <div className="ap-plan-cal-head">
            <h2>
              {new Intl.DateTimeFormat("tr-TR", {
                month: "long",
                year: "numeric",
              }).format(new Date(calendar.year, calendar.month, 1))}
            </h2>
            <div className="ap-plan-cal-nav">
              <button
                type="button"
                aria-label="Önceki ay"
                onClick={() =>
                  setAnchor(new Date(calendar.year, calendar.month - 1, 1))
                }
              >
                <ChevronLeft className="mx-auto h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Sonraki ay"
                onClick={() =>
                  setAnchor(new Date(calendar.year, calendar.month + 1, 1))
                }
              >
                <ChevronRight className="mx-auto h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="ap-plan-filters" role="tablist" aria-label="Takvim filtresi">
            <button
              type="button"
              className={cn("ap-plan-filter", calScope === "all" && "is-on")}
              role="tab"
              aria-selected={calScope === "all"}
              onClick={() => setCalScope("all")}
            >
              Tümü
            </button>
            <button
              type="button"
              className={cn("ap-plan-filter", calScope === "events" && "is-on")}
              role="tab"
              aria-selected={calScope === "events"}
              onClick={() => setCalScope("events")}
            >
              Etkinliklerim
            </button>
          </div>
          <div className="ap-plan-cal-week">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="ap-plan-cal-grid">
            {calendar.cells.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className={cn(
                  "ap-plan-cal-cell",
                  !day && "is-empty",
                  day && todayDay === day && "is-today",
                  day && dueDays.has(day) && "is-due",
                  day && doneDays.has(day) && "is-done",
                )}
              >
                {day ?? ""}
              </div>
            ))}
          </div>
          <ul className="ap-plan-cal-list">
            {calendarTasks.length ? (
              calendarTasks.map((task) => (
                <li key={task.id}>
                  <em>{task.title}</em>
                  <span>{formatDateShort(task.dueDate)}</span>
                </li>
              ))
            ) : (
              <li>
                <em>Bu görünümde tarihli görev yok.</em>
                <span />
              </li>
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
