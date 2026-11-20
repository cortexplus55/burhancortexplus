"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, FileText, Moon, Share2 } from "lucide-react";
import { CramPrintButton } from "@/components/parity/cram-print-button";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { UnicodeFormulaText } from "@/components/parity/unicode-formula";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { CortexMark } from "@/components/brand/cortex-mark";
import { CRAM_QR_NOTE } from "@/lib/learning/class-share";
import {
  CRAM_EMPTY_TEXT,
  CRAM_KIND_LABEL,
  CRAM_SHEET_TITLE,
  CRAM_SIGNATURE,
  CRAM_TRAP_KINDS,
  CRAM_WEAK_HEADING,
  cramFocusNote,
  cramFormulaMarkup,
  cramSectionBadge,
  type CramSheet,
} from "@/lib/learning/cram-sheet";
import "@/styles/cram-sheet.css";

export type CramFilter = "all" | "formulas" | "traps" | "mistakes";
type CramView = "dark" | "paper";

/** Paylaşım: bağlantı hazırlığın imzalı davetidir (kâğıdın kendi adresi yalnız sahibine açık). */
export type CramShare = { url: string; whatsappHref: string; qrSrc: string | null };

const FILTERS: { id: CramFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "formulas", label: "Formüller" },
  { id: "traps", label: "Sınav Tuzakları" },
  { id: "mistakes", label: "Yanıldığım Noktalar" },
];

const EMPTY_FILTER: Record<Exclude<CramFilter, "all">, string> = {
  formulas: "Bu hazırlığın derslerinde henüz formül yok.",
  traps: "Henüz sınav tuzağı ya da hoca uyarısı yok.",
  mistakes: "Henüz yanıldığın bir nokta yok. Test çözdükçe burada toplanır.",
};

/**
 * Sınav sabahı kâğıdının gövdesi (Paket J denetimi: sayfadan ayrıldı ki uçtan uca test veritabanısız fikstürle aynı
 * bileşeni çizebilsin). Veri yükleme sayfada kalır.
 *
 * 15 Kasım 2026 (ürün sahibi): üstte süzgeç çipleri (Tümü · Formüller · Sınav Tuzakları · Yanıldığım Noktalar), başta
 * formül özeti ve hoca uyarıları, "Koyu görünüm" ile "A4 kâğıt önizlemesi" arasında geçiş, yazdır düğmesinin yanında
 * WhatsApp ve bağlantı kopyalama, kâğıdın altında imza ve QR. Yazdırırken süzgeç ne olursa olsun kâğıdın tamamı basılır
 * (`cram-sheet.css`, `@media print`).
 */
