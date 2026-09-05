"use client";

import { useState } from "react";
import Link from "next/link";
import type { MistakeQuestion } from "@/lib/learning/mistake-notebook";
import { MistakeRunner } from "@/components/parity/mistake-runner";

/**
 * Günün turu.
 *
 * Sorular sunucuda seçilip donduruluyor; buranın işi sadece sırayla sormak ve
 * sonunda günün özetini vermek. Bittiğinde tekrar başlatma düğmesi yok:
 * "bugünü bitirdim" ancak bir kez olabilecek bir şeyse anlam taşıyor. Daha
 * çalışmak isteyen deftere gidiyor.
 */
export function DailyDrillView({
  drillId,
  questions,
  answeredCount,
  correctCount,
  completed,
}: {
  drillId: string;
  questions: MistakeQuestion[];
  answeredCount: number;
  correctCount: number;
  completed: boolean;
}) {
  // Gün içinde geri dönen öğrenci kaldığı yerden devam ediyor.
  const [index, setIndex] = useState(completed ? questions.length : answeredCount);
  const [correct, setCorrect] = useState(correctCount);

  const total = questions.length;
  const current = questions[index];
  const done = completed || index >= total || !current;

  if (done) {
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="ap-exam-page">
        <div className="ap-page-head">
          <h1 className="ap-page-title">Bugünü bitirdin</h1>
        </div>

        <div className="astra-pay-card p-6 text-center">
          <p className="text-4xl font-bold text-[var(--astra-text)]">
            {correct} / {total}
          </p>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            {score >= 80
              ? "Defterin eriyor. Yarın yenileri gelir."
              : score >= 40
                ? "Fena değil. Kalanlar defterinde bekliyor, istersen şimdi devam et."
                : "Bugün zorlandın — bu normal, defter zaten en çok takıldığın soruları tutuyor."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/yanlislarim"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Deftere git
            </Link>
            <Link
              href="/ogretmen"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]"
            >
              Ana ekrana dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-exam-page">
      <div className="ap-page-head">
        <h1 className="ap-page-title">Günün turu</h1>
      </div>

      {/* İlerleme çubuğu: turun sonu görünsün diye. Kaç soru kaldığını
          bilmeyen öğrenci bırakıyor. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Günün turu ilerlemesi"
      >
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${total ? (index / total) * 100 : 0}%` }}
        />
      </div>

      <MistakeRunner
        key={current.id}
        question={current}
        position={index + 1}
        total={total}
        drillId={drillId}
        onAnswered={(f) => {
          if (f.correct) setCorrect((n) => n + 1);
        }}
        onNext={() => setIndex((i) => i + 1)}
        nextLabel={index + 1 >= total ? "Turu bitir" : "Sonraki soru"}
      />
    </div>
  );
}
