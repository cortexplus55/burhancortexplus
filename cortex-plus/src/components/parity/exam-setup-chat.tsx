"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check } from "lucide-react";

/**
 * Kurulum soruları — form değil, sohbet.
 *
 * Üç soruyu aynı anda gösteren bir form çalışıyordu ama Astra bunları
 * sırayla soruyor ve fark yalnızca görsel değil: tek soru ekranda
 * durunca öğrenci okuyor, üçü birden durunca atlıyor.
 *
 * Sorular YAZILI, model çağrısı yok. Gerçek bir sohbet her soru için bir
 * çağrı demek olurdu: kurulum yavaşlar, kredi harcar ve model çöktüğünde
 * öğrenci hazırlık kuramaz. Sohbet olan şey biçim; sorular sabit.
 *
 * Serbest metin gerçekten işe yarıyor: öğrencinin yazdığı not derse
 * kadar gidiyor (preferencePromptHint). Yazılıp hiçbir yere ulaşmayan
 * bir alan koymuyoruz — bu tuzağa learning_preferences ile bir kez
 * düşüldü.
 */

export type SetupAnswers = {
  style: "theory" | "examples" | "mixed";
  onlyMyFiles: boolean;
  dailyMinutes: number;
  /** Öğrencinin kendi cümlesi; derse tercih notu olarak gidiyor. */
  notes: string;
};

type Choice = { value: string; label: string; hint?: string };

type Question = {
  id: "style" | "source" | "minutes";
  /** Katlanmış satırda görünen kısa ad. */
  short: string;
  ask: string;
  lead?: string;
  choices: Choice[];
  /** "Sen karar ver" bunu seçer. */
  fallback: string;
};

const QUESTIONS: Question[] = [
  {
    id: "style",
    short: "Anlatım",
    ask: "Dersi nasıl anlatayım?",
    lead: "Aynı konuyu iki öğrenci farklı yoldan öğreniyor.",
    choices: [
      { value: "theory", label: "Önce anlat", hint: "Kavramı açan uzun anlatım" },
      { value: "examples", label: "Örnekle göster", hint: "Çözümlü örnek ve alıştırma" },
      { value: "mixed", label: "İkisi de", hint: "Anlatım ve örnek dengeli" },
    ],
    fallback: "mixed",
  },
  {
    id: "source",
    short: "Kaynak",
    ask: "Yalnızca yüklediğin belgeye mi bağlı kalayım?",
    lead: "Belgende olmayan bir konu çıkarsa ne yapmamı istersin?",
    choices: [
      {
        value: "only",
        label: "Yalnızca belgem",
        hint: "Belgende olmayan bilgi eklenmez",
      },
      {
        value: "supported",
        label: "Eksikleri tamamla",
        hint: "Belgen yetmezse genel bilgiyle destekle",
      },
    ],
    fallback: "only",
  },
  {
    id: "minutes",
    short: "Günlük süre",
    ask: "Günde ne kadar vaktin var?",
    lead: "Plan buna göre günlere bölünüyor.",
    choices: [
      { value: "20", label: "20 dk" },
      { value: "30", label: "30 dk" },
      { value: "45", label: "45 dk" },
      { value: "60", label: "60 dk" },
      { value: "90", label: "90 dk" },
    ],
    fallback: "45",
  },
];