export function CramSheetView({
  sheet,
  prepTitle,
  examDay,
  homeHref,
  preview = false,
  share = null,
}: {
  sheet: CramSheet;
  prepTitle: string;
  examDay: string | null;
  homeHref: string;
  /**
   * Ana sayfadaki önizleme (11 Kasım 2026): aynı kâğıt, ama sayfanın tek başlığı o değil (h3), yazdırma düğmesi yok
   * ve baskı kurallarını tetikleyen `cp-cram-sheet` sınıfı taşınmaz (ana sayfa yazdırılırken kâğıt sayfayı gizlemesin).
   */
  preview?: boolean;
  share?: CramShare | null;
}) {
  const Title = preview ? "h3" : "h1";
  const [filter, setFilter] = useState<CramFilter>("all");
  const [view, setView] = useState<CramView>("dark");
  const formulas = sheet.formulas ?? [];
  const teacherRules = sheet.teacherRules ?? [];

  // Yazdırırken kâğıdın tamamı basılır: süzgeç baskı penceresi açılmadan "Tümü"ne döner.
  useEffect(() => {
    if (preview) return;
    const reset = () => flushSync(() => setFilter("all"));
    window.addEventListener("beforeprint", reset);
    return () => window.removeEventListener("beforeprint", reset);
  }, [preview]);

  const sections = useMemo(() => {
    if (filter === "traps") {
      return sheet.sections
        .map((section) => ({ ...section, items: section.items.filter((item) => CRAM_TRAP_KINDS.has(item.kind)) }))
        .filter((section) => section.items.length > 0);
    }
    return filter === "all" ? sheet.sections : [];
  }, [filter, sheet.sections]);

  const counts: Record<CramFilter, number> = {
    all: sheet.itemCount + sheet.weakSpots.length + teacherRules.length,
    formulas: formulas.length,
    traps:
      teacherRules.length +
      sheet.sections.reduce((sum, section) => sum + section.items.filter((item) => CRAM_TRAP_KINDS.has(item.kind)).length, 0),
    mistakes: sheet.weakSpots.length,
  };
  const showFormulas = (filter === "all" || filter === "formulas") && formulas.length > 0;
  const showRules = (filter === "all" || filter === "traps") && teacherRules.length > 0;
  const showSpots = (filter === "all" || filter === "mistakes") && sheet.weakSpots.length > 0;
  const filterEmpty = filter !== "all" && counts[filter] === 0;

  async function copyLink() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      toast.success("Bağlantı kopyalandı.");
    } catch {
      toast.error(`Kopyalanamadı. Bağlantı: ${share.url}`);
    }
  }

  return (
    <article
      className={preview ? "cp-cram cp-cram-preview" : "cp-cram cp-cram-sheet"}
      data-view={preview ? undefined : view}
      data-filter={preview ? undefined : filter}
      aria-labelledby="cram-title"
    >
      <header className="cp-cram-head">
        <p className="cp-cram-kicker">
          {prepTitle}
          {examDay ? ` · Sınav ${examDay}` : ""}
        </p>
        <Title id="cram-title" className="cp-cram-title">
          {CRAM_SHEET_TITLE}
        </Title>
        <p className="cp-cram-lead">
          Derslerinden derlendi: formüller, sınav ipuçları, tuzaklar ve en çok
          yanıldığın noktalar.
        </p>
        {sheet.empty || preview ? null : (
          <div className="cp-cram-actions">
            <CramPrintButton />
            {share ? (
              <>
                <ExternalAnchor href={share.whatsappHref} className="cp-cram-share">
                  <Share2 className="h-4 w-4" aria-hidden />
                  <span>WhatsApp&apos;ta Paylaş</span>
                </ExternalAnchor>
                <button type="button" className="cp-cram-share" onClick={() => void copyLink()}>
                  <Copy className="h-4 w-4" aria-hidden />
                  <span>Bağlantıyı Kopyala</span>
                </button>
              </>
            ) : null}
          </div>
        )}
      </header>

      {sheet.empty ? (
        <div className="cp-cram-empty" role="status">
          <p>{CRAM_EMPTY_TEXT}</p>
          <Link href={homeHref} className="cp-cram-go">
            Yoluna dön
          </Link>
        </div>
      ) : (
        <>
          {preview ? null : (
            <div className="cp-cram-toolbar">
              <div className="cp-cram-filters" role="group" aria-label="Kâğıdı süz">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cp-cram-chip"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                    <span className="cp-cram-chip-count">{counts[item.id]}</span>
                  </button>
                ))}
              </div>
              <div className="cp-cram-views" role="group" aria-label="Görünüm">
                <button type="button" className="cp-cram-view" aria-pressed={view === "dark"} onClick={() => setView("dark")}>
                  <Moon className="h-4 w-4" aria-hidden />
                  Koyu Görünüm
                </button>
                <button type="button" className="cp-cram-view" aria-pressed={view === "paper"} onClick={() => setView("paper")}>
                  <FileText className="h-4 w-4" aria-hidden />
                  A4 Kağıt Önizlemesi
                </button>
              </div>
            </div>
          )}

          <div className="cp-cram-page">
            {filter === "all" && sheet.focusTopics.length ? (
              <p className="cp-cram-focus">
                <strong>Önce bunlara bak: </strong>
                {sheet.focusTopics
                  .map((topic) => {
                    const note = cramFocusNote(topic);
                    return note ? `${topic.label} (${note})` : topic.label;
                  })
                  .join(" · ")}
              </p>
            ) : null}

            {showFormulas ? (
              <section className="cp-cram-formulas" aria-label="Formül özeti">
                <h2>Formül Özeti</h2>
                <ul className="cp-cram-formula-list">
                  {formulas.map((formula, index) => (
                    <li key={`formula-${index}`} className="cp-cram-formula">
                      {formula.title ? <span className="cp-cram-item-title">{formula.title}: </span> : null}
                      {/* Faz 5 §1.1: yazı tipinden bağımsız Unicode formül (²ⁿ√(a²ⁿ) = |a|); çevrilemeyen KaTeX ile. */}
                      <UnicodeFormulaText text={cramFormulaMarkup(formula.text)} topicHint={formula.topic} />
                      <span className="cp-cram-formula-topic">{formula.topic}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {showRules ? (
              <section className="cp-cram-rules" aria-label="Hoca uyarıları">
                <h2>Hoca Uyarıları</h2>
                <ul className="cp-cram-list">
                  {teacherRules.map((rule, index) => (
                    <li key={`rule-${index}`} className="cp-cram-item cp-cram-item--teacher">
                      <span className="cp-cram-tag">{CRAM_KIND_LABEL.teacher}</span>
                      <RichBody text={rule} topicHint="" />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {filterEmpty ? (
              <p className="cp-cram-filter-empty" role="status">
                {EMPTY_FILTER[filter as Exclude<CramFilter, "all">]}
              </p>
            ) : null}

            <div className="cp-cram-body">
              {showSpots ? (
                <section className="cp-cram-section" aria-label="En çok yanıldığın noktalar">
                  <h2>{CRAM_WEAK_HEADING}</h2>
                  <ul className="cp-cram-list">
                    {sheet.weakSpots.map((spot, index) => (
                      <li key={`spot-${index}`} className="cp-cram-item cp-cram-item--trap">
                        <RichBody text={spot.text} topicHint={spot.topic ?? ""} />
                        {spot.topic ? <span className="cp-cram-spot-topic">{spot.topic}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {sections.map((section, sectionIndex) => (
                <section key={`${section.topic}-${sectionIndex}`} className="cp-cram-section">
                  <h2>
                    {section.topic}
                    {cramSectionBadge(section) ? <span className="cp-cram-weak">{cramSectionBadge(section)}</span> : null}
                  </h2>
                  <ul className="cp-cram-list">
                    {section.items.map((item, index) => (
                      <li key={`${item.kind}-${index}`} className={`cp-cram-item cp-cram-item--${item.kind}`}>
                        <span className="cp-cram-tag">{CRAM_KIND_LABEL[item.kind]}</span>
                        {item.title ? <span className="cp-cram-item-title">{item.title}: </span> : null}
                        <RichBody text={item.kind === "formula" ? cramFormulaMarkup(item.text) : item.text} topicHint={section.topic} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {preview ? (
              <p className="cp-cram-foot">Cortex Plus · {prepTitle}</p>
            ) : (
              // Faz 7 (20 Kasım 2026): imza mührü (marka işareti, logo değişmez), not ve QR. Baskıda tek parça
              // (`break-inside: avoid`); QR bağlantısı hazırlığın paylaşım kodu (`/davet/<kod>`).
              <footer className="cp-cram-sign" data-has-qr={share?.qrSrc ? "true" : undefined}>
                <div className="cp-cram-sign-seal">
                  <CortexMark size={28} className="cp-cram-sign-mark" />
                  <div className="cp-cram-sign-text">
                    <p className="cp-cram-sign-brand">{CRAM_SIGNATURE}</p>
                    <p className="cp-cram-sign-note">{prepTitle} · notlarından ve derslerinden derlendi.</p>
                  </div>
                </div>
                {share?.qrSrc ? (
                  <div className="cp-cram-sign-qr">
                    <p className="cp-cram-sign-cta">{CRAM_QR_NOTE}</p>
                    {/* QR yerel üreticiyle çizilir (ağ isteği yok). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cp-cram-qr" src={share.qrSrc} alt="Bu hazırlığı telefonunda açma bağlantısının QR kodu" width={96} height={96} />
                  </div>
                ) : null}
              </footer>
            )}
          </div>
        </>
      )}
    </article>
  );
}
