"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LEARNED_SKIP_COPY, TARGETED_FIRST_COPY } from "@/lib/learning/learned-skip-copy";
import { examPrepHomeHref, examPrepNodeHref, examPrepTargetedReviewHref } from "@/lib/learning/exam-prep-hrefs";
import "@/styles/report-card.css";

/** Faz 4 madde 3.4: "Öğrendin" konusundaki tekrar adımının başında 0 kredilik atlama. */
export function LearnedSkipBar({ prepId, nodeId }: { prepId: string; nodeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function skip() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, action: "skip-learned" }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; nextId?: string | null } | null;
      if (!res.ok || body?.ok !== true) throw new Error("skip_failed");
      router.push(body.nextId ? examPrepNodeHref(prepId, body.nextId) : examPrepHomeHref(prepId));
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <section className="cp-learned-skip" aria-label={LEARNED_SKIP_COPY.title} data-testid="learned-skip">
      <span className="cp-badge cp-badge--emerald">Öğrendin</span>
      <div className="cp-learned-skip-text">
        <strong>{LEARNED_SKIP_COPY.title}</strong>
        <p>{LEARNED_SKIP_COPY.body}</p>
        {failed ? <p role="alert" className="cp-learned-skip-error">{LEARNED_SKIP_COPY.failed}</p> : null}
      </div>
      <button type="button" className="cp-report-btn" disabled={busy} onClick={skip}>
        {busy ? LEARNED_SKIP_COPY.busy : LEARNED_SKIP_COPY.action}
      </button>
    </section>
  );
}

/** Faz 4 madde 3.4: Zayıf / Gelişiyor / tuzak konuda önce kayıtlı sorulardan ücretsiz hedefli tekrar. */
export function TargetedFirstBar({ prepId }: { prepId: string }) {
  return (
    <section className="cp-learned-skip cp-learned-skip--targeted" aria-label={TARGETED_FIRST_COPY.title} data-testid="targeted-first">
      <span className="cp-badge cp-badge--coral">Eksik var</span>
      <div className="cp-learned-skip-text">
        <strong>{TARGETED_FIRST_COPY.title}</strong>
        <p>{TARGETED_FIRST_COPY.body}</p>
      </div>
      <Link href={examPrepTargetedReviewHref(prepId)} className="cp-report-btn">
        {TARGETED_FIRST_COPY.action}
      </Link>
    </section>
  );
}
