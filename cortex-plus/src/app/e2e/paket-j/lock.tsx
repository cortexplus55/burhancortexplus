"use client";

import { useState } from "react";
import { FirstTopicLockCard } from "@/components/parity/first-topic-lock";

/** Beklemesiz kilit (Paket J takip #1): yolda 🔒 rozetli adım; tıklayınca kart anında, istek yok. */
export function LockFixture({ completed }: { completed: boolean }) {
  const [open, setOpen] = useState(false);
  const label = completed ? "Kilitli adım (1. konu bitti)" : "Kilitli adım (1. konu sürüyor)";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${label}, Plus'ta`}>
        <span data-testid="path-plan-lock" aria-hidden>
          🔒
        </span>
        {label}
      </button>
      <FirstTopicLockCard
        prepId="e2e-prep"
        open={open}
        onClose={() => setOpen(false)}
        summary={
          completed
            ? { title: "Birinci konu", done: 4, total: 4, lessonsDone: 2, bestScore: 75, completed: true }
            : { title: "Birinci konu", done: 1, total: 4, lessonsDone: 1, bestScore: null, completed: false }
        }
      />
    </>
  );
}
