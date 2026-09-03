"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Beaker,
  Gamepad2,
  LayoutGrid,
  Layers,
  Eye,
  Star,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LAB_APPS,
  LAB_FEATURED_IDS,
  LAB_FILTERS,
  labCategoryCounts,
  type LabApp,
} from "@/lib/parity/lab-apps";
import {
  displayRating,
  formatPlays,
  topPlayed,
  type LabStat,
  type LabStatMap,
} from "@/lib/parity/lab-stats";

type CatId = "mini" | "sim" | "tool" | "mine";

const CATEGORIES: {
  id: CatId;
  title: string;
  countKey: "mini" | "sim" | "tool" | "mine";
  unit: string;
  icon: LucideIcon;
}[] = [
  { id: "mini", title: "Mini oyunlar", countKey: "mini", unit: "oyun", icon: Gamepad2 },
  { id: "sim", title: "Simülasyonlar", countKey: "sim", unit: "simülasyon", icon: Beaker },
  { id: "tool", title: "Araçlar", countKey: "tool", unit: "araç", icon: Layers },
  { id: "mine", title: "Uygulamalarım", countKey: "mine", unit: "uygulama", icon: LayoutGrid },
];

const TONES = ["violet", "blue", "amber", "emerald", "rose"] as const;

export function UygulamalarLabGrid({ stats = {} }: { stats?: LabStatMap }) {
  const [subject, setSubject] = useState<(typeof LAB_FILTERS)[number]>("Tümü");
  const [category, setCategory] = useState<CatId | null>(null);
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const counts = { ...labCategoryCounts(), mine: 0 };

  const filtered = useMemo(() => {
    return LAB_APPS.filter((app) => {
      if (subject !== "Tümü" && app.subject !== subject) return false;
      if (category && category !== "mine" && app.category !== category) return false;
      return true;
    });
  }, [subject, category]);

  const featuredPool = useMemo(() => {
    const pool = LAB_FEATURED_IDS.map((id) => LAB_APPS.find((a) => a.id === id)).filter(
      Boolean,
    ) as LabApp[];
    const visible = pool.filter((app) => filtered.some((f) => f.id === app.id));
    return visible.length ? visible : pool;
  }, [filtered]);

  const featured = featuredPool[featuredIdx % featuredPool.length] ?? featuredPool[0];
  // Gerçek oynanmadan türetilir; hiç açılmamış uygulama listeye girmez, yani
  // veri birikene kadar bölüm hiç görünmez.
  const mostPlayed = useMemo(() => topPlayed(LAB_APPS, stats), [stats]);

  return (
    <div className="ap-lab-page">
      <header className="ap-lab-hero">
        <h1>Öğrenme uygulamaları</h1>
        <p>
          Öğrenmek için eğlenceli oyunlar, görsel keşifler ve etkileşimli
          araçlardan oluşan büyüleyici bir koleksiyon.
        </p>
      </header>

      <div className="ap-lab-cats">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const selected = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={cn("ap-lab-cat", selected && "ap-lab-cat--on")}
              onClick={() => setCategory((prev) => (prev === cat.id ? null : cat.id))}
            >
              <Icon className="h-7 w-7" aria-hidden />
              <strong>{cat.title}</strong>
              <span>
                {counts[cat.countKey]} {cat.unit}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ap-lab-toolbar">
        <div className="ap-lab-filters">
          {LAB_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSubject(f)}
              className={cn("ap-lab-chip", f === subject && "ap-lab-chip--on")}
            >
              {f}
            </button>
          ))}
        </div>
        <Link href="/quizler" className="ap-lab-create">
          + Uygulama oluştur
        </Link>
      </div>

      {category === "mine" ? (
        <div className="ap-lab-empty">
          <LayoutGrid className="h-8 w-8 opacity-50" aria-hidden />
          <p>Henüz kendi uygulaman yok.</p>
          <Link href="/quizler" className="ap-lab-create">
            + Uygulama oluştur
          </Link>
        </div>
      ) : (
        <>
          {featured ? (
            <FeaturedCard
              app={featured}
              index={featuredIdx % featuredPool.length}
              total={featuredPool.length}
              onDot={setFeaturedIdx}
            />
          ) : null}

          <div className="ap-lab-grid">
            {filtered.map((app, i) => (
              <Link
                key={app.id}
                href={app.href}
                className={cn("ap-lab-tile", `ap-lab-tile--${TONES[i % TONES.length]}`)}
                onClick={() => recordPlay(app.id)}
              >
                <span className="ap-lab-tile-kicker">{app.subject}</span>
                <span className="ap-lab-tile-title">{app.title}</span>
                {app.blurb ? <span className="ap-lab-tile-blurb">{app.blurb}</span> : null}
                <LabMetrics stat={stats[app.id]} />
              </Link>
            ))}
          </div>

          {mostPlayed.length ? (
            <section className="ap-lab-top">
              <h2 className="ap-cal-section-title">En çok oynananlar</h2>
              <ol className="ap-lab-top-list">
                {mostPlayed.map((row, index) => {
                  const app = LAB_APPS.find((a) => a.id === row.id);
                  if (!app) return null;
                  return (
                    <li key={row.id}>
                      <Link href={app.href} onClick={() => recordPlay(app.id)}>
                        <span className="ap-lab-top-rank">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="ap-lab-top-title">{app.title}</span>
                          <span className="ap-lab-top-meta">{app.subject}</span>
                        </span>
                        <span className="ap-lab-top-plays">
                          {formatPlays(row.plays)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function FeaturedCard({
  app,
  index,
  total,
  onDot,
}: {
  app: LabApp;
  index: number;
  total: number;
  onDot: (i: number) => void;
}) {
  return (
    <article className="ap-lab-featured">
      <div className="ap-lab-featured-copy">
        <div className="ap-lab-badges">
          <span>{app.subject.toUpperCase()}</span>
          <span className="ap-lab-badge-new">YENİ</span>
        </div>
        <h2>{app.title}</h2>
        <p>
          {app.blurb ??
            "Keşfedilebilir bir öğrenme aracı — aç ve dene."}
        </p>
        <Link href={app.href} className="ap-lab-open">
          Uygulamayı aç →
        </Link>
      </div>
      <div className="ap-lab-featured-art" aria-hidden>
        <span className="ap-lab-orb ap-lab-orb--a" />
        <span className="ap-lab-orb ap-lab-orb--b" />
        <span className="ap-lab-line" />
        <span className="ap-lab-frame" />
      </div>
      <div className="ap-lab-dots" role="tablist" aria-label="Öne çıkanlar">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={cn("ap-lab-dot", i === index && "ap-lab-dot--on")}
            onClick={() => onDot(i)}
          />
        ))}
      </div>
    </article>
  );
}

/**
 * Kart üzerindeki metrikler. Sıfır oynanma ve az oylu puan hiç gösterilmez —
 * uydurma sosyal kanıt yerine boşluk bırakmayı tercih ediyoruz.
 */
function LabMetrics({ stat }: { stat?: LabStat }) {
  const rating = displayRating(stat);
  const plays = stat?.plays ?? 0;
  if (!rating && plays === 0) return null;
  return (
    <span className="ap-lab-metrics">
      {rating ? (
        <span className="ap-lab-metric">
          <Star className="h-3 w-3" aria-hidden />
          {rating}
        </span>
      ) : null}
      {plays > 0 ? (
        <span className="ap-lab-metric" title={`${plays} kez açıldı`}>
          <Eye className="h-3 w-3" aria-hidden />
          {formatPlays(plays)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Açılış kaydı. Sayaç ikincil bir şey; başarısız olursa kullanıcı yine de
 * uygulamaya gider, bu yüzden hata yutuluyor ve gezinme beklemiyor.
 *
 * Sayım burada, katalog tıklamasında yapılıyor — detay sayfasında değil.
 * Katalogdaki 30 uygulamanın 9'u /uygulamalar/lab/[id] yerine kısayol
 * rotalarına gidiyor (/quizler, /flashcardlar gibi); detay sayfasında saymak
 * onları kaçırır, iki yerde birden saymak kalan 21'ini çift sayardı.
 * Bunun bedeli: doğrudan bağlantı veya yer imiyle açılışlar sayılmıyor.
 */
function recordPlay(appId: string) {
  void fetch("/api/lab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
    keepalive: true,
  }).catch(() => {});
}
