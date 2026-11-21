"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { RememberCard } from "@/components/chat/remember-card";
import { splitRememberBlock } from "@/lib/learning/remember-facts";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileText,
  History,
  Lightbulb,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MathText } from "@/components/learning/math-text";
import { formatSourceSections, generalOnlyAnswer } from "@/lib/ai/source-sections";
import { splitTutorChrome, type ReplyChip, type ReplyQuote } from "@/lib/learning/tutor-reply";
import { splitActionMarkers, type ChatAction } from "@/lib/ai/chat-material-link";
import { stripOrphanCitations } from "@/lib/ai/chat-answer-settle";
import "@/styles/chat-teaching.css";
import "@/styles/teacher-v2-sohbet.css";
import { LADDER_CHIPS, SOCRATIC_QUICK_CHIPS, stepQuickChips, type TutorStyle } from "@/lib/learning/tutor-style";
import { splitFinalQuestion } from "@/lib/learning/question-bubble";
import { parseQuickCheck, type QuickCheckOption } from "@/lib/teacher/quick-check";
import { chosenQuickCheckLetter, type ReplyAction } from "@/lib/teacher/reply-actions";
import { TeacherQuickCheck } from "@/components/chat/teacher-quick-check";

/**
 * Faz 11 (teacher.v2, ana sohbet): yanıtın öğretmen hâli. Verilince yanıtın kendi hızlı çipleri (Rehberli/Sokratik
 * merdiveni, Adım Adım çipleri) yerine `actions` tek sırada durur; sunucunun `[[chip:…]]` önerileri aynı sıranın sonuna
 * eklenir (aynı etiket/istem bir kez) ve sıra `maxChips` ile kesilir. `actions` null ise (son yanıt değil) yanıtın
 * altında çip yoktur. Mini yoklama kart olarak çizilir.
 */
export type TutorReplyV2 = {
  actions: ReplyAction[] | null;
  /** Soru "Sıra sende" kartında (Adım Adım Öğret). */
  askCard: boolean;
  /** Yoklama kartı etkileşimli mi (yalnız son yanıt, akış bitmişken). */
  interactiveCheck: boolean;
  /** Yanıtın hemen ardından gelen öğrenci mesajı: yoklamada seçilen şık buradan okunur. */
  answeredWith?: string | null;
  onCheckAnswer?: (option: QuickCheckOption) => void;
  /** Çip sırasının altındaki durum satırı (ör. deftere eklendi). */
  note?: React.ReactNode;
};

