"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreditGate } from "@/components/paywall/credit-gate";

type Msg = { role: "user" | "assistant"; content: string };

const ASK = "Bilmiyorum, sen anlat.";

export function ExamNodeCoach({
  prepId,
  nodeId,
  itemText,
  returnPath,
}: {
  prepId: string;
  nodeId: string;
  itemText: string;
  returnPath: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    const next = [...messages, { role: "user" as const, content: clean }];
    setMessages(next);
    setInput("");
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, itemText, messages: next }),
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
      setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ap-exam-coach">
      <button type="button" className="ap-exam-coach-chip" disabled={loading} onClick={() => void send(ASK)}>
        Bilmiyorum, sen anlat
      </button>
      <form
        className="ap-exam-coach-form"
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
        <ol className="ap-exam-coach-log">
          {messages.map((msg, index) => (
            <li key={`${msg.role}-${index}`} className={`ap-exam-coach-msg ap-exam-coach-msg--${msg.role}`}>
              <em>{msg.role === "user" ? "Sen" : "Eğitmen"}</em>
              <p>{msg.content}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Eğitmen sohbeti için kredin kalmadı."
        returnPath={returnPath}
      />
    </div>
  );
}
