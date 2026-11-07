"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, GraduationCap } from "lucide-react";
import { CreditGate } from "@/components/paywall/credit-gate";
import { Markdown } from "@/components/markdown";
import "@/styles/node-coach.css";

/**
 * `q`: mesajın ait olduğu sorunun sırası (8 Kasım 2026). Eksikse ilk soru sayılır (eski oturum kayıtları).
 * `marker` eski sürümün ayraç satırıydı; artık yazılmıyor, okunursa gösterilmez.
 */
export type CoachMessage = { role: "user" | "assistant" | "marker"; content: string; q?: number };

/** Hızlı istekler: öğrenci ne isteyeceğini yazmak zorunda kalmasın. İlk düğmenin adı testlerde ve ipucu sayımında. */
export const COACH_ASKS = [
  { label: "Bilmiyorum, sen anlat", message: "Bilmiyorum, sen anlat." },
  { label: "Bir ipucu ver", message: "Cevabı söyleme, yalnız bir ipucu ver." },
  { label: "Örnekle anlat", message: "Bunu başka bir örnekle anlatır mısın?" },
] as const;

function questionOf(message: CoachMessage): number {
  return typeof message.q === "number" ? message.q : 0;
}

/** Yalnız bu sorunun konuşması modele gider (son 12 ileti). */
export function threadFor(messages: CoachMessage[], questionIndex: number): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((message): message is CoachMessage & { role: "user" | "assistant" } => message.role !== "marker")
    .filter((message) => questionOf(message) === questionIndex)
    .map(({ role, content }) => ({ role, content }))
    .slice(-12);
}

/**
 * Test ve kart oturumundaki eğitmen (8 Kasım 2026 yeniden tasarım). Her soru kendi sohbetini görür: sonraki soruya
 * geçince önceki konuşma ekrandan kalkar (geri dönülürse yine görünür) ve modele de yalnız bu sorunun konuşması gider.
 * Önceden bütün oturum tek akıştaydı; öğrenci yeni soruda eski cevapları okuyordu.
 */
export function ExamNodeCoach({
  prepId,
  nodeId,
  itemText,
  returnPath,
  onUsed,
  messages,
  onMessagesChange,
  questionIndex,
}: {
  prepId: string;
  nodeId: string;
  itemText: string;
  returnPath: string;
  /**
   * Eğitmen cevap verdi (20 Ekim 2026). Oturum, soru cevaplanmadan önce gelen yardımı "ipuçlu"
   * işaretler; o cevap bağımsız başarı sayılmaz. Hak yetmediğinde ya da hata olduğunda çağrılmaz.
   */
  onUsed?: () => void;
  /** Oturum boyunca durur; ekranda yalnız bu sorunun iletileri görünür. */
  messages: CoachMessage[];
  onMessagesChange: (update: CoachMessage[] | ((current: CoachMessage[]) => CoachMessage[])) => void;
  questionIndex: number;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const logRef = useRef<HTMLOListElement | null>(null);
  const thread = messages.filter((message) => message.role !== "marker" && questionOf(message) === questionIndex);

  // Soru değişince yarım yazılmış mesaj da gider.
  useEffect(() => {
    setInput("");
  }, [questionIndex]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [thread.length, loading]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    const next: CoachMessage[] = [...messages, { role: "user", content: clean, q: questionIndex }];
    onMessagesChange(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, itemText, messages: threadFor(next, questionIndex) }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Eğitmen yanıtlayamadı.");
        return;
      }
      onMessagesChange((current) => [...current, { role: "assistant", content: data.reply ?? "", q: questionIndex }]);
      onUsed?.();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="cp-exam-coach" aria-label="Eğitmen">
      <header className="cp-coach-head">
        <span className="cp-coach-avatar" aria-hidden>
          <GraduationCap className="h-4 w-4" />
        </span>
        <span className="cp-coach-head-text">
          <strong>Eğitmen</strong>
          <span>Soru {questionIndex + 1} hakkında sor; cevabı söylemeden adım adım anlatır.</span>
        </span>
      </header>

      {thread.length || loading ? (
        <ol className="cp-exam-coach-log" ref={logRef} aria-live="polite">
          {thread.map((msg, index) => (
            <li key={`${msg.role}-${index}`} className={`cp-exam-coach-msg cp-exam-coach-msg--${msg.role}`}>
              <em>{msg.role === "user" ? "Sen" : "Eğitmen"}</em>
              {msg.role === "assistant" ? (
                <div className="cp-coach-bubble">
                  <Markdown content={msg.content} variant="parity" />
                </div>
              ) : (
                <p className="cp-coach-bubble">{msg.content}</p>
              )}
            </li>
          ))}
          {loading ? (
            <li className="cp-exam-coach-msg cp-exam-coach-msg--assistant" role="status">
              <em>Eğitmen</em>
              <span className="cp-coach-typing" aria-label="Eğitmen yazıyor">
                <span />
                <span />
                <span />
              </span>
            </li>
          ) : null}
        </ol>
      ) : null}

      <div className="cp-coach-asks" role="group" aria-label="Hızlı istekler">
        {COACH_ASKS.map((ask) => (
          <button key={ask.label} type="button" className="cp-exam-coach-chip" disabled={loading} onClick={() => void send(ask.message)}>
            {ask.label}
          </button>
        ))}
      </div>

      <form
        className="cp-exam-coach-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          rows={1}
          maxLength={2000}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder="Eğitmene yaz"
          aria-label="Eğitmene yaz"
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Gönder">
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Eğitmen sohbeti için kullanım hakkın doldu."
        returnPath={returnPath}
        // Ders içi yardım ücretsizde derse dahil; dolan, günlük adım sınırı (gece yarısı).
        meter="included"
      />
    </section>
  );
}
