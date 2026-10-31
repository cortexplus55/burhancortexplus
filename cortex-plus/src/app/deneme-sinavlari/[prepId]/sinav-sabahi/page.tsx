import Link from "next/link";
import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { CramPrintButton } from "@/components/parity/cram-print-button";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { formatDayLong } from "@/lib/format";
import {
  CRAM_EMPTY_TEXT,
  CRAM_KIND_LABEL,
  CRAM_SHEET_TITLE,
  CRAM_WEAK_HEADING,
} from "@/lib/learning/cram-sheet";
import { loadCramSheet } from "@/lib/learning/cram-sheet-load";
import "@/styles/cram-sheet.css";

export const metadata = { title: "Sınav sabahı kâğıdı" };
export const dynamic = "force-dynamic";

/**
 * Sınav sabahı kâğıdı (31 Ekim 2026, Paket J3 #14): hazırlığın kayıtlı derslerinden formüller, sınav ipuçları,
 * tuzaklar, hafıza çivileri, "Sınavda sorulur" maddeleri ve öğrencinin en çok yanıldığı noktalar tek sayfada.
 * Model çağrısı yok, kredi düşmez. Yazdır düğmesi tarayıcının penceresini açar ("PDF olarak kaydet" oradan).
 * Bekleme kutusu (Suspense, loading.tsx) yok: bu projede sayfayı boşaltıyor.
 */
export default async function CramSheetPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, target_score")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const sheet = await loadCramSheet(createServiceClient(), {
    prepId,
    userId: user.id,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
  });
  const prepTitle = (prep.title as string | null) ?? (prep.exam_type as string | null) ?? "Sınav hazırlığı";
  const examDay = formatDayLong((prep.exam_date as string | null) ?? null);

  return (
    <ParitySorShell {...shell} chrome="focus" backHref={examPrepHomeHref(prepId)}>
      <article className="cp-cram cp-cram-sheet" aria-labelledby="cram-title">
        <header className="cp-cram-head">
          <p className="cp-cram-kicker">
            {prepTitle}
            {examDay ? ` · Sınav ${examDay}` : ""}
          </p>
          <h1 id="cram-title" className="cp-cram-title">
            {CRAM_SHEET_TITLE}
          </h1>
          <p className="cp-cram-lead">Derslerinden derlendi: formüller, sınav ipuçları, tuzaklar ve en çok yanıldığın noktalar.</p>
          {sheet.empty ? null : (
            <div className="cp-cram-actions">
              <CramPrintButton />
            </div>
          )}
        </header>

        {sheet.empty ? (
          <div className="cp-cram-empty" role="status">
            <p>{CRAM_EMPTY_TEXT}</p>
            <Link href={examPrepHomeHref(prepId)} className="cp-cram-go">
              Yoluna dön
            </Link>
          </div>
        ) : (
          <>
            {sheet.focusTopics.length ? (
              <p className="cp-cram-focus">
                <strong>Önce bunlara bak: </strong>
                {sheet.focusTopics
                  .map((topic) => (topic.percent != null ? `${topic.label} (%${topic.percent})` : topic.label))
                  .join(" · ")}
              </p>
            ) : null}
            <div className="cp-cram-body">
              {sheet.weakSpots.length ? (
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
              {sheet.sections.map((section, sectionIndex) => (
                <section key={`${section.topic}-${sectionIndex}`} className="cp-cram-section">
                  <h2>
                    {section.topic}
                    {section.weak ? (
                      <span className="cp-cram-weak">
                        Zayıf{section.percent != null ? ` · %${section.percent}` : ""}
                      </span>
                    ) : null}
                  </h2>
                  <ul className="cp-cram-list">
                    {section.items.map((item, index) => (
                      <li key={`${item.kind}-${index}`} className={`cp-cram-item cp-cram-item--${item.kind}`}>
                        <span className="cp-cram-tag">{CRAM_KIND_LABEL[item.kind]}</span>
                        {item.title ? <span className="cp-cram-item-title">{item.title}: </span> : null}
                        <RichBody text={item.text} topicHint={section.topic} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="cp-cram-foot">Cortex Plus · {prepTitle}</p>
          </>
        )}
      </article>
    </ParitySorShell>
  );
}
