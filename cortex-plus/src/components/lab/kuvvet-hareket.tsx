"use client";

import { useMemo, useState } from "react";

export function KuvvetHareketLab() {
  const [mass, setMass] = useState(2);
  const [force, setForce] = useState(10);

  const acceleration = useMemo(() => force / mass, [force, mass]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--astra-muted)]">
        Newton: F = m · a — kaydırıcılarla deney yap.
      </p>
      <label className="block text-sm">
        Kütle (kg): {mass}
        <input
          type="range"
          min={0.5}
          max={10}
          step={0.5}
          value={mass}
          onChange={(e) => setMass(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      <label className="block text-sm">
        Kuvvet (N): {force}
        <input
          type="range"
          min={1}
          max={50}
          value={force}
          onChange={(e) => setForce(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      <div className="astra-pay-card p-4 text-center">
        <p className="text-xs text-[var(--astra-muted)]">İvme</p>
        <p className="text-3xl font-bold">{acceleration.toFixed(2)} m/s²</p>
      </div>
      <div
        className="relative h-16 overflow-hidden rounded-2xl bg-[var(--astra-surface)]"
        aria-hidden
      >
        <div
          className="absolute top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-[var(--astra-primary)] transition-transform duration-300"
          style={{
            transform: `translateX(${Math.min(acceleration * 8, 280)}px) translateY(-50%)`,
          }}
        />
      </div>
    </div>
  );
}
