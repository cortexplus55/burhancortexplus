"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import {
  ToolChips,
  ToolField,
  ToolShell,
  ToolSteps,
} from "@/components/lab/tool-shell";

/**
 * Birim dönüştürücü.
 *
 * Sıcaklık dışındaki her birim tek bir temel birime oranla tanımlı, o yüzden
 * dönüşüm iki çarpma. Sıcaklık ise ofsetli (0 °C = 273,15 K), oranla
 * çevrilirse yanlış çıkıyor — bu yüzden ayrı ele alınıyor. Çoğu basit
 * dönüştürücünün hatası tam burada.
 */

type Unit = { id: string; label: string; factor: number };
type Category = { id: string; label: string; base: string; units: Unit[] };

const CATEGORIES: Category[] = [
  {
    id: "uzunluk",
    label: "Uzunluk",
    base: "metre",
    units: [
      { id: "mm", label: "milimetre", factor: 0.001 },
      { id: "cm", label: "santimetre", factor: 0.01 },
      { id: "m", label: "metre", factor: 1 },
      { id: "km", label: "kilometre", factor: 1000 },
      { id: "inc", label: "inç", factor: 0.0254 },
      { id: "ft", label: "fit", factor: 0.3048 },
      { id: "mil", label: "mil", factor: 1609.344 },
    ],
  },
  {
    id: "kutle",
    label: "Kütle",
    base: "kilogram",
    units: [
      { id: "mg", label: "miligram", factor: 1e-6 },
      { id: "g", label: "gram", factor: 0.001 },
      { id: "kg", label: "kilogram", factor: 1 },
      { id: "ton", label: "ton", factor: 1000 },
      { id: "lb", label: "libre", factor: 0.45359237 },
      { id: "oz", label: "ons", factor: 0.028349523 },
    ],
  },
  {
    id: "alan",
    label: "Alan",
    base: "metrekare",
    units: [
      { id: "cm2", label: "santimetrekare", factor: 0.0001 },
      { id: "m2", label: "metrekare", factor: 1 },
      { id: "da", label: "dönüm", factor: 1000 },
      { id: "ha", label: "hektar", factor: 10000 },
      { id: "km2", label: "kilometrekare", factor: 1e6 },
    ],
  },
  {
    id: "hacim",
    label: "Hacim",
    base: "litre",
    units: [
      { id: "ml", label: "mililitre", factor: 0.001 },
      { id: "l", label: "litre", factor: 1 },
      { id: "m3", label: "metreküp", factor: 1000 },
      { id: "gal", label: "galon (ABD)", factor: 3.785411784 },
    ],
  },
  {
    id: "zaman",
    label: "Zaman",
    base: "saniye",
    units: [
      { id: "ms", label: "milisaniye", factor: 0.001 },
      { id: "s", label: "saniye", factor: 1 },
      { id: "dk", label: "dakika", factor: 60 },
      { id: "sa", label: "saat", factor: 3600 },
      { id: "gun", label: "gün", factor: 86400 },
      { id: "yil", label: "yıl", factor: 31557600 },
    ],
  },
  {
    id: "sicaklik",
    label: "Sıcaklık",
    base: "kelvin",
    // Ofsetli olduğu için factor kullanılmıyor; aşağıda ayrı çevriliyor.
    units: [
      { id: "C", label: "santigrat", factor: 1 },
      { id: "F", label: "fahrenhayt", factor: 1 },
      { id: "K", label: "kelvin", factor: 1 },
    ],
  },
];

/** Sıcaklık ofsetli: oranla çevirmek yanlış sonuç verir. */
function toKelvin(v: number, unit: string): number {
  if (unit === "C") return v + 273.15;
  if (unit === "F") return ((v - 32) * 5) / 9 + 273.15;
  return v;
}

function fromKelvin(k: number, unit: string): number {
  if (unit === "C") return k - 273.15;
  if (unit === "F") return ((k - 273.15) * 9) / 5 + 32;
  return k;
}

function format(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e9)) return v.toExponential(4);
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 6 }).format(v);
}

export function BirimDonusturucu() {
  const [catId, setCatId] = useState("uzunluk");
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("km");
  const [amount, setAmount] = useState("1");

  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const value = Number(amount.replace(",", "."));

  const result = useMemo(() => {
    if (!Number.isFinite(value)) return NaN;
    if (cat.id === "sicaklik") return fromKelvin(toKelvin(value, from), to);
    const uf = cat.units.find((u) => u.id === from)?.factor ?? 1;
    const ut = cat.units.find((u) => u.id === to)?.factor ?? 1;
    return (value * uf) / ut;
  }, [value, from, to, cat]);

  function switchCategory(id: string) {
    const next = CATEGORIES.find((c) => c.id === id)!;
    setCatId(id);
    // Eski birimler yeni kategoride yok; ilk ikisine düş.
    setFrom(next.units[0].id);
    setTo(next.units[1]?.id ?? next.units[0].id);
  }

  const fromLabel = cat.units.find((u) => u.id === from)?.label ?? from;
  const toLabel = cat.units.find((u) => u.id === to)?.label ?? to;

  return (
    <ToolShell
      title="Birim dönüştürücü"
      subject="Genel"
      summary="Uzunluk, kütle, alan, hacim, zaman ve sıcaklık arasında çevir."
      inputs={
        <>
          <ToolChips
            label="Kategori"
            value={catId}
            options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
            onChange={switchCategory}
          />
          <ToolField label="Değer">
            <input
              className="tool-input"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Değer"
            />
          </ToolField>
          <ToolField label="Şu birimden">
            <select
              className="tool-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Kaynak birim"
            >
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </ToolField>
          <button
            type="button"
            className="tool-swap"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            Birimleri değiştir
          </button>
          <ToolField label="Şu birime">
            <select
              className="tool-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Hedef birim"
            >
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </ToolField>
        </>
      }
      result={
        <>
          <span className="tool-result-label">
            {format(value)} {fromLabel}
          </span>
          <strong className="tool-result-value">{format(result)}</strong>
          <span className="tool-result-note">{toLabel}</span>
        </>
      }
    >
      <ToolSteps
        rows={
          cat.id === "sicaklik"
            ? [
                { label: "Yöntem", value: "Ofsetli dönüşüm (oran değil)" },
                { label: "Ara değer", value: `${format(toKelvin(value, from))} K` },
                { label: "0 °C karşılığı", value: "273,15 K" },
              ]
            : [
                { label: "Temel birim", value: cat.base },
                {
                  label: `1 ${fromLabel}`,
                  value: `${format(cat.units.find((u) => u.id === from)?.factor ?? 1)} ${cat.base}`,
                },
                {
                  label: `1 ${toLabel}`,
                  value: `${format(cat.units.find((u) => u.id === to)?.factor ?? 1)} ${cat.base}`,
                },
                {
                  label: "Çarpan",
                  value: format(
                    (cat.units.find((u) => u.id === from)?.factor ?? 1) /
                      (cat.units.find((u) => u.id === to)?.factor ?? 1),
                  ),
                },
              ]
        }
      />
    </ToolShell>
  );
}
