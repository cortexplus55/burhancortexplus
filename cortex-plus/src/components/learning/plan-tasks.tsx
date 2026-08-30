"use client";

import { useMemo, useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { togglePlanTask } from "@/app/actions";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
};

function startOfMonday(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const pad = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - pad);
  return next;
}

function groupLabel(dueDate: string | null) {
  if (!dueDate) return "Tarihsiz";
  const due = new Date(dueDate);
  const now = new Date();
  const week = startOfMonday(now);
  const next = new Date(week);
  next.setDate(week.getDate() + 7);
  const after = new Date(next);
  after.setDate(next.getDate() + 7);
  if (due >= week && due < next) return "Bu hafta";
  if (due >= next && due < after) return "Gelecek hafta";
  if (due < week) return "Geçmiş";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(due);
}

export function PlanTasks({
  title,
  tasks,
  status,
}: {
  title: string;
  tasks: Task[];
  status?: string | null;
}) {
  const [state, setState] = useState(tasks);
  const [, startTransition] = useTransition();

  const done = state.filter((task) => task.completed).length;
  const progress = state.length ? (done / state.length) * 100 : 0;
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of state) {
      const key = groupLabel(task.dueDate);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [state]);

  function toggle(taskId: string, completed: boolean) {
    setState((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, completed } : task)),
    );
    startTransition(async () => {
      await togglePlanTask(taskId, completed);
    });
  }

  return (
    <section className="ap-plan-card">
      <div className="ap-plan-card-head">
        <h3 className="ap-plan-card-title">{title}</h3>
        <div className="ap-plan-card-meta">
          {status === "active" ? <span className="ap-plan-badge">Aktif</span> : null}
          <span>
            {done} / {state.length} tamamlandı
          </span>
        </div>
      </div>

      {state.length > 0 ? (
        <div
          className="ap-plan-progress"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {groups.map(([label, items]) => (
        <div key={label} className="ap-plan-group">
          <p className="ap-plan-group-label">{label}</p>
          <ul>
            {items.map((task) => (
              <li key={task.id}>
                <label
                  htmlFor={`task-${task.id}`}
                  className={cn("ap-plan-task", task.completed && "is-done")}
                >
                  <Checkbox
                    id={`task-${task.id}`}
                    checked={task.completed}
                    onCheckedChange={(value) => toggle(task.id, value === true)}
                    className="mt-0.5 border-[var(--ap-border)] data-[state=checked]:border-[var(--ap-gold)] data-[state=checked]:bg-[var(--ap-gold)] data-[state=checked]:text-[#0a0a0a] data-checked:border-[var(--ap-gold)] data-checked:bg-[var(--ap-gold)] data-checked:text-[#0a0a0a]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="ap-plan-task-title">{task.title}</span>
                    {task.dueDate ? (
                      <span className="ap-plan-task-due">
                        {" "}
                        {formatDateShort(task.dueDate)}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
