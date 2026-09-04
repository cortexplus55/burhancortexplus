"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { CreditGate } from "@/components/paywall/credit-gate";
import { CortexMark } from "@/components/brand/cortex-mark";
import { STUDIO_INTRO } from "@/lib/learning/studio-intro";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { STUDIO_NEXT, studioHref, type StudioToolId } from "@/lib/learning/studio-next";
import { playPlusTone } from "@/lib/learning/studio-sound";
import { downloadStudioCard } from "@/lib/learning/studio-share-card";
import { cn } from "@/lib/utils";
import "@/styles/learning-studio.css";

export type { StudioToolId };

export async function postStudio<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<{ paywall: true } | { ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 402) return { paywall: true };
    const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: payload.error ?? "İşlem tamamlanamadı." };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "Bağlantı hatası." };
  }
}

export function StudioFrame({
  tool,
  kicker,
  children,
}: {
  tool: StudioToolId;
  kicker: string;
  children: ReactNode;
}) {
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  return (
    <div className={cn("ls-studio", `ls-studio--${tool}`, isPlus && "ls-studio--plus")}>
      <div className="ls-studio-ambient" aria-hidden />
      <header className="ls-studio-bar">
        <Link href="/ogretmen" className="ls-back">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Sor
        </Link>
        <p className="ls-studio-kicker">{kicker}</p>
      </header>
      <div className="ls-studio-body">{children}</div>
    </div>
  );
}

/**
 * Stüdyoların açılışı.
 *
 * Eskiden tek satırlık bir formdu: "Konu" yazan boş bir kutu ve bir düğme. O
 * kutu ne yazacağını bilmeyen öğrenciyi orada bırakıyordu — stüdyoya girip
 * hiçbir şey yazmadan çıkmak en kolay yoldu.
 *
 * Şimdi öğretmen soruyu soruyor ve üç somut örnek veriyor. Örneğe dokunmak
 * doğrudan başlatıyor; yazmak isteyen için kutu duruyor. `onSubmit` sözleşmesi
 * değişmedi, o yüzden altı stüdyo da tek yerden dönüştü.
 */
export function StudioEntry({
  tool,
  title,
  placeholder,
  submitLabel,
  creditCost,
  initialTopic = "",
  onSubmit,
}: {
  tool: StudioToolId;
  title: string;
  placeholder: string;
  submitLabel: string;
  creditCost: number | null;
  initialTopic?: string;
  onSubmit: (topic: string) => void;
}) {
  const intro = STUDIO_INTRO[tool];
  const [draft, setDraft] = useState(initialTopic);

  function start(topic: string) {
    const clean = topic.trim();
    if (clean.length < 3) return;
    onSubmit(clean);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(draft);
  }

  return (
    <div className="ls-chat">
      {/* Başlık ekranda değil ama sayfanın bir adı olmalı: ekran okuyucu ve
          sekme başlığı için duruyor. */}
      <h1 className="sr-only">{title}</h1>

      <div className={cn("ls-world", `ls-world--${tool}`)} aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="ls-msg">
        <span className="ls-msg-mark" aria-hidden>
          <CortexMark size={20} />
        </span>
        <p className="ls-msg-body">{intro.greeting}</p>
      </div>

      <div className="ls-chips" role="group" aria-label="Örnek konular">
        {intro.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="ls-chip"
            onClick={() => start(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form className="ls-chat-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="studio-topic">
          Konu
        </label>
        <input
          id="studio-topic"
          name="topic"
          className="ls-field"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          minLength={3}
          autoComplete="off"
        />
        <button
          type="submit"
          className="ls-cta"
          disabled={draft.trim().length < 3}
        >
          {submitLabel}
        </button>
      </form>

      {creditCost != null ? (
        <p className="ls-credit">{creditCost} kredi</p>
      ) : null}
    </div>
  );
}

export function StudioLoading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="ls-loading" role="status" aria-live="polite">
      <div className="ls-loading-ring" aria-hidden />
      <h2 className="ls-loading-title">{title}</h2>
      <p className="ls-entry-lead">{lead}</p>
    </div>
  );
}

export function StudioProgress({
  index,
  total,
}: {
  index: number;
  total: number;
}) {
  return (
    <div className="ls-play-head">
      <div className="ls-progress" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i
            key={i}
            className={cn(i === index && "is-on", i < index && "is-done")}
          />
        ))}
      </div>
      <span className="ls-count">
        {index + 1} / {total}
      </span>
    </div>
  );
}

export function StudioResults({
  tool,
  topic,
  scoreLabel,
  title,
  lead,
  onAgain,
  onNew,
}: {
  tool: StudioToolId;
  topic: string;
  scoreLabel?: string;
  title: string;
  lead: string;
  onAgain: () => void;
  onNew: () => void;
}) {
  const next = STUDIO_NEXT[tool];
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  useEffect(() => {
    if (isPlus) playPlusTone("fanfare");
  }, [isPlus]);

  return (
    <div className="ls-results">
      {scoreLabel ? <div className="ls-score">{scoreLabel}</div> : null}
      <h2>{title}</h2>
      <p>{lead}</p>
      <div className="ls-actions">
        <button type="button" className="ls-cta" onClick={onAgain}>
          Tekrar dene
        </button>
        <button type="button" className="ls-ghost" onClick={onNew}>
          Yeni konu
        </button>
        <button
          type="button"
          className="ls-ghost"
          onClick={() =>
            downloadStudioCard({ tool, topic, title, scoreLabel })
          }
        >
          Kartı indir
        </button>
      </div>
      {topic.trim().length >= 3 ? (
        <div className="ls-next">
          <p className="ls-next-label">Sıradaki sahne</p>
          <div className="ls-next-row">
            {next.map((item) => (
              <Link
                key={item.id}
                href={studioHref(item.href, topic)}
                className={cn("ls-next-card", `ls-next-card--${item.id}`)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StudioPaywall({
  open,
  onOpenChange,
  returnPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnPath: string;
}) {
  return (
    <CreditGate
      open={open}
      onOpenChange={onOpenChange}
      message="Bu stüdyo için kredin yetmiyor."
      returnPath={returnPath}
    />
  );
}
