"use client";

import { useState } from "react";

import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
} from "@/components/learning/studio/studio-shared";
import {
  MIN_WORDS,
  VERDICT_HINT,
  VERDICT_LABEL,
  wordCount,
  type ExplainReview,
} from "@/lib/learning/explain-review";

/**
 * Anlatarak öğren.
 *
 * Diğer stüdyolar öğrenciye bir şey üretip veriyor; bu tersi — öğrenci
 * üretiyor, ürün okuyor. Bu yüzden akış da ters: konu seçiliyor, sonra boş
 * bir sayfa geliyor ve doldurulması gereken öğrencinin kendisi.
 *
 * Sonuç ekranında not yok. Not verilseydi öğrenci nota bakıp geçerdi; oysa
 * öğreten şey nerede tökezlediğini görmek. Bu yüzden ekranın en altında bir
 * soru var ve o soru cevaplanmadan konu bitmiş sayılmıyor.
 */

const VERDICT_TONE: Record<string, string> = {
  anladin: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  kismen: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ezber: "border-red-500/40 bg-red-500/10 text-red-300",
};

export function ExplainStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "writing" | "loading" | "result">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [text, setText] = useState("");
  const [review, setReview] = useState<ExplainReview | null>(null);
  const [paywall, setPaywall] = useState(false);
  /** Sonuç ekranından gelen sınama sorusu; yazma ekranının başında duruyor. */
  const [probe, setProbe] = useState<string | null>(null);

  const words = wordCount(text);
  const ready = words >= MIN_WORDS;

  async function submit() {
    setPhase("loading");
    const result = await postStudio<ExplainReview>("/api/learning/explain", {
      topic,
      explanation: text,
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("writing");
      return;
    }
    if (!result.ok) {
      toast.error(
        result.error === "too_short"
          ? "Anlatım çok kısa, biraz daha yaz."
          : "Anlatım değerlendirilemedi.",
      );
      setPhase("writing");
      return;
    }
    setReview(result.data);
    setPhase("result");
  }

  function restart(nextProbe: string | null = null) {
    setText("");
    setReview(null);
    setProbe(nextProbe);
    setPhase("writing");
  }

  const paywallDialog = (
    <StudioPaywall
      open={paywall}
      onOpenChange={setPaywall}
      returnPath="/studio/anlat"
    />
  );

  if (phase === "entry") {
    return (
      <>
        <StudioEntry
          tool="anlat"
          title="Anlatarak öğren"
          placeholder="Hangi konuyu anlatacaksın?"
          submitLabel="Anlatmaya başla"
          creditCost={creditCost}
          initialTopic={initialTopic}
          onSubmit={(value) => {
            setTopic(value);
            setPhase("writing");
          }}
        />
        {paywallDialog}
      </>
    );
  }

  if (phase === "loading") {
    return (
      <StudioLoading
        title="Anlatımını okuyorum"
        lead="Nerede bağ kurmuşsun, nerede atlamışsın — ikisine de bakıyorum."
      />
    );
  }

  if (phase === "result" && review) {
    return (
      <StudioFrame tool="anlat" kicker={topic}>
        <div className="space-y-5">
          <div
            className={`rounded-2xl border p-4 ${VERDICT_TONE[review.verdict] ?? VERDICT_TONE.kismen}`}
          >
            <p className="text-sm font-bold">{VERDICT_LABEL[review.verdict]}</p>
            <p className="mt-1 text-sm opacity-90">
              {VERDICT_HINT[review.verdict]}
            </p>
          </div>

          <p className="text-sm leading-relaxed text-[var(--astra-muted)]">
            {review.summary}
          </p>

          {review.gaps.length ? (
            <section>
              <h2 className="text-sm font-bold text-[var(--astra-text)]">
                Burada tökezledin
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {review.gaps.map((gap) => (
                  <li
                    key={gap.point}
                    className="rounded-xl border border-white/10 p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--astra-text)]">
                      {gap.point}
                    </p>
                    <p className="mt-1 text-sm text-[var(--astra-muted)]">
                      {gap.why}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.missed.length ? (
            <section>
              <h2 className="text-sm font-bold text-[var(--astra-text)]">
                Hiç değinmedin
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {review.missed.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--astra-muted)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h2 className="text-sm font-bold text-[var(--astra-text)]">
              Şimdi şuna cevap ver
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--astra-muted)]">
              {review.followUp}
            </p>
            {/* Soru burada yanıtlanıyor, başka bir ekrana taşınmıyor:
                anlamadığını gösteren şey bu soruya yine anlatarak cevap
                verebilmek. Yanıt aynı değerlendirmeden geçiyor. */}
            <button
              type="button"
              onClick={() => restart(review.followUp)}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Bunu anlatarak cevapla
            </button>
          </section>

          <button
            type="button"
            onClick={() => restart()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Baştan anlat
          </button>
        </div>
      </StudioFrame>
    );
  }

  // ---------- yazma ekranı ----------

  return (
    <StudioFrame tool="anlat" kicker={topic}>
      <div className="space-y-4">
        {probe ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              Cevaplaman gereken soru
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--astra-text)]">
              {probe}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--astra-muted)]">
            <strong className="text-[var(--astra-text)]">{topic}</strong>{" "}
            konusunu bu konuyu hiç bilmeyen birine anlatır gibi anlat. Tanım
            ezberlemene gerek yok — kendi cümlelerinle kur, örnek ver.
          </p>
        )}

        <label htmlFor="explain-text" className="sr-only">
          Anlatımın
        </label>
        <textarea
          id="explain-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Anlatmaya başla…"
          className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-relaxed text-[var(--astra-text)] outline-none transition-colors focus:border-amber-500/60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-xs text-[var(--astra-muted)]"
            aria-live="polite"
          >
            {ready
              ? `${words} kelime`
              : `${words} kelime · en az ${MIN_WORDS} kelime gerekiyor`}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anlatımımı değerlendir
          </button>
        </div>
      </div>
      {paywallDialog}
    </StudioFrame>
  );
}
