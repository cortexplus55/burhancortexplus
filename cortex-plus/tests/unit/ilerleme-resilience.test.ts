/**
 * /ilerleme yayında "Bir şeyler ters gitti" diyordu (Ekim 2026). Kök neden:
 * sunucu sayfası `"use client"` dosyasındaki `streakFreezeTitle()`'ı çağırıyordu —
 * istemci modülünün fonksiyonu sunucuda çağrılamaz, sayfa düşer. Ayrıca tek bir
 * kaynağın hatası `Promise.all` ile bütün sayfayı düşürüyordu.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  favoriteSubjects,
  lastSevenDays,
  normalizeLearningRows,
  type LearningTimeRow,
} from "@/lib/learning/learning-time";
import { safePct, safePositive } from "@/lib/learning/chart-safe";
import { streakFreezeTitle } from "@/lib/learning/streak-freeze-copy";
import { PrepRadarChart } from "@/components/parity/prep-radar-chart";
import { PrepForecastChart } from "@/components/parity/prep-forecast-chart";
import type { PrepRadarView, ReadinessForecastSeries } from "@/lib/learning/prep-radar";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("/ilerleme: kök neden — sunucudan istemci fonksiyonu", () => {
  it("streakFreezeTitle istemci dosyasından değil, düz modülden gelir", () => {
    const page = read("src/app/ilerleme/page.tsx");
    expect(page).toContain('import { streakFreezeTitle } from "@/lib/learning/streak-freeze-copy"');
    expect(page).not.toMatch(/streakFreezeTitle[^\n]*from "@\/components\/parity\/streak-freeze-badge"/);
    const copy = read("src/lib/learning/streak-freeze-copy.ts");
    expect(copy).not.toMatch(/^\s*["']use client["']/);
  });

  it("streakFreezeTitle her durumda metin döndürür", () => {
    expect(streakFreezeTitle({ remaining: 0, protected: true, used: false })).toContain("korudu");
    expect(streakFreezeTitle({ remaining: 1, protected: false, used: false })).toContain("1 hakkın");
    expect(streakFreezeTitle({ remaining: Number.NaN, protected: false, used: false })).toContain("bitti");
  });

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/^(page|layout)\.tsx$/.test(name)) out.push(full);
    }
    return out;
  }

  function resolveModule(spec: string): string | null {
    if (!spec.startsWith("@/")) return null;
    const base = path.join(ROOT, "src", spec.slice(2));
    for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  it("hiçbir sunucu sayfası/yerleşimi istemci modülünün fonksiyonunu çağırmaz", () => {
    const offenders: string[] = [];
    const importRe = /import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/g;
    for (const file of walk(path.join(ROOT, "src/app"))) {
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(source)) continue;
      for (const match of source.matchAll(importRe)) {
        const target = resolveModule(match[2]);
        if (!target) continue;
        const targetSource = readFileSync(target, "utf8");
        if (!/^\s*["']use client["']/.test(targetSource)) continue;
        const names = match[1]
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith("type "))
          .map((part) => part.split(/\s+as\s+/).pop()!.trim());
        for (const name of names) {
          // Bileşenler (büyük harf) JSX olarak kullanılabilir; küçük harfli çağrı sunucuda düşer.
          if (!/^[a-z]/.test(name)) continue;
          if (new RegExp(`\\b${name}\\s*\\(`).test(source)) {
            offenders.push(`${path.relative(ROOT, file)} → ${name}() from ${match[2]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("/ilerleme: her kaynak ayrı", () => {
  const page = read("src/app/ilerleme/page.tsx");

  it("kaynaklar settle ile sarılı; çıplak Promise.all sorgusu yok", () => {
    for (const label of [
      "shell",
      "conversations",
      "quizzes",
      "flashcards",
      "attempts",
      "weak_topics",
      "mistakes",
      "activity",
      "learning_time",
      "prep_insights",
    ]) {
      expect(page).toMatch(new RegExp(`settle(<[^>]*>+)?\\(\\s*"${label}"`));
    }
    expect(page).not.toMatch(/const shell = await loadParityShellProps/);
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("normalizeLearningRows(learningTime.data)");
  });

  it("hazırlık özeti yükleyicisi fırlatmaz, null döner", () => {
    const loader = read("src/lib/learning/prep-insights-load.ts");
    expect(loader).toMatch(/try \{\s*return await loadInsights/);
  });
});

describe("öğrenme süresi: bozuk satır sayfayı düşürmez", () => {
  it("normalizeLearningRows null ders adını, metin saniyeyi, bozuk tarihi temizler", () => {
    const rows = normalizeLearningRows([
      { activity_date: "2026-10-20", subject: null, seconds: "120" },
      { activity_date: "2026-10-21", subject: "Fizik", seconds: 300 },
      { activity_date: "bozuk", subject: "Tarih", seconds: 60 },
      { activity_date: "2026-10-22T08:00:00Z", subject: "Hukuk", seconds: Number.NaN },
      null,
      "x",
    ]);
    expect(rows).toEqual([
      { activity_date: "2026-10-20", subject: "", seconds: 120 },
      { activity_date: "2026-10-21", subject: "Fizik", seconds: 300 },
      { activity_date: "2026-10-22", subject: "Hukuk", seconds: 0 },
    ]);
    expect(normalizeLearningRows(null)).toEqual([]);
  });

  it("favoriteSubjects string olmayan ders adında düşmez", () => {
    const rows = [
      { activity_date: "2026-10-20", subject: null, seconds: 600 },
      { activity_date: "2026-10-20", subject: "Kimya", seconds: 600 },
    ] as unknown as LearningTimeRow[];
    expect(favoriteSubjects(rows)).toEqual(["Kimya"]);
  });

  it("lastSevenDays bozuk bugün tarihinde düşmez", () => {
    expect(lastSevenDays([], "bozuk")).toHaveLength(7);
  });
});

describe("grafikler: sayı olmayan değer çizimi bozmaz", () => {
  it("safePct / safePositive", () => {
    expect(safePct(Number.NaN)).toBe(0);
    expect(safePct("72.4")).toBe(72);
    expect(safePct(140)).toBe(100);
    expect(safePct(-5)).toBe(0);
    expect(safePositive(undefined, 14)).toBe(14);
    expect(safePositive(7, 14)).toBe(7);
  });

  it("radar NaN eksende NaN yazmaz", () => {
    const view = {
      readinessPct: Number.NaN,
      targetScore: undefined,
      label: "Hazırlık",
      axes: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id, pct: Number.NaN })),
    } as unknown as PrepRadarView;
    const html = renderToStaticMarkup(createElement(PrepRadarChart, { view }));
    expect(html).not.toContain("NaN");
    expect(html).toContain("%0");
  });

  it("tahmin noktası eksik ya da bozuk olsa da çizilir", () => {
    const series = {
      horizonDays: Number.NaN,
      currentPct: Number.NaN,
      targetPct: 70,
      hitsTargetOn: null,
      points: [{ day: 0, pct: Number.NaN }, { day: "x", pct: 50 }, null],
    } as unknown as ReadinessForecastSeries;
    const html = renderToStaticMarkup(createElement(PrepForecastChart, { series }));
    expect(html).not.toContain("NaN");
    const empty = renderToStaticMarkup(
      createElement(PrepForecastChart, { series: { ...series, points: undefined } as unknown as ReadinessForecastSeries }),
    );
    expect(empty).toContain("Hedef (%70)");
  });
});

describe("/fiyatlar 404 vermez", () => {
  it("next.config /fiyatlar → /fiyatlandirma kalıcı yönlendirme", () => {
    const config = read("next.config.ts");
    expect(config).toContain('{ source: "/fiyatlar", destination: "/fiyatlandirma", permanent: true }');
    expect(existsSync(path.join(ROOT, "src/app/fiyatlandirma/page.tsx"))).toBe(true);
  });
});
