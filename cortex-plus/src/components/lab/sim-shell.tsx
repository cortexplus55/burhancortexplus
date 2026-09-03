"use client";

import { useEffect, useId, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simülasyon kabuğu.
 *
 * Eski lab uygulamaları birer düğme ve bir sayıdan ibaretti (~20 satır).
 * Ölçülebilir fark şuydu: öğrenci ne yapacağını bilmiyor, ne değiştirdiğini
 * göremiyor ve sonucu tahmin etmeden görüyor. Bu kabuk üçünü de çözüyor:
 *
 *  - İlk açılışta yardım: ne öğrenileceği, nasıl oynanacağı, gösterge anlamı.
 *  - Sol rayda etiketli denetimler; her denetimin değeri yanında canlı.
 *  - Sonuç şeridi: değiştirilen her denetimin sonuca etkisi anında görünür.
 *
 * Böylece her yeni simülasyon yalnızca kendi matematiğini ve çizimini
 * yazıyor; düzen, erişilebilirlik ve pedagoji burada bir kez çözülmüş oluyor.
 */

/**
 * SVG koordinatlarını yuvarlar.
 *
 * Tam duyarlıklı kayan noktalar sunucu ve istemcide farklı dizgeye
 * dönüşebiliyor; React bunu hidrasyon uyuşmazlığı sayıyor ve "düzeltilmeyecek"
 * uyarısı veriyor. İki ondalık hem sorunu kapatıyor hem DOM'u küçültüyor —
 * ekranda bir pikselin yüzde biri zaten görünmüyor.
 */
export const r2 = (v: number) => Math.round(v * 100) / 100;

export type SimHelp = {
  /** Bu simülasyon neyi öğretiyor — tek paragraf. */
  intro: string;
  /** Nasıl oynanır — kısa maddeler. */
  steps: string[];
  /** Renk/işaret anlamları. */
  legend?: { color: string; label: string }[];
};

export function SimShell({
  id,
  title,
  summary,
  subject,
  kind = "Simülasyon",
  help,
  modes,
  mode,
  onMode,
  controls,
  readouts,
  children,
}: {
  /** Yardımın "bir daha gösterme" kaydı bunun üzerinden tutuluyor. */
  id: string;
  title: string;
  summary: string;
  subject: string;
  kind?: string;
  help: SimHelp;
  modes?: { id: string; label: string }[];
  mode?: string;
  onMode?: (id: string) => void;
  controls: React.ReactNode;
  readouts?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // İlk açılışta yardım kendiliğinden çıkar, sonraki açılışlarda çıkmaz.
  // localStorage erişimi bazı bağlamlarda hata fırlatıyor; yardımı hiç
  // göstermemektense her seferinde göstermek daha iyi.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(`sim-help:${id}`) === "1";
    } catch {
      seen = false;
    }
    setHelpOpen(!seen);
    setReady(true);
  }, [id]);

  function closeHelp() {
    setHelpOpen(false);
    try {
      window.localStorage.setItem(`sim-help:${id}`, "1");
    } catch {
      /* kalıcılık olmadan da çalışsın */
    }
  }

  return (
    <div className="sim">
      <header className="sim-head">
        <div className="sim-head-main">
          <h2>{title}</h2>
          <span className="sim-tag">{subject}</span>
          <span className="sim-tag sim-tag--kind">{kind}</span>
        </div>
        <p className="sim-summary">{summary}</p>
        <button
          type="button"
          className="sim-help-btn"
          onClick={() => setHelpOpen(true)}
          aria-label="Nasıl kullanılır"
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
          Yardım
        </button>
      </header>

      {modes && modes.length > 1 ? (
        <div className="sim-modes" role="tablist" aria-label="Mod">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === mode}
              className={cn("sim-mode", m.id === mode && "is-on")}
              onClick={() => onMode?.(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="sim-body">
        <aside className="sim-controls" aria-label="Denetimler">
          {controls}
        </aside>
        <div className="sim-stage">{children}</div>
      </div>

      {readouts ? <div className="sim-readouts">{readouts}</div> : null}

      {ready && helpOpen ? (
        <div className="sim-help-scrim" role="dialog" aria-modal="true" aria-label="Yardım">
          <div className="sim-help">
            <button
              type="button"
              className="sim-help-close"
              onClick={closeHelp}
              aria-label="Kapat"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <h3>Yardım</h3>
            <p>{help.intro}</p>
            <ul>
              {help.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
            {help.legend?.length ? (
              <div className="sim-help-legend">
                {help.legend.map((item) => (
                  <span key={item.label}>
                    <i style={{ background: item.color }} aria-hidden />
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
            <button type="button" className="sim-help-ok" onClick={closeHelp}>
              Anladım
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Denetim ilkelleri
   ------------------------------------------------------------------------- */

export function SimSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Gösterim biçimi; ham sayı okunmuyorsa (para, yüzde) kullanılır. */
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="sim-field">
      <label htmlFor={id}>
        <span>{label}</span>
        <strong>
          {format ? format(value) : value}
          {unit ? <em>{unit}</em> : null}
        </strong>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function SimChips<T extends string>({
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
    <div className="sim-field">
      {label ? <span className="sim-field-label">{label}</span> : null}
      <div className="sim-chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            className={cn("sim-chip", o.id === value && "is-on")}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SimReadout({
  label,
  rows,
  tone = "neutral",
}: {
  label: string;
  rows: { label: string; value: string }[];
  tone?: "neutral" | "accent" | "highlight";
}) {
  return (
    <div className={cn("sim-card", `sim-card--${tone}`)}>
      <span className="sim-card-label">{label}</span>
      {rows.map((row) => (
        <span key={row.label} className="sim-card-row">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </span>
      ))}
    </div>
  );
}
