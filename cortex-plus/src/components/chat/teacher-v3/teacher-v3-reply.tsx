"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MathText } from "@/components/learning/math-text";
import { RememberCard } from "@/components/chat/remember-card";
import { TeacherQuickCheck } from "@/components/chat/teacher-quick-check";
import { splitRememberBlock } from "@/lib/learning/remember-facts";
import { splitTutorChrome } from "@/lib/learning/tutor-reply";
import { maskStreamingMarkdown } from "@/lib/chat/stream-markdown-mask";
import { parseQuickCheck, type QuickCheckOption } from "@/lib/teacher/quick-check";
import { chosenQuickCheckLetter } from "@/lib/teacher/reply-actions";
import { GENERAL_NOTE_TEXT, cleanV3Reply, hidePartialMarkers, v3Segments } from "@/lib/teacher/v3-reply";
import { useFreshFade, useSmoothReveal } from "@/components/chat/teacher-v3/use-smooth-reveal";
import type { ChatAction } from "@/lib/ai/chat-material-link";

/** Gövdeyi bölümleriyle çizer: genel bilgi bölümü başlık değil, tek soluk satırla başlar. */
function SegmentedBody({ body }: { body: string }) {
  const segments = useMemo(() => v3Segments(body), [body]);
  return (
    <>
      {segments.map((segment, index) => (
        <div key={index} className="cx-v3-seg" data-general={segment.general || undefined}>
          {segment.general ? (
            <p className="cx-v3-general" data-v3-static>
              {GENERAL_NOTE_TEXT}
            </p>
          ) : null}
          <div className="cx-v3-md">
            <Markdown content={segment.text} variant="parity" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Stüdyo düğmeleri (sunucunun işareti): sakin cam haplar; ekranın marka düğmesi yazma alanında kalır. */
function V3StudioActions({ actions }: { actions: ChatAction[] }) {
  if (!actions.length) return null;
  return (
    <nav className="cx-v3-tools" aria-label="Çalışma araçları">
      {actions.map((action) => (
        <Link key={action.href} href={action.href} className="cx-v3-tool" data-kind={action.kind}>
          <span className="cx-v3-tool-text">
            <span className="cx-v3-tool-label">{action.label}</span>
            {action.context ? <span className="cx-v3-tool-context">{action.context}</span> : null}
          </span>
          <ArrowRight aria-hidden />
        </Link>
      ))}
    </nav>
  );
}

/**
 * Öğretmenin yanıtı, çerçevesiz (öğretmen v3). Teknik damgalar (kaynak başlığı, atıf, kaynak çipi, devam çipi, "Sıra
 * sende" kartı) çizilmez; öğretim işaretleri (kilit bilgi, kutular, formül, adımlar, Akılda kalsın, mini yoklama) hafif
 * ton bloklarıyla kalır. Akan yanıt kelime kelime açılır (`animate`).
 */
export function TeacherV3Reply({
  content,
  streaming,
  animate,
  disabled = false,
  interactiveCheck,
  answeredWith,
  onCheckAnswer,
  onRevealed,
}: {
  content: string;
  /** Akış sürüyor mu (yalnız son yanıt). */
  streaming: boolean;
  /** Bu oturumda akan yanıt: kelime kelime açılır. Eski mesajlarda kapalı. */
  animate: boolean;
  disabled?: boolean;
  /** Mini yoklama etkileşimli mi (son yanıt, akış bitmiş). */
  interactiveCheck: boolean;
  answeredWith?: string | null;
  onCheckAnswer?: (option: QuickCheckOption) => void;
  /** Görünen metin tamamlanınca (yumuşak açılış bitti) bir kez. */
  onRevealed?: () => void;
}) {
  const clean = useMemo(() => cleanV3Reply(content), [content]);
  const reveal = useSmoothReveal(clean.body, { animate, streaming });
  const visible = useMemo(() => {
    if (reveal.done) return clean.body;
    return hidePartialMarkers(maskStreamingMarkdown(reveal.text));
  }, [reveal.done, reveal.text, clean.body]);
  const view = useMemo(() => splitTutorChrome(visible), [visible]);
  const remember = useMemo(() => splitRememberBlock(view.body), [view.body]);
  const quickCheck = useMemo(() => (reveal.done ? parseQuickCheck(remember.body) : null), [reveal.done, remember.body]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useFreshFade(rootRef, visible, animate && !reveal.done);

  const revealed = reveal.done;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  useEffect(() => {
    if (revealed) onRevealedRef.current?.();
  }, [revealed]);

  const body = quickCheck ? quickCheck.before : remember.body;
  return (
    <div ref={rootRef} className="cx-v3-reply" data-streaming={!reveal.done || undefined}>
      {view.verdict ? (
        <p className="cx-v3-verdict" data-verdict={view.verdict.verdict} role="status" data-v3-static>
          {view.verdict.label}
        </p>
      ) : null}
      {view.verifying ? (
        <p className="cx-v3-general" aria-live="polite" data-v3-static>
          Hesaplar doğrulanıyor…
        </p>
      ) : null}
      {view.analogy ? (
        <aside className="cx-v3-tone" data-tone="analogy">
          <p className="cx-v3-tone-kicker" data-v3-static>
            Benzetme
          </p>
          <p>{view.analogy}</p>
        </aside>
      ) : null}
      {view.rule ? (
        <div className="cx-v3-tone" data-tone="rule">
          <MathText text={view.rule} />
        </div>
      ) : null}
      {view.example ? (
        <section className="cx-v3-tone" data-tone="example">
          <p className="cx-v3-tone-kicker" data-v3-static>
            Notlarından bir örnek
          </p>
          <div className="cx-v3-md">
            <Markdown content={view.example} variant="parity" />
          </div>
        </section>
      ) : null}
      {body.includes("[[QUOTE]]") && view.quote ? (
        <>
          <SegmentedBody body={body.split("[[QUOTE]]")[0] ?? ""} />
          <blockquote className="cx-v3-quote">
            <p>{view.quote.text}</p>
            <footer>{view.quote.source}</footer>
          </blockquote>
          <SegmentedBody body={body.split("[[QUOTE]]").slice(1).join("") ?? ""} />
        </>
      ) : body ? (
        <SegmentedBody body={body} />
      ) : null}
      {remember.items.length && reveal.done ? <RememberCard items={remember.items} /> : null}
      {quickCheck ? (
        <>
          <TeacherQuickCheck
            check={quickCheck}
            interactive={interactiveCheck && !disabled}
            chosen={chosenQuickCheckLetter(quickCheck, answeredWith)}
            onAnswer={onCheckAnswer}
          />
          {quickCheck.after ? <SegmentedBody body={quickCheck.after} /> : null}
        </>
      ) : null}
      {view.check ? (
        // Sunucunun "Sıra sende" sorusu kart değil, öğretmenin cümlesi olarak.
        <p className="cx-v3-ask">{view.check}</p>
      ) : null}
      {view.steps && reveal.done ? (
        <details className="cx-v3-steps">
          <summary>
            <ChevronDown aria-hidden />
            Adımları göster
          </summary>
          <div className="cx-v3-md">
            <Markdown content={view.steps} variant="parity" />
          </div>
        </details>
      ) : null}
      {view.followUp ? <p className="cx-v3-ask">{view.followUp}</p> : null}
      {reveal.done ? <V3StudioActions actions={clean.actions} /> : null}
    </div>
  );
}

/** Son yanıtın altındaki takip soruları: sağa yaslı "↳" haplar; dokunulan soru öğrencinin mesajı olur. */
export function TeacherV3FollowUps({ questions, onPick, disabled }: { questions: string[]; onPick: (question: string) => void; disabled?: boolean }) {
  if (!questions.length) return null;
  return (
    <div className="cx-v3-haps" role="group" aria-label="Takip soruları">
      {questions.map((question) => (
        <button key={question} type="button" className="cx-v3-hap" disabled={disabled} onClick={() => onPick(question)}>
          <span className="cx-v3-hap-arrow" aria-hidden>
            ↳
          </span>
          <span>{question}</span>
        </button>
      ))}
    </div>
  );
}
