"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Araç kabuğu.
 *
 * Simülasyon kabuğundan farkı bilinçli: burada "önce tahmin et" ya da ilk
 * açılış yardımı yok. Araç bir şeyi öğretmek için değil, bir işi yapmak
 * için açılıyor — araya adım koymak yoluna taş koymak olur.
 *
 * Girdi solda, sonuç sağda ve sonuç HER ZAMAN görünür; araç açılır açılmaz
 * varsayılan değerlerle bir cevap duruyor, boş ekran karşılamıyor.
 */
export function ToolShell({
  title,
  subject,
  summary,
  inputs,
  result,
  children,
}: {
  title: string;
  subject: string;
  summary: string;
  inputs: React.ReactNode;
  /** Baş sonuç — büyük ve tek bakışta okunur. */
  result: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="tool">
      <Link href="/araclar" className="tool-back">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Araçlar
      </Link>

      <header className="tool-head">
        <h1>{title}</h1>
        <span className="tool-tag">{subject}</span>
        <p>{summary}</p>
      </header>

      <div className="tool-body-grid">
        <div className="tool-inputs">{inputs}</div>
        <div className="tool-output">
          <div className="tool-result">{result}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ToolField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tool-field">
      <span className="tool-field-label">{label}</span>
      {children}
      {hint ? <span className="tool-field-hint">{hint}</span> : null}
    </div>
  );
}

export function ToolNumber({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="tool-field">
      <label className="tool-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="tool-input"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
      {hint ? <span className="tool-field-hint">{hint}</span> : null}
    </div>
  );
}

export function ToolChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tool-field">
      {label ? <span className="tool-field-label">{label}</span> : null}
      <div className="tools-filters" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            className={cn("tools-chip", o.id === value && "is-on")}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ana sonucun altındaki ara değerler — çözümün nasıl çıktığını gösterir. */
export function ToolSteps({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="tool-steps">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
