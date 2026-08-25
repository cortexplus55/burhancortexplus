"use client";

const ELEMENTS = [
  { s: "H", z: 1, name: "Hidrojen" },
  { s: "He", z: 2, name: "Helyum" },
  { s: "Li", z: 3, name: "Lityum" },
  { s: "C", z: 6, name: "Karbon" },
  { s: "N", z: 7, name: "Azot" },
  { s: "O", z: 8, name: "Oksijen" },
  { s: "Na", z: 11, name: "Sodyum" },
  { s: "Fe", z: 26, name: "Demir" },
  { s: "Cu", z: 29, name: "Bakır" },
  { s: "Au", z: 79, name: "Altın" },
];

export function PeriyodikTabloLab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--astra-muted)]">
        Seçili öğeler — tam tablo yakında genişletilecek.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {ELEMENTS.map((el) => (
          <div
            key={el.z}
            className="astra-pay-card flex flex-col items-center p-3 text-center"
          >
            <span className="text-[10px] text-[var(--astra-muted)]">{el.z}</span>
            <span className="text-lg font-bold">{el.s}</span>
            <span className="text-[10px] leading-tight text-[var(--astra-muted)]">
              {el.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
