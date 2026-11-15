"use client";

import { useEffect, useState } from "react";
import type { PlanItem, TeacherPlanView } from "@/lib/teacher/director";

/**
 * Öğretmen önce konuşur (PROMPT-V2 §6 M2–M6, PR-4; teacher.v2, ana sohbet, boş konuşma). Model çağrısı ve kota yok:
 * veri `/api/teacher/plan`'dan (Öğrenci Dosyası + yönlendirici). Akış: ilk söz ve süre çipleri → "Bir bakayım" ve
 * gerçek okumaların çipleri (en çok 3, ≤2 sn) → veriden teşhis → seçilen süreye eşit plan, "Başlayalım" / "Değiştir".
 * Veri yoksa dürüst yol ("seni daha tanımıyorum"). Okuma düşerse kart çizilmez (bugünkü boş ekran kalır).
 */
export function TeacherOpening({
  firstName,
  onWrite,
  onPrompt,
}: {
  firstName?: string | null;
  /** "Kendi cümlenle yaz": yazma alanına odak. */
  onWrite?: () => void;
  /** Veri yokken "Başlayalım": öğretmene kısa tanışma isteği gider (öğrencinin kendi dokunuşuyla, normal mesaj). */
  onPrompt?: (prompt: string) => void;
}) {
  const [view, setView] = useState<TeacherPlanView | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const query = firstName ? `?ad=${encodeURIComponent(firstName)}` : "";
    fetch(`/api/teacher/plan${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: TeacherPlanView | null) => {
        if (!cancelled && body && typeof body.opening === "string") setView(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [firstName]);

  // Analiz çipleri sırayla belirir (her biri 450 ms; en çok 3 → ≤1,4 sn), sonra teşhis ve plan.
  useEffect(() => {
    if (minutes == null || !view) return;
    setShown(0);
    const total = view.chips.length;
    const timers = Array.from({ length: total + 1 }, (_, index) => window.setTimeout(() => setShown(index + 1), 450 * (index + 1)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [minutes, view]);

  if (!view) return null;
  const plan: PlanItem[] = minutes != null ? (view.plans[String(minutes)] ?? []) : [];
  const analysed = minutes != null && shown > view.chips.length;

  return (
    <section className="cp-teacher-opening" aria-label="Öğretmenin önerisi">
      <p className="cp-teacher-opening-text">{view.opening}</p>
      {minutes == null ? (
        <div className="cp-tutor-chips" role="group" aria-label="Bugün ne kadar vaktin var?">
          {[10, 20, 45].map((value) => (
            <button key={value} type="button" className="cp-tutor-chip" onClick={() => setMinutes(value)}>
              {value} dk
            </button>
          ))}
          <button type="button" className="cp-tutor-chip" onClick={() => onWrite?.()}>
            Kendi cümlenle yaz
          </button>
        </div>
      ) : (
        <div className="cp-teacher-opening-flow" aria-live="polite">
          <p className="cp-teacher-opening-look">Bir bakayım…</p>
          {view.chips.length ? (
            <ul className="cp-teacher-opening-checks">
              {view.chips.slice(0, Math.min(shown, view.chips.length)).map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>
          ) : null}
          {analysed ? (
            <>
              <p className="cp-teacher-opening-text">{view.diagnosis}</p>
              {plan.length ? (
                <>
                  <ol className="cp-teacher-plan">
                    {plan.map((item) => (
                      <li key={item.key}>
                        <a href={item.href}>{item.title}</a>
                        <span>
                          {item.activity} · {item.minutes} dk · {item.reason}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="cp-tutor-chips" role="group" aria-label="Plan">
                    <a className="cp-tutor-chip cp-tutor-chip--primary" href={plan[0]!.href}>
                      Başlayalım
                    </a>
                    <button type="button" className="cp-tutor-chip" onClick={() => setMinutes(null)}>
                      Değiştir
                    </button>
                  </div>
                </>
              ) : (
                <div className="cp-tutor-chips" role="group" aria-label="Plan">
                  <button
                    type="button"
                    className="cp-tutor-chip cp-tutor-chip--primary"
                    onClick={() => onPrompt?.(`Bugün ${minutes} dakikam var. Beni tanımak için seviyemi ölçen kısa bir soru sor.`)}
                  >
                    Başlayalım
                  </button>
                  <button type="button" className="cp-tutor-chip" onClick={() => onWrite?.()}>
                    Kendi cümlenle yaz
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
