import type { ReactNode } from "react";
import { formatDayLong } from "@/lib/format";
import { sharedByLine } from "@/lib/learning/class-share";
import "@/styles/class-share.css";

/** Kartta en çok bu kadar konu satırı; kalanı tek satırda sayılır (sayfa telefonda kısa kalsın). */
const UNIT_PREVIEW = 12;

export type SharedPrepCardData = {
  title: string;
  examType: string | null;
  examDate: string | null;
  units: string[];
  sharedBy: string | null;
};

/**
 * Paylaşılan çalışma yolunun önizlemesi (Faz 7, 20 Kasım 2026): `/davet/<kod>`. Misafir pazarlama kabuğunda, oturum
 * açık öğrenci uygulama kabuğunda (`cx-mk-body`) aynı kartı görür. Yalnız başlık, sınav türü ve tarihi, konu adları
 * (kazanım kodu atılmış) ve paylaşanın maskeli ilk adı; belge, ilerleme ve sonuç yok. 1. ünite "ücretsiz" etiketli:
 * klonda 1. ünitenin dersi hazır gelir ve ücretsiz hesabın ilk dersi süresiz açıktır.
 */
export function SharedPrepCard({ prep, action }: { prep: SharedPrepCardData; action: ReactNode }) {
  const examDay = formatDayLong(prep.examDate);
  const initial = prep.sharedBy ? prep.sharedBy.charAt(0) : "★";
  const shown = prep.units.slice(0, UNIT_PREVIEW);
  const rest = prep.units.length - shown.length;
  return (
    <section className="mk-card cp-invite-card" aria-labelledby="shared-prep-title" data-testid="shared-prep-card">
      <p className="cp-invite-by">
        <span className="cp-invite-avatar" aria-hidden>
          {initial}
        </span>
        <span>{sharedByLine(prep.sharedBy)}</span>
      </p>
      {prep.examType && prep.examType !== "Serbest" ? <p className="cp-invite-kicker">{prep.examType}</p> : null}
      <h1 id="shared-prep-title" className="cp-invite-title">
        {prep.title}
      </h1>
      <p className="cp-invite-meta">
        {prep.units.length ? `${prep.units.length} ünite` : "Çalışma yolu"}
        {examDay ? ` · Sınav ${examDay}` : ""}
      </p>
      {shown.length ? (
        <ol className="cp-invite-units" aria-label="Üniteler">
          {shown.map((unit, index) => (
            <li key={`${index}-${unit}`} className="cp-invite-unit">
              <span className="cp-invite-unit-no" aria-hidden>
                {index + 1}
              </span>
              <span className="cp-invite-unit-label">{unit}</span>
              {index === 0 ? <span className="cp-invite-unit-free">Ücretsiz</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {rest > 0 ? <p className="cp-invite-more">+{rest} ünite daha</p> : null}
      <p className="cp-invite-note">
        Klonlayınca bu çalışma yolu ve 1. ünitenin dersi kendi hesabına kopyalanır. Arkadaşının notları, cevapları ve
        sonuçları paylaşılmaz; senin ilerlemen de sıfırdan başlar.
      </p>
      {action}
    </section>
  );
}
