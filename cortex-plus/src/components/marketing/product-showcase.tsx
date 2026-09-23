import { Camera, LineChart, CalendarRange } from "lucide-react";

/**
 * Ürün vitrini — büyük, okunaklı, sinematik sahneler.
 * Küçük/karışık webp yerine yüksek kontrastlı ürün kartları.
 */

const SCENES = [
  {
    id: "solve",
    icon: Camera,
    eyebrow: "1 · Soru çöz",
    title: "Fotoğraftan adım adım çözüm",
    body: "Şıkları eleyen gerçek çeldiriciler; yanlışta neden, doğruda pekiştirme.",
    panel: {
      label: "Geometri",
      lines: [
        "Üçgende |AB|=16, |BC|=12 iken |AC|?",
        "16² + 12² = 400 → √400 = 20",
        "Anlama skoru yükseliyor",
      ],
    },
  },
  {
    id: "analyze",
    icon: LineChart,
    eyebrow: "2 · Deneme analizi",
    title: "Zayıf konuyu net olarak gör",
    body: "Deneme sonrası konu bazlı kayıp listesi; sıradaki çalışma buna göre kurulur.",
    panel: {
      label: "Son deneme",
      lines: ["Net 28.4", "Doğruluk %35", "Öncelik: olasılık + geometri"],
    },
  },
  {
    id: "plan",
    icon: CalendarRange,
    eyebrow: "3 · Kişisel plan",
    title: "Bugünün yolu hazır",
    body: "Sınav tarihine göre günlük bloklar; AI koç hangi derse kaç dakika diyecek.",
    panel: {
      label: "Bugün",
      lines: [
        "09:00 Matematik · türev",
        "11:00 Geometri · üçgen",
        "14:00 Fizik · dinamik test",
      ],
    },
  },
] as const;

export function ProductShowcase() {
  return (
    <section
      className="mk-showcase-premium mx-auto max-w-6xl px-4 py-20"
      data-cinematic-reveal
      aria-labelledby="showcase-heading"
    >
      <p className="mk-eyebrow">Canlı arayüz</p>
      <h2 id="showcase-heading" className="mk-section-title">
        Kayıt olmadan önce ürünü gör
      </h2>
      <p className="mk-muted mt-3 max-w-2xl text-base">
        Üç kritik akış — bulanık ekran görüntüsü değil, okunaklı ürün sahneleri.
      </p>

      <div className="mk-showcase-grid">
        {SCENES.map((scene) => {
          const Icon = scene.icon;
          return (
            <article key={scene.id} className="mk-showcase-card">
              <div className="mk-showcase-card-copy">
                <p className="mk-eyebrow inline-flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {scene.eyebrow}
                </p>
                <h3>{scene.title}</h3>
                <p>{scene.body}</p>
              </div>
              <div className="mk-showcase-panel" aria-hidden>
                <div className="mk-showcase-panel-chrome">
                  <span />
                  <span />
                  <span />
                  <em>{scene.panel.label}</em>
                </div>
                <ol>
                  {scene.panel.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
