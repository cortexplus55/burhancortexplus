"use client";

import { useState, useTransition } from "react";
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

export function PlanTasks({ title, tasks }: { title: string; tasks: Task[] }) {
  const [state, setState] = useState(tasks);
  const [, startTransition] = useTransition();

  const done = state.filter((task) => task.completed).length;
  const progress = state.length ? (done / state.length) * 100 : 0;

  function toggle(taskId: string, completed: boolean) {
    setState((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, completed } : task)),
    );
    startTransition(async () => {
      await togglePlanTask(taskId, completed);
    });
  }

  return (
    <section className="astra-pay-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--astra-text)]">{title}</h3>
        <span className="text-xs text-[var(--astra-muted)]">
          {done} / {state.length} tamamlandı
        </span>
      </div>

      {state.length > 0 ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <ul className="mt-4 space-y-1">
        {state.map((task) => (
          <li key={task.id}>
            <label
              htmlFor={`task-${task.id}`}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-sm transition-colors",
                "hover:bg-[var(--astra-pill)]",
                task.completed && "opacity-80",
              )}
            >
              <Checkbox
                id={`task-${task.id}`}
                checked={task.completed}
                onCheckedChange={(value) => toggle(task.id, value === true)}
                className="mt-0.5 border-[var(--astra-border)] data-[state=checked]:border-[var(--astra-primary)] data-[state=checked]:bg-[var(--astra-primary)] data-[state=checked]:text-[#0a0a0a]"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[var(--astra-text)] transition-all duration-200",
                    task.completed && "line-through opacity-70",
                  )}
                >
                  {task.title}
                </span>
                {task.dueDate ? (
                  <span className="mt-0.5 block text-xs text-[var(--astra-muted)]">
                    {formatDateShort(task.dueDate)}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
