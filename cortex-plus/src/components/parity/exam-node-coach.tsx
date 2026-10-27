"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditGate } from "@/components/paywall/credit-gate";

export type CoachMessage = { role: "user" | "assistant" | "marker"; content: string };

const ASK = "Bilmiyorum, sen anlat.";

function wireMessages(messages: CoachMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((message): message is { role: "user" | "assistant"; content: string } => message.role === "user" || message.role === "assistant")
    .slice(-12);
}

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
  /** Oturum boyunca durur. Soru indeksi bunu silmez. */
  messages: CoachMessage[];
  onMessagesChange: (update: CoachMessage[] | ((current: CoachMessage[]) => CoachMessage[])) => void;
  questionIndex: number;
}) {
  const [open, setOpen] = useState(messages.length > 0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const lastIndex = useRef(questionIndex);

  useEffect(() => {
    if (lastIndex.current === questionIndex) return;
    const shown = questionIndex + 1;
    lastIndex.current = questionIndex;
    onMessagesChange((current) =>
      current.length ? [...current, { role: "marker", content: `📌 Soru ${shown} için soruluyor` }] : current,
    );
  }, [questionIndex, onMessagesChange]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    const next = [...messages, { role: "user" as const, content: clean }];
    onMessagesChange(next);
    setInput("");
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, itemText, messages: wireMessages(next) }),
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
      onMessagesChange([...next, { role: "assistant", content: data.reply ?? "" }]);
      onUsed?.();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cp-exam-coach">
      <button type="button" className="cp-exam-coach-chip" disabled={loading} onClick={() => void send(ASK)}>
        Bilmiyorum, sen anlat
      </button>
      <form
        className="cp-exam-coach-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Eğitmene yaz"
          aria-label="Eğitmene yaz"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? "…" : "Gönder"}
        </button>
      </form>
      {open && messages.length ? (
        <ol className="cp-exam-coach-log">
          {messages.map((msg, index) =>
            msg.role === "marker" ? (
              <li key={`marker-${index}`} className="cp-exam-coach-mark">
                {msg.content}
              </li>
            ) : (
              <li key={`${msg.role}-${index}`} className={`cp-exam-coach-msg cp-exam-coach-msg--${msg.role}`}>
                <em>{msg.role === "user" ? "Sen" : "Eğitmen"}</em>
                <p>{msg.content}</p>
              </li>
            ),
          )}
        </ol>
      ) : null}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Eğitmen sohbeti için kullanım hakkın doldu."
        returnPath={returnPath}
        // Ders içi yardım ücretsizde derse dahil; dolan, günlük adım sınırı (gece yarısı).
        meter="included"
      />
    </div>
  );
}
