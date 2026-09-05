"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { MistakeQuestionGroup } from "@/lib/learning/mistake-notebook";
import { MistakeRunner } from "@/components/parity/mistake-runner";

/**
 * Yanlış defteri.
 *
 * İki hâl: liste ve tekrar. Listede konular ve kaçar soru beklediği; bir
 * konuya basınca o konunun soruları sırayla soruluyor. Soru-cevap ekranının
 * kendisi `MistakeRunner`'da — günün turu da aynı ekranı kullanıyor.
 */
export function MistakeNotebookView({
  groups,
  masteredCount,
}: {
  groups: MistakeQuestionGroup[];
  masteredCount: number;
}) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);

  const openCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.questions.length, 0),
    [groups],
  );

  const queue = useMemo(() => {
    if (!activeTopic) return [];
    return groups.find((g) => g.label === activeTopic)?.questions ?? [];
  }, [activeTopic, groups]);

  function startTopic(label: string) {
    setActiveTopic(label);
    setIndex(0);
    setSolvedCount(0);
  }

  function leave() {
    setActiveTopic(null);
  }

  // ---------- tekrar ekranı ----------

  if (activeTopic) {
    const current = queue[index];
    const done = index >= queue.length;

    return (
      <div className="ap-exam-page">
        <div className="ap-page-head">
          <h1 className="ap-page-title">{activeTopic}</h1>
          <button
            type="button"
            onClick={leave}
            className="self-start rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]"
          >
            Deftere dön
          </button>
        </div>

        {done || !current ? (
          <div className="astra-pay-card p-6 text-center">
            <p className="text-lg font-semibold text-[var(--astra-text)]">
              Bu turu bitirdin.
            </p>
            <p className="mt-2 text-sm text-[var(--astra-muted)]">
              {solvedCount
                ? `${solvedCount} soru defterden çıktı. Kalanlar bir sonraki tura kaldı — üst üste iki doğru gerekiyor.`
                : "Hiçbir soru henüz defterden çıkmadı. Üst üste iki doğru gerekiyor; bir tur daha at."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => startTopic(activeTopic)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Bir tur daha
              </button>
              <button
                type="button"
                onClick={leave}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]"
              >
                Deftere dön
              </button>
            </div>
          </div>
        ) : (
          <MistakeRunner
            key={current.id}
            question={current}
            position={index + 1}
            total={queue.length}
            onAnswered={(f) => {
              if (f.mastered) setSolvedCount((n) => n + 1);
            }}
            onNext={() => setIndex((i) => i + 1)}
            nextLabel={index + 1 >= queue.length ? "Turu bitir" : "Sonraki soru"}
          />
        )}
      </div>
    );
  }

  // ---------- liste ekranı ----------

  return (
    <div className="ap-exam-page">
      <div className="ap-page-head">
        <h1 className="ap-page-title">Yanlış defteri</h1>
      </div>

      <p className="text-sm text-[var(--astra-muted)]">
        Denemede ve quizde yanlış yaptığın sorular burada birikiyor. Bir soru
        defterden ancak <strong>üst üste iki kez</strong> doğru yaptığında
        çıkıyor — tek doğru şans olabilir.
      </p>

      {openCount === 0 ? (
        <div className="astra-pay-card mt-5 p-6 text-center">
          <p className="text-lg font-semibold text-[var(--astra-text)]">
            {masteredCount > 0 ? "Defterin şu an boş." : "Defterin henüz boş."}
          </p>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            {masteredCount > 0
              ? `Bekleyen soru kalmadı. Bugüne kadar ${masteredCount} soruyu defterden çıkardın.`
              : "Bir deneme sınavı ya da quiz çözdüğünde yanlışların buraya kendiliğinden düşecek."}
          </p>
          <Link
            href="/deneme-sinavlari"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Deneme çöz
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="astra-pay-card p-4">
              <p className="text-xs text-[var(--astra-muted)]">Bekleyen soru</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--astra-text)]">
                {openCount}
              </p>
            </div>
            <div className="astra-pay-card p-4">
              <p className="text-xs text-[var(--astra-muted)]">Defterden çıkan</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--astra-text)]">
                {masteredCount}
              </p>
            </div>
          </div>

          <Link
            href="/gunluk"
            className="astra-pay-card mt-3 flex items-center justify-between gap-4 p-4 transition-transform hover:scale-[1.01]"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--astra-text)]">
                Günün turu
              </span>
              <span className="mt-1 block text-xs text-[var(--astra-muted)]">
                Konulara dağıtılmış 10 soru, beş dakika
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-amber-400">
              Başla →
            </span>
          </Link>

          <div className="mt-5 flex flex-col gap-2">
            {groups.map((group) => {
              // Üç soruyu aşamamak artık soru tekrarıyla çözülmüyor: konu
              // anlaşılmamış demektir. Tekrar etmeye devam etmek yerine
              // anlatmaya davet ediyoruz.
              const stuck = group.questions.length >= 3;
              return (
                <div key={group.label} className="astra-pay-card p-4">
                  <button
                    type="button"
                    onClick={() => startTopic(group.label)}
                    className="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[var(--astra-text)]">
                        {group.label}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--astra-muted)]">
                        {group.questions.length} soru bekliyor
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-amber-400">
                      Tekrar et
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>

                  {stuck ? (
                    <Link
                      href={`/studio/anlat?topic=${encodeURIComponent(group.label)}`}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-[var(--astra-muted)] transition-colors hover:border-amber-500/50 hover:text-[var(--astra-text)]"
                    >
                      Bu konu sana zor geliyor — bir de sen anlat
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
