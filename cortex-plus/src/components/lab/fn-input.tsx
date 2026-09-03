"use client";

import { useId } from "react";

/**
 * Fonksiyon girişi.
 *
 * Hazır fonksiyon listesi yerine serbest metin: öğrencinin kendi yazdığı
 * fonksiyonu görmesi, listeden seçmesinden çok daha fazlasını öğretiyor.
 * Girdi `eval` ile değil kendi ayrıştırıcımızla işleniyor (lib/lab/expr.ts).
 *
 * Hazır örnekler yine duruyor — boş bir kutuya ne yazacağını bilmemek
 * öğrenciyi durduruyor.
 */

const PRESETS = ["x^2", "x^3-3x", "sin(x)", "1/x", "sqrt(x)", "e^x"];

export function FnInput({
  value,
  onChange,
  label = "Fonksiyon f(x)",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="sim-field">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <input
        id={id}
        className="sim-fn-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder="x^2"
      />
      <div className="sim-chips">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`sim-chip${p === value ? " is-on" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
