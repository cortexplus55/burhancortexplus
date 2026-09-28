"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

  async function saveLearning() {
    setLoading(true);
    const ok = await patchProfile({ daily_goal_minutes: Number(dailyGoal) || 3 });
    setLoading(false);
    if (!ok) {
      toast.error("Kaydedilemedi.");
      return;
    }
    toast.success("Öğrenme hedefin güncellendi.");
    onClose();
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
              ["learning", "Öğrenme"],
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
            <h2 className="cp-profile-heading">Rolüm</h2>
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
          </div>
        ) : null}

        {tab === "learning" ? (
          <div className="cp-profile-body">
            <h2 className="cp-profile-heading">Günlük hedef</h2>
            <p className="cp-profile-lead">
              Her gün kaç soru veya görev tamamlamak istediğini seç.
            </p>
            <label className="cp-field">
              <span>Günlük soru / görev sayısı</span>
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
              className="cp-exam-continue cp-exam-continue--primary mt-4 w-full"
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
