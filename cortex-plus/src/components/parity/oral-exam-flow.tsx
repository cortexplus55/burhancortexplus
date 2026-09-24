"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, Flame, Info, MessageCircle, Sparkles, X } from "lucide-react";
import {
  formatTopicPct,
  letterGrade,
  ORAL_PREFLIGHT,
  ORAL_TEACHER_MOODS,
  ORAL_VOICE_NAME,
  oralHeadline,
  oralSummary,
  type OralReviewItem,
  type OralTeacherMoodId,
} from "@/lib/learning/oral-exam-chrome";
import "@/styles/oral-exam-chrome.css";

export type OralTopicRow = { id: string; label: string; pct: number };

function SolutionText({ text }: { text: string }) {
  const marker = "Hatanız şuradaydı:";
  const at = text.indexOf(marker);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="cp-oral-miss">{text.slice(at)}</span>
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
  onBack,
  onClose,
  onStart,
  notice,
}: {
  moodId: OralTeacherMoodId;
  onMood: (id: OralTeacherMoodId) => void;
  onBack: () => void;
  onClose: () => void;
  onStart: () => void;
  notice?: string | null;
}) {
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
        <p className="cp-oral-note">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Sesli oturum mevcut çalışma hakkını kullanır
        </p>
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
}: {
  onConfirm: () => void;
}) {
  return (
    <div className="cp-oral-modal-back">
      <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="oral-preflight-title">
        <h2 id="oral-preflight-title">{ORAL_PREFLIGHT.title}</h2>
        <p>{ORAL_PREFLIGHT.body}</p>
        <ul className="cp-oral-checks">
          {ORAL_PREFLIGHT.items.map((item) => (
            <li key={item}>
              <CircleCheck className="h-4 w-4" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <button type="button" className="cp-oral-cta" onClick={onConfirm}>
          {ORAL_PREFLIGHT.confirm}
        </button>
      </div>
    </div>
  );
}

export function OralEndDialog({
  busy,
  onStay,
  onConfirm,
}: {
  busy?: boolean;
  onStay: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="cp-oral-modal-back">
      <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="oral-end-title">
        <h2 id="oral-end-title">Test değerlendirme için gönderilsin mi?</h2>
        <p>Testi bitirip cevaplarını değerlendirmeye göndermek üzeresin.</p>
        <div className="cp-oral-modal-actions">
          <button type="button" className="cp-oral-ghost" onClick={onStay} disabled={busy}>
            Kal
          </button>
          <button type="button" className="cp-oral-cta" onClick={onConfirm} disabled={busy}>
            {busy ? "Gönderiliyor…" : "Evet"}
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
        <p>
          Öğretmenin yanıtlarını gözden geçirip geri bildirim verecek ve bundan sonra
          neye odaklanman gerektiğini gösterecek.
        </p>
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
}: {
  topicLabel: string;
  pct: number;
  onReview: () => void;
  onRepeat: () => void;
  nextHref: string;
}) {
  const letter = letterGrade(pct);
  return (
    <section className="cp-oral cp-oral-results">
      <p className="cp-oral-results-kicker">Sınav simülasyonu sonuçları</p>
      <div className="cp-oral-books" aria-hidden>
        📚
      </div>
      <h1>{oralHeadline(pct)}</h1>
      <article className="cp-oral-scorecard">
        <p className="cp-oral-scorecard-topic">{topicLabel}</p>
        <div className="cp-oral-score-row">
          <div className="cp-oral-score-pill">
            <span>DENEME</span>
            <strong>{letter}</strong>
          </div>
          <div className="cp-oral-score-pill is-pct">
            <span>NOT</span>
            <strong>{formatTopicPct(pct)}</strong>
          </div>
        </div>
      </article>
      <button type="button" className="cp-oral-review-link" onClick={onReview}>
        <Sparkles className="h-4 w-4" aria-hidden />
        Cevaplarımı gözden geçir
      </button>
      <p className="cp-oral-summary">{oralSummary(pct)}</p>
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
  const item = items[index] ?? items[0];
  const pctLabel = item && item.answer ? "Yanıt alındı" : "%0 puan";
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
              <CircleCheck className="h-5 w-5" aria-hidden />
              Çözüm
            </h2>
            <p>
              <SolutionText text={item.solution} />
            </p>
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
