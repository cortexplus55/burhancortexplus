"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, HelpCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ExamPrepCard = {
  id: string;
  title: string;
  examType?: string;
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
  otherPreps = [],
  userInitial,
  initialSchoolName = "",
}: {
  activePrep: ExamPrepCard | null;
  otherPreps?: ExamPrepCard[];
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
  const [query, setQuery] = useState("");
  const [howOpen, setHowOpen] = useState(false);

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

  const prep = activePrep;
  const needle = query.trim().toLowerCase();
  function matches(card: ExamPrepCard) {
    if (!needle) return true;
    return `${card.title} ${card.examType ?? ""} ${card.daysLabel}`
      .toLowerCase()
      .includes(needle);
  }
  const visibleActive = prep && matches(prep) ? prep : null;
  const visibleOthers = otherPreps.filter(matches);
  const targetMarker =
    visibleActive?.targetScore != null && visibleActive.targetScore > 0
      ? Math.min(100, Math.max(8, visibleActive.targetScore))
      : 72;

  return (
    <div className="ap-exam-page">
      <div className="ap-exam-section-head">
        <span>
          Sınav hazırlıklarım
          <span aria-hidden> ›</span>
        </span>
        <Link href="/deneme-sinavlari/olustur" className="ap-exam-create">
          + Oluştur
        </Link>
      </div>

      <div className="ap-exam-hub-tools">
        <label className="ap-exam-search">
          <Search className="h-4 w-4" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ara"
            aria-label="Hazırlık ara"
          />
        </label>
        <button type="button" className="ap-exam-how" onClick={() => setHowOpen(true)}>
          <HelpCircle className="h-4 w-4" aria-hidden />
          Nasıl çalışır
        </button>
      </div>

      {visibleActive ? (
        <article className="ap-exam-active-card">
          <h2 className="ap-exam-active-title">{visibleActive.title}</h2>
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
                style={{ width: `${visibleActive.progressPct}%` }}
              />
              <span
                className="ap-exam-target-marker"
                style={{ left: `${targetMarker}%` }}
                aria-hidden
              />
            </div>
            <p className="ap-exam-progress-pct">{visibleActive.progressPct}%</p>
          </div>
          <div className="ap-exam-active-footer">
            <div className="ap-exam-active-meta">
              <span>{visibleActive.daysLabel}</span>
              <span>
                {visibleActive.topicsDone} / {visibleActive.topicsTotal} konu
              </span>
            </div>
            <Link href={visibleActive.continueHref} className="ap-exam-continue">
              {visibleActive.topicsDone === visibleActive.topicsTotal && visibleActive.topicsTotal > 0
                ? "Deneme çöz"
                : "Devam et"}
            </Link>
          </div>
        </article>
      ) : needle ? (
        visibleOthers.length === 0 && tab === "cortex" ? (
          <p className="ap-exam-search-empty">Bu aramaya uyan hazırlık yok.</p>
        ) : null
      ) : !prep ? (
        <article className="ap-exam-active-card">
          <h2 className="ap-exam-active-title">İlk sınav hazırlığını oluştur</h2>
          <p className="mt-2 text-sm text-[var(--ap-muted)]">
            Sınavında neler var söyle; konuları sohbetle topla, tarihi seç, yolda ilerle.
          </p>
          <div className="ap-exam-active-footer">
            <span />
            <Link href="/deneme-sinavlari/olustur" className="ap-exam-continue">
              Oluştur
            </Link>
          </div>
        </article>
      ) : null}

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
                Okul yazılısı oluştur; konular ders ders ilerler.
              </p>
              <div className="ap-exam-school-actions">
                <Link
                  href="/deneme-sinavlari/olustur"
                  className="ap-exam-discover-cta"
                >
                  Okul yazılısı oluştur
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
          {visibleOthers.map((item) => (
            <article key={item.id} className="ap-exam-discover-card ap-exam-discover-card--curriculum">
              <div className="ap-exam-discover-icon ap-exam-discover-icon--user">
                <BookOpen className="h-4 w-4 text-sky-400" aria-hidden />
              </div>
              <h3 className="ap-exam-discover-title">{item.title}</h3>
              <p className="ap-exam-discover-desc">
                {item.topicsDone} / {item.topicsTotal} konu · {item.daysLabel}
              </p>
              <Link href={`/deneme-sinavlari/${item.id}`} className="ap-exam-discover-cta">
                Aç
              </Link>
            </article>
          ))}
          {!needle ? (
            <article className="ap-exam-discover-card ap-exam-discover-card--brand">
              <div className="ap-exam-discover-icon ap-exam-discover-icon--brand">
                {userInitial?.slice(0, 1) ?? "✦"}
              </div>
              <h3 className="ap-exam-discover-title">Yeni hazırlık</h3>
              <p className="ap-exam-discover-desc">
                TYT, AYT, LGS veya okul yazılısı — konuları seç, ders ders ilerle.
              </p>
              <Link href="/deneme-sinavlari/olustur" className="ap-exam-discover-cta">
                Oluştur
              </Link>
            </article>
          ) : null}
        </div>
      )}

      {howOpen ? (
        <div
          className="ap-exam-how-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-how-title"
          onClick={() => setHowOpen(false)}
        >
          <article className="ap-exam-how-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="ap-exam-how-head">
              <h2 id="exam-how-title">Nasıl çalışır</h2>
              <button type="button" aria-label="Kapat" onClick={() => setHowOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="ap-exam-how-steps">
              <li>
                <strong>Sınavını anlat</strong>
                <span>Sohbette neler çıkacağını söyle. Konular toplanır, sınav tarihini seçersin.</span>
              </li>
              <li>
                <strong>Hadi başlayalım</strong>
                <span>Bir konu seç. 5 soruluk tanışma testi gelir; bazı sorularda birden fazla yanıt vardır.</span>
              </li>
              <li>
                <strong>Yolda ilerle</strong>
                <span>Podcast, alıştırma, quiz, sözlü ve deneme sırayla açılır. Kilitli düğümler önceki bitince çözülür.</span>
              </li>
              <li>
                <strong>Ders bitince</strong>
                <span>Skorunu gör, eğitmenden kısa not al, sonraki düğüme geç.</span>
              </li>
            </ol>
            <Link
              href="/deneme-sinavlari/olustur"
              className="ap-exam-continue ap-exam-continue--primary"
              onClick={() => setHowOpen(false)}
            >
              Hazırlık oluştur
            </Link>
          </article>
        </div>
      ) : null}
    </div>
  );
}
