"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  TEACHER_AI_TOOLS,
  TEACHER_TOOL_CATEGORIES,
  type TeacherToolCategory,
} from "@/lib/teacher/ai-tools-catalog";
import { cn } from "@/lib/utils";
import "@/styles/cortex-premium.css";

export function TeacherAiHub({
  greetingName,
  classCount,
  studentCount,
}: {
  greetingName: string;
  classCount: number;
  studentCount: number;
}) {
  const [category, setCategory] = useState<TeacherToolCategory>("all");
  const router = useRouter();

  function openTool(prompt: string) {
    try {
      sessionStorage.setItem("cortex-entry-prompt", prompt);
    } catch {
      /* ignore */
    }
    router.push("/ogretmen");
  }

  const tools = useMemo(() => {
    if (category === "all") return TEACHER_AI_TOOLS;
    return TEACHER_AI_TOOLS.filter((t) => t.category === category);
  }, [category]);

  return (
    <div className="cortex-premium space-y-6 pb-4">
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cx-gold)]">
          Öğretmenler için Cortex Plus
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--cx-text)] md:text-3xl">
          {greetingName}, bugün sana nasıl yardımcı olabilirim?
        </h1>
        <p className="text-sm text-[var(--cx-muted)]">
          Ders planla, değerlendirme hazırla, veliye yaz veya sınıf için hızlıca
          interaktif etkinlik oluştur.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/ogretmen-paneli/siniflar"
          className="cortex-premium-tool-card block"
        >
          <p className="text-xs text-[var(--cx-muted)]">Sınıf</p>
          <p className="mt-1 text-2xl font-semibold">{classCount}</p>
        </Link>
        <Link
          href="/ogretmen-paneli/ogrenciler"
          className="cortex-premium-tool-card block"
        >
          <p className="text-xs text-[var(--cx-muted)]">Öğrenci</p>
          <p className="mt-1 text-2xl font-semibold">{studentCount}</p>
        </Link>
      </div>

      <Link
        href="/ogretmen-paneli/plus"
        className="block rounded-2xl border border-[var(--cx-border-gold)] bg-gradient-to-r from-[rgba(232,168,56,0.12)] to-transparent p-4"
      >
        <p className="text-sm font-semibold text-[var(--cx-gold-hover)]">
          Öğretmenlere Plus avantajları
        </p>
        <p className="mt-1 text-xs text-[var(--cx-muted)]">
          Sınırsız sınıf, gelişmiş raporlar ve yüksek günlük AI limiti.
        </p>
      </Link>

      <div className="flex flex-wrap gap-2">
        {TEACHER_TOOL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="cortex-premium-chip"
            data-active={category === cat.id}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => openTool(tool.prompt)}
            className={cn("cortex-premium-tool-card w-full text-left")}
          >
            <p className="text-sm font-semibold text-[var(--cx-text)]">
              {tool.title}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--cx-muted)]">
              {tool.description}
            </p>
          </button>
        ))}
      </div>

      <section className="space-y-3 border-t border-[var(--cx-border)] pt-6">
        <h2 className="text-sm font-semibold text-[var(--cx-muted)]">
          Hızlı geçiş
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link href="/ogretmen" className="cortex-premium-tool-card text-sm font-medium">
            Sor — genel asistan
          </Link>
          <Link
            href="/deneme-sinavlari"
            className="cortex-premium-tool-card text-sm font-medium"
          >
            Sınav hazırlığı
          </Link>
          <Link href="/uygulamalar" className="cortex-premium-tool-card text-sm font-medium">
            Öğrenme uygulamaları
          </Link>
        </div>
      </section>
    </div>
  );
}
