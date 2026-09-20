import { Camera, LineChart, CalendarRange } from "lucide-react";
import Link from "next/link";

const SCENES = [
  {
    id: "solve",
    icon: Camera,
    eyebrow: "Soru çöz",
    title: "Fotoğraftan adım adım",
    body: "Çeldiricilerle gerçek sınav mantığı; yanlışta neden, doğruda pekiştirme.",
    lines: ["Soru yakalandı", "Adımlar açık", "Anlama skoru görünür"],
  },
  {
    id: "analyze",
    icon: LineChart,
    eyebrow: "Analiz",
    title: "Zayıf konuyu net gör",
    body: "Deneme sonrası kayıp listesi — sıradaki çalışma buna göre kurulur.",
    lines: ["Konu bazlı net", "Öncelik sırası", "Koç notu"],
  },
  {
    id: "plan",
    icon: CalendarRange,
    eyebrow: "Plan",
    title: "Tek akışta öğretmen",
    body: "Sınav tarihine göre günlük bloklar; ne çalışacağını bilerek başla.",
    lines: ["Bugünün yolu", "Süre önerisi", "Takip"],
  },
] as const;

export function ProductShowcase() {
  return (
    <section
      className="mk-astra-showcase"
      aria-labelledby="astra-showcase-heading"
      data-cinematic-reveal
    >
      <p className="mk-astra-eyebrow">Ürün</p>
      <h2 id="astra-showcase-heading">Üç net sahne. Tek öğretmen.</h2>
      <p className="mk-astra-showcase-lead">
        Bulanık ekran görüntüsü değil — okunaklı ürün akışı.
      </p>
      <div className="mk-astra-showcase-grid">
        {SCENES.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.id} className="mk-astra-showcase-card">
              <p className="mk-astra-eyebrow">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {s.eyebrow}
              </p>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <ul>
                {s.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      <div className="mk-astra-cta-row mk-astra-cta-row--center">
        <Link href="/kayit" className="mk-astra-btn-primary">
          Ücretsiz dene
        </Link>
        <Link href="/ornek" className="mk-astra-btn-secondary">
          Ürünü gör
        </Link>
      </div>
    </section>
  );
}
