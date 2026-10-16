"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, Landmark } from "lucide-react";
import { toast } from "sonner";
import { SchoolFeedView } from "@/components/parity/school-feed-view";
import {
  OFFICIAL_EXAMS,
  catalogCreateHref,
  curriculumFor,
  type CatalogItem,
} from "@/lib/learning/exam-catalog";
import type { SchoolFeedRow, SchoolSummary } from "@/lib/parity/school-feed";

/*
  Sınavlar listesindeki üç kutunun sayfaları (17 Ekim 2026, Astra ile yan yana:
  OKULUM / MÜFREDAT / RESMÎ SINAVLAR ayrı sayfalar açıyor — /exam-preps/school,
  /curriculum, /official). Önceden aynı sayfada sekmeydiler.
*/

export function SchoolPrepsPage({
  initialSchoolName,
  summary,
  rows,
}: {
  initialSchoolName: string;
  summary: SchoolSummary | null;
  rows: SchoolFeedRow[];
}) {
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolOptions, setSchoolOptions] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [picking, setPicking] = useState(!initialSchoolName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!picking) return;
    const q = schoolQuery.trim();
    const t = window.setTimeout(() => {
      void fetch(`/api/schools/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setSchoolOptions(data.results ?? []))
        .catch(() => setSchoolOptions([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [picking, schoolQuery]);

  // Ad yalnız gösterim için; ağın dayandığı şey school_id.
  async function saveSchool(school: { id: string; name: string }) {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_name: school.name, school_id: school.id }),
      });
      if (!res.ok) {
        toast.error("Okul kaydedilemedi.");
        return;
      }
      setSchoolName(school.name);
      setSchoolQuery("");
      setPicking(false);
      toast.success("Okul kaydedildi.");
      // Akış okul kimliğine göre sunucuda okunuyor; yeni okulun hazırlıkları için tazele.
      window.location.reload();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cp-exam-page cp-exam-subpage">
      <h1 className="cp-exam-subpage-title">Okulum</h1>
      {picking || !schoolName ? (
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
                  <button type="button" disabled={saving} onClick={() => void saveSchool(option)}>
                    + {option.name}
                    {option.city ? <span className="cp-school-suggest-city">{option.city}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--cp-muted)]">En az 2 harf yaz; önerilerden okulunu seç.</p>
          )}
          {schoolName ? (
            <button type="button" className="cp-chip mt-3" onClick={() => setPicking(false)}>
              Vazgeç
            </button>
          ) : null}
        </div>
      ) : (
        <div className="cp-exam-school-filled">
          <SchoolFeedView
            summary={summary}
            rows={rows}
            onPickSchool={() => {
              setSchoolQuery(schoolName);
              setPicking(true);
            }}
          />
          <Link href="/deneme-sinavlari/olustur" className="cp-exam-discover-cta mt-4 inline-flex">
            Okul yazılısı oluştur
          </Link>
        </div>
      )}
    </div>
  );
}

export function CurriculumPage({ gradeLevel }: { gradeLevel: string | null }) {
  const curriculum = curriculumFor(gradeLevel);
  return (
    <section className="cp-exam-page cp-exam-subpage cp-catalog" aria-label="Müfredat">
      <p className="cp-catalog-level">
        <GraduationCap className="h-4 w-4" aria-hidden />
        Eğitim seviyen · {curriculum.levelLabel}
      </p>
      <h1 className="cp-exam-subpage-title">Müfredat</h1>
      <p className="cp-catalog-lead">
        Dersini seç; konular kurulumda müfredatına göre çıkarılır, yol ona göre açılır.
      </p>
      <CatalogGrid items={curriculum.items} />
    </section>
  );
}

export function OfficialExamsPage() {
  return (
    <section className="cp-exam-page cp-exam-subpage cp-catalog" aria-label="Resmî sınavlar">
      <h1 className="cp-exam-subpage-title">Resmî sınavlar</h1>
      <p className="cp-catalog-lead">Hazırlandığın sınavı seç; konuları birlikte netleştirip yolunu kuralım.</p>
      <CatalogGrid items={OFFICIAL_EXAMS} icon />
    </section>
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
