"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileText,
  Headphones,
  ListChecks,
  Mic,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/ui/confetti";
import { timeGreeting } from "@/lib/ui/greeting";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  SPEAKER_LABEL,
  buildTimeline,
  formatClock,
  lineAt,
  totalDurationMs,
  type PodcastChapter,
  type SpeakerId,
} from "@/lib/learning/podcast-script";

/**
 * Örnek akış.
 *
 * Amaç, ürünü anlatmak değil göstermek: ziyaretçi hazır bir ders notundan
 * yola çıkıp podcast, quiz ve sözlünün gerçekte nasıl göründüğünü adım adım
 * görüyor. Tüm içerik önceden üretildi — burada hiçbir AI çağrısı yok.
 *
 * Görsel dil premium-design-system.css'teki "pm-" bileşenlerini kullanıyor:
 * parlayan küre (sözlü adımı), dairesel ilerleme (quiz özeti), kademeli
 * beliriş (konu listesi), adım geçişlerinde yumuşak giriş.
 */

const SPEAKER_COLOR: Record<SpeakerId, string> = {
  ada: "var(--pm-amber-500)",
  kerem: "var(--pm-violet-500)",
};

type Step = {
  id: string;
  kicker: string;
  title: string;
  lead: string;
  icon: typeof FileText;
};

const STEPS: Step[] = [
  {
    id: "kaynak",
    kicker: "1. adım",
    title: "Kaynağını yükle",
    lead: "Öğretmenin notu, kitabın bir bölümü ya da kendi özetin. Metin çıkarılır ve konuya göre aranabilir hâle gelir.",
    icon: FileText,
  },
  {
    id: "konular",
    kicker: "2. adım",
    title: "Konular çıkarılır",
    lead: "Notun içinden çalışılacak başlıklar ayrıştırılır. Sıralama, dersin yolunu belirler.",
    icon: Sparkles,
  },
  {
    id: "podcast",
    kicker: "3. adım",
    title: "Konuyu dinle",
    lead: "İki sunucu konuyu senin notundan anlatır. Okunan cümle vurgulanır; tıklayınca oraya atlarsın.",
    icon: Headphones,
  },
  {
    id: "quiz",
    kicker: "4. adım",
    title: "Kendini dene",
    lead: "Sorular da aynı nottan üretilir. Yanlışta açıklama gelir, doğruda pekiştirir.",
    icon: ListChecks,
  },
  {
    id: "sozlu",
    kicker: "5. adım",
    title: "Sözlüye çalış",
    lead: "Eğitmen sorar, sen sesli yanıtlarsın. Yazılıda çıkacak soruların provası.",
    icon: Mic,
  },
];

export function DemoWalkthrough({
  subject,
  sourceName,
  sourceHref,
  sourceText,
  topics,
  podcastTitle,
  chapters,
  audio,
  quiz,
  oral,
}: {
  subject: { label: string; icon: string; colorVar: string };
  sourceName: string;
  sourceHref: string;
  sourceText: string;
  topics: string[];
  podcastTitle: string;
  chapters: PodcastChapter[];
  audio: { url: string; durationMs: number }[];
  quiz: { text: string; options: string[]; correct: number; explanation: string }[];
  oral: { prompt: string; hint?: string }[];
}) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  // Sunucu ile istemcinin saati farklı çıkabilir; SSR'da hiç göstermeyip
  // yalnızca istemcide beliriyor — kayan/uyuşmayan metin yerine kasıtlı bir
  // "senin için beliriyor" hissi.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => setGreeting(timeGreeting()), []);

  return (
    <div className="dm-page">
      <header className="dm-head">
        <div className="dm-head-top">
          <p className="dm-eyebrow">Örnek çalışma</p>
          {greeting ? <p className="dm-greeting pm-enter">{greeting} 👋</p> : null}
        </div>
        <h1 className="pm-display">Cortex Plus nasıl çalışır?</h1>
        <p className="dm-lead">
          Hazır bir ders notuyla baştan sona gezelim. Aşağıdaki her şey gerçek
          ürün ekranları — sadece içeriği önceden hazırladık.
        </p>
        <span
          className="pm-chip mt-3"
          style={{ ["--pm-chip-color" as string]: subject.colorVar }}
        >
          <span aria-hidden>{subject.icon}</span> {subject.label}
        </span>
      </header>

      <ol className="dm-rail" aria-label="Adımlar">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={cn(
                "dm-rail-item",
                i === step && "is-on",
                i < step && "is-done",
              )}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="dm-rail-dot" aria-hidden>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="dm-rail-label">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="dm-stage">
        <div key={current.id} className="pm-enter">
          <div className="dm-stage-head">
            <span className="dm-stage-icon" aria-hidden>
              <current.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="dm-kicker">{current.kicker}</p>
              <h2 className="pm-display">{current.title}</h2>
            </div>
          </div>
          <p className="dm-stage-lead">{current.lead}</p>

          {current.id === "kaynak" ? (
            <SourceStep name={sourceName} href={sourceHref} text={sourceText} />
          ) : null}
          {current.id === "konular" ? <TopicsStep topics={topics} /> : null}
          {current.id === "podcast" ? (
            <PodcastStep title={podcastTitle} chapters={chapters} audio={audio} />
          ) : null}
          {current.id === "quiz" ? <QuizStep quiz={quiz} /> : null}
          {current.id === "sozlu" ? <OralStep oral={oral} /> : null}
        </div>
      </section>

      <div className="dm-nav">
        <button
          type="button"
          className="dm-btn"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Geri
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="dm-btn dm-btn--primary"
            onClick={() => setStep((s) => s + 1)}
          >
            Sonraki adım
          </button>
        ) : (
          <Link href="/kayit" className="dm-btn dm-btn--primary">
            Kendi notunla dene
          </Link>
        )}
      </div>
    </div>
  );
}

