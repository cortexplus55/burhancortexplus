"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
}: {
  activePrep: ExamPrepCard | null;
  userInitial?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabId =
    searchParams.get("tab") === "school" ? "school" : "cortex";

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
    continueHref: "/calisma-plani",
  };

  const targetMarker =
    prep.targetScore != null && prep.targetScore > 0
      ? Math.min(100, Math.max(8, prep.targetScore))
      : 72;

  return (
    <div className="ap-exam-page">
      <Link href="/deneme-sinavlari" className="ap-exam-section-head">
        Sınav hazırlıklarım
        <span aria-hidden>›</span>
      </Link>

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
        <button type="button" className="ap-exam-school-prompt">
          Hangi okula gidiyorsun?
        </button>
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
