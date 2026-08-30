"use client";

import Link from "next/link";
import { useEffect, type FormEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { CreditGate } from "@/components/paywall/credit-gate";
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

export function StudioEntry({
  tool,
  title,
  lead,
  placeholder,
  submitLabel,
  creditCost,
  loading,
  initialTopic = "",
  onSubmit,
}: {
  tool: StudioToolId;
  title: string;
  lead: string;
  placeholder: string;
  submitLabel: string;
  creditCost: number | null;
  loading: boolean;
  initialTopic?: string;
  onSubmit: (topic: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const topic = String(data.get("topic") ?? "").trim();
    if (topic.length < 3) return;
    onSubmit(topic);
  }

  return (
    <div className="ls-entry">
      <div className={cn("ls-world", `ls-world--${tool}`)} aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div>
        <h1 className="ls-entry-title">{title}</h1>
        <p className="ls-entry-lead">{lead}</p>
      </div>
      <form className="ls-entry-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="studio-topic">
          Konu
        </label>
        <input
          id="studio-topic"
          name="topic"
          className="ls-field"
          placeholder={placeholder}
          defaultValue={initialTopic}
          minLength={3}
          required
          autoComplete="off"
        />
        <button type="submit" className="ls-cta" disabled={loading}>
          {loading ? "Hazırlanıyor…" : submitLabel}
        </button>
        {creditCost != null ? (
          <p className="ls-credit">{creditCost} kredi</p>
        ) : null}
      </form>
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
