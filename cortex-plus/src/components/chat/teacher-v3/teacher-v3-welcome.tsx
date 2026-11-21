"use client";

import { useEffect, useState } from "react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { RESUME_HAP, START_CARDS_ENDPOINT, WELCOME_HAPS, parseResume, welcomeLines, type ResumeOffer } from "@/lib/teacher/welcome";
import { useSmoothReveal } from "@/components/chat/teacher-v3/use-smooth-reveal";

/** Karşılamanın açılma hızı: kısa metin, bir saniyenin altında okunur (yanıtlardan hızlı). */
const WELCOME_CPS = 220;

/**
 * Öğretmen v3 karşılaması: küçük işaret, çerçevesiz selam ve sağa yaslı haplar. Metin bir kez kelime kelime açılır
 * (hareket azaltmada hemen); ekran okuyucu bütün metni baştan okur. Açılınca `start-cards` ucu bir kez istenir;
 * yanıtta `resume` varsa selamın altına onun cümlesi (solarak gelir) ve hapların en üstüne devam hapı gelir. İstek
 * düşerse ya da alan yoksa hiçbir şey değişmez.
 */
export function TeacherV3Welcome({
  firstName,
  prepTitle,
  disabled,
  onPick,
  onResume,
}: {
  firstName?: string | null;
  prepTitle?: string | null;
  disabled?: boolean;
  onPick: (text: string) => void;
  onResume: (offer: ResumeOffer) => void;
}) {
  const [resume, setResume] = useState<ResumeOffer | null>(null);
  const lines = welcomeLines({ firstName, prepTitle });
  const reveal = useSmoothReveal(`${lines.hello}\n${lines.body}`, { animate: true, streaming: false, baseCps: WELCOME_CPS });

  useEffect(() => {
    let cancelled = false;
    fetch(START_CARDS_ENDPOINT, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { resume?: unknown }) : null))
      .then((body) => {
        if (cancelled || !body) return;
        const offer = parseResume(body.resume);
        if (offer) setResume(offer);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [hello = "", ...rest] = reveal.text.split("\n");
  return (
    <section className="cx-v3-welcome" aria-label="Karşılama">
      <span className="cx-v3-welcome-mark" aria-hidden>
        <CortexMark size={22} />
      </span>
      <p className="sr-only">{[lines.hello, resume?.line, lines.body].filter(Boolean).join(" ")}</p>
      <div className="cx-v3-welcome-text" aria-hidden>
        <p className="cx-v3-welcome-hello">{hello || " "}</p>
        {resume ? <p className="cx-v3-welcome-resume">{resume.line}</p> : null}
        <p className="cx-v3-welcome-body">{rest.join("\n")}</p>
      </div>
      <div className="cx-v3-haps" role="group" aria-label="Başlangıç önerileri" data-ready={reveal.done || undefined}>
        {resume ? (
          <button type="button" className="cx-v3-hap" data-resume disabled={disabled} onClick={() => onResume(resume)}>
            <span className="cx-v3-hap-arrow" aria-hidden>
              ↳
            </span>
            <span>{RESUME_HAP}</span>
          </button>
        ) : null}
        {WELCOME_HAPS.map((text) => (
          <button key={text} type="button" className="cx-v3-hap" disabled={disabled} onClick={() => onPick(text)}>
            <span className="cx-v3-hap-arrow" aria-hidden>
              ↳
            </span>
            <span>{text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
