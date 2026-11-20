import { Check } from "lucide-react";
import {
  RED_PEN_DEDUCTION_LEAD,
  RED_PEN_TITLE,
  formatRedPenPoints,
  splitEarnedNote,
  type RedPen,
} from "@/lib/learning/mock-exam/red-pen";
import "@/styles/red-pen.css";

/**
 * Kırmızı Kalemli Hoca (Faz 7, 20 Kasım 2026): açık uçlu sorunun notu sınav kâğıdı gibi. Yeşil tik satırları puanın
 * nereden geldiğini ("+N Puan · …"), kırmızı kalemle halkalanan satırlar nerede kırıldığını ("−N Puan · Hoca buradan
 * kırar: …") söyler. Kâğıt her iki temada da açık zeminli ve koyu mürekkepli (ekran görüntüsü alınacak bir yüzey);
 * renk çiftleri AA'yı geçer (`red-pen.css`). Veri `red-pen.ts`ten, kayıttaki `feedback` alanlarından.
 */
export function RedPenSheet({
  redPen,
  earned,
  max,
  className,
}: {
  redPen: RedPen;
  /** Sorunun notu; kâğıdın köşesinde "7 / 10". Yoksa yazılmaz. */
  earned?: number | null;
  max?: number | null;
  className?: string;
}) {
  const hasScore = typeof earned === "number" && typeof max === "number" && max > 0;
  const lost = redPen.deductionAlerts.length > 0;
  return (
    <section className={["cp-redpen", className].filter(Boolean).join(" ")} aria-label={RED_PEN_TITLE}>
      <header className="cp-redpen-head">
        <p className="cp-redpen-kicker">{RED_PEN_TITLE}</p>
        {hasScore ? (
          <p className={lost ? "cp-redpen-total is-lost" : "cp-redpen-total"}>
            <span className="cp-redpen-total-num">{formatRedPenPoints(earned!)}</span>
            <span className="cp-redpen-total-max"> / {formatRedPenPoints(max!)} Puan</span>
          </p>
        ) : null}
      </header>
      <ul className="cp-redpen-list">
        {redPen.earnedStepNotes.map((note, index) => {
          const row = splitEarnedNote(note);
          return (
            <li key={`e-${index}`} className="cp-redpen-row is-earned">
              <span className="cp-redpen-tick" aria-hidden>
                <Check strokeWidth={3} />
              </span>
              <p className="cp-redpen-text">
                {row.points ? <strong className="cp-redpen-plus">+{row.points} Puan</strong> : null}
                {row.points ? <span className="cp-redpen-sep" aria-hidden> · </span> : null}
                <span>{row.text}</span>
              </p>
            </li>
          );
        })}
        {redPen.deductionAlerts.map((alert, index) => (
          <li key={`d-${index}`} className="cp-redpen-row is-lost">
            <span className="cp-redpen-circle">−{formatRedPenPoints(alert.lostPoints)} Puan</span>
            <div className="cp-redpen-text">
              <p className="cp-redpen-step">{alert.step}</p>
              <p className="cp-redpen-note">
                <strong>{RED_PEN_DEDUCTION_LEAD}</strong> {alert.teacherNote}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
