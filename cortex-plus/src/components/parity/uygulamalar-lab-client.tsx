"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  LAB_APPS,
  LAB_FILTERS,
  labCategoryCounts,
  type LabApp,
} from "@/lib/parity/lab-apps";

export function UygulamalarLabGrid() {
  const [filter, setFilter] = useState<(typeof LAB_FILTERS)[number]>("Tümü");
  const counts = labCategoryCounts();

  const filtered = useMemo(() => {
    if (filter === "Tümü") return LAB_APPS;
    return LAB_APPS.filter((a) => a.subject === filter);
  }, [filter]);

  const byCategory = (cat: LabApp["category"]) =>
    filtered.filter((a) => a.category === cat);

  return (
    <>
      <div className="ap-lab-hero">
        <h1>Öğrenme uygulamaları</h1>
        <p>
          Öğrenmek için alışılmışın dışında görsel keşifler ve etkileşimli
          araçlardan oluşan bir koleksiyon.
        </p>
        <div className="ap-lab-cats">
          <div className="ap-lab-cat">
            <strong>Hızlı oyunlar</strong>
            <span>{counts.mini} oyun</span>
          </div>
          <div className="ap-lab-cat">
            <strong>Simülasyonlar</strong>
            <span>{counts.sim} simülasyon</span>
          </div>
          <div className="ap-lab-cat">
            <strong>Araçlar</strong>
            <span>{counts.tool} araç</span>
          </div>
          <div className="ap-lab-cat">
            <strong>Uygulamalarım</strong>
            <span>0 uygulama</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LAB_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              f === filter
                ? "shrink-0 rounded-full bg-[var(--astra-primary)] px-3 py-1.5 text-xs font-medium text-white"
                : "shrink-0 rounded-full border border-[var(--astra-border)] px-3 py-1.5 text-xs text-[var(--astra-muted)]"
            }
          >
            {f}
          </button>
        ))}
      </div>

      <CategorySection title="Mini oyunlar" apps={byCategory("mini")} />
      <CategorySection title="Simülasyonlar" apps={byCategory("sim")} />
      <CategorySection title="Araçlar" apps={byCategory("tool")} />

      <p className="mt-4 text-xs text-[var(--astra-muted)]">
        Katalog: {counts.mini + counts.sim + counts.tool} uygulama · filtre:{" "}
        {filtered.length}
      </p>

      <Link
        href="/quizler"
        className="astra-btn-primary mt-6 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
      >
        + Uygulama oluştur
      </Link>
    </>
  );
}

function CategorySection({
  title,
  apps,
}: {
  title: string;
  apps: LabApp[];
}) {
  if (!apps.length) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-[var(--astra-muted)]">
        {title}{" "}
        <span className="text-[var(--astra-text)]">({apps.length})</span>
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {apps.map((app) => (
          <Link
            key={app.id}
            href={app.href}
            className="astra-pay-card flex min-h-[88px] flex-col justify-between p-4 transition-colors hover:border-[var(--astra-primary)]"
          >
            <span className="text-sm font-medium leading-snug">{app.title}</span>
            <span className="mt-2 text-[10px] uppercase tracking-wide text-[var(--astra-muted)]">
              {app.subject}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