function V2ActionChip({
  action,
  disabled,
  onPrompt,
}: {
  action: ReplyAction;
  disabled: boolean;
  onPrompt?: (prompt: string) => void;
}) {
  if (action.href) {
    return (
      <Link href={action.href} className="cp-tutor-chip cx-v2-chip" data-chip={action.id}>
        {action.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="cp-tutor-chip cx-v2-chip"
      data-chip={action.id}
      disabled={disabled || action.disabled}
      aria-busy={action.busy || undefined}
      onClick={() => {
        if (action.onSelect) action.onSelect();
        else if (action.prompt) onPrompt?.(action.prompt);
      }}
    >
      {action.label}
    </button>
  );
}

function TutorBody({
  body,
  quote,
  variant,
}: {
  body: string;
  quote: ReplyQuote | null;
  variant: "default" | "parity";
}) {
  if (!body && !quote) return null;
  const parts = body.split("[[QUOTE]]");
  if (!quote || parts.length < 2) {
    return body ? <Markdown content={body} variant={variant} /> : null;
  }
  const [before, after] = parts;
  return (
    <>
      {before?.trim() ? <Markdown content={before.trim()} variant={variant} /> : null}
      <blockquote className="cp-tutor-quote">
        <p>{quote.text}</p>
        <footer>— {quote.source}</footer>
      </blockquote>
      {after?.trim() ? <Markdown content={after.trim()} variant={variant} /> : null}
    </>
  );
}

/**
 * Cevabın altındaki gerçek stüdyo düğmeleri (15 Kasım 2026): sunucunun bastığı işaretlerden (model yazamaz). Bağlantı
 * yalnız uygulama içi çalışma sayfalarına; ilk kart birincil (ekranın tek marka eylemi), öbürleri cam.
 */
function StudioActionCards({ actions }: { actions: ChatAction[] }) {
  if (!actions.length) return null;
  return (
    <nav className="cp-chat-actions" aria-label="Çalışma araçları">
      {actions.map((action, index) => (
        <Link
          key={action.href}
          href={action.href}
          className={index === 0 ? "cp-chat-action cp-chat-action--primary" : "cp-chat-action"}
          data-kind={action.kind}
        >
          <span className="cp-chat-action-text">
            <span className="cp-chat-action-label">{action.label}</span>
            {action.context ? <span className="cp-chat-action-context">{action.context}</span> : null}
          </span>
          <ArrowRight size={16} aria-hidden />
        </Link>
      ))}
    </nav>
  );
}

function VerdictChip({ label, verdict }: { label: string; verdict: "dogru" | "kismen" | "yanlis" }) {
  const Icon = verdict === "dogru" ? CheckCircle2 : verdict === "kismen" ? CircleDot : XCircle;
  return (
    <p className={`cp-tutor-verdict cp-tutor-verdict--${verdict}`} role="status">
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </p>
  );
}

/**
 * Sohbet yanıtı: benzetme, kural, sıra sende, hüküm çipi, katlanır işlem,
 * kaynak / geçmiş çipi, takip önerisi.
 */
export function TutorReplyView({
  content,
  variant = "parity",
  disabled = false,
  onPrompt,
  error,
  onRetry,
  hideChips = false,
  tutorStyle,
  quickActions = true,
  maxChips,
  ladderChips = false,
  v2,
}: {
  /** Faz 11 (teacher.v2, ana sohbet): tepki çipleri, "Sıra sende" kartı ve mini yoklama. Verilmezse bugünkü gibi. */
  v2?: TutorReplyV2;
  /**
   * teacher.v2 (Faz 13 PR-1): Rehberli ve Sokratik yanıtın altında "İpucu ver" ve "Cevabı göster" her zaman; soru
   * cümlesi ayrı kartta ("Sıra sende"). Verilmezse bugünkü gibi.
   */
  ladderChips?: boolean;
  /** teacher.v2 (Faz 13A): yanıtın altındaki çiplerin tavanı (en çok 3). Verilmezse bugünkü gibi hepsi. */
  maxChips?: number;
  /** Adım Adım modunun hızlı eylemleri yalnız sohbetin son yanıtında; çağıran son yanıt değilse false verir. */
  quickActions?: boolean;
  /** Ayarlar > Önerilen sorular kapalıysa devam çipleri çizilmez. */
  hideChips?: boolean;
  content: string;
  variant?: "default" | "parity";
  disabled?: boolean;
  onPrompt?: (prompt: string) => void;
  error?: boolean;
  onRetry?: () => void;
  /** Sokratik modda ipucu / adım / tam çözüm çipleri her yanıtın altında; Adım Adım modunda sıradaki adım / tam çözüm. */
  tutorStyle?: TutorStyle;
}) {
  const checkRef = useRef<HTMLDivElement | null>(null);
  // Stüdyo düğmeleri cevaptan ayrılır (sunucunun işareti); kalan metin bugünkü gibi çizilir.
  const split = useMemo(() => splitActionMarkers(content), [content]);
  // Kaynak listesi ya da kaynak kartı olmayan cevapta çıplak `[n]` atfının karşılığı yok (15 Kasım 2026): eski
  // mesajlarda ve akan taslakta da öğrenci boşta kalan `[2]` görmesin.
  const body = useMemo(
    () => (/Kaynaklar:|\[\[kaynak:/.test(split.body) ? split.body : stripOrphanCitations(split.body)),
    [split.body],
  );
  const view = useMemo(
    () => splitTutorChrome(formatSourceSections(body)),
    [body],
  );
  // "Akılda kalsın" kutusu cevaptan ayrılır, düğmeli kartla çizilir (8 Kasım 2026).
  const remember = useMemo(() => splitRememberBlock(view.body), [view.body]);
  // Hızlı eylemler: Sokratik modda her yanıtın altında; Adım Adım modunda yalnız adımlı yanıtın ("N. adım" + "Devam et"
  // daveti) ve yalnız son yanıtın altında (eski adımın çipi sıradaki adımı yanlış gösterirdi).
  const hasV2 = Boolean(v2);
  const quickChips = useMemo(
    () =>
      hasV2
        ? []
        : ladderChips
        ? LADDER_CHIPS
        : tutorStyle === "hints_first"
        ? SOCRATIC_QUICK_CHIPS
        : tutorStyle === "step_by_step" && quickActions
          ? stepQuickChips(content)
          : [],
    [content, quickActions, tutorStyle, ladderChips, hasV2],
  );
  // Faz 11: öğretmenin mini yoklaması kart olur (yalnız v2); kurala uymayan blok düz metin kalır.
  const quickCheck = useMemo(() => (hasV2 ? parseQuickCheck(remember.body) : null), [hasV2, remember.body]);
  // Soru ayrı kartta (PROMPT-V2 §7): yalnız bayrak açıkken ve yanıtın kendi "Sıra sende" kartı yokken.
  const askEnabled = ladderChips || Boolean(v2?.askCard);
  const ask = useMemo(
    () => (askEnabled && !view.check && !quickCheck ? splitFinalQuestion(remember.body) : null),
    [askEnabled, view.check, quickCheck, remember.body],
  );
  // Faz 11: tek çip sırası. Önce öğretmenin tepki eylemleri, sonra (yer kalırsa) sunucunun önerileri; aynı etiket ya da
  // istem bir kez. Son yanıt değilse (`actions` null) çip yok.
  const v2Row = useMemo(() => {
    if (!v2?.actions) return null;
    const seen = new Set<string>();
    const row: ReplyAction[] = [];
    const extra = hideChips ? [] : view.chips.map((chip, index) => ({ id: `oneri-${index}`, label: chip.label, prompt: chip.prompt }));
    for (const action of [...v2.actions, ...extra]) {
      const keys = [action.label, action.prompt].filter((key): key is string => Boolean(key));
      if (keys.some((key) => seen.has(key))) continue;
      keys.forEach((key) => seen.add(key));
      row.push(action);
    }
    return maxChips != null ? row.slice(0, maxChips) : row;
  }, [v2, hideChips, view.chips, maxChips]);
  const chips = useMemo(() => {
    const extra = hideChips ? [] : view.chips;
    const seen = new Set<string>();
    const next: ReplyChip[] = [];
    for (const chip of [...quickChips, ...extra]) {
      if (seen.has(chip.label) || seen.has(chip.prompt)) continue;
      seen.add(chip.label);
      seen.add(chip.prompt);
      next.push(chip);
    }
    return maxChips != null ? next.slice(0, maxChips) : next;
  }, [hideChips, quickChips, view.chips, maxChips]);
  const quickLabels = new Set(quickChips.map((chip) => chip.label));
  const quickClass = tutorStyle === "step_by_step" ? "cp-tutor-chip cp-tutor-chip--step" : "cp-tutor-chip cp-tutor-chip--socratic";

  useEffect(() => {
    if (!view.check || typeof window === "undefined") return;
    // Mobilde klavye aniden açılmasın.
    if (window.matchMedia("(max-width: 640px)").matches) return;
    const composer = document.querySelector<HTMLTextAreaElement>(
      "textarea[name='message'], textarea.cp-exam-input, textarea.cp-sor-input",
    );
    composer?.focus();
  }, [view.check]);

  if (error) {
    return (
      <div className="cp-tutor-error" role="alert">
        <AlertCircle size={18} aria-hidden />
        <p>Yanıt bu sefer gelmedi; sorunu yeniden gönderebilirsin.</p>
        {onRetry ? (
          <button type="button" className="cp-tutor-error-retry" onClick={onRetry}>
            Yeniden dene
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {view.badge ? <p className="cp-tutor-badge">{view.badge}</p> : null}
      {view.verdict ? (
        <VerdictChip label={view.verdict.label} verdict={view.verdict.verdict} />
      ) : null}
      {view.verifying ? (
        <div className="cp-tutor-verifying" aria-live="polite">
          <div className="pm-skeleton" style={{ height: 12, width: "92%" }} />
          <div className="pm-skeleton" style={{ height: 12, width: "70%", marginTop: 8 }} />
          <p className="cp-tutor-verifying-label">Hesaplar doğrulanıyor…</p>
        </div>
      ) : null}
      {view.analogy ? (
        <aside className="cp-tutor-analogy">
          <p className="cp-tutor-analogy-kicker">
            <Lightbulb size={16} aria-hidden />
            Benzetme
          </p>
          <p className="cp-tutor-analogy-body">{view.analogy}</p>
        </aside>
      ) : null}
      {view.rule ? (
        <div className="cp-tutor-rule">
          <MathText text={view.rule} />
        </div>
      ) : null}
      {view.example ? (
        <section className="cp-tutor-example">
          <p className="cp-tutor-example-title">Notlarından bir örnek</p>
          <Markdown content={view.example} variant={variant} />
        </section>
      ) : null}
      {quickCheck && v2 ? (
        <>
          {quickCheck.before || view.quote ? <TutorBody body={quickCheck.before} quote={view.quote} variant={variant} /> : null}
          {remember.items.length ? <RememberCard items={remember.items} /> : null}
          <TeacherQuickCheck
            check={quickCheck}
            interactive={v2.interactiveCheck && !disabled}
            chosen={chosenQuickCheckLetter(quickCheck, v2.answeredWith)}
            onAnswer={v2.onCheckAnswer}
          />
          {quickCheck.after ? <TutorBody body={quickCheck.after} quote={null} variant={variant} /> : null}
        </>
      ) : (
        <>
          {!ask || ask.body || view.quote ? <TutorBody body={ask ? ask.body : remember.body} quote={view.quote} variant={variant} /> : null}
          {remember.items.length ? <RememberCard items={remember.items} /> : null}
        </>
      )}
      {ask ? (
        <div className="cp-tutor-check cp-tutor-ask">
          <p className="cp-tutor-check-kicker">Sıra sende</p>
          <div className="cp-tutor-check-q">
            <MathText text={ask.question} />
          </div>
        </div>
      ) : null}
      {view.check ? (
        <div className="cp-tutor-check" ref={checkRef}>
          <p className="cp-tutor-check-kicker">Sıra sende</p>
          <p className="cp-tutor-check-q">{view.check}</p>
          <p className="cp-tutor-check-hint">Cevabını aşağıya yaz ya da söyle.</p>
        </div>
      ) : null}
      {view.steps ? (
        <details className="cp-tutor-steps">
          <summary>
            <ChevronDown size={16} aria-hidden />
            Adımları göster
          </summary>
          <Markdown content={view.steps} variant={variant} />
        </details>
      ) : null}
      {view.followUp ? <p className="cp-tutor-followup">{view.followUp}</p> : null}
      {/* Yalnız genel bilgiyle verilen cevabın altında belge sayfa çipi durmaz (30 Ekim 2026, canlı tur). */}
      {((view.citations.length > 0 && !generalOnlyAnswer(content)) || view.historyCitations.length > 0) ? (
        <div className="cp-tutor-cites">
          {(generalOnlyAnswer(content) ? [] : view.citations).map((item) => {
            const raw = `${item.documentName}${item.pageNumber != null ? ` · ${item.slide ? "slayt" : "s."} ${item.pageNumber}` : ""}`;
            const label = raw.length > 24 ? `${raw.slice(0, 23)}…` : raw;
            return (
              <a
                key={`${item.href}-${item.documentName}`}
                className="cp-tutor-cite cp-tutor-cite--card"
                href={item.href}
                title={raw}
              >
                <FileText size={14} aria-hidden />
                <span>
                  <span className="cp-tutor-cite-kicker">
                    {item.slide ? "Slayt" : item.pageNumber != null ? `Sayfa ${item.pageNumber}` : "Kaynak"}
                  </span>
                  <span className="cp-tutor-cite-name">{label}</span>
                </span>
              </a>
            );
          })}
          {view.historyCitations.map((item) => (
            <span key={item.id} className="cp-tutor-cite cp-tutor-cite--history" title={item.label}>
              <History size={14} aria-hidden />
              {item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label}
            </span>
          ))}
        </div>
      ) : null}
      {view.scope ? (
        <button
          type="button"
          className="cp-tutor-scope"
          disabled={disabled}
          onClick={() => onPrompt?.(view.scope?.prompt ?? "")}
        >
          {view.scope.label}
        </button>
      ) : null}
      <StudioActionCards actions={split.actions} />
      {!v2 && chips.length ? (
        <div className="cp-tutor-chips" role="group" aria-label="Devam önerileri">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={quickLabels.has(chip.label) ? quickClass : "cp-tutor-chip"}
              disabled={disabled}
              onClick={() => onPrompt?.(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      {v2Row?.length ? (
        <div className="cp-tutor-chips cx-v2-chips" role="group" aria-label="Devam önerileri">
          {v2Row.map((action) => (
            <V2ActionChip key={action.id} action={action} disabled={disabled} onPrompt={onPrompt} />
          ))}
        </div>
      ) : null}
      {v2?.note ? v2.note : null}
    </>
  );
}
