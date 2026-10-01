"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppearanceRow } from "@/components/parity/appearance-row";
import { AvatarPicker } from "@/components/parity/avatar-picker";
import { TUTOR_STYLE_OPTIONS, type TutorStyle } from "@/lib/learning/tutor-style";
import {
  DAILY_GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  TUTOR_VOICES,
  dailyGoalLabel,
  type TutorVoice,
} from "@/lib/student/learning-prefs";
import { prefsFromProfile, writeLearningPrefs } from "@/lib/client/learning-prefs-store";
import "@/styles/parity-shell.css";

type TabId = "account" | "school" | "learning";

// "Veli" seçeneği kaldırıldı: ürün yalnızca öğrenciye (AGENTS.md, 29 Ağustos
// 2026 kararı); veliyi seçen öğrenciyi bekleyen bir veli arayüzü yok.
const ROLES = [
  { id: "student", label: "Öğrenci", hint: "Sınav ve ders odaklı AI" },
  { id: "graduate", label: "Mezun", hint: "KPSS, TUS ve yetişkin hedefler" },
] as const;

type SchoolOption = { id: string; name: string; city: string | null };

export type ProfilePlanView = {
  /** Ücretsizde paketin adı ('Temel'), abonede rozet ('Plus' / 'Sigma'). */
  label: string;
  /** Paketin bir cümlelik hâli. */
  hint: string;
  isPremium: boolean;
};

