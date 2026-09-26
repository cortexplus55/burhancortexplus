"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, Crown, Flame, Info, MessageCircle, Sparkles, Target, ThumbsUp, X } from "lucide-react";
import { useIsFounder } from "@/lib/student/student-shell-context";
import { presentOralReview } from "@/lib/learning/oral-exam";
import {
  formatTopicPct,
  ORAL_TEACHER_MOODS,
  ORAL_VOICE_NAME,
  oralHeadline,
  oralPreflightCopy,
  oralSummary,
  type OralReviewItem,
  type OralTeacherMoodId,
} from "@/lib/learning/oral-exam-chrome";
import { ORAL_ALL_TOPICS, ORAL_LENGTH_OPTIONS, type OralLength } from "@/lib/learning/oral-exam";
import { ProgressRing } from "@/components/ui/progress-ring";
import "@/styles/oral-exam-chrome.css";

export type OralTopicRow = { id: string; label: string; pct: number };

function SolutionText({ text }: { text: string }) {
  const markers = ["Eksik kalan:", "Doğru kısım:", "Örnek çözüm:"];
  let earliest = -1;
  let marker = "";
  for (const item of markers) {
    const at = text.indexOf(item);
    if (at >= 0 && (earliest < 0 || at < earliest)) {
      earliest = at;
      marker = item;
    }
  }
  if (earliest < 0) return text;
  return (
    <>
      {text.slice(0, earliest)}
      <span className={marker === "Eksik kalan:" ? "cp-oral-miss" : "cp-oral-right"}>
        {text.slice(earliest)}
      </span>
    </>
  );
}

const MOOD_ICON = {
  strict: ClipboardCheck,
  helpful: MessageCircle,
  harsh: Flame,
} as const;

