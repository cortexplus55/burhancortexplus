"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { markNodeClickIfMissing } from "@/lib/learning/node-open-click";
import { peekInstantLesson, type InstantLesson } from "@/lib/learning/instant-lesson";

/**
 * Anında ilk ekran (3 Kasım 2026): yoldan bir adıma tıklanınca oturum kabuğu sunucu çizimini beklemeden çizilir.
 * Havuz dersi açılışı (#543 deseni): yol sayfası sıradaki dersin ilk ekranını belleğe yazdıysa ilk ders metni
 * hemen görünür; yoksa ders biçimli iskelet (eski boş ekran + dönen simge yerine). Sayfa gelince gerçek ders geçer.
 */
export default function ExamNodeLoading() {
  const params = useParams<{ prepId: string; nodeId: string }>();
  const [lesson, setLesson] = useState<InstantLesson | null>(() =>
    params?.prepId && params?.nodeId ? peekInstantLesson(String(params.prepId), String(params.nodeId)) : null,
  );
  useEffect(() => {
    markNodeClickIfMissing();
    if (!lesson && params?.prepId && params?.nodeId) setLesson(peekInstantLesson(String(params.prepId), String(params.nodeId)));
    try {
      performance.mark(lesson ? "cp-lesson-preview" : "cp-lesson-skeleton");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="cp-sor-root cp-sor-root--session">
      <main className="cp-sor-main">
        <div className="cp-exam-page mx-auto w-full max-w-2xl px-4 py-6" aria-busy="true" aria-label="Ders yükleniyor">
          {lesson ? (
            <article data-testid="instant-lesson" className="space-y-3">
              <h1 className="text-xl font-semibold leading-snug break-words">{lesson.title}</h1>
              <h2 className="text-base font-semibold text-[var(--c-action)] break-words">{lesson.heading}</h2>
              {lesson.paragraphs.map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed break-words">
                  {p}
                </p>
              ))}
            </article>
          ) : (
            <div data-testid="lesson-skeleton" className="space-y-3 animate-pulse">
              <div className="h-6 w-3/4 rounded bg-black/10 dark:bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-black/10 dark:bg-white/10" />
              {[100, 95, 98, 80, 92, 60].map((w, i) => (
                <div key={i} className="h-3.5 rounded bg-black/10 dark:bg-white/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
