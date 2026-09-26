"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

type Topic = {
  id: string;
  label: string;
  outOfScope?: boolean;
  examHeavy?: boolean;
  weightPercent?: number | null;
};

export function MockExamSetup({
  prepId,
  topics,
  formatSummary,
  isAdmin,
  allocationPreview,
}: {
  prepId: string;
  topics: Topic[];
  formatSummary: string | null;
  isAdmin: boolean;
  allocationPreview: Array<{ topicLabel: string; count: number; examHeavy: boolean }>;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"all" | "topics">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set(topics.map((t) => t.id)));
  const [preset, setPreset] = useState<"short" | "standard" | "real">(
    formatSummary ? "real" : "standard",
  );
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const creditNote = isAdmin
    ? "Kurucu hesabı: bu deneme kredinden düşmez."
    : `Bu deneme ${CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits} kredi kullanır. Değerlendirme dahildir.`;

  const preview = useMemo(() => {
    if (scope === "all") return allocationPreview;
    const labels = new Set(
      topics.filter((t) => selected.has(t.id) && !t.outOfScope).map((t) => t.label),
    );
    return allocationPreview.filter((row) => labels.has(row.topicLabel));
  }, [scope, selected, topics, allocationPreview]);

  async function start() {
    setLoading(true);
    setProgress(["Konular okunuyor…"]);
    try {
      const res = await fetch("/api/learning/exam-prep/mock-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          preset,
          scope,
          topicIds: scope === "topics" ? [...selected] : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          payload.error === "insufficient_credits"
            ? "Kredin yetersiz."
            : "Deneme şu anda hazırlanamadı. Kredin iade edildi.",
        );
        setLoading(false);
        return;
      }
      if (payload.note) toast.message(payload.note);
      setProgress((p) => [...p, "Sorular hazır."]);
      router.push(`/deneme-sinavlari/${prepId}/deneme/${payload.examId}`);
    } catch {
      toast.error("Bağlantı hatası.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setProgress((p) =>
        p.length >= 4 ? p : [...p, `Konu ${p.length} hazırlanıyor…`],
      );
    }, 1800);
    return () => clearInterval(id);
  }, [loading]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#3d5afe]" />
        <h1 className="mt-4 text-xl font-semibold">Deneme sınavın hazırlanıyor…</h1>
        <ul className="mt-6 space-y-2 text-left text-sm text-[color:var(--cp-muted)]">
          {progress.map((line) => (
            <li key={line}>✓ {line}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8">
      <p className="text-xs font-semibold tracking-widest text-[color:var(--cp-gold,#f4ae0b)]">
        YAZILI DENEME
      </p>
      <h1
        className="mt-2 text-[32px] leading-tight text-[color:var(--cp-text)]"
        style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
      >
        Gerçek sınav provası
      </h1>
      <p className="mt-2 text-[15px] text-[color:var(--cp-muted)]">
        Süre var, yardım yok. Açıklamalar sınavın sonunda.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Kapsam</h2>
        <div className="mt-2 flex rounded-xl border border-[color:var(--cp-border)] p-1">
          {(
            [
              ["all", "Tüm sınav"],
              ["topics", "Konuları seç"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "flex-1 rounded-lg py-2.5 text-sm font-semibold",
                scope === value
                  ? "bg-[color:color-mix(in_srgb,#3d5afe_20%,transparent)] text-[color:var(--cp-text)]"
                  : "text-[color:var(--cp-muted)]",
              )}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {scope === "topics" ? (
          <ul className="mt-3 space-y-2">
            {topics.map((topic) => (
              <li key={topic.id}>
                <label
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-[color:var(--cp-border)] px-3 py-2.5 text-sm",
                    topic.outOfScope && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={topic.outOfScope}
                    checked={selected.has(topic.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(topic.id);
                        else next.delete(topic.id);
                        return next;
                      });
                    }}
                  />
                  <span className="flex-1">{topic.label}</span>
                  {topic.outOfScope ? (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[color:var(--cp-muted)]">
                      Kapsam dışı
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Uzunluk</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["short", "Kısa · 10 soru · 20 dk", null],
              ["standard", "Standart · 20 soru · 40 dk", null],
              [
                "real",
                formatSummary ? `Gerçek sınav biçimi · ${formatSummary}` : null,
                "ÖNERİLEN",
              ],
            ] as const
          )
            .filter((row) => row[1] != null)
            .map(([value, label, badge]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "relative rounded-2xl border p-4 text-left text-sm",
                  preset === value
                    ? "border-[#3d5afe] bg-[color:color-mix(in_srgb,#3d5afe_12%,transparent)]"
                    : "border-[color:var(--cp-border)] bg-[color:var(--cp-surface)]",
                )}
                onClick={() => setPreset(value)}
              >
                {badge ? (
                  <span className="absolute right-2 top-2 rounded-full bg-[color:var(--cp-gold)] px-2 py-0.5 text-[10px] font-bold text-[#050505]">
                    {badge}
                  </span>
                ) : null}
                {label}
              </button>
            ))}
        </div>
      </section>

      {preview.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Soru dağılımı</h2>
          <ul className="mt-3 space-y-2">
            {preview.map((row) => (
              <li key={row.topicLabel} className="text-sm">
                <div className="mb-1 flex items-center gap-2">
                  {row.examHeavy ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cp-gold)]" />
                  ) : (
                    <span className="h-1.5 w-1.5" />
                  )}
                  <span>
                    {row.topicLabel} · {row.count} soru
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[color:color-mix(in_srgb,#3d5afe_60%,transparent)]"
                    style={{
                      width: `${Math.min(100, row.count * 8)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex gap-3 rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] p-4 text-sm text-[color:var(--cp-muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <ul className="list-disc space-y-1 pl-4">
          <li>Sınav sırasında ipucu ve sohbet kapalı.</li>
          <li>Süre bitince cevapların otomatik gönderilir.</li>
          <li>Sayfayı kapatırsan kaldığın yerden devam edebilirsin.</li>
        </ul>
      </div>

      <button
        type="button"
        className="cp-exam-continue cp-exam-continue--primary mt-6 flex h-[52px] w-full items-center justify-center rounded-full text-[15px] font-semibold"
        onClick={() => void start()}
      >
        Sınavı başlat
      </button>
      <p className="mt-3 text-center text-[13px] text-[color:var(--cp-muted)]">{creditNote}</p>
    </div>
  );
}
