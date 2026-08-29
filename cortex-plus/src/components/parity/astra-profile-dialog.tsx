"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/styles/astra-parity-sor.css";

type TabId = "account" | "school" | "learning";

const ROLES = [
  { id: "student", label: "Öğrenci", hint: "Sınav ve ders odaklı AI" },
  { id: "graduate", label: "Mezun", hint: "KPSS, TUS ve yetişkin hedefler" },
  { id: "parent", label: "Veli", hint: "Çocuğunun ilerlemesini takip et" },
] as const;

export function AstraProfileDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("account");
  const [role, setRole] = useState("student");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<string[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [dailyGoal, setDailyGoal] = useState("3");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/profile/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.school_name) {
          setSchoolName(data.school_name);
          setSchoolQuery(data.school_name);
        }
        if (data.daily_goal_minutes) {
          setDailyGoal(String(data.daily_goal_minutes));
        }
        if (data.learning_role) setRole(data.learning_role);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "school") return;
    const q = schoolQuery.trim();
    if (q.length < 2) {
      setSchoolOptions([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetch(`/api/schools/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setSchoolOptions(data.schools ?? []))
        .catch(() => setSchoolOptions([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, schoolQuery, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function saveLearning() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_goal_minutes: Number(dailyGoal) || 3,
          learning_role: role,
        }),
      });
      if (!res.ok) {
        toast.error("Kaydedilemedi.");
        return;
      }
      toast.success("Öğrenme hedefin güncellendi.");
      onClose();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSchool(name: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_name: name }),
      });
      if (!res.ok) {
        toast.error("Okul kaydedilemedi.");
        return;
      }
      setSchoolName(name);
      toast.success("Okul güncellendi.");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="ap-profile-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Ayarlar"
      onClick={onClose}
    >
      <div className="ap-profile-scrim">
        <p className="ap-profile-scrim-title">Ayarlar</p>
      </div>
      <div className="ap-profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-profile-panel-head">
          <button type="button" className="ap-profile-back" onClick={onClose} aria-label="Geri">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" className="ap-profile-close" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="ap-profile-tabs" aria-label="Ayarlar bölümleri">
          {(
            [
              ["account", "Hesabım"],
              ["school", "Okulum"],
              ["learning", "Öğrenme"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(tab === id && "ap-profile-tabs--active")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "account" ? (
          <div className="ap-profile-body">
            <h2 className="ap-profile-heading">Rolüm</h2>
            <ul className="ap-profile-role-list">
              {ROLES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "ap-profile-role",
                      role === item.id && "ap-profile-role--active",
                    )}
                    onClick={() => setRole(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "school" ? (
          <div className="ap-profile-body">
            <h2 className="ap-profile-heading">Okul</h2>
            <label className="ap-field">
              <span>Hangi okula gidiyorsun?</span>
              <input
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Okul adı ara"
                autoComplete="off"
              />
            </label>
            {schoolOptions.length ? (
              <ul className="ap-school-suggest">
                {schoolOptions.map((name) => (
                  <li key={name}>
                    <button type="button" onClick={() => void saveSchool(name.split(" (")[0] ?? name)}>
                      + {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {schoolName ? (
              <p className="mt-3 text-sm text-[var(--ap-muted)]">Seçili: {schoolName}</p>
            ) : null}
          </div>
        ) : null}

        {tab === "learning" ? (
          <div className="ap-profile-body">
            <h2 className="ap-profile-heading">Günlük hedef</h2>
            <p className="ap-profile-lead">
              Her gün kaç soru veya görev tamamlamak istediğini seç.
            </p>
            <label className="ap-field">
              <span>Günlük görev sayısı</span>
              <input
                type="number"
                min={1}
                max={20}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary mt-4 w-full"
              disabled={loading}
              onClick={() => void saveLearning()}
            >
              Kaydet
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
