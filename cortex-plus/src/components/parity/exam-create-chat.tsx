"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PLAN_NODE_META, type PlanNodeDraft } from "@/lib/learning/exam-prep-plan";
import { CreditGate } from "@/components/paywall/credit-gate";

type Draft = { title: string; examType: string; topics: string[] };
type ChatMsg = { role: "user" | "assistant"; content: string };

const WEEKDAYS: { id: number; label: string }[] = [
  { id: 1, label: "Pzt" },
  { id: 2, label: "Sal" },
  { id: 3, label: "Çar" },
  { id: 4, label: "Per" },
  { id: 5, label: "Cum" },
  { id: 6, label: "Cmt" },
  { id: 7, label: "Paz" },
];

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function ExamCreateChat({
  initialDocumentId = null,
}: {
  /** Stage 9 — deep link from topic map / docs list. */
  initialDocumentId?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Sınavında neler var, söyle. Konuları birlikte netleştirelim; sonra tarihi seçip yolunu çıkaracağım.",
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
  const [docs, setDocs] = useState<{ id: string; fileName: string }[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId);
  const [intakeMode, setIntakeMode] = useState<"legacy" | "v2">("legacy");
  const [dailyMinutes, setDailyMinutes] = useState(45);
  const [studyDays, setStudyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hardTopics, setHardTopics] = useState<string[]>([]);
  const [prefStyle, setPrefStyle] = useState<"examples" | "theory" | "mixed">("mixed");
  const [prefPace, setPrefPace] = useState<"slow" | "normal" | "fast">("normal");

  useEffect(() => {
    let alive = true;
    void fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((data: { documents?: { id: string; fileName: string }[] }) => {
        if (alive) setDocs(data.documents ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Belge seçilince kredi harcamadan v2 profil / konu haritası var mı bak.
  useEffect(() => {
    if (!documentId) {
      setIntakeMode("legacy");
      return;
    }
    let alive = true;
    void fetch("/api/learning/exam-prep/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, probeOnly: true }),
    })
      .then(async (res) => {
        if (!alive || !res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (payload.intakeMode === "v2" || payload.intakeMode === "legacy") {
          setIntakeMode(payload.intakeMode);
        }
        if (payload.intakeMode === "v2" && payload.draft?.topics?.length) {
          setDraft((prev) => ({
            ...prev,
            topics: payload.draft.topics,
            title: prev.title || payload.draft.title || prev.title,
          }));
          setNeedDate(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [documentId]);

  const canStart = Boolean(examDate && draft.topics.length && draft.title);
  const showProfile = intakeMode === "v2" && (needDate || draft.topics.length >= 2);

  const grouped = useMemo(() => {
    const map = new Map<number, PlanNodeDraft[]>();
    for (const node of preview) {
      map.set(node.dayIndex, [...(map.get(node.dayIndex) ?? []), node]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview]);

  function toggleStudyDay(day: number) {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  function toggleHardTopic(topic: string) {
    setHardTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }

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
          documentId: documentId ?? undefined,
          dailyMinutes: intakeMode === "v2" ? dailyMinutes : undefined,
          studyDays: intakeMode === "v2" ? studyDays : undefined,
          hardTopics: intakeMode === "v2" ? hardTopics : undefined,
          learningPreferences:
            intakeMode === "v2"
              ? { style: prefStyle, pace: prefPace }
              : undefined,
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
      if (payload.intakeMode === "v2" || payload.intakeMode === "legacy") {
        setIntakeMode(payload.intakeMode);
      }
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
          documentId: documentId ?? undefined,
          ...(intakeMode === "v2"
            ? {
                dailyMinutes,
                studyDays,
                hardTopics,
                learningPreferences: { style: prefStyle, pace: prefPace },
              }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Plan oluşturulamadı.");
        return;
      }
      if (payload.schedule?.summary) {
        toast.message(payload.schedule.summary);
        if (!payload.schedule.fits && payload.schedule.optionsIfTight?.length) {
          toast.warning(
            "Süre yetmiyor — günlük süreyi artır, önceliklendir veya kapsamı daralt.",
          );
        }
      } else {
        toast.success(`${days ?? ""} günlük planın hazır.`);
      }
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
          />
        </label>
      ) : null}

      {docs.length && (needDate || draft.topics.length >= 2) ? (
        <label className="ap-field">
          <span>Hangi kaynaktan çalışalım?</span>
          <select
            value={documentId ?? ""}
            onChange={(event) => {
              setDocumentId(event.target.value || null);
              setIntakeMode("legacy");
            }}
          >
            <option value="">Tüm belgelerim</option>
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.fileName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showProfile ? (
        <div className="ap-exam-intake" style={{ gap: "0.75rem" }}>
          <p className="text-sm text-[var(--ap-muted)]">
            Öğrenme profilin (sonra düzenlenebilir). Zor bulduğun konular öz-bildirimdir;
            tanışma testi ölçülen seviyeyi ayrı kaydeder.
          </p>
          <label className="ap-field">
            <span>Günde kaç dakika?</span>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={dailyMinutes}
              onChange={(event) => setDailyMinutes(Number(event.target.value) || 45)}
            />
          </label>
          <fieldset className="ap-field">
            <legend>Çalışma günleri</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {WEEKDAYS.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  className="ap-back-pill"
                  aria-pressed={studyDays.includes(day.id)}
                  onClick={() => toggleStudyDay(day.id)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </fieldset>
          {draft.topics.length ? (
            <fieldset className="ap-field">
              <legend>Zor bulduğun konular (öz-bildirim)</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {draft.topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className="ap-back-pill"
                    aria-pressed={hardTopics.includes(topic)}
                    onClick={() => toggleHardTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="ap-field">
            <span>Nasıl öğrenmek istersin?</span>
            <select
              value={prefStyle}
              onChange={(event) =>
                setPrefStyle(event.target.value as "examples" | "theory" | "mixed")
              }
            >
              <option value="examples">Örneklerle</option>
              <option value="theory">Kuram / tanım</option>
              <option value="mixed">Karışık</option>
            </select>
          </label>
          <label className="ap-field">
            <span>Tempo</span>
            <select
              value={prefPace}
              onChange={(event) =>
                setPrefPace(event.target.value as "slow" | "normal" | "fast")
              }
            >
              <option value="slow">Yavaş</option>
              <option value="normal">Normal</option>
              <option value="fast">Hızlı</option>
            </select>
          </label>
        </div>
      ) : null}

      {canStart && preview.length === 0 ? (
        <button
          type="button"
          className="ap-exam-continue ap-exam-continue--primary"
          disabled={loading}
          onClick={() => void send(examDate)}
        >
          {loading ? "Yol hazırlanıyor…" : "Çalışma yolunu hazırla"}
        </button>
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