export function OralTopicPick({
  topics,
  selected,
  onToggle,
  onContinue,
  onClose,
}: {
  topics: OralTopicRow[];
  selected: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const ready = selected.length > 0;
  return (
    <section className="cp-oral">
      <button type="button" className="cp-oral-x" aria-label="Kapat" onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
      <h1>Konuları seç</h1>
      {topics.length ? (
        <ul className="cp-oral-topics">
          <li>
            <button
              type="button"
              className="cp-oral-topic"
              aria-pressed={selected.includes(ORAL_ALL_TOPICS)}
              onClick={() => onToggle(ORAL_ALL_TOPICS)}
            >
              <span className="cp-oral-check" aria-hidden>
                {selected.includes(ORAL_ALL_TOPICS) ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="cp-oral-topic-label">Tüm sınav</span>
            </button>
          </li>
          {topics.map((topic) => {
            const on = selected.includes(topic.id);
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  className="cp-oral-topic"
                  aria-pressed={on}
                  onClick={() => onToggle(topic.id)}
                >
                  <span className="cp-oral-check" aria-hidden>
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="cp-oral-topic-label">{topic.label}</span>
                  <span className="cp-oral-topic-pct">{formatTopicPct(topic.pct)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cp-oral-empty">Bu hazırlıkta seçilecek konu yok.</p>
      )}
      <div className="cp-oral-footer">
        <button type="button" className="cp-oral-cta" disabled={!ready} onClick={onContinue}>
          Devam et
        </button>
      </div>
    </section>
  );
}

export function OralTeacherCustomize({
  moodId,
  onMood,
  length = 3,
  onLength,
  onBack,
  onClose,
  onStart,
  notice,
}: {
  moodId: OralTeacherMoodId;
  onMood: (id: OralTeacherMoodId) => void;
  length?: OralLength;
  onLength?: (length: OralLength) => void;
  onBack: () => void;
  onClose: () => void;
  onStart: () => void;
  notice?: string | null;
}) {
  const founder = useIsFounder();
  return (
    <section className="cp-oral">
      <header className="cp-oral-bar">
        <button type="button" className="cp-oral-icon" aria-label="Geri" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p>Sözlü Deneme Sınavı</p>
        <button type="button" className="cp-oral-icon" aria-label="Kapat" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </header>
      <h1>Öğretmenini özelleştir</h1>
      <div className="cp-oral-voice">
        <div className="cp-oral-voice-orb" aria-hidden />
        <p className="cp-oral-kicker">Ses seç</p>
        <p className="cp-oral-voice-name">{ORAL_VOICE_NAME}</p>
        <div className="cp-oral-slider">
          <div className="cp-oral-slider-track" aria-hidden />
          <div className="cp-oral-slider-grip" aria-hidden>
            <span style={{ left: 10, top: 8 }} />
            <span style={{ left: 16, top: 8 }} />
            <span style={{ left: 22, top: 8 }} />
            <span style={{ left: 10, top: 14 }} />
            <span style={{ left: 16, top: 14 }} />
            <span style={{ left: 22, top: 14 }} />
          </div>
          <input
            type="range"
            min={0}
            max={0}
            value={0}
            aria-label="Ses seç"
            aria-valuetext={ORAL_VOICE_NAME}
            onChange={() => undefined}
          />
        </div>
      </div>
      <h2 className="cp-oral-section-title">Soru sayısı</h2>
      <div className="cp-oral-lengths" role="listbox" aria-label="Soru sayısı">
        {ORAL_LENGTH_OPTIONS.map((option) => {
          const on = option.questions === length;
          return (
            <button
              key={option.questions}
              type="button"
              role="option"
              aria-selected={on}
              className={on ? "cp-oral-mood is-on" : "cp-oral-mood"}
              onClick={() => onLength?.(option.questions)}
            >
              <span>
                <strong>{option.questions} soru</strong>
                <em>{option.minutes} dakika</em>
              </span>
            </button>
          );
        })}
      </div>
      <h2 className="cp-oral-section-title">Öğretmen havasını seç</h2>
      <div className="cp-oral-moods" role="listbox" aria-label="Öğretmen havasını seç">
        {ORAL_TEACHER_MOODS.map((mood) => {
          const Icon = MOOD_ICON[mood.id];
          const on = mood.id === moodId;
          return (
            <button
              key={mood.id}
              type="button"
              role="option"
              aria-selected={on}
              className={on ? "cp-oral-mood is-on" : "cp-oral-mood"}
              onClick={() => onMood(mood.id)}
            >
              {mood.badge ? (
                <span className={mood.badge === "ÖNERİLMEZ" ? "cp-oral-mood-badge is-no" : "cp-oral-mood-badge"}>
                  {mood.badge}
                </span>
              ) : null}
              <span className="cp-oral-mood-icon" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <strong>{mood.title}</strong>
                <em>{mood.blurb}</em>
              </span>
              {on ? <Check className="cp-oral-mood-check h-4 w-4" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="cp-oral-footer">
        <button type="button" className="cp-oral-cta" onClick={onStart}>
          Sözlü Deneme Sınavını Başlat
        </button>
        {founder ? (
          <p className="cp-oral-note">
            <Crown className="h-3 w-3" style={{ color: "var(--cp-gold)" }} aria-hidden />
            Kurucu hesabı: bu oturum kredinden düşmez.
          </p>
        ) : (
          <p className="cp-oral-note">
            <Info className="h-3.5 w-3.5" aria-hidden />
            Sesli oturum mevcut çalışma hakkını kullanır
          </p>
        )}
        {notice ? (
          <p role="alert" className="cp-oral-note">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function OralPreflightDialog({
  onConfirm,
  onCancel,
  questionCount = 3,
  minutes = 7,
  copy,
}: {
  onConfirm: () => void;
  onCancel?: () => void;
  questionCount?: number;
  minutes?: number;
  copy?: { title: string; body: string; items: readonly string[]; confirm: string };
}) {
  const resolved = copy ?? oralPreflightCopy(questionCount, minutes);
  return (
    <div className="cp-oral-modal-back">
      <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="oral-preflight-title">
        <h2 id="oral-preflight-title">{resolved.title}</h2>
        <ul className="cp-oral-checks">
          {resolved.items.map((item) => (
            <li key={item}>
              <CircleCheck className="h-4 w-4" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <div className="cp-oral-modal-actions">
          {onCancel ? (
            <button type="button" className="cp-oral-ghost" onClick={onCancel}>
              Vazgeç
            </button>
          ) : null}
          <button type="button" className="cp-oral-cta" onClick={onConfirm}>
            {resolved.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OralEndDialog({
  busy,
  answered = 0,
  total = 0,
  onStay,
  onConfirm,
}: {
  busy?: boolean;
  answered?: number;
  total?: number;
  onStay: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="cp-oral-modal-back">
      <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="oral-end-title">
        <h2 id="oral-end-title">Sınav değerlendirmeye gönderilsin mi?</h2>
        <p>
          {answered}/{total || "?"} soruyu cevapladın.
        </p>
        <div className="cp-oral-modal-actions">
          <button type="button" className="cp-oral-ghost" onClick={onStay} disabled={busy}>
            Sınava dön
          </button>
          <button type="button" className="cp-oral-cta" onClick={onConfirm} disabled={busy}>
            {busy ? "Gönderiliyor…" : "Evet, gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OralReviewTimeDialog({ onSeeResults }: { onSeeResults: () => void }) {
  return (
    <div className="cp-oral-modal-back">
      <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="oral-review-time-title">
        <h2 id="oral-review-time-title">İnceleme zamanı!</h2>
        <p>Cevapların değerlendiriliyor…</p>
        <button type="button" className="cp-oral-cta" onClick={onSeeResults}>
          Sonuçlarımı gör
        </button>
      </div>
    </div>
  );
}

export function OralResults({
  topicLabel,
  pct,
  onReview,
  onRepeat,
  nextHref,
  strengths = [],
  weaknesses = [],
  practiceHref,
  practiceLabel,
  fullCount,
  total,
  minutesSpent,
}: {
  topicLabel: string;
  pct: number;
  onReview: () => void;
  onRepeat: () => void;
  nextHref: string;
  strengths?: string[];
  weaknesses?: string[];
  practiceHref?: string | null;
  practiceLabel?: string | null;
  fullCount?: number;
  total?: number;
  minutesSpent?: number;
}) {
  return (
    <section className="cp-oral cp-oral-results">
      <h1 className="cp-oral-results-title">Sözlü deneme sonucu</h1>
      <div className="cp-oral-ring-wrap">
        <ProgressRing value={pct} size={140} strokeWidth={10}>
          <span className="cp-oral-ring-pct">{formatTopicPct(pct)}</span>
          <span className="cp-oral-ring-headline">{oralHeadline(pct)}</span>
        </ProgressRing>
      </div>
      <p className="cp-oral-scorecard-topic">{topicLabel}</p>
      <div className="cp-oral-stat-row" aria-label="Oturum özeti">
        <article>
          <span>Harcanan zaman</span>
          <strong>{minutesSpent ?? 1} dk</strong>
        </article>
        <article>
          <span>Tam doğru</span>
          <strong>
            {fullCount ?? "—"}/{total ?? "—"}
          </strong>
        </article>
        <article>
          <span>Önceki deneme</span>
          <strong>İlk deneme</strong>
        </article>
      </div>
      <button type="button" className="cp-oral-review-link" onClick={onReview}>
        <Sparkles className="h-4 w-4" aria-hidden />
        Cevaplarımı gözden geçir
      </button>
      <p className="cp-oral-summary">{oralSummary(pct)}</p>
      <div className="cp-oral-split">
        <section aria-label="Güçlü yanlar" className="cp-oral-side-card">
          <h2>
            <ThumbsUp className="h-4 w-4" aria-hidden />
            Güçlü yanlar
          </h2>
          {strengths.length ? (
            <ul>
              {strengths.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Bu denemede belirgin bir güçlü yan listelenmedi.</p>
          )}
        </section>
        <section aria-label="Eksikler" className="cp-oral-side-card">
          <h2>
            <Target className="h-4 w-4" aria-hidden />
            Eksikler
          </h2>
          {weaknesses.length ? (
            <ul>
              {weaknesses.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Bu denemede belirgin bir eksik görünmüyor.</p>
          )}
        </section>
      </div>
      {practiceHref ? (
        <Link className="cp-oral-review-link" href={practiceHref}>
          {practiceLabel || "Eksik konuda pratik"}
        </Link>
      ) : null}
      <div className="cp-oral-result-actions">
        <button type="button" className="cp-oral-ghost" onClick={onRepeat}>
          Tekrarla
        </button>
        <Link className="cp-oral-cta" href={nextHref}>
          Devam et
        </Link>
      </div>
    </section>
  );
}

export function OralAnswerReview({
  items,
  index,
  tab,
  onTab,
  onIndex,
  onClose,
}: {
  items: OralReviewItem[];
  index: number;
  tab: "ai" | "you";
  onTab: (tab: "ai" | "you") => void;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const raw = items[index] ?? items[0];
  const item = raw ? presentOralReview(raw) : undefined;
  const pctLabel = item?.scoreLabel ?? (item?.answer ? "Yanıt alındı" : "%0 puan");
  const missed = item?.verdict === "yanlis" || item?.verdict === "bos";
  return (
    <section className="cp-oral">
      <header className="cp-oral-bar">
        <span />
        <p>Soru {items.length ? index + 1 : 1}</p>
        <button type="button" className="cp-oral-icon" aria-label="Kapat" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="cp-oral-review-head">
        <strong>{pctLabel}</strong>
      </div>
      <div className="cp-oral-tabs" role="tablist" aria-label="Cevap incelemesi">
        <button type="button" role="tab" aria-selected={tab === "ai"} onClick={() => onTab("ai")}>
          AI incelemesi
        </button>
        <button type="button" role="tab" aria-selected={tab === "you"} onClick={() => onTab("you")}>
          Senin cevabın
        </button>
      </div>
      {item ? (
        tab === "ai" ? (
          <article className="cp-oral-review-card">
            <p className="cp-oral-review-kicker">CEVAP İNCELEMESİ</p>
            <h2>
              {missed ? <X className="h-5 w-5" aria-hidden /> : <CircleCheck className="h-5 w-5" aria-hidden />}
              Çözüm
            </h2>
            <p>
              <SolutionText text={item.solution} />
            </p>
            {item.missing ? <p className="cp-oral-miss">Eksik: {item.missing}</p> : null}
            {item.citation ? <p>Kaynak: {item.citation}</p> : null}
          </article>
        ) : (
          <div>
            <article className="cp-oral-review-card">
              <p className="cp-oral-review-kicker">SORU</p>
              <p>{item.question}</p>
            </article>
            <article className="cp-oral-review-card cp-oral-review-card--next">
              <p className="cp-oral-review-kicker">CEVAP</p>
              <p>{item.answer || "Sesli cevap kaydedilmedi."}</p>
            </article>
          </div>
        )
      ) : (
        <p className="cp-oral-empty">İncelenecek soru yok.</p>
      )}
      <div className="cp-oral-nav">
        <button
          type="button"
          className="cp-oral-icon"
          aria-label="Önceki soru"
          disabled={index <= 0}
          onClick={() => onIndex(Math.max(0, index - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="cp-oral-icon"
          aria-label="Sonraki soru"
          disabled={!items.length || index >= items.length - 1}
          onClick={() => onIndex(Math.min(items.length - 1, index + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
