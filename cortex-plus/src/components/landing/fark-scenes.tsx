import { Check, FileText, Keyboard, Mic, X } from "lucide-react";
import { ClassShareShowcaseCard } from "@/components/landing/fark-vitrini";
import { SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import { FARK_LABELS, NOTE_SCENE, PARENT_LINK_SCENE, SILENT_ORAL_SCENE, TWIN_EXAM_SCENE } from "@/lib/marketing/fark-accordion";
import { splitShowcaseTitle } from "@/lib/marketing/fark-vitrini";

/**
 * "Aynı not, iki ayrı sonuç" akordeonunun durağan sahneleri (Faz 9, 20 Kasım 2026). Durum, istek ve hareket kodu yok:
 * sunucuda çizilir, akordeona prop olarak verilir. Etkileşimli sahneler ayrı dosyalarda (radyo, kırmızı kalem, ikiz soru).
 * Metnin tamamı `fark-accordion.ts` ve `advantage-content.ts`te (`SAME_NOTE_CASE`).
 */

const letter = (at: number) => String.fromCharCode(65 + at);

function SceneTitle({ title, plus = false }: { title: string; plus?: boolean }) {
  const { emoji, text } = splitShowcaseTitle(title);
  return (
    <div className="fk-card-head">
      <h4 className="fk-card-title">
        {emoji ? (
          <span className="fk-card-emoji" aria-hidden>
            {emoji}
          </span>
        ) : null}
        {text}
      </h4>
      {plus ? <span className="fk-plus">{FARK_LABELS.plus}</span> : null}
    </div>
  );
}

/** Sahne 1: aynı ders notu iki yere verilince. Solda genel botlar (sönük, kesik çizgi), sağda Cortex Plus (ışıkta). */
export function SameNoteScene() {
  const data = SAME_NOTE_CASE;
  const [themPoint, themOptions] = data.others.points;
  const [rulePoint, optionPoint] = data.cortex.points;
  return (
    <article className="fk-card fk-note" aria-label={`${FARK_LABELS.them} ve ${FARK_LABELS.us}: ${data.input.label}`} data-testid="same-note-case">
      <div className="fk-note-file">
        <FileText className="fk-note-icon" aria-hidden />
        <p className="fk-note-name">
          <strong>{data.input.label}</strong>
          <span className="fk-mono">{data.input.file}</span>
        </p>
      </div>
      <ul className="fk-note-lines">
        {data.input.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="fk-split">
        <section className="fk-side fk-side--them" aria-label={FARK_LABELS.them}>
          <h4 className="fk-side-head">
            <X className="fk-side-icon" strokeWidth={3} aria-hidden />
            {FARK_LABELS.them}
          </h4>
          <ul className="fk-points">
            <li>{themPoint}</li>
          </ul>
          <ol className="fk-opts fk-opts--ghost" aria-hidden>
            {NOTE_SCENE.themLetters.map((item) => (
              <li key={item}>
                <span className="fk-opt-letter">{item}</span>
                <span className="fk-opt-bar" />
              </li>
            ))}
          </ol>
          <p className="fk-cap">{themOptions}</p>
        </section>

        <section className="fk-side fk-side--us" aria-label={FARK_LABELS.us}>
          <h4 className="fk-side-head">
            <Check className="fk-side-icon" strokeWidth={3} aria-hidden />
            {FARK_LABELS.us}
            <span className="fk-badge">{data.cortex.badge}</span>
          </h4>
          <ul className="fk-points">
            <li>{rulePoint.text}</li>
          </ul>
          <div className="fk-q">
            <p className="fk-q-text">{NOTE_SCENE.question}</p>
            <ol className="fk-opts">
              {NOTE_SCENE.options.map((option, at) => {
                const right = at === NOTE_SCENE.answerIndex;
                return (
                  <li key={option} className={right ? "is-right" : undefined}>
                    <span className="fk-opt-letter">{letter(at)}</span>
                    <span className="fk-opt-text">{option}</span>
                    {/* Durum renkle değil, adı olan simgeyle de söylenir (gizli metin yerine: yazı katmanında üst üste binmez). */}
                    {right ? <Check className="fk-opt-mark" strokeWidth={3} role="img" aria-label="Doğru cevap" /> : null}
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="fk-cap">{optionPoint.text}</p>
          <ul className="fk-checks" aria-label={data.cortex.badge}>
            {NOTE_SCENE.checks.map((item) => (
              <li key={item}>
                <Check className="fk-check-icon" strokeWidth={3} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

/** Sahne 5: çıkmış sorulardan 20 soruluk ikiz sınavın önizlemesi ve mikrofonsuz (yazılı) sözlü. İkisi Plus'ta. */
export function TwinExamScene() {
  const exam = TWIN_EXAM_SCENE;
  const oral = SILENT_ORAL_SCENE;
  const cells = exam.topics.flatMap((topic, at) => Array.from({ length: topic.count }, () => at));
  return (
    <div className="fk-stack" data-testid="twin-exam-scene">
      <article className="fk-card fk-exam" aria-label={splitShowcaseTitle(exam.title).text}>
        <SceneTitle title={exam.title} plus />
        <p className="fk-kicker">{exam.sample}</p>
        <ol className="fk-cells" aria-hidden>
          {cells.map((topic, at) => (
            <li key={at} data-topic={topic}>
              {at + 1}
            </li>
          ))}
        </ol>
        <ul className="fk-legend">
          {exam.topics.map((topic, at) => (
            <li key={topic.name} data-topic={at}>
              <span className="fk-legend-dot" aria-hidden />
              {topic.name}
              <b>{topic.count}</b>
            </li>
          ))}
        </ul>
        <p className="fk-fine">{exam.unlock}</p>
      </article>

      <article className="fk-card fk-oral" aria-label={splitShowcaseTitle(oral.title).text}>
        <SceneTitle title={oral.title} plus />
        <p className="fk-kicker">{oral.counter}</p>
        <p className="fk-oral-prompt">{oral.prompt}</p>
        <div className="fk-oral-box">
          <p className="fk-oral-answer">
            {oral.answer}
            <span className="fk-caret" aria-hidden />
          </p>
          <div className="fk-oral-row">
            <span className="fk-oral-mic" aria-hidden>
              <Mic className="h-4 w-4" />
            </span>
            <span className="fk-oral-hint">
              {oral.mic} · {oral.placeholder}
            </span>
          </div>
        </div>
        <p className="fk-oral-done">
          <Keyboard className="h-4 w-4" aria-hidden />
          {oral.typed}
        </p>
      </article>
    </div>
  );
}

/** Sahne 6: sınıfla paylaşım (QR'lı sınav sabahı kâğıdı, +50 kredi) ve velime ödeme linki rozeti. */
export function ShareScene() {
  const parent = PARENT_LINK_SCENE;
  return (
    <div className="fk-stack" data-testid="share-scene">
      <ClassShareShowcaseCard />
      <article className="fk-card fk-parent" aria-label={splitShowcaseTitle(parent.badge).text} data-testid="parent-link-scene">
        <p className="fk-parent-badge">{parent.badge}</p>
        <ul className="fk-parent-facts">
          {parent.facts.map((fact) => (
            <li key={fact}>
              <Check className="fk-check-icon" strokeWidth={3} aria-hidden />
              {fact}
            </li>
          ))}
        </ul>
        <p className="fk-fine">{parent.note}</p>
      </article>
    </div>
  );
}
