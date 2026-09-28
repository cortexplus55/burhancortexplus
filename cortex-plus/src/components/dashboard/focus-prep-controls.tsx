"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LearningHubSwitchPrep, LearningHubUrgentChip } from "@/lib/learning/learning-hub";

async function setFocusPrep(prepId: string): Promise<boolean> {
  const res = await fetch("/api/learning/focus-prep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepId }),
  });
  return res.ok;
}

function daysLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "tarih yok";
  if (daysLeft < 0) return "geçti";
  if (daysLeft === 0) return "bugün";
  return `${daysLeft} gün`;
}

export function FocusPrepSwitch({
  preps,
  currentId,
}: {
  preps: LearningHubSwitchPrep[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (preps.length < 2) return null;

  const choose = (prepId: string) => {
    if (prepId === currentId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const ok = await setFocusPrep(prepId);
      if (ok) {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="min-h-[52px] rounded-2xl border border-white/15 px-3 py-2 text-xs font-semibold text-[var(--cs-muted)] transition-colors hover:border-white/30 hover:text-[var(--cs-text)] disabled:opacity-60"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        Sınavı değiştir
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1 min-w-[220px] max-h-64 overflow-y-auto rounded-xl border border-white/15 bg-[var(--cs-bg,#0f1419)] py-1 shadow-lg"
        >
          {preps.map((prep) => (
            <li key={prep.id} role="option" aria-selected={prep.id === currentId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(prep.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[var(--cs-text)] hover:bg-white/[0.06] disabled:opacity-60"
              >
                <span className="truncate">{prep.title}</span>
                <span className="shrink-0 text-xs text-[var(--cs-muted)]">
                  {daysLabel(prep.daysLeft)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FocusPrepUrgentLine({ chip }: { chip: LearningHubUrgentChip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchToUrgent = () => {
    startTransition(async () => {
      const ok = await setFocusPrep(chip.prepId);
      if (ok) router.refresh();
    });
  };

  return (
    <p className="text-center text-xs text-[var(--cs-muted)]">
      <span className="text-[var(--cs-text)]">{chip.title}</span>
      {" sınavına "}
      {chip.daysLeft === 0 ? "bugün" : `${chip.daysLeft} gün kaldı`}
      {" · "}
      <button
        type="button"
        disabled={pending}
        onClick={switchToUrgent}
        className="font-semibold text-amber-300/90 underline-offset-2 hover:underline disabled:opacity-60"
      >
        Geç
      </button>
    </p>
  );
}
