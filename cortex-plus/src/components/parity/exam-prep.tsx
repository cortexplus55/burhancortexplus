"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, GraduationCap, HelpCircle, Landmark, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SchoolFeedView } from "@/components/parity/school-feed-view";
import {
  OFFICIAL_EXAMS,
  catalogCreateHref,
  curriculumFor,
  type CatalogItem,
} from "@/lib/learning/exam-catalog";
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

/** Astra'daki üç sekme: Okulum / Müfredatım / Resmî sınavlar. */
type TabId = "school" | "curriculum" | "official";

const TAB_PARAM: Record<TabId, string | null> = {
  school: null,
  curriculum: "mufredat",
  official: "resmi",
};

function tabFromParam(value: string | null): TabId {
  if (value === "mufredat") return "curriculum";
  if (value === "resmi") return "official";
  return "school";
}

export function ParityExamPrep({
  activePrep,
  otherPreps = [],
  initialSchoolName = "",
  schoolSummary = null,
  schoolRows = [],
  gradeLevel = null,
}: {
  activePrep: ExamPrepCard | null;
  otherPreps?: ExamPrepCard[];
  userInitial?: string;
  initialSchoolName?: string;
  schoolSummary?: SchoolSummary | null;
  schoolRows?: SchoolFeedRow[];
  /** Profildeki sınıf; Müfredatım sekmesi buna göre ders gösterir. */
  gradeLevel?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"));
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<
    { id: string; name: string; city: string | null }[]
  >([]);
  const [pickingSchool, setPickingSchool] = useState(!initialSchoolName);
  const [savingSchool, setSavingSchool] = useState(false);
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
    const value = TAB_PARAM[next];
    if (value) params.set("tab", value);
    else params.delete("tab");
    const q = params.toString();
    router.replace(q ? `?${q}` : "/deneme-sinavlari", { scroll: false });
  }

  // Astra'da "Sınav hazırlıklarım" bütün hazırlıkları yan yana kart olarak
  // gösteriyor; tek öne çıkan kart + "Aç" satırları yok.
  const cards = [activePrep, ...otherPreps].filter(
    (card): card is ExamPrepCard => Boolean(card),
  );
  const curriculum = curriculumFor(gradeLevel);

  return (
    <div className="cp-exam-page">
      <div className="cp-exam-hub-tools">
        {/* Astra gibi: "Ara" okulda paylaşılanlarla birlikte arayan sayfayı açar. */}
        <Link href="/deneme-sinavlari/ara" className="cp-exam-search">
          <Search className="h-4 w-4" aria-hidden />
          Ara
        </Link>
        <button type="button" className="cp-exam-how" onClick={() => setHowOpen(true)}>
          <HelpCircle className="h-4 w-4" aria-hidden />
          Nasıl çalışır
        </button>
        <Link href="/deneme-sinavlari/olustur" className="cp-exam-create">
          + Yeni hazırlık
        </Link>
      </div>

      {cards.length ? (
        <section className="cp-prep-row-section" aria-labelledby="my-preps-title">
          <h1 id="my-preps-title" className="cp-prep-row-title">
            Sınav hazırlıklarım <ChevronRight className="h-4 w-4" aria-hidden />
          </h1>
          <div className="cp-prep-row">
            {cards.map((card, index) => (
              <PrepCard key={card.id} card={card} showTargetLabel={index === 0} />
            ))}
          </div>
        </section>
      ) : (
        <article className="cp-exam-active-card cp-exam-discover">
          <p className="cp-exam-discover-kicker">Henüz hazırlık yok</p>
          <h1 className="cp-exam-active-title">İlk sınav yolunu kur</h1>
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
      )}

      <div className="cp-exam-segment" role="tablist" aria-label="Kaynak">
        {(
          [
            ["school", "Okulum"],
            ["curriculum", "Müfredatım"],
            ["official", "Resmî sınavlar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn("cp-exam-segment-btn", tab === id && "cp-exam-segment-btn--active")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
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
      ) : null}

      {tab === "curriculum" ? (
        <section className="cp-catalog" aria-label="Müfredatım">
          <p className="cp-catalog-level">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Eğitim seviyen · {curriculum.levelLabel}
          </p>
          <h2 className="cp-catalog-title">Müfredatım</h2>
          <p className="cp-catalog-lead">
            Dersini seç; konular kurulumda müfredatına göre çıkarılır, yol ona göre açılır.
          </p>
          <CatalogGrid items={curriculum.items} />
        </section>
      ) : null}

      {tab === "official" ? (
        <section className="cp-catalog" aria-label="Resmî sınavlar">
          <h2 className="cp-catalog-title">Resmî sınavlar</h2>
          <p className="cp-catalog-lead">
            Hazırlandığın sınavı seç; konuları birlikte netleştirip yolunu kuralım.
          </p>
          <CatalogGrid items={OFFICIAL_EXAMS} icon />
        </section>
      ) : null}

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
                <span>Bir konu seç. Kısa başlangıç soruları o konudaki seviyeni ölçer; sonra derse geçersin.</span>
              </li>
              <li>
                <strong>Yolda ilerle</strong>
                <span>Podcast, alıştırma, quiz, sözlü ve deneme önerilen sıradadır. İstediğin etkinliği istediğin zaman açabilirsin.</span>
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

/** Astra'nın hazırlık kartı: başlık, hedef işaretli çubuk, yüzde, tarih, konu, Devam et. */
function PrepCard({ card, showTargetLabel }: { card: ExamPrepCard; showTargetLabel: boolean }) {
  const target =
    card.targetScore != null && card.targetScore > 0 && card.targetScore <= 100
      ? Math.min(100, Math.max(8, card.targetScore))
      : 75;
  const finished = card.topicsTotal > 0 && card.topicsDone === card.topicsTotal;
  return (
    <article className="cp-prep-card">
      <h2 className="cp-prep-card-title">{card.title}</h2>
      <div className="cp-exam-progress-wrap">
        {showTargetLabel ? (
          <span className="cp-exam-target-label" style={{ left: `${target}%` }}>
            hedef puan
          </span>
        ) : null}
        <div className="cp-exam-progress-track">
          <div className="cp-exam-progress-fill" style={{ width: `${card.progressPct}%` }} />
          <span className="cp-exam-target-marker" style={{ left: `${target}%` }} aria-hidden />
        </div>
        <p className="cp-exam-progress-pct">{card.progressPct}%</p>
      </div>
      <div className="cp-exam-active-footer">
        <div className="cp-exam-active-meta">
          <span>{card.daysLabel}</span>
          <span>
            {card.topicsDone} / {card.topicsTotal} konu
          </span>
        </div>
        <Link href={card.continueHref} className="cp-exam-continue">
          {finished ? "Deneme çöz" : "Devam et"}
        </Link>
      </div>
    </article>
  );
}

function CatalogGrid({ items, icon = false }: { items: CatalogItem[]; icon?: boolean }) {
  return (
    <ul className="cp-catalog-grid">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={catalogCreateHref(item)} className="cp-catalog-card">
            {icon ? <Landmark className="h-5 w-5" aria-hidden /> : null}
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
            <em>Başla</em>
          </Link>
        </li>
      ))}
    </ul>
  );
}