function SourceStep({ name, href, text }: { name: string; href: string; text: string }) {
  return (
    <div className="dm-source">
      <a
        className="dm-file pm-card pm-card--interactive pm-card--ghost"
        data-ghost-icon="📄"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        <FileText className="h-5 w-5" aria-hidden />
        <span>
          <strong>{name}</strong>
          <em>Örnek ders notu · PDF</em>
        </span>
      </a>
      <p className="dm-source-kicker">Çıkarılan metin</p>
      <div className="dm-source-text">{text}</div>
    </div>
  );
}

function TopicsStep({ topics }: { topics: string[] }) {
  return (
    <ol className="dm-topics">
      {topics.map((t, i) => (
        <li
          key={t}
          className="pm-stagger"
          style={{ ["--pm-i" as string]: i }}
        >
          <span className="dm-topic-no">{i + 1}</span>
          <span>{t}</span>
          {i === 0 ? <em className="dm-topic-tag">buradan başlanır</em> : null}
        </li>
      ))}
    </ol>
  );
}

function PodcastStep({
  title,
  chapters,
  audio,
}: {
  title: string;
  chapters: PodcastChapter[];
  audio: { url: string; durationMs: number }[];
}) {
  const timeline = useMemo(
    () => buildTimeline(chapters, audio.map((a) => a.durationMs)),
    [chapters, audio],
  );
  const totalMs = totalDurationMs(timeline);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);
  const activeIndex = lineAt(timeline, positionMs);

  function playFrom(index: number, offsetMs = 0) {
    const track = audio[index];
    if (!track) {
      setPlaying(false);
      return;
    }
    const token = ++tokenRef.current;
    let el = elementRef.current;
    if (!el) {
      el = new Audio();
      elementRef.current = el;
    }
    el.pause();
    el.src = track.url;
    el.currentTime = Math.max(0, offsetMs) / 1000;
    el.ontimeupdate = () => {
      if (token !== tokenRef.current) return;
      setPositionMs((timeline[index]?.startMs ?? 0) + el!.currentTime * 1000);
    };
    el.onended = () => {
      if (token !== tokenRef.current) return;
      if (index + 1 >= audio.length) {
        setPlaying(false);
        setPositionMs(totalMs);
        return;
      }
      playFrom(index + 1);
    };
    void el.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }

  function toggle() {
    if (playing) {
      tokenRef.current += 1;
      elementRef.current?.pause();
      setPlaying(false);
      return;
    }
    const index = Math.max(0, lineAt(timeline, positionMs));
    playFrom(index, positionMs - (timeline[index]?.startMs ?? 0));
  }

  function seekToLine(index: number) {
    setPositionMs(timeline[index]?.startMs ?? 0);
    playFrom(index);
  }

  return (
    <div className="dm-pod">
      <div className="dm-pod-bar">
        <button
          type="button"
          className={cn("dm-pod-play", playing && "is-on")}
          onClick={toggle}
          disabled={!audio.length}
          aria-label={playing ? "Duraklat" : "Oynat"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="dm-pod-title">{title}</p>
          <p className="dm-pod-time">
            {audio.length
              ? `${formatClock(positionMs)} / ${formatClock(totalMs)}`
              : "Ses şu an hazırlanamadı — senaryoyu okuyabilirsin."}
          </p>
        </div>
      </div>

      <ol className="dm-pod-lines">
        {timeline.map((line, i) => {
          const first = i === 0 || timeline[i - 1].chapterIndex !== line.chapterIndex;
          return (
            <li key={i}>
              {first ? (
                <p className="dm-pod-chapter">{chapters[line.chapterIndex]?.title}</p>
              ) : null}
              <button
                type="button"
                className={cn(
                  "dm-pod-line",
                  i === activeIndex && playing && "is-on",
                )}
                onClick={() => seekToLine(i)}
                disabled={!audio.length}
              >
                <span
                  className="dm-pod-avatar"
                  aria-hidden
                  style={{ background: SPEAKER_COLOR[line.speaker] }}
                >
                  {SPEAKER_LABEL[line.speaker].slice(0, 1)}
                </span>
                <span className="dm-pod-said">
                  <span className="dm-pod-who">{SPEAKER_LABEL[line.speaker]}</span>
                  <span>{line.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function QuizStep({
  quiz,
}: {
  quiz: { text: string; options: string[]; correct: number; explanation: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const q = quiz[index];
  const answered = picked !== null;
  const isLast = index === quiz.length - 1;
  const finished = isLast && answered;

  function pick(i: number, event: React.MouseEvent<HTMLButtonElement>) {
    if (!q || answered) return;
    setPicked(i);
    if (i === q.correct) {
      setCorrectCount((c) => c + 1);
      const rect = event.currentTarget.getBoundingClientRect();
      celebrate({ originX: rect.left + rect.width / 2, originY: rect.top });
    }
  }

  if (finished) {
    const pct = Math.round((correctCount / quiz.length) * 100);
    return (
      <div className="dm-quiz-done pm-enter">
        <ProgressRing value={pct} size={104} strokeWidth={9}>
          <strong className="dm-quiz-done-pct">%{pct}</strong>
        </ProgressRing>
        <p className="dm-quiz-done-line">
          {quiz.length} sorudan {correctCount} tanesini doğru bildin.
        </p>
        <p className="dm-quiz-done-sub">
          Gerçek bir hazırlıkta bu sonuç sonraki dersin zorluğunu ayarlar.
        </p>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="dm-quiz">
      <p className="dm-quiz-count">
        Soru {index + 1} / {quiz.length}
      </p>
      <h3 className="dm-quiz-text">{q.text}</h3>
      <ul className="dm-quiz-options">
        {q.options.map((opt, i) => (
          <li key={i}>
            <button
              type="button"
              className={cn(
                "dm-quiz-option",
                answered && i === q.correct && "is-right",
                answered && i === picked && i !== q.correct && "is-wrong",
              )}
              onClick={(event) => pick(i, event)}
              disabled={answered}
            >
              <span className="dm-quiz-letter">{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
            </button>
          </li>
        ))}
      </ul>
      {answered ? (
        <div className="dm-quiz-explain">
          <strong>{picked === q.correct ? "Doğru." : "Doğrusu şu:"}</strong>{" "}
          {q.explanation}
        </div>
      ) : null}
      {answered ? (
        <button
          type="button"
          className="dm-btn dm-btn--primary mt-3"
          onClick={() => {
            setIndex((i) => i + 1);
            setPicked(null);
          }}
        >
          Sonraki soru
        </button>
      ) : null}
    </div>
  );
}

function OralStep({ oral }: { oral: { prompt: string; hint?: string }[] }) {
  return (
    <div className="dm-oral">
      <div className="pm-orb pm-orb--violet is-breathing dm-oral-orb" aria-hidden />
      <p className="dm-oral-caption">Eğitmen soruyor…</p>
      <ol className="dm-oral-list">
        {oral.map((q, i) => (
          <li key={i} className="pm-stagger" style={{ ["--pm-i" as string]: i }}>
            <p className="dm-oral-q">{q.prompt}</p>
            {q.hint ? <p className="dm-oral-hint">İpucu: {q.hint}</p> : null}
          </li>
        ))}
      </ol>
      <p className="dm-oral-note">
        Gerçek oturumda mikrofonla yanıtlarsın; eğitmen cevabını dinleyip
        eksikleri söyler.
      </p>
    </div>
  );
}
