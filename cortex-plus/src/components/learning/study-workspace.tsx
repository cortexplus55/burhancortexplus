"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PlanTasks } from "@/components/learning/plan-tasks";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
};

type Plan = {
  id: string;
  title: string;
  tasks: Task[];
};

type TabId = "plan" | "yol" | "hedef" | "takvim";

const TABS: { id: TabId; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "yol", label: "Çalışma yolu" },
  { id: "hedef", label: "Hedef" },
  { id: "takvim", label: "Takvim" },
];

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

export function StudyWorkspace({
  plans,
  generateSlot,
  emptySlot,
  targetScore,
}: {
  plans: Plan[];
  generateSlot: React.ReactNode;
  emptySlot: React.ReactNode;
  targetScore: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (["plan", "yol", "hedef", "takvim"].includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")
    : "plan") as TabId;
  const [goal, setGoal] = useState(String(targetScore ?? 80));
  const [saving, setSaving] = useState(false);
  const allTasks = plans.flatMap((plan) => plan.tasks);
  const calendar = useMemo(() => monthCells(new Date()), []);
  const dueDays = new Set(
    allTasks
      .map((task) => (task.dueDate ? new Date(task.dueDate).getDate() : null))
      .filter((day): day is number => day != null),
  );
  const doneDays = new Set(
    allTasks
      .filter((task) => task.completed && task.dueDate)
      .map((task) => new Date(task.dueDate as string).getDate()),
  );

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
    <div className="space-y-6">
      <div className="ap-exam-segment" role="tablist" aria-label="Çalışma görünümü">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn(
              "ap-exam-segment-btn",
              tab === item.id && "ap-exam-segment-btn--active",
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "plan" ? (
        <>
          {generateSlot}
          {plans.length ? plans.map((plan) => (
            <PlanTasks key={plan.id} title={plan.title} tasks={plan.tasks} />
          )) : emptySlot}
        </>
      ) : null}

      {tab === "yol" ? (
        <section className="ap-path">
          {allTasks.length ? (
            allTasks.map((task, index) => (
              <div
                key={task.id}
                className={cn("ap-path-node", task.completed && "ap-path-node--done")}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{task.title}</strong>
                  <em>{task.completed ? "Tamamlandı" : "Sırada"}</em>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--astra-muted)]">
              Önce bir plan veya sınav hazırlığı oluştur.
            </p>
          )}
        </section>
      ) : null}

      {tab === "hedef" ? (
        <section className="astra-pay-card space-y-3 p-4">
          <h2 className="font-semibold">Hedef puan</h2>
          <p className="text-sm text-[var(--astra-muted)]">
            Sınav hazırlığı çubuğundaki işaret bu puana göre konumlanır.
          </p>
          <input
            className="ap-goal-input"
            type="number"
            min={1}
            max={100}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button
            type="button"
            className="ap-exam-continue"
            disabled={saving}
            onClick={() => void saveGoal()}
          >
            Kaydet
          </button>
        </section>
      ) : null}

      {tab === "takvim" ? (
        <section className="ap-cal space-y-4">
          <div className="ap-exam-segment" role="tablist" aria-label="Takvim filtresi">
            <button
              type="button"
              className="ap-exam-segment-btn ap-exam-segment-btn--active"
              role="tab"
              aria-selected
            >
              Tümü
            </button>
            <button type="button" className="ap-exam-segment-btn" role="tab" aria-selected={false}>
              Etkinliklerim
            </button>
          </div>
          <h2>
            {new Intl.DateTimeFormat("tr-TR", {
              month: "long",
              year: "numeric",
            }).format(new Date(calendar.year, calendar.month, 1))}
          </h2>
          <div className="ap-cal-week">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="ap-cal-grid">
            {calendar.cells.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className={cn(
                  "ap-cal-cell",
                  day && dueDays.has(day) && "ap-cal-cell--due",
                  day && doneDays.has(day) && "ap-cal-cell--done",
                )}
              >
                {day ?? ""}
              </div>
            ))}
          </div>
          <ul className="ap-cal-list">
            {allTasks
              .filter((task) => task.dueDate)
              .map((task) => (
                <li key={task.id}>
                  <span>{task.dueDate}</span>
                  <em>{task.title}</em>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
