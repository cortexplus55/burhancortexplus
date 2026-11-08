"use client";

import type { ReactNode } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, FileText, GraduationCap, ListChecks, Sprout, Target } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { subjectLook } from "@/lib/ui/subject-look";

/**
 * Kurulum sihirbazının çerçevesi (8 Kasım 2026 yeniden tasarım; ürün sahibi: "daha premium, profesyonel, samimi;
 * üstünde düşünülmüş"). Üç parça:
 *  - `WizardHeader`: geri, dört aşamalı adım çubuğu (Sınav · Materyal · Sen · Plan) ve "3 / 10".
 *  - `PrepTicket`: cevaplar geldikçe dolan "Hazırlığın" kartı; masaüstünde sağda yapışkan, telefonda üstte yatay
 *    şerit. Cevaplanmış satıra dokunmak o adıma döner.
 *  - `TeacherSay`: adımın açıklaması öğretmenin ağzından, küçük marka işaretiyle.
 */

export type WizardPhase = { id: string; label: string; steps: readonly string[] };

export const WIZARD_PHASES: readonly WizardPhase[] = [
  { id: "sinav", label: "Sınav", steps: ["subject", "date", "target"] },
  { id: "materyal", label: "Materyal", steps: ["material", "language"] },
  { id: "sen", label: "Sen", steps: ["modality", "familiarity"] },
  { id: "plan", label: "Plan", steps: ["topics", "focus", "plan"] },
];

export function WizardHeader({
  order,
  current,
  onBack,
}: {
  /** Adımların sırası (WIZARD_STEP_ORDER). */
  order: readonly string[];
  /** İlerleme sayılan adım (hazırlanıyor ekranları "topics" sayılır). */
  current: string;
  /** Yoksa geri düğmesi çizilmez. */
  onBack?: () => void;
}) {
  const index = Math.max(0, order.indexOf(current));
  return (
    <header className="apw-head">
      <div className="apw-head-row">
        {onBack ? (
          <button type="button" className="apw-back" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Geri
          </button>
        ) : (
          <span className="apw-head-title">Yeni sınav hazırlığı</span>
        )}
        <span className="apw-head-count" aria-label={`Adım ${index + 1} / ${order.length}`}>
          {index + 1} / {order.length}
        </span>
      </div>
      <ol className="apw-phases-bar" aria-label="Kurulum aşamaları">
        {WIZARD_PHASES.map((phase) => {
          const positions = phase.steps.map((step) => order.indexOf(step)).filter((at) => at >= 0);
          const done = positions.filter((at) => at < index).length;
          const active = positions.includes(index);
          const complete = positions.length > 0 && done === positions.length;
          const fill = positions.length ? ((done + (active ? 0.5 : 0)) / positions.length) * 100 : 0;
          const state = complete ? "done" : active ? "active" : "todo";
          return (
            <li
              key={phase.id}
              className={`apw-phase apw-phase--${state}`}
              style={{ flexGrow: Math.max(1, positions.length) }}
              aria-current={active ? "step" : undefined}
            >
              <span className="apw-phase-track" aria-hidden>
                <span className="apw-phase-fill" style={{ width: `${fill}%` }} />
              </span>
              <span className="apw-phase-label">
                {complete ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

export type TicketRow = {
  key: string;
  label: string;
  /** Boşsa satır "henüz yok" olarak çizilir (telefonda hiç çizilmez). */
  value: string | null;
  detail?: string | null;
  /** Bu satırın sorulduğu adım; geçilmişse satır o adıma dönen düğmedir. */
  step: string;
};

const ROW_ICON = {
  exam: GraduationCap,
  date: CalendarDays,
  daily: Clock3,
  target: Target,
  material: FileText,
  level: Sprout,
  topics: ListChecks,
} as const;

export function PrepTicket({
  subject,
  rows,
  order,
  current,
  onJump,
}: {
  subject: string;
  rows: TicketRow[];
  order: readonly string[];
  current: string;
  /** Yoksa satırlar düğme değildir (hazırlanıyor ekranlarında). */
  onJump?: (step: string) => void;
}) {
  const look = subjectLook(subject);
  const SubjectIcon = look.icon;
  const index = order.indexOf(current);
  const filled = rows.filter((row) => row.value).length;
  return (
    <section
      className={subject ? "apw-ticket apw-ticket--on" : "apw-ticket"}
      style={{ ["--apw-subject" as string]: look.accent }}
      aria-label="Hazırlığın"
      data-filled={filled}
    >
      <div className="apw-ticket-head">
        <span className="apw-ticket-icon" aria-hidden>
          <SubjectIcon className="h-5 w-5" />
        </span>
        <span className="apw-ticket-title">
          <small>Hazırlığın</small>
          <strong>{subject || "Ders seçilmedi"}</strong>
        </span>
      </div>
      <ul className="apw-ticket-rows">
        {rows.map((row) => {
          const Icon = row.key === "subject" ? SubjectIcon : ROW_ICON[row.key as keyof typeof ROW_ICON] ?? Check;
          const reachable = Boolean(onJump && row.value && order.indexOf(row.step) >= 0 && order.indexOf(row.step) < index);
          const body = (
            <>
              <Icon className="apw-ticket-row-icon h-4 w-4" aria-hidden />
              <span className="apw-ticket-label">{row.label}</span>
              <span className="apw-ticket-value">
                {row.value ?? "—"}
                {row.value && row.detail ? <small>{row.detail}</small> : null}
              </span>
            </>
          );
          return (
            <li key={row.key} className={row.value ? "apw-ticket-row" : "apw-ticket-row apw-ticket-row--empty"}>
              {reachable ? (
                <button
                  type="button"
                  className="apw-ticket-jump"
                  onClick={() => onJump?.(row.step)}
                  aria-label={`${row.label}: ${row.value}. Değiştir`}
                >
                  {body}
                </button>
              ) : (
                <span className="apw-ticket-static">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Adımın açıklaması öğretmenin ağzından: küçük işaret + cümle. */
export function TeacherSay({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={className ? `apw-lead apw-say ${className}` : "apw-lead apw-say"}>
      <span className="apw-say-mark" aria-hidden>
        <CortexMark size={16} />
      </span>
      <span className="apw-say-text">{children}</span>
    </p>
  );
}
