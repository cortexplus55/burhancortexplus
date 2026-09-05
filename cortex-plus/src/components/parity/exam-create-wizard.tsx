"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EXAM_TYPES = ["LGS", "TYT", "AYT", "Okul yazılısı", "Serbest"] as const;

const DEFAULT_TOPICS: Record<string, string[]> = {
  LGS: ["Çarpanlar ve katlar", "Üslü ifadeler", "Köklü ifadeler", "Olasılık", "Veri analizi"],
  TYT: ["Temel kavramlar", "Fonksiyonlar", "Polinomlar", "Trigonometri", "Limit"],
  AYT: ["Türev", "İntegral", "Analitik geometri", "Logaritma", "Diziler"],
  "Okul yazılısı": ["Konu tekrarı", "Örnek soru çözümü", "Yanlış analizi", "Kısa özet"],
  Serbest: ["Konu 1", "Konu 2", "Konu 3"],
};

export function ExamCreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [examType, setExamType] = useState<(typeof EXAM_TYPES)[number]>("TYT");
  const [title, setTitle] = useState("TYT Matematik");
  const [targetScore, setTargetScore] = useState("80");
  const [topics, setTopics] = useState(DEFAULT_TOPICS.TYT);
  const [topicSearch, setTopicSearch] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => title.trim().length >= 2 && topics.length > 0,
    [title, topics],
  );

  const filteredSuggest = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return DEFAULT_TOPICS[examType].filter(
      (t) => t.toLowerCase().includes(q) && !topics.includes(t),
    );
  }, [examType, topicSearch, topics]);

  function applyType(next: (typeof EXAM_TYPES)[number]) {
    const previousDefaults = DEFAULT_TOPICS[examType] ?? [];
    const stillDefault =
      topics.length === previousDefaults.length &&
      topics.every((topic, index) => topic === previousDefaults[index]);
    setExamType(next);
    if (stillDefault) {
      setTopics(DEFAULT_TOPICS[next] ?? DEFAULT_TOPICS.Serbest);
    }
    if (next === "Okul yazılısı") setTitle("Okul yazılısı");
    else if (next === "Serbest") setTitle("Sınav hazırlığım");
    else setTitle(`${next} Matematik`);
  }

  function addTopic(label?: string) {
    const value = (label ?? draft).trim();
    if (!value) return;
    if (topics.includes(value)) return;
    setTopics((prev) => [...prev, value]);
    setDraft("");
    setTopicSearch("");
  }

  function removeTopic(index: number) {
    setTopics((prev) => prev.filter((_, i) => i !== index));
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
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Sınav hazırlığı oluşturulamadı.");
        return;
      }
      toast.success("Hazırlık planın oluşturuldu. İlk konudan başla.");
      router.push(`/deneme-sinavlari/${payload.prepId}`);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ap-exam-page ap-wizard ap-wizard--flow">
      <div className="ap-wizard-progress" aria-hidden>
        <div className="ap-wizard-progress-fill" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 ? (
        <>
          <h1>Sınavında neler var?</h1>
          <p className="ap-wizard-lead">Sınav türünü seç; konuları bir sonraki adımda düzenlersin.</p>
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
          <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={() => setStep(1)}>
            Devam
          </button>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h1>Konular</h1>
          <p className="ap-wizard-lead">Konuları kontrol et; eksik olanı ekle.</p>
          <label className="ap-field">
            <span>Konu ara veya ekle</span>
            <input
              value={topicSearch || draft}
              onChange={(e) => {
                setTopicSearch(e.target.value);
                setDraft(e.target.value);
              }}
              placeholder="Örn. pediatri"
            />
          </label>
          {filteredSuggest.length ? (
            <ul className="ap-school-suggest">
              {filteredSuggest.map((name) => (
                <li key={name}>
                  <button type="button" onClick={() => addTopic(name)}>
                    + {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <ol className="ap-topic-numbered-list">
            {topics.map((topic, index) => (
              <li key={`${topic}-${index}`}>
                <span className="ap-topic-num">{index + 1}</span>
                <span className="ap-topic-label">{topic}</span>
                <button type="button" aria-label="Kaldır" onClick={() => removeTopic(index)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="ap-chip" onClick={() => addTopic()}>
            <Plus className="h-4 w-4" aria-hidden /> Yeni konu ekle
          </button>
          <div className="ap-wizard-nav">
            <button type="button" className="ap-chip" onClick={() => setStep(0)}>
              Geri
            </button>
            <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={() => setStep(2)}>
              Devam
            </button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1>Hedef puan</h1>
          <p className="ap-wizard-lead">Devam etmeden önce konu listesini son kez gözden geçir.</p>
          <label className="ap-field">
            <span>Hedef puan (%)</span>
            <input value={targetScore} onChange={(e) => setTargetScore(e.target.value)} />
          </label>
          <label className="ap-field">
            <span>Not (isteğe bağlı)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          <p className="rounded-xl border border-[var(--ap-border)] bg-[#1a1a1a] p-3 text-sm text-[var(--ap-muted)]">
            Devam etmeden önce konuları yalnızca burada düzenleyebilirsin. Sonra her konuyu sırayla açıp dersini üretirsin; bitince deneme çözersin.
          </p>
          <div className="ap-wizard-nav">
            <button type="button" className="ap-chip" onClick={() => setStep(1)}>
              Geri
            </button>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              disabled={loading || !canSubmit}
              onClick={() => void submit()}
            >
              {loading ? "Oluşturuluyor…" : "Başla"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
