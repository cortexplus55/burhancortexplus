"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ToolShell } from "@/components/lab/tool-shell";
import {
  CELL_ORGANELLES,
  organelleForSlot,
  scoreCellPlacement,
  type OrganelleId,
  type SlotId,
} from "@/lib/lab/simulations";
import "@/styles/sim-lab.css";

const SHORT_NAME: Record<OrganelleId, string> = {
  nucleus: "Çekirdek",
  mito: "Mito",
  ribo: "Ribozom",
  golgi: "Golgi",
  er: "ER",
};

const SLOTS: { id: SlotId; x: number; y: number; label: string }[] = [
  { id: "center", x: 160, y: 150, label: "Merkez" },
  { id: "top", x: 160, y: 48, label: "Üst" },
  { id: "right", x: 268, y: 150, label: "Sağ" },
  { id: "bottom", x: 160, y: 248, label: "Alt" },
  { id: "left", x: 52, y: 150, label: "Sol" },
];

export function HucreLab() {
  const [selected, setSelected] = useState<OrganelleId | null>(CELL_ORGANELLES[0].id);
  const [placed, setPlaced] = useState<Partial<Record<SlotId, OrganelleId>>>({});
  const score = useMemo(() => scoreCellPlacement(placed), [placed]);
  const placedCount = Object.keys(placed).length;
  const place = (slotId: SlotId) => {
    if (!selected) return;
    setPlaced((current) => ({ ...current, [slotId]: selected }));
  };

  return (
    <ToolShell
      title="Hücre laboratuvarı"
      subject="Biyoloji"
      summary="Organeli seç, yuvaya yerleştir. Doğru yerde sınav ipucu açılır; yanlışta düzeltme görürsün."
      inputs={
        <div className="sim-palette" role="listbox" aria-label="Organeller">
          {CELL_ORGANELLES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected === item.id}
              className={`sim-chip${selected === item.id ? " is-on" : ""}`}
              onClick={() => setSelected(item.id)}
            >
              {item.name}
            </button>
          ))}
          <button type="button" className="sim-chip" onClick={() => setPlaced({})}>
            Sıfırla
          </button>
        </div>
      }
      result={
        <div>
          <svg viewBox="0 0 320 300" className="sim-svg sim-cell" role="img" aria-label="Hücre">
            <ellipse cx="160" cy="150" rx="138" ry="122" className="sim-cell-wall" />
            <ellipse cx="160" cy="150" rx="124" ry="108" className="sim-cell-membrane" />
            {SLOTS.map((slot) => {
              const got = placed[slot.id];
              const expected = organelleForSlot(slot.id);
              const ok = got === expected.id;
              const name = got ? CELL_ORGANELLES.find((item) => item.id === got)?.name : null;
              return (
                <g
                  key={slot.id}
                  role="button"
                  tabIndex={0}
                  aria-label={name ? `${slot.label} yuvası: ${name}` : `${slot.label} yuvasına yerleştir`}
                  onClick={() => place(slot.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    place(slot.id);
                  }}
                >
                  <motion.circle
                    cx={slot.x}
                    cy={slot.y}
                    r={28}
                    className={`sim-slot${got ? (ok ? " is-ok" : " is-bad") : ""}`}
                  />
                  <text x={slot.x} y={slot.y + 4} textAnchor="middle" className="sim-slot-label">
                    {got ? SHORT_NAME[got] : slot.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="sim-caption">
            {placedCount === 0
              ? "Bir organel seç, sonra yuvaya dokun."
              : `${score.correct} / ${score.total} doğru`}
          </p>
        </div>
      }
    >
      <ul className="sim-tips">
        {SLOTS.map((slot) => {
          const got = placed[slot.id];
          if (!got) return null;
          const expected = organelleForSlot(slot.id);
          const ok = got === expected.id;
          return (
            <li key={slot.id} className={ok ? "is-ok" : "is-bad"}>
              {ok ? (
                <>
                  <strong>Sınav ipucu · {expected.name}:</strong> {expected.tip}
                </>
              ) : (
                <>
                  <strong>Yanlış yer:</strong> {CELL_ORGANELLES.find((item) => item.id === got)?.name} buraya ait
                  değil. Doğrusu {expected.name}.
                </>
              )}
            </li>
          );
        })}
      </ul>
    </ToolShell>
  );
}
