"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { LearningPreferencesView } from "@/lib/learning/exam-prep-ui-path";

const WEEKDAYS = [
  { id: 1, label: "Pzt" },
  { id: 2, label: "Sal" },
  { id: 3, label: "Çar" },
  { id: 4, label: "Per" },
  { id: 5, label: "Cum" },
  { id: 6, label: "Cmt" },
  { id: 7, label: "Paz" },
] as const;

export type PrepSettingsInitial = {
  examDate: string | null;
  dailyMinutes: number;
  studyDays: number[];
  hardTopics: string[];
  topicOptions: string[];
  preferences: LearningPreferencesView;
  scheduleFits: boolean | null;
  optionsIfTight: string[];
};

export function ExamPrepSettingsPanel({
  prepId,
  initial,
}: {
  prepId: string;
  initial: PrepSettingsInitial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [examDate, setExamDate] = useState(initial.examDate ?? "");
  const [dailyMinutes, setDailyMinutes] = useState(initial.dailyMinutes);
  const [studyDays, setStudyDays] = useState(initial.studyDays);
  const [hardTopics, setHardTopics] = useState(initial.hardTopics);
  const [prefStyle, setPrefStyle] = useState<
    "examples" | "theory" | "mixed"
  >(initial.preferences.style ?? "mixed");
  const [prefPace, setPrefPace] = useState<"slow" | "normal" | "fast">(
    initial.preferences.pace ?? "normal",
  );
  const [saving, setSaving] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  function toggleStudyDay(id: number) {
    setStudyDays((days) =>
      days.includes(id) ? days.filter((d) => d !== id) : [...days, id].sort(),
    );
  }

  function toggleHard(topic: string) {
    setHardTopics((list) =>
      list.includes(topic) ? list.filter((t) => t !== topic) : [...list, topic],
    );
  }

  async function save(rebuildSchedule: boolean) {
    if (!examDate || studyDays.length === 0) {
      toast.error("Sınav tarihi ve en az bir çalışma günü gerekli.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/learning/exam-prep/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          examDate,
          dailyMinutes,
          studyDays,
          hardTopics,
          learningPreferences: { style: prefStyle, pace: prefPace },
          rebuildSchedule,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error === "feature_disabled"
            ? "Bu özellik şu an kapalı."
            : "Ayarlar kaydedilemedi.",
        );
        return;
      }
      toast.success(
        data.rebuilt
          ? `Kaydedildi ve plan yenilendi. ${data.summary ?? ""}`
          : "Tercihler kaydedildi — sonraki oturumlarda sorulmaz.",
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  async function rescheduleMissed() {
    setRescheduling(true);
    try {
      const res = await fetch("/api/learning/exam-prep/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, reason: "missed_days" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error === "no_schedule_v2"
            ? "Yeniden dağıtılacak v2 planı yok."
            : "Plan yeniden dağıtılamadı.",
        );
        return;
      }
      toast.success(data.summary ?? "Kalan günler yeniden dağıtıldı.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setRescheduling(false);
    }
  }

  return (
    <section className="ap-exam-settings" aria-label="Çalışma tercihleri">
      <div className="ap-exam-settings-bar">
        <button
          type="button"
          className="ap-back-pill"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Tercihleri gizle" : "Tarih · süre · tercihler"}
        </button>
        <button
          type="button"
          className="ap-back-pill"
          disabled={rescheduling}
          onClick={() => void rescheduleMissed()}
        >
          {rescheduling ? "Dağıtılıyor…" : "Kaçırılan günleri yeniden dağıt"}
        </button>
      </div>

      {initial.scheduleFits === false ? (
        <p className="ap-exam-settings-warn" role="status">
          Plan süreye sığmıyor
          {initial.optionsIfTight.length
            ? ` — seçenekler: ${initial.optionsIfTight
                .map((o) =>
                  o === "increase_daily_time"
                    ? "günlük süreyi artır"
                    : o === "prioritize_topics"
                      ? "konuları önceliklendir"
                      : o === "cut_scope"
                        ? "kapsamı daralt"
                        : o === "extend_days"
                          ? "sınav tarihini ileri al"
                          : o,
                )
                .join(", ")}`
            : ""}
          . Tercihleri kaydederken “planı yenile”yi kullan.
        </p>
      ) : null}

      {open ? (
        <div className="ap-exam-intake" style={{ gap: "0.75rem", marginTop: "0.75rem" }}>
          <p className="text-sm text-[var(--ap-muted)]">
            Bu tercihler hazırlığına kaydedilir; her oturumda yeniden sorulmaz.
          </p>
          <label className="ap-field">
            <span>Sınav tarihi</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
          <label className="ap-field">
            <span>Günde kaç dakika?</span>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value) || 45)}
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
          {initial.topicOptions.length ? (
            <fieldset className="ap-field">
              <legend>Zor bulduğun konular (öz-bildirim)</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {initial.topicOptions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className="ap-back-pill"
                    aria-pressed={hardTopics.includes(topic)}
                    onClick={() => toggleHard(topic)}
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
              onChange={(e) =>
                setPrefStyle(e.target.value as "examples" | "theory" | "mixed")
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
              onChange={(e) =>
                setPrefPace(e.target.value as "slow" | "normal" | "fast")
              }
            >
              <option value="slow">Yavaş</option>
              <option value="normal">Normal</option>
              <option value="fast">Hızlı</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="ap-exam-continue"
              disabled={saving}
              onClick={() => void save(false)}
            >
              {saving ? "Kaydediliyor…" : "Yalnızca tercihleri kaydet"}
            </button>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              disabled={saving}
              onClick={() => void save(true)}
            >
              Kaydet ve kalan planı yenile
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
