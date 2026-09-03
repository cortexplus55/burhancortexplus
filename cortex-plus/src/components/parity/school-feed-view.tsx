"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  feedSubjects,
  filterBySubject,
  popularIds,
  type SchoolFeedRow,
  type SchoolSummary,
} from "@/lib/parity/school-feed";

export function SchoolFeedView({
  summary,
  rows,
  onPickSchool,
}: {
  summary: SchoolSummary | null;
  rows: SchoolFeedRow[];
  /** Okul seçilmemişse seçiciyi açar. */
  onPickSchool: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const subjects = useMemo(() => feedSubjects(rows), [rows]);
  const visible = useMemo(() => filterBySubject(rows, subject), [rows, subject]);
  const popular = useMemo(() => popularIds(rows), [rows]);

  if (!summary) {
    return (
      <div className="ap-exam-school-picker">
        <p className="ap-upload-hint">
          Okulunu seçtiğinde arkadaşlarının paylaştığı hazırlıklar burada
          görünür.
        </p>
        <button type="button" className="ap-exam-discover-cta mt-3" onClick={onPickSchool}>
          Okulumu seç
        </button>
      </div>
    );
  }

  async function join(prepId: string) {
    setJoining(prepId);
    try {
      const res = await fetch("/api/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      const data = (await res.json()) as { id?: string; alreadyJoined?: boolean };
      if (!res.ok || !data.id) throw new Error();
      if (data.alreadyJoined) {
        toast.info("Bu hazırlığa zaten katılmıştın.");
      }
      router.push(`/deneme-sinavlari/${data.id}`);
    } catch {
      toast.error("Katılamadın. Lütfen tekrar dene.");
    } finally {
      setJoining(null);
    }
  }

  return (
    <div className="ap-school-feed">
      <article className="ap-school-card">
        <span className="ap-school-icon" aria-hidden>
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="ap-school-name">{summary.schoolName}</h3>
          <p className="ap-school-meta">
            <span>
              <Users className="h-3 w-3" aria-hidden /> {summary.memberCount} üye
            </span>
            <span>·</span>
            <span>{summary.sharedCount} paylaşılan hazırlık</span>
          </p>
        </div>
        <button type="button" className="ap-chip" onClick={onPickSchool}>
          Değiştir
        </button>
      </article>

      {subjects.length > 1 ? (
        <div className="ap-lab-filters">
          <button
            type="button"
            onClick={() => setSubject(null)}
            className={cn("ap-lab-chip", subject === null && "ap-lab-chip--on")}
          >
            Tüm dersler
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={cn("ap-lab-chip", subject === s && "ap-lab-chip--on")}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length ? (
        <ul className="ap-school-list">
          {visible.map((item) => (
            <li key={item.id} className="ap-school-item">
              <div className="ap-school-item-head">
                <span className="ap-school-avatar" aria-hidden>
                  {item.ownerName.slice(0, 1).toUpperCase()}
                </span>
                <span className="ap-school-owner">
                  {item.isOwn ? "Sen" : item.ownerName}
                </span>
                {popular.has(item.id) ? (
                  <span className="ap-school-badge">POPÜLER</span>
                ) : null}
                {item.isOwn ? <span className="ap-school-own">Seninki</span> : null}
              </div>

              {item.examType ? (
                <span className="ap-school-subject">{item.examType}</span>
              ) : null}
              <h4 className="ap-school-title">{item.title ?? "Sınav hazırlığı"}</h4>

              <div className="ap-school-item-foot">
                {/* Sayaç katılımları sayıyor; "görüntülenme" demek yanlış olurdu. */}
                <span className="ap-school-views">
                  <Users className="h-3 w-3" aria-hidden />
                  {item.viewCount} katılım
                  {item.topicCount > 0 ? ` · ${item.topicCount} konu` : ""}
                </span>
                {item.isOwn ? (
                  <Link href={`/deneme-sinavlari/${item.id}`} className="ap-chip">
                    Aç
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="ap-exam-discover-cta"
                    disabled={joining === item.id}
                    onClick={() => void join(item.id)}
                  >
                    {joining === item.id ? "Katılıyor…" : "Katıl"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ap-upload-hint">
          {rows.length
            ? "Bu derste paylaşılan hazırlık yok."
            : "Okulunda henüz paylaşılan hazırlık yok. İlk paylaşan sen ol — hazırlığını açıp menüden paylaşabilirsin."}
        </p>
      )}
    </div>
  );
}
