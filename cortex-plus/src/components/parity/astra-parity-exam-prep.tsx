"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ExamPrepCard = {
  id: string;
  title: string;
  progressPct: number;
  daysLabel: string;
  topicsDone: number;
  topicsTotal: number;
  targetScore: number | null;
  continueHref: string;
};

type TabId = "school" | "cortex";

export function AstraParityExamPrep({
  activePrep,
  userInitial,
  initialSchoolName = "",
}: {
  activePrep: ExamPrepCard | null;
  userInitial?: string;
  initialSchoolName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabId =
    searchParams.get("tab") === "school" ? "school" : "cortex";
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<string[]>([]);
  const [pickingSchool, setPickingSchool] = useState(!initialSchoolName);
  const [savingSchool, setSavingSchool] = useState(false);

  useEffect(() => {
    setSchoolName(initialSchoolName);
    setPickingSchool(!initialSchoolName);
  }, [initialSchoolName]);

  useEffect(() => {
    if (tab !== "school" || !pickingSchool) return;
    const q = schoolQuery.trim();
    const t = window.setTimeout(() => {
      void fetch(`/api/schools/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setSchoolOptions(data.schools ?? []))
        .catch(() => setSchoolOptions([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [tab, pickingSchool, schoolQuery]);

  async function saveSchool(name: string) {
    const clean = name.split(" (")[0] ?? name;
    setSavingSchool(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_name: clean }),
      });
      if (!res.ok) {
        toast.error("Okul kaydedilemedi.");
        return;
      }
      setSchoolName(clean);
      setSchoolQuery("");
      setPickingSchool(false);
      toast.success("Okul kaydedildi.");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSavingSchool(false);
    }
  }

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "cortex") {
      params.delete("tab");
    } else {
      params.set("tab", "school");
    }
    const q = params.toString();
    router.replace(q ? `?${q}` : "/deneme-sinavlari", { scroll: false });
  }

  const prep = activePrep ?? {
    id: "empty",
    title: "İlk sınav hazırlığını oluştur",
    progressPct: 0,
    daysLabel: "—",
    topicsDone: 0,
    topicsTotal: 0,
    targetScore: null,
    continueHref: "/deneme-sinavlari/olustur",
  };

  const targetMarker =
    prep.targetScore != null && prep.targetScore > 0
      ? Math.min(100, Math.max(8, prep.targetScore))
      : 72;

  return (
    <div className="ap-exam-page">
      <div className="ap-exam-section-head">
        <Link href="/deneme-sinavlari/olustur">
          Sınav hazırlıklarım
          <span aria-hidden>›</span>
        </Link>
        <Link href="/deneme-sinavlari/olustur" className="ap-exam-create">
          + Oluştur
        </Link>
      </div>

      <article className="ap-exam-active-card">
        <h2 className="ap-exam-active-title">{prep.title}</h2>
        <div className="ap-exam-progress-wrap">
          <span
            className="ap-exam-target-label"
            style={{ left: `${targetMarker}%` }}
          >
            hedef puan
          </span>
          <div className="ap-exam-progress-track">
            <div
              className="ap-exam-progress-fill"
              style={{ width: `${prep.progressPct}%` }}
            />
            <span
              className="ap-exam-target-marker"
              style={{ left: `${targetMarker}%` }}
              aria-hidden
            />
          </div>
          <p className="ap-exam-progress-pct">{prep.progressPct}%</p>
        </div>
        <div className="ap-exam-active-footer">
          <div className="ap-exam-active-meta">
            <span>{prep.daysLabel}</span>
            <span>
              {prep.topicsDone} / {prep.topicsTotal} konu
            </span>
          </div>
          <Link href={prep.continueHref} className="ap-exam-continue">
            Devam et
          </Link>
        </div>
      </article>

      <div className="ap-exam-segment" role="tablist" aria-label="Kaynak">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "school"}
          className={cn(
            "ap-exam-segment-btn",
            tab === "school" && "ap-exam-segment-btn--active",
          )}
          onClick={() => setTab("school")}
        >
          Okulum
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cortex"}
          className={cn(
            "ap-exam-segment-btn",
            tab === "cortex" && "ap-exam-segment-btn--active",
          )}
          onClick={() => setTab("cortex")}
        >
          Cortex&apos;ten
        </button>
      </div>

      {tab === "school" ? (
        pickingSchool || !schoolName ? (
          <div className="ap-exam-school-picker">
            <label className="ap-field">
              <span>Hangi okula gidiyorsun?</span>
              <input
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Okul adı ara"
                autoComplete="off"
                autoFocus
              />
            </label>
            {schoolOptions.length ? (
              <ul className="ap-school-suggest">
                {schoolOptions.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      disabled={savingSchool}
                      onClick={() => void saveSchool(name)}
                    >
                      + {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--ap-muted)]">
                En az 2 harf yaz; önerilerden okulunu seç.
              </p>
            )}
            {schoolName ? (
              <button
                type="button"
                className="ap-chip mt-3"
                onClick={() => setPickingSchool(false)}
              >
                Vazgeç
              </button>
            ) : null}
          </div>
        ) : (
          <div className="ap-exam-school-filled">
            <article className="ap-exam-discover-card">
              <h3 className="ap-exam-discover-title">{schoolName}</h3>
              <p className="ap-exam-discover-desc">
                Okuluna özel yazılı ve müfredat yolları burada.
              </p>
              <div className="ap-exam-school-actions">
                <Link
                  href="/deneme-sinavlari/olustur"
                  className="ap-exam-discover-cta"
                >
                  Okul yazılısı oluştur
                </Link>
                <Link href="/calisma-plani" className="ap-exam-discover-cta">
                  Müfredatı aç
                </Link>
                <button
                  type="button"
                  className="ap-chip"
                  onClick={() => {
                    setSchoolQuery(schoolName);
                    setPickingSchool(true);
                  }}
                >
                  Okulu değiştir
                </button>
              </div>
            </article>
          </div>
        )
      ) : (
        <div className="ap-exam-discover-grid">
          <article className="ap-exam-discover-card ap-exam-discover-card--curriculum">
            <div className="ap-exam-discover-icon ap-exam-discover-icon--user">
              {userInitial?.slice(0, 1) ?? "?"}
            </div>
            <h3 className="ap-exam-discover-title">Matematik müfredatım</h3>
            <p className="ap-exam-discover-desc">
              Matematik müfredatından önceden hazırlanmış öğrenme yolları.
            </p>
            <Link href="/calisma-plani" className="ap-exam-discover-cta">
              Keşfet
            </Link>
          </article>
          <article className="ap-exam-discover-card ap-exam-discover-card--brand">
            <div className="ap-exam-discover-icon ap-exam-discover-icon--brand">
              ✦
            </div>
            <h3 className="ap-exam-discover-title">
              Cortex Plus tarafından önceden hazırlanmış
            </h3>
            <p className="ap-exam-discover-desc">
              Bilgini genişletmek için seçilmiş konular.
            </p>
            <Link href="/quizler" className="ap-exam-discover-cta">
              Keşfet
            </Link>
          </article>
        </div>
      )}
    </div>
  );
}
