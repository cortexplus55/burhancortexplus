"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EXAM_TYPES = ["LGS", "TYT", "AYT", "Okul yazılısı"] as const;

const DEFAULT_TOPICS: Record<string, string[]> = {
  LGS: ["Çarpanlar ve katlar", "Üslü ifadeler", "Köklü ifadeler", "Olasılık", "Veri analizi"],
  TYT: ["Temel kavramlar", "Fonksiyonlar", "Polinomlar", "Trigonometri", "Limit"],
  AYT: ["Türev", "İntegral", "Analitik geometri", "Logaritma", "Diziler"],
  "Okul yazılısı": ["Konu tekrarı", "Örnek soru çözümü", "Yanlış analizi", "Kısa özet"],
};

export function ExamCreateWizard() {
  const router = useRouter();
  const [examType, setExamType] = useState<(typeof EXAM_TYPES)[number]>("TYT");
  const [title, setTitle] = useState("TYT Matematik");
  const [targetScore, setTargetScore] = useState("80");
  const [topics, setTopics] = useState(DEFAULT_TOPICS.TYT);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => title.trim().length >= 2 && topics.length > 0,
    [title, topics],
  );

  function applyType(next: (typeof EXAM_TYPES)[number]) {
    setExamType(next);
    setTopics(DEFAULT_TOPICS[next]);
    if (next === "Okul yazılısı") setTitle("Okul yazılısı");
    else setTitle(`${next} Matematik`);
  }

  function addTopic() {
    const value = draft.trim();
    if (!value) return;
    setTopics((prev) => [...prev, value]);
    setDraft("");
  }

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          examType,
          targetScore: Number(targetScore) || undefined,
          topics,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Sınav hazırlığı oluşturulamadı.");
        return;
      }
      toast.success("Hazırlık planın oluşturuldu.");
      router.push("/calisma-plani?tab=yol");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ap-exam-page ap-wizard">
      <h1>Sınavında neler var?</h1>
      <p className="ap-wizard-lead">
        Konuları işaretle, eksik olanı ekle; çalışma yolu ve takvim otomatik oluşsun.
      </p>

      <div className="ap-wizard-types">
        {EXAM_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={type === examType ? "ap-chip ap-chip--on" : "ap-chip"}
            onClick={() => applyType(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <label className="ap-field">
        <span>Başlık</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label className="ap-field">
        <span>Hedef puan</span>
        <input
          type="number"
          min={1}
          max={100}
          value={targetScore}
          onChange={(e) => setTargetScore(e.target.value)}
        />
      </label>

      <ul className="ap-topic-list">
        {topics.map((topic, index) => (
          <li key={`${topic}-${index}`}>
            <span>{topic}</span>
            <button
              type="button"
              aria-label="Konuyu sil"
              onClick={() => setTopics((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="ap-topic-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ Konu ekle"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTopic();
            }
          }}
        />
        <button type="button" onClick={addTopic} aria-label="Ekle">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <label className="ap-field">
        <span>Sınavında ne var, söyle</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Örn. Trigonometri kimlikleri ve birim çember ağırlıklı"
        />
      </label>

      <button
        type="button"
        className="ap-wizard-submit"
        disabled={!canSubmit || loading}
        onClick={() => void submit()}
      >
        {loading ? "Oluşturuluyor…" : "Hazırlığı oluştur"}
      </button>
    </div>
  );
}
