"use client";

import { useEffect, useMemo, useState } from "react";

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
  documentSuggestions,
  sourceNotice,
  StudioSetup,
  StudioSourcePicker,
  type StudioDocument,
  type StudioSourceMode,
} from "@/components/learning/studio/studio-setup";
import {
  MIN_WORDS,
  VERDICT_HINT,
  VERDICT_LABEL,
  wordCount,
  type ExplainReview,
} from "@/lib/learning/explain-review";
import {
  closedGaps,
  latestAttemptForTopic,
  mergeExplainHistory,
  readLocalExplainHistory,
  reviewToAttempt,
  writeLocalExplainHistory,
  type ExplainAttempt,
} from "@/lib/learning/explain-history";

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
  documents = [],
  initialDocumentId = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  documents?: StudioDocument[];
  initialDocumentId?: string | null;
}) {
  // Belgeden de (24 Ekim 2026): anlatım öğrencinin kendi notuna göre değerlendirilir.
  const [sourceMode, setSourceMode] = useState<StudioSourceMode>(initialDocumentId ? "document" : "topic");
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? documents[0]?.id ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceDocument = sourceMode === "document" ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const [phase, setPhase] = useState<"entry" | "writing" | "loading" | "result">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [text, setText] = useState("");
  const [review, setReview] = useState<ExplainReview | null>(null);
  const [paywall, setPaywall] = useState(false);
  /** Sonuç ekranından gelen sınama sorusu; yazma ekranının başında duruyor. */
  const [probe, setProbe] = useState<string | null>(null);
  const [history, setHistory] = useState<ExplainAttempt[]>([]);
  const [closed, setClosed] = useState<string[]>([]);
  const [gapRetry, setGapRetry] = useState<{ point: string }[] | null>(null);

  const words = wordCount(text);
  const ready = words >= MIN_WORDS;
  const topicHistory = useMemo(() => history.filter((row) => row.topic === topic || !topic), [history, topic]);

  useEffect(() => {
    let cancelled = false;
    const local = readLocalExplainHistory();
    setHistory(local);
    fetch("/api/learning/explain/history")
      .then((res) => (res.ok ? res.json() : { attempts: [] }))
      .then((data: { attempts?: ExplainAttempt[] }) => {
        if (cancelled) return;
        const merged = mergeExplainHistory(data.attempts ?? [], local);
        setHistory(merged);
        writeLocalExplainHistory(merged);
      })
      .catch(() => {
        if (!cancelled) setHistory(readLocalExplainHistory());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setPhase("loading");
    const result = await postStudio<
      ExplainReview & { source?: Parameters<typeof sourceNotice>[0]; attemptId?: string | null; createdAt?: string }
    >("/api/learning/explain", {
      topic,
      explanation: text,
      probe: probe ?? undefined,
      ...(sourceDocument ? { documentId: sourceDocument.id } : {}),
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
          : result.error === "document_not_ready"
            ? "Belge henüz hazır değil ya da içi boş. Hakkın düşmedi."
            : "Anlatım değerlendirilemedi.",
      );
      setPhase("writing");
      return;
    }
    const previous = gapRetry ?? latestAttemptForTopic(history, topic)?.gaps ?? [];
    setClosed(closedGaps(previous, result.data.gaps));
    const attempt = reviewToAttempt({
      id: result.data.attemptId ?? undefined,
      topic,
      documentId: sourceDocument?.id ?? null,
      explanation: text,
      probe,
      createdAt: result.data.createdAt,
      ...result.data,
    });
    setHistory((current) => {
      const next = mergeExplainHistory([attempt], current);
      writeLocalExplainHistory(next);
      return next;
    });
    setReview(result.data);
    setNotice(sourceNotice(result.data.source));
    setGapRetry(null);
    setPhase("result");
  }

  function restart(nextProbe: string | null = null, nextGaps: { point: string }[] | null = null) {
    setText("");
    setReview(null);
    setClosed([]);
    setProbe(nextProbe);
    setGapRetry(nextGaps);
    setPhase("writing");
  }

  const paywallDialog = (
    <StudioPaywall
      open={paywall}
      onOpenChange={setPaywall}
      returnPath="/studio/anlat"
      // Araçlar kartı, ders içi yardım değil: ücretsizde mesaj hakkından düşer (24 Ekim 2026).
      meter="chat"
    />
  );

  if (phase === "entry") {
    return (
      <>
        <StudioEntry
          tool="anlat"
          title="Anlatarak öğren"
          placeholder={sourceDocument ? "Belgendeki bir konu" : "Hangi konuyu anlatacaksın?"}
          submitLabel="Anlatmaya başla"
          creditCost={creditCost}
          initialTopic={initialTopic}
          suggestions={documentSuggestions(sourceDocument)}
          setup={
            <StudioSetup>
              <StudioSourcePicker
                idPrefix="anlat"
                documents={documents}
                mode={sourceMode}
                onModeChange={setSourceMode}
                documentId={documentId}
                onDocumentChange={setDocumentId}
              />
            </StudioSetup>
          }
          onSubmit={(value) => {
            if (sourceMode === "document" && !sourceDocument) {
              toast.error(documentId ? "Belgen hâlâ hazırlanıyor; biter bitmez başlatabilirsin." : "Önce bir belge seç ya da yükle.");
              return;
            }
            setTopic(value);
            setPhase("writing");
          }}
        />
        {history.length ? <ExplainHistoryList attempts={history} /> : null}
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
          {notice ? <p className="ls-source-notice">{notice}</p> : null}
          {closed.length ? (
            <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300" role="status">
              Önceki eksiğini kapattın!
              <span className="mt-1 block font-normal opacity-90">{closed.join(" · ")}</span>
            </p>
          ) : null}
          <div
            className={`rounded-2xl border p-4 ${VERDICT_TONE[review.verdict] ?? VERDICT_TONE.kismen}`}
          >
            <p className="text-sm font-bold">{VERDICT_LABEL[review.verdict]}</p>
            <p className="mt-1 text-sm opacity-90">
              {VERDICT_HINT[review.verdict]}
            </p>
          </div>

          <p className="text-sm leading-relaxed text-[var(--cs-muted)]">
            {review.summary}
          </p>

          {review.gaps.length ? (
            <section>
              <h2 className="text-sm font-bold text-[var(--cs-text)]">
                Burada tökezledin
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {review.gaps.map((gap) => (
                  <li
                    key={gap.point}
                    className="rounded-xl border border-white/10 p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--cs-text)]">
                      {gap.point}
                    </p>
                    <p className="mt-1 text-sm text-[var(--cs-muted)]">
                      {gap.why}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.missed.length ? (
            <section>
              <h2 className="text-sm font-bold text-[var(--cs-text)]">
                Hiç değinmedin
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {review.missed.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--cs-muted)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h2 className="text-sm font-bold text-[var(--cs-text)]">
              Şimdi şuna cevap ver
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cs-muted)]">
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

          {review.gaps.length ? (
            <button
              type="button"
              onClick={() =>
                restart(
                  `Eksiklerin: ${review.gaps.map((gap) => gap.point).join("; ")}. Bunları tamamlayarak yeniden anlat.`,
                  review.gaps,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Eksiklerimi tamamlayarak tekrar anlat
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => restart()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--cs-muted)] transition-colors hover:border-white/30 hover:text-[var(--cs-text)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Baştan anlat
          </button>
          {topicHistory.length ? <ExplainHistoryList attempts={topicHistory} compact /> : null}
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
            <p className="mt-1 text-sm leading-relaxed text-[var(--cs-text)]">
              {probe}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--cs-muted)]">
            <strong className="text-[var(--cs-text)]">{topic}</strong>{" "}
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
          className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-relaxed text-[var(--cs-text)] outline-none transition-colors focus:border-amber-500/60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-xs text-[var(--cs-muted)]"
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

function ExplainHistoryList({ attempts, compact = false }: { attempts: ExplainAttempt[]; compact?: boolean }) {
  return (
    <section className={compact ? "mt-6 space-y-3" : "mx-auto mt-8 w-full max-w-2xl space-y-3 px-4 pb-10"}>
      <h2 className="text-sm font-bold text-[var(--cs-text)]">
        Önceki anlatımların ve gelişimin
      </h2>
      <ul className="space-y-2">
        {attempts.slice(0, compact ? 5 : 12).map((row) => (
          <li key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--cs-text)]">
              <span>{row.topic}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${VERDICT_TONE[row.verdict] ?? VERDICT_TONE.kismen}`}>
                {VERDICT_LABEL[row.verdict] ?? row.verdict}
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--cs-muted)]">
              {new Date(row.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
              {row.gaps.length ? ` · ${row.gaps.length} eksik` : " · eksik yok"}
            </p>
            {row.gaps.length ? (
              <p className="mt-1 text-xs text-[var(--cs-muted)]">{row.gaps.map((gap) => gap.point).join(" · ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
