"use client";

import { useMemo, useState } from "react";
import { ToolChips, ToolShell, ToolSteps } from "@/components/lab/tool-shell";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  ELEMENTS,
  shells,
  type ChemElement,
  type ElementCategory,
} from "@/lib/lab/elements";
import { cn } from "@/lib/utils";

/**
 * Periyodik tablo.
 *
 * Tablonun bütün öğretici gücü KONUMDAN geliyor: aynı gruptakiler alt alta,
 * aynı periyottakiler yan yana. Bu yüzden ızgara gerçek periyot/grup
 * değerleriyle çiziliyor, alfabetik bir liste değil.
 *
 * Kategori vurgulama var çünkü "alkali metaller nerede" sorusunun cevabı
 * ancak diğerleri sönükleşince görülüyor.
 */

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ElementCategory[];

export function PeriyodikTablo() {
  const [selected, setSelected] = useState<ChemElement>(
    ELEMENTS.find((e) => e.z === 6)!,
  );
  const [highlight, setHighlight] = useState<string>("hepsi");

  const main = useMemo(() => ELEMENTS.filter((e) => e.period <= 7), []);
  const lanth = useMemo(() => ELEMENTS.filter((e) => e.period === 8), []);
  const actin = useMemo(() => ELEMENTS.filter((e) => e.period === 9), []);

  const dim = (e: ChemElement) => highlight !== "hepsi" && e.category !== highlight;

  const cell = (e: ChemElement) => (
    <button
      key={e.z}
      type="button"
      className={cn("pt-cell", dim(e) && "is-dim", selected.z === e.z && "is-on")}
      style={{
        gridColumn: e.group,
        borderColor: CATEGORY_COLOR[e.category],
        color: CATEGORY_COLOR[e.category],
      }}
      onClick={() => setSelected(e)}
      aria-label={`${e.name}, atom numarası ${e.z}`}
      aria-pressed={selected.z === e.z}
    >
      <span className="pt-z">{e.z}</span>
      <span className="pt-sym">{e.symbol}</span>
    </button>
  );

  const config = shells(selected.z);

  return (
    <ToolShell
      title="Periyodik tablo"
      subject="Kimya"
      summary="118 element. Konum tesadüf değil — aynı gruptakiler alt alta."
      inputs={
        <>
          <ToolChips
            label="Vurgula"
            value={highlight}
            options={[
              { id: "hepsi", label: "Hepsi" },
              ...CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABEL[c] })),
            ]}
            onChange={setHighlight}
          />
        </>
      }
      result={
        <>
          <span className="tool-result-label">
            {selected.z} · {CATEGORY_LABEL[selected.category]}
          </span>
          <strong
            className="tool-result-value"
            style={{ color: CATEGORY_COLOR[selected.category] }}
          >
            {selected.symbol}
          </strong>
          <span className="tool-result-note">{selected.name}</span>
        </>
      }
    >
      <ToolSteps
        rows={[
          { label: "Atom numarası", value: String(selected.z) },
          { label: "Kütle numarası", value: String(selected.mass) },
          {
            label: "Periyot / grup",
            value:
              selected.period > 7
                ? selected.period === 8
                  ? "Lantanit serisi"
                  : "Aktinit serisi"
                : `${selected.period}. periyot · ${selected.group}. grup`,
          },
          { label: "Elektron dizilimi", value: config.join(" · ") },
          { label: "Değerlik kabuğu", value: String(config[config.length - 1]) },
        ]}
      />

      <div className="pt-wrap">
        <div className="pt-grid">{main.map(cell)}</div>
        <div className="pt-series">
          <div className="pt-grid pt-grid--series">{lanth.map(cell)}</div>
          <div className="pt-grid pt-grid--series">{actin.map(cell)}</div>
        </div>
      </div>

      <div className="pt-legend">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={cn("pt-legend-item", highlight === c && "is-on")}
            onClick={() => setHighlight(highlight === c ? "hepsi" : c)}
          >
            <i style={{ background: CATEGORY_COLOR[c] }} aria-hidden />
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
    </ToolShell>
  );
}
