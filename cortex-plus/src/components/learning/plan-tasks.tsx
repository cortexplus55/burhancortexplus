"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { togglePlanTask } from "@/app/actions";

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

  function toggle(taskId: string, completed: boolean) {
    setState((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, completed } : task)),
    );
    startTransition(async () => {
      await togglePlanTask(taskId, completed);
    });
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {done} / {state.length} tamamlandı
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {state.map((task) => (
          <li key={task.id} className="flex items-start gap-2 text-sm">
            <Checkbox
              id={`task-${task.id}`}
              checked={task.completed}
              onCheckedChange={(value) => toggle(task.id, value === true)}
            />
            <label htmlFor={`task-${task.id}`} className="flex-1 cursor-pointer">
              <span className={task.completed ? "line-through opacity-70" : ""}>
                {task.title}
              </span>
              {task.dueDate ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {task.dueDate}
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
