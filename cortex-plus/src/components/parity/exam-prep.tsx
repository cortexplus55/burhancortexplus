"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, HelpCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { turkishFold } from "@/lib/text/turkish";
import { cn } from "@/lib/utils";
import { SchoolFeedView } from "@/components/parity/school-feed-view";
import type {
  SchoolFeedRow,
  SchoolSummary,
} from "@/lib/parity/school-feed";

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

export function ParityExamPrep({
  activePrep,
  otherPreps = [],
  userInitial,
  initialSchoolName = "",
  schoolSummary = null,
  schoolRows = [],
}: {
  activePrep: ExamPrepCard | null;
  otherPreps?: ExamPrepCard[];
  userInitial?: string;
  initialSchoolName?: string;
  schoolSummary?: SchoolSummary | null;
  schoolRows?: SchoolFeedRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabId =
    searchParams.get("tab") === "school" ? "school" : "cortex";
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<
    { id: string; name: string; city: string | null }[]
  >([]);
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
        .then((data) => setSchoolOptions(data.results ?? []))
        .catch(() => setSchoolOptions([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [tab, pickingSchool, schoolQuery]);

  // Ad artik yalnizca gosterim icin; agin dayandigi sey school_id.
  async function saveSchool(school: { id: string; name: string }) {
    const clean = school.name;
    setSavingSchool(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_name: clean, school_id: school.id }),
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
  // Katlama olmadan "ingilizce" yazan "İngilizce"yi bulamıyordu.
  const needle = turkishFold(query.trim());
  function matches(card: ExamPrepCard) {
    if (!needle) return true;
    return turkishFold(
      `${card.title} ${card.examType ?? ""} ${card.daysLabel}`,
    ).includes(needle);
  }
  const visibleActive = prep && matches(prep) ? prep : null;
  const visibleOthers = otherPreps.filter(matches);
  const targetMarker =
    visibleActive?.targetScore != null && visibleActive.targetScore > 0
      ? Math.min(100, Math.max(8, visibleActive.targetScore))
      : 72;

  return (
    <div className="cp-exam-page">
      <div className="cp-exam-section-head">
        {/* Sayfanın h1'i yoktu; görsel başlık zaten buydu. */}
        <h1 className="cp-exam-section-title">
          Sınav
        </h1>
        <Link href="/deneme-sinavlari/olustur" className="cp-exam-create">
          + Oluştur
        </Link>
      </div>

      <div className="cp-exam-hub-tools">
        <label className="cp-exam-search">
          <Search className="h-4 w-4" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ara"
            aria-label="Hazırlık ara"
          />
        </label>
        <button type="button" className="cp-exam-how" onClick={() => setHowOpen(true)}>
          <HelpCircle className="h-4 w-4" aria-hidden />
          Nasıl çalışır
        </button>
      </div>

      {visibleActive ? (
        <article className="cp-exam-active-card">
          <h2 className="cp-exam-active-title">{visibleActive.title}</h2>
          <div className="cp-exam-progress-wrap">
            <span
              className="cp-exam-target-label"
              style={{ left: `${targetMarker}%` }}
            >
              hedef puan
            </span>
            <div className="cp-exam-progress-track">
              <div
                className="cp-exam-progress-fill"
                style={{ width: `${visibleActive.progressPct}%` }}
              />
              <span
                className="cp-exam-target-marker"
                style={{ left: `${targetMarker}%` }}
                aria-hidden
              />
            </div>
            <p className="cp-exam-progress-pct">{visibleActive.progressPct}%</p>
          </div>
          <div className="cp-exam-active-footer">
            <div className="cp-exam-active-meta">
              <span>{visibleActive.daysLabel}</span>
              <span>
                {visibleActive.topicsDone} / {visibleActive.topicsTotal} konu
              </span>
            </div>
            <Link href={visibleActive.continueHref} className="cp-exam-continue">
              {visibleActive.topicsDone === visibleActive.topicsTotal && visibleActive.topicsTotal > 0
                ? "Deneme çöz"
                : "Devam et"}
            </Link>
          </div>
        </article>
      ) : needle ? (
        visibleOthers.length === 0 && tab === "cortex" ? (
          <p className="cp-exam-search-empty">Bu aramaya uyan hazırlık yok.</p>
        ) : null
      ) : !prep ? (
        <article className="cp-exam-active-card cp-exam-discover">
          <p className="cp-exam-discover-kicker">Henüz hazırlık yok</p>
          <h2 className="cp-exam-active-title">İlk sınav yolunu kur</h2>
          <p className="mt-2 text-sm text-[var(--cp-muted)]">
            Hedef sınavını söyle, konuları topla, kısa tanı testiyle seviyeni ölç — günlük yol otomatik açılır.
          </p>
          <ol className="cp-exam-discover-steps" aria-label="Nasıl başlanır">
            <li><strong>1</strong><span>Sınavı anlat</span></li>
            <li><strong>2</strong><span>Konu seç + tanı</span></li>
            <li><strong>3</strong><span>Yolda ilerle</span></li>
          </ol>
          <div className="cp-exam-active-footer">
            <button type="button" className="cp-exam-how cp-exam-how--ghost" onClick={() => setHowOpen(true)}>
              Nasıl çalışır?
            </button>
            <Link href="/deneme-sinavlari/olustur" className="cp-exam-continue cp-exam-continue--primary">
              Hazırlık oluştur
            </Link>
          </div>
        </article>
      ) : null}

      <div className="cp-exam-segment" role="tablist" aria-label="Kaynak">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "school"}
          className={cn(
            "cp-exam-segment-btn",
            tab === "school" && "cp-exam-segment-btn--active",
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
            "cp-exam-segment-btn",
            tab === "cortex" && "cp-exam-segment-btn--active",
          )}
          onClick={() => setTab("cortex")}
        >
          Cortex&apos;ten
        </button>
      </div>

      {tab === "school" ? (
        pickingSchool || !schoolName ? (
          <div className="cp-exam-school-picker">
            <label className="cp-field">
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
              <ul className="cp-school-suggest">
                {schoolOptions.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={savingSchool}
                      onClick={() => void saveSchool(option)}
                    >
                      + {option.name}
                      {option.city ? (
                        <span className="cp-school-suggest-city">{option.city}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--cp-muted)]">
                En az 2 harf yaz; önerilerden okulunu seç.
              </p>
            )}
            {schoolName ? (
              <button
                type="button"
                className="cp-chip mt-3"
                onClick={() => setPickingSchool(false)}
              >
                Vazgeç
              </button>
            ) : null}
          </div>
        ) : (
          <div className="cp-exam-school-filled">
            <SchoolFeedView
              summary={schoolSummary}
              rows={schoolRows}
              onPickSchool={() => {
                setSchoolQuery(schoolName);
                setPickingSchool(true);
              }}
            />
            <Link
              href="/deneme-sinavlari/olustur"
              className="cp-exam-discover-cta mt-4 inline-flex"
            >
              Okul yazılısı oluştur
            </Link>
          </div>
        )
      ) : (
        <div className="cp-exam-discover-grid">
          {visibleOthers.map((item) => (
            <article key={item.id} className="cp-exam-discover-card cp-exam-discover-card--curriculum">
              <div className="cp-exam-discover-icon cp-exam-discover-icon--user">
                <BookOpen className="h-4 w-4 text-sky-400" aria-hidden />
              </div>
              <h3 className="cp-exam-discover-title">{item.title}</h3>
              <p className="cp-exam-discover-desc">
                {item.topicsDone} / {item.topicsTotal} konu · {item.daysLabel}
              </p>
              <Link href={`/deneme-sinavlari/${item.id}`} className="cp-exam-discover-cta">
                Aç
              </Link>
            </article>
          ))}
          {!needle ? (
            <article className="cp-exam-discover-card cp-exam-discover-card--brand">
              <div className="cp-exam-discover-icon cp-exam-discover-icon--brand">
                {userInitial?.slice(0, 1) ?? "✦"}
              </div>
              <h3 className="cp-exam-discover-title">Yeni hazırlık</h3>
              <p className="cp-exam-discover-desc">
                TYT, AYT, LGS veya okul yazılısı — konuları seç, ders ders ilerle.
              </p>
              <Link href="/deneme-sinavlari/olustur" className="cp-exam-discover-cta">
                Oluştur
              </Link>
            </article>
          ) : null}
        </div>
      )}

      {howOpen ? (
        <div
          className="cp-exam-how-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-how-title"
          onClick={() => setHowOpen(false)}
        >
          <article className="cp-exam-how-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="cp-exam-how-head">
              <h2 id="exam-how-title">Nasıl çalışır</h2>
              <button type="button" aria-label="Kapat" onClick={() => setHowOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="cp-exam-how-steps">
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
              className="cp-exam-continue cp-exam-continue--primary"
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