export function ProfileDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan?: ProfilePlanView | null;
}) {
  const [tab, setTab] = useState<TabId>("account");
  const [role, setRole] = useState("student");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [fullName, setFullName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  const [tutorStyle, setTutorStyle] = useState<TutorStyle>("step_by_step");
  const [suggestions, setSuggestions] = useState(true);
  const [readable, setReadable] = useState(false);
  const [voice, setVoice] = useState<TutorVoice>("female");
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
        if (data.daily_goal_minutes) setDailyGoal(Number(data.daily_goal_minutes));
        if (data.learning_role) setRole(data.learning_role);
        setTodayMinutes(Number(data.today_minutes) || 0);
        setFullName(data.full_name ?? "");
        setGradeLevel(data.grade_level ?? "");
        setAvatarEmoji(data.avatar_emoji ?? null);
        if (data.tutor_style) setTutorStyle(data.tutor_style);
        setSuggestions(data.show_suggestions !== false);
        setReadable(data.readable_font === true);
        setVoice(data.tutor_voice === "male" ? "male" : "female");
        writeLearningPrefs(prefsFromProfile(data));
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
        .then((data) => setSchoolOptions(Array.isArray(data.results) ? data.results : []))
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

  async function patchProfile(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Tek alanı hemen kaydeder; olmazsa eski değere döner. */
  async function saveField(
    body: Record<string, unknown>,
    apply: () => void,
    revert: () => void,
    done?: () => void,
  ) {
    apply();
    const ok = await patchProfile(body);
    if (!ok) {
      revert();
      toast.error("Kaydedilemedi.");
      return;
    }
    done?.();
  }

  async function saveText(body: Record<string, unknown>, message: string) {
    setLoading(true);
    const ok = await patchProfile(body);
    setLoading(false);
    if (!ok) {
      toast.error("Kaydedilemedi.");
      return;
    }
    toast.success(message);
  }

  /*
    Rol "Hesabım" sekmesinde seçiliyordu ama o sekmede kaydet yoktu; seçim
    ancak "Öğrenme" sekmesindeki Kaydet'e basılırsa gidiyordu. Artık
    seçildiği anda kaydediliyor.
  */
  async function saveRole(next: string) {
    const previous = role;
    setRole(next);
    const ok = await patchProfile({ learning_role: next });
    if (!ok) {
      setRole(previous);
      toast.error("Rol kaydedilemedi.");
      return;
    }
    toast.success("Rolün güncellendi.");
  }

  /*
    Okul adı eskiden serbest metin olarak yazılıyordu; profil paneli ve okul
    paylaşımı ise school_id'ye bakıyor. "Okul güncellendi" deniyor, hiçbir
    şey değişmiyordu (okul paylaşımı school_required dönüyordu). Arama artık
    kimlikli sonuçları kullanıyor, sınav hazırlığındaki okul seçici gibi.
  */
  async function saveSchool(school: SchoolOption) {
    setLoading(true);
    const ok = await patchProfile({ school_name: school.name, school_id: school.id });
    setLoading(false);
    if (!ok) {
      toast.error("Okul kaydedilemedi.");
      return;
    }
    setSchoolName(school.name);
    setSchoolQuery(school.name);
    setSchoolOptions([]);
    toast.success("Okul güncellendi.");
  }

  return (
    <div
      className="cp-profile-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Ayarlar"
      onClick={onClose}
    >
      <div className="cp-profile-scrim">
        <p className="cp-profile-scrim-title">Ayarlar</p>
      </div>
      <div className="cp-profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-profile-panel-head">
          <button type="button" className="cp-profile-back" onClick={onClose} aria-label="Geri">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" className="cp-profile-close" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          PAKET ROZETİ — öğrencinin hangi katmanda olduğunu gördüğü yer.

          Referans üründe profil penceresi bir hesap merkezi: en üstte paket adı
          ('Temel — Ücretsiz plan') ve ücretsiz kullanıcıya bir yükseltme
          çağrısı duruyor. Bizde profil yalnızca ayar paneliydi; öğrenci
          hangi pakette olduğunu buradan hiç göremiyordu.

          Abonede çağrı yok: parasını ödemiş kullanıcıya satış gösterilmez.
        */}
        {plan ? (
          <div className={cn("cp-profile-plan", plan.isPremium && "cp-profile-plan--premium")}>
            <div>
              <strong>{plan.label}</strong>
              <span>{plan.hint}</span>
            </div>
            <a className="cp-profile-plan-cta" href="/paketler">
              {plan.isPremium ? "Ek paket" : "Daha hızlı öğren"}
            </a>
          </div>
        ) : null}

        <nav className="cp-profile-tabs" aria-label="Ayarlar bölümleri">
          {(
            [
              ["account", "Hesabım"],
              ["school", "Okulum"],
              ["learning", "Öğrenme tercihleri"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(tab === id && "cp-profile-tabs--active")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/*
          HESAP BAĞLANTILARI — paketini ve hakkını görmenin yolu.

          Referans üründe profil menüsünde "Kullanım" ve "Abonelikler" duruyor.
          Bizde profil yalnızca ayar paneliydi; iki ekran da vardı ama
          profilden erişilemiyordu. Paket rozeti ücretsize özel olunca
          (referans üründe de öyle) abone öğrencinin paketini görebileceği hiçbir
          yol kalmıyordu — bu boşluğu kapatıyor.
        */}
        <div className="cp-profile-links">
          <a href="/krediler">Kullanımım</a>
          <a href="/odemeler">Aboneliğim</a>
        </div>

        {tab === "account" ? (
          <div className="cp-profile-body">
            <div className="cp-settings-avatar">
              <span className="cp-pp-avatar" aria-hidden>
                {avatarEmoji ?? (fullName.trim().slice(0, 1).toLocaleUpperCase("tr-TR") || "?")}
              </span>
              <AvatarPicker current={avatarEmoji} onChange={setAvatarEmoji} />
            </div>
            <label className="cp-field">
              <span>İsim</span>
              <input value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <button
              type="button"
              className="cp-exam-continue mt-2 w-full"
              disabled={loading || !fullName.trim()}
              onClick={() => void saveText({ full_name: fullName.trim() }, "İsmin güncellendi.")}
            >
              İsmi kaydet
            </button>
            <h2 className="cp-profile-heading mt-6">Rolüm</h2>
            <ul className="cp-profile-role-list">
              {ROLES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "cp-profile-role",
                      role === item.id && "cp-profile-role--active",
                    )}
                    aria-pressed={role === item.id}
                    onClick={() => void saveRole(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <AppearanceRow />
            </div>
            <a className="cp-settings-link" href="/ayarlar">
              E-posta, şifre, hatırlatma ve hesap silme →
            </a>
          </div>
        ) : null}

        {tab === "school" ? (
          <div className="cp-profile-body">
            <h2 className="cp-profile-heading">Okul</h2>
            <label className="cp-field">
              <span>Hangi okula gidiyorsun?</span>
              <input
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Okul adı ara"
                autoComplete="off"
              />
            </label>
            {schoolOptions.length ? (
              <ul className="cp-school-suggest">
                {schoolOptions.map((school) => (
                  <li key={school.id}>
                    <button type="button" disabled={loading} onClick={() => void saveSchool(school)}>
                      + {school.city ? `${school.name} (${school.city})` : school.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {schoolName ? (
              <p className="mt-3 text-sm text-[var(--cp-muted)]">Seçili: {schoolName}</p>
            ) : null}
            <label className="cp-field mt-6">
              <span>Sınıf / seviye</span>
              <input
                value={gradeLevel}
                maxLength={40}
                placeholder="Örn. 11. sınıf, üniversite 2. sınıf"
                onChange={(e) => setGradeLevel(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="cp-exam-continue mt-2 w-full"
              disabled={loading}
              onClick={() => void saveText({ grade_level: gradeLevel.trim() }, "Seviyen güncellendi.")}
            >
              Seviyeyi kaydet
            </button>
          </div>
        ) : null}

        {tab === "learning" ? (
          <div className="cp-profile-body">
            <p className="cp-profile-lead">Bu ayarlar öğrenme deneyimini kişiselleştirir.</p>

            <h2 className="cp-profile-heading">Öğretmen stili</h2>
            <ul className="cp-profile-role-list">
              {TUTOR_STYLE_OPTIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={cn("cp-profile-role", tutorStyle === option.id && "cp-profile-role--active")}
                    aria-pressed={tutorStyle === option.id}
                    onClick={() => {
                      const previous = tutorStyle;
                      void saveField(
                        { tutor_style: option.id },
                        () => setTutorStyle(option.id),
                        () => setTutorStyle(previous),
                      );
                    }}
                  >
                    <strong>
                      {option.emoji} {option.title}
                    </strong>
                    <span>{option.body}</span>
                  </button>
                </li>
              ))}
            </ul>

            <h2 className="cp-profile-heading mt-6">Günlük çalışma hedefi</h2>
            <p className="cp-profile-lead">Bugün {dailyGoalLabel(todayMinutes, dailyGoal)}</p>
            <div className="cp-settings-chips" role="radiogroup" aria-label="Günlük çalışma hedefi">
              {DAILY_GOAL_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={dailyGoal === minutes}
                  className={cn("cp-settings-chip", dailyGoal === minutes && "is-on")}
                  onClick={() => {
                    const previous = dailyGoal;
                    void saveField(
                      { daily_goal_minutes: minutes },
                      () => setDailyGoal(minutes),
                      () => setDailyGoal(previous),
                    );
                  }}
                >
                  {minutes} dk
                </button>
              ))}
            </div>

            <label className="cp-settings-toggle">
              <span>
                <strong>Önerilen sorular</strong>
                <em>Cevaptan sonra devam önerilerini göster</em>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={suggestions}
                onChange={(e) => {
                  const next = e.target.checked;
                  void saveField(
                    { show_suggestions: next },
                    () => setSuggestions(next),
                    () => setSuggestions(!next),
                    () => writeLearningPrefs({ suggestions: next }),
                  );
                }}
              />
            </label>

            <label className="cp-settings-toggle">
              <span>
                <strong>Disleksi dostu okuma</strong>
                <em>Derslerde ve cevaplarda daha geniş harf ve satır aralığı</em>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={readable}
                onChange={(e) => {
                  const next = e.target.checked;
                  void saveField(
                    { readable_font: next },
                    () => setReadable(next),
                    () => setReadable(!next),
                    () => writeLearningPrefs({ readable: next }),
                  );
                }}
              />
            </label>

            <h2 className="cp-profile-heading mt-6">Öğretmen sesi</h2>
            <div className="cp-settings-chips" role="radiogroup" aria-label="Öğretmen sesi">
              {TUTOR_VOICES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={voice === option.id}
                  className={cn("cp-settings-chip", voice === option.id && "is-on")}
                  onClick={() => {
                    const previous = voice;
                    void saveField(
                      { tutor_voice: option.id },
                      () => setVoice(option.id),
                      () => setVoice(previous),
                      () => writeLearningPrefs({ voice: option.id }),
                    );
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="cp-profile-lead mt-2">Sesli dinle ve Konuş modu cihazındaki Türkçe sesi kullanır.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
