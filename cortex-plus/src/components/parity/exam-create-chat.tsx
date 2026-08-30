"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PLAN_NODE_META, type PlanNodeDraft } from "@/lib/learning/exam-prep-plan";
import { CreditGate } from "@/components/paywall/credit-gate";

type Draft = { title: string; examType: string; topics: string[] };
type ChatMsg = { role: "user" | "assistant"; content: string };

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function ExamCreateChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: "Sınavında neler var, söyle. Konuları birlikte netleştirelim; sonra tarihi seçip yolunu çıkaracağım.",
    },
  ]);
  const [draft, setDraft] = useState<Draft>({ title: "", examType: "Serbest", topics: [] });
  const [input, setInput] = useState("");
  const [examDate, setExamDate] = useState("");
  const [needDate, setNeedDate] = useState(false);
  const [preview, setPreview] = useState<PlanNodeDraft[]>([]);
  const [days, setDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const canStart = Boolean(examDate && draft.topics.length && draft.title);

  const grouped = useMemo(() => {
    const map = new Map<number, PlanNodeDraft[]>();
    for (const node of preview) {
      map.set(node.dayIndex, [...(map.get(node.dayIndex) ?? []), node]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview]);

  async function send(nextDate?: string) {
    const text = input.trim();
    if (!nextDate && !text) return;
    const history = nextDate
      ? messages
      : [...messages, { role: "user" as const, content: text }];
    if (!nextDate) {
      setMessages(history);
      setInput("");
    }
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          examDate: nextDate || examDate || undefined,
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Yanıt alınamadı.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: payload.reply }]);
      if (payload.draft) setDraft(payload.draft);
      setNeedDate(Boolean(payload.needDate));
      setPreview(payload.preview ?? []);
      setDays(payload.days ?? null);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function startPlan() {
    if (!canStart) return;
    setStarting(true);
    try {
      const res = await fetch("/api/learning/exam-prep/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          examType: draft.examType,
          topics: draft.topics,
          examDate,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Plan oluşturulamadı.");
        return;
      }
      toast.success(`${days ?? ""} günlük planın hazır.`);
      router.push(`/deneme-sinavlari/${payload.prepId}`);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="ap-exam-page ap-wizard ap-wizard--flow">
      <div className="ap-wizard-progress" aria-hidden>
        <div
          className="ap-wizard-progress-fill"
          style={{ width: canStart ? "100%" : needDate ? "70%" : "35%" }}
        />
      </div>

      <h1>Sınavında neler var?</h1>
      <div className="ap-exam-intake">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "ap-exam-intake-user" : "ap-exam-intake-ai"}
          >
            {message.content}
          </p>
        ))}
      </div>

      {draft.topics.length ? (
        <ol className="ap-topic-numbered-list">
          {draft.topics.map((topic, index) => (
            <li key={`${topic}-${index}`}>
              <span className="ap-topic-num">{index + 1}</span>
              <span className="ap-topic-label">{topic}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {needDate || draft.topics.length >= 2 ? (
        <label className="ap-field">
          <span>Sınav tarihi</span>
          <input
            type="date"
            min={tomorrowIso()}
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            onBlur={() => {
              if (examDate) void send(examDate);
            }}
          />
        </label>
      ) : null}

      {grouped.length ? (
        <div className="ap-exam-plan-preview">
          <p className="ap-lesson-kicker">{days} günlük yol</p>
          {grouped.map(([day, nodes]) => (
            <section key={day}>
              <h2>Gün {day}</h2>
              <ul>
                {nodes.map((node) => (
                  <li key={`${day}-${node.sortOrder}`}>
                    {PLAN_NODE_META[node.kind].title}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            disabled={starting || !canStart}
            onClick={() => void startPlan()}
          >
            {starting ? "Kuruluyor…" : `${days} günlük planını başlat`}
          </button>
        </div>
      ) : null}

      <label className="ap-field">
        <span className="sr-only">Mesaj</span>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Sınavında ne var söyle"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
        />
      </label>
      <button
        type="button"
        className="ap-exam-continue ap-exam-continue--primary"
        disabled={loading || !input.trim()}
        onClick={() => void send()}
      >
        {loading ? "Dinliyorum…" : "Gönder"}
      </button>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Plan çıkarmak için kredin kalmadı."
        returnPath="/deneme-sinavlari/olustur"
      />
    </div>
  );
}
