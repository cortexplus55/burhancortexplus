"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * Enzim kinetiği (Michaelis-Menten).
 *
 * Öğrenci "substrat artınca hız artar" diye başlıyor ve doygunluğu
 * beklemiyor. Eğrinin düzleşmesinin sebebi enzimin bitmesi: her enzim zaten
 * çalışıyorsa daha fazla substrat bir işe yaramıyor.
 *
 * İnhibitör türü seçilebiliyor çünkü sınav sorularının çoğu buradan
 * geliyor ve yarışmalı/yarışmasız ayrımı yalnızca hangi parametrenin
 * değiştiğine bakarak anlaşılıyor: yarışmalı Km'yi, yarışmasız Vmax'ı
 * bozuyor. Grafikte bu fark doğrudan okunuyor.
 */

type Inhibitor = "yok" | "yarismali" | "yarismasiz";

export function EnzimKinetigiLab() {
  const [vmax, setVmax] = useState(100);
  const [km, setKm] = useState(5);
  const [substrate, setSubstrate] = useState(5);
  const [inhibitor, setInhibitor] = useState<Inhibitor>("yok");
  const [inhAmount, setInhAmount] = useState(1);

  // Yarışmalı inhibisyon Km'yi büyütür, yarışmasız Vmax'ı küçültür.
  const alpha = inhibitor === "yok" ? 1 : 1 + inhAmount;
  const effKm = inhibitor === "yarismali" ? km * alpha : km;
  const effVmax = inhibitor === "yarismasiz" ? vmax / alpha : vmax;

  const rate = (s: number) => (effVmax * s) / (effKm + s);
  const baseRate = (s: number) => (vmax * s) / (km + s);

  const v = rate(substrate);
  const saturation = (v / effVmax) * 100;

  const data = useMemo(() => {
    const sMax = Math.max(km * 8, substrate * 1.5, 20);
    return Array.from({ length: 121 }, (_, i) => {
      const s = (i / 120) * sMax;
      return { s, v: rate(s), base: baseRate(s) };
    });
  }, [effKm, effVmax, km, vmax, substrate]);

  const W = 540;
  const H = 260;
  const PAD = 42;
  const sMax = data[data.length - 1].s;
  const yMax = vmax * 1.1;

  const px = (s: number) => r2(PAD + (s / sMax) * (W - PAD * 2));
  const py = (val: number) => r2(H - PAD - (val / yMax) * (H - PAD * 2));

  const line = (key: "v" | "base") =>
    data.map((p, i) => `${i ? "L" : "M"}${px(p.s)},${py(p[key])}`).join(" ");

  return (
    <SimShell
      id="enzim-kinetigi"
      title="Enzim kinetiği"
      subject="Biyoloji"
      summary="Substrat artınca hız neden bir yerden sonra artmıyor?"
      help={{
        intro:
          "Enzimler substratı ürüne çevirir. Substrat azken hız substratla artar; belli bir noktadan sonra tüm enzimler doludur ve hız Vmax'a takılır. Km, hızın Vmax'ın yarısına ulaştığı substrat derişimidir.",
        steps: [
          "Substratı artır — eğri önce hızlı yükselir, sonra düzleşir.",
          "Yarışmalı inhibitör ekle: Km büyür, ama yeterince substratla Vmax'a yine ulaşılır.",
          "Yarışmasız inhibitörde Vmax düşer; ne kadar substrat eklersen ekle eski hıza çıkamazsın.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Şu anki koşul" },
          { color: "#8a8a8a", label: "İnhibitörsüz" },
        ],
      }}
      controls={
        <>
          <SimSlider label="Vmax" value={vmax} onChange={setVmax} min={20} max={200} step={10} unit=" µM/dk" />
          <SimSlider label="Km" value={km} onChange={setKm} min={0.5} max={30} step={0.5} unit=" mM" format={(v) => v.toFixed(1)} />
          <SimSlider label="Substrat [S]" value={substrate} onChange={setSubstrate} min={0.5} max={80} step={0.5} unit=" mM" format={(v) => v.toFixed(1)} />
          <SimChips
            label="İnhibitör"
            value={inhibitor}
            options={[
              { id: "yok" as Inhibitor, label: "Yok" },
              { id: "yarismali" as Inhibitor, label: "Yarışmalı" },
              { id: "yarismasiz" as Inhibitor, label: "Yarışmasız" },
            ]}
            onChange={setInhibitor}
          />
          {inhibitor !== "yok" ? (
            <SimSlider label="İnhibitör miktarı" value={inhAmount} onChange={setInhAmount} min={0.2} max={5} step={0.2} format={(v) => `${v.toFixed(1)}×`} />
          ) : null}
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Tepkime hızı"
            tone="highlight"
            rows={[
              { label: "v", value: `${v.toFixed(1)} µM/dk` },
              { label: "Doygunluk", value: `%${saturation.toFixed(1)}` },
            ]}
          />
          <SimReadout
            label="Etkin sabitler"
            tone="accent"
            rows={[
              { label: "Vmax", value: `${effVmax.toFixed(0)} µM/dk` },
              { label: "Km", value: `${effKm.toFixed(1)} mM` },
            ]}
          />
          <SimReadout
            label="İnhibitörün etkisi"
            rows={[
              {
                label: "Değişen",
                value:
                  inhibitor === "yok"
                    ? "—"
                    : inhibitor === "yarismali"
                      ? "Km büyüdü"
                      : "Vmax düştü",
              },
              {
                label: "Aşılabilir mi",
                value: inhibitor === "yarismali" ? "evet, substratla" : inhibitor === "yarismasiz" ? "hayır" : "—",
              },
            ]}
          />
          <SimReadout
            label="Yarı doygunluk"
            rows={[
              { label: "[S] = Km", value: `${effKm.toFixed(1)} mM` },
              { label: "Oradaki hız", value: `${(effVmax / 2).toFixed(1)} µM/dk` },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`[S] = ${substrate.toFixed(1)} mM iken tepkime hızı kaç olur?`}
        hint={`Vmax = ${effVmax.toFixed(0)}, Km = ${effKm.toFixed(1)}. v = Vmax·[S]/(Km+[S]).`}
        actual={v}
        unit=" µM/dk"
        format={(x) => x.toFixed(1)}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`Hız ${v.toFixed(1)}, doygunluk %${saturation.toFixed(0)}`}>
        <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />
        <line x1={PAD} x2={PAD} y1={PAD - 10} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />

        {/* Vmax ve yarı Vmax çizgileri — Km'nin tanımı grafikte okunsun. */}
        <line x1={PAD} x2={W - PAD} y1={py(effVmax)} y2={py(effVmax)} stroke="#f4ae0b" strokeWidth="1" strokeDasharray="6 4" opacity="0.55" />
        <line x1={PAD} x2={px(effKm)} y1={py(effVmax / 2)} y2={py(effVmax / 2)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <line x1={px(effKm)} x2={px(effKm)} y1={py(effVmax / 2)} y2={py(0)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

        {inhibitor !== "yok" ? (
          <path d={line("base")} fill="none" stroke="#8a8a8a" strokeWidth="1.5" strokeDasharray="4 4" />
        ) : null}
        <path d={line("v")} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

        <circle cx={px(substrate)} cy={py(v)} r="5" fill="#f4ae0b" />

        <text x={W - PAD} y={py(effVmax) - 6} textAnchor="end" className="sim-axis" fill="#f4ae0b">Vmax</text>
        <text x={px(effKm) + 5} y={py(0) - 6} className="sim-axis" fill="#7aa2f7">Km</text>
        <text x={W - PAD} y={H - 12} textAnchor="end" className="sim-axis">[S] mM</text>
      </svg>
    </SimShell>
  );
}