export function ExamSetupChat({
  onDone,
  busy = false,
}: {
  onDone: (answers: SetupAnswers) => void;
  busy?: boolean;
}) {
  // Cevaplar: seçilen değer + varsa öğrencinin kendi cümlesi.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const [openIndex, setOpenIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const liveRef = useRef<HTMLLIElement>(null);

  const answeredCount = QUESTIONS.filter((q) => picked[q.id]).length;
  const done = answeredCount === QUESTIONS.length;
  const live = openIndex < QUESTIONS.length ? QUESTIONS[openIndex] : null;

  // Yeni soru ekrana gelince oraya kay; azaltılmış hareket isteyene zıplama yok.
  useEffect(() => {
    if (!liveRef.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    liveRef.current.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [openIndex]);

  function answer(question: Question, value: string, ownWords?: string) {
    setPicked((prev) => ({ ...prev, [question.id]: value }));
    if (ownWords !== undefined) {
      setWritten((prev) => ({ ...prev, [question.id]: ownWords }));
    }
    setDraft("");
    // Sıradaki cevapsız soruya geç; hepsi doluysa kapan. Bir cevabı
    // değiştirmek için geri dönüldüğünde de doğru yere dönmeli, bu yüzden
    // "ilk boş soru" ölçüsü kullanılıyor, "bir sonraki" değil.
    const next = QUESTIONS.findIndex(
      (q) => q.id !== question.id && !picked[q.id],
    );
    setOpenIndex(next === -1 ? QUESTIONS.length : next);
  }

  function labelFor(question: Question): string {
    const own = written[question.id];
    if (own) return own;
    return (
      question.choices.find((c) => c.value === picked[question.id])?.label ?? ""
    );
  }

  const answers: SetupAnswers = useMemo(() => {
    const notes = QUESTIONS.filter((q) => written[q.id])
      .map((q) => `${q.short}: ${written[q.id]}`)
      .join(" · ");
    return {
      style: (picked.style ?? "mixed") as SetupAnswers["style"],
      onlyMyFiles: (picked.source ?? "only") === "only",
      dailyMinutes: Number(picked.minutes ?? 45),
      notes,
    };
  }, [picked, written]);

  return (
    <section className="apw-step">
      <h1>Nasıl çalışalım?</h1>
      <p className="apw-lead">
        Üç kısa soru; dersler buna göre yazılır. Sonradan değiştirebilirsin.
      </p>

      <ol className="apc-thread">
        {QUESTIONS.map((question, index) => {
          const isLive = live?.id === question.id;
          const isAnswered = Boolean(picked[question.id]);

          if (!isLive && isAnswered) {
            return (
              <li key={question.id} className="apc-row apc-row--done">
                <button
                  type="button"
                  className="apc-done"
                  onClick={() => setOpenIndex(index)}
                >
                  <Check className="apc-check" aria-hidden />
                  <span className="apc-done-q">{question.short}</span>
                  <span className="apc-done-a">{labelFor(question)}</span>
                  <span className="apc-edit">değiştir</span>
                </button>
              </li>
            );
          }

          if (!isLive) return null;

          return (
            <li key={question.id} className="apc-row apc-row--live" ref={liveRef}>
              <p className="apc-ask">{question.ask}</p>
              {question.lead ? <p className="apc-sub">{question.lead}</p> : null}
              <div
                className={
                  question.id === "minutes" ? "apc-opts apc-opts--tight" : "apc-opts"
                }
              >
                {question.choices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={
                      picked[question.id] === choice.value && !written[question.id]
                        ? "apw-tile apw-tile--on"
                        : "apw-tile"
                    }
                    aria-pressed={picked[question.id] === choice.value}
                    onClick={() => {
                      setWritten((prev) => ({ ...prev, [question.id]: "" }));
                      answer(question, choice.value, "");
                    }}
                  >
                    <b>{choice.label}</b>
                    {choice.hint ? <span>{choice.hint}</span> : null}
                  </button>
                ))}
              </div>

              <div className="apc-compose">
                <input
                  value={draft}
                  placeholder="Ya da kendi cümlenle yaz"
                  aria-label={`${question.ask} — kendi cevabın`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !draft.trim()) return;
                    event.preventDefault();
                    answer(question, question.fallback, draft.trim());
                  }}
                />
                <button
                  type="button"
                  aria-label="Cevabı gönder"
                  disabled={!draft.trim()}
                  onClick={() => answer(question, question.fallback, draft.trim())}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <button
                type="button"
                className="apc-skip"
                onClick={() => answer(question, question.fallback, "")}
              >
                Sen karar ver
              </button>
            </li>
          );
        })}
      </ol>

      {done ? (
        <button
          type="button"
          className="apw-cta"
          disabled={busy}
          onClick={() => onDone(answers)}
        >
          {busy ? "Hazırlanıyor…" : "Yolumu göster"}
        </button>
      ) : null}
    </section>
  );
}
