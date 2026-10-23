"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  FileText,
  FlaskConical,
  Layers,
  LineChart,
  MessageSquare,
  Mic,
  NotebookPen,
  Ruler,
  Sigma,
  Superscript,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { TOOLS, TOOL_SUBJECTS, type Tool } from "@/lib/parity/tools";
import { exceedsFreeDaily } from "@/lib/billing/free-reach";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import type { ActionCode } from "@/lib/env";

/**
 * Ücretsiz günlük haktan büyük kısayollar (19 Ekim 2026): ücretsiz hesapta "Plus" rozeti. Fotoğraftan çözüm 23 Ekim
 * 2026'dan beri ücretsizde günde 3 (krediye dokunmadan); rozeti yok.
 */
const TOOL_ACTION: Partial<Record<string, ActionCode>> = {
  podcast: "PODCAST_GENERATE",
  sozlu: "ORAL_EXAM_GENERATE",
};

/**
 * Araçlar merkezi.
 *
 * Önceki hâli bir uygulama mağazasıydı: puan, oynanma, öne çıkanlar, günün
 * bulmacaları. O vitrin bir oyun kataloğu için doğruydu ama burada
 * yapılacak iş belli — öğrenci bir araca gitmek istiyor. Vitrin kaldırıldı.
 *
 * Kalan tek tasarım kararı şu: hangi kartın burada bir araç AÇACAĞINI,
 * hangisinin başka bir bölüme GÖTÜRECEĞİNİ tıklamadan önce bilmek. İkisi
 * ayrı bölümde ve kısayollarda dışa açılan ok var.
 */

const ICONS: Record<string, LucideIcon> = {
  denklem: Superscript,
  integral: Sigma,
  periyodik: FlaskConical,
  birim: Ruler,
  "soru-coz": Camera,
  flashcard: Layers,
  quiz: BookOpen,
  deneme: FileText,
  dokuman: FileText,
  ilerleme: LineChart,
  sohbetler: MessageSquare,
  yanlislarim: NotebookPen,
  anlat: Mic,
  "dogru-yanlis": BookOpen,
};

export function ToolsHub() {
  const shellAccount = useStudentShellAccount();
  const freeAccount = shellAccount ? !shellAccount.isPremium : false;
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string>("Tümü");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return TOOLS.filter((t) => {
      if (subject !== "Tümü" && t.subject !== subject) return false;
      if (!q) return true;
      return (
        t.title.toLocaleLowerCase("tr-TR").includes(q) ||
        t.blurb.toLocaleLowerCase("tr-TR").includes(q)
      );
    });
  }, [query, subject]);

  const calculators = filtered.filter((t) => t.kind === "hesap");
  const shortcuts = filtered.filter((t) => t.kind === "kisayol");

  return (
    <div className="tools">
      <header className="tools-hero">
        <h1>Araçlar</h1>
        <p>
          Hesaplayıcılar bu sayfada açılır. Kısayollar ise sohbet, deneme ya da belgeler gibi ilgili bölüme gider.
        </p>
      </header>

      <div className="tools-bar">
        <input
          className="tools-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Araç ara"
          aria-label="Araç ara"
        />
        <div className="tools-filters" role="group" aria-label="Ders filtresi">
          {TOOL_SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === subject}
              className={cn("tools-chip", s === subject && "is-on")}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {calculators.length ? (
        <section className="tools-section">
          <h2>
            Hesap araçları
            <span>{calculators.length}</span>
          </h2>
          <div className="tools-grid">
            {calculators.map((t) => (
              <ToolCard key={t.id} tool={t} plus={false} />
            ))}
          </div>
        </section>
      ) : null}

      {shortcuts.length ? (
        <section className="tools-section">
          <h2>
            Çalışma kısayolları
            <span>{shortcuts.length}</span>
          </h2>
          <div className="tools-grid">
            {shortcuts.map((t) => {
              const code = TOOL_ACTION[t.id];
              return <ToolCard key={t.id} tool={t} plus={freeAccount && Boolean(code && exceedsFreeDaily(code))} />;
            })}
          </div>
        </section>
      ) : null}

      {!filtered.length ? (
        <p className="tools-empty">
          “{query}” için araç bulunamadı.
        </p>
      ) : null}
    </div>
  );
}

/** Hesap araçlarının 3B görseli (tasarım 7. adım); kısayollar düz simgede kalır. */
const ICONS_3D: Partial<Record<string, Icon3DName>> = {
  denklem: "denklem",
  integral: "integral",
  periyodik: "periyodik",
  birim: "birim",
};

function ToolCard({ tool, plus }: { tool: Tool; plus: boolean }) {
  const Icon = ICONS[tool.id] ?? Layers;
  const art = ICONS_3D[tool.id];
  const isShortcut = tool.kind === "kisayol";

  return (
    <Link
      href={tool.href}
      className={cn("tool-card", isShortcut && "is-shortcut")}
    >
      <span className={cn("tool-icon", art && "tool-icon--3d")} aria-hidden>
        {art ? <Icon3D name={art} size={44} /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="tool-body">
        <span className="tool-title">
          {tool.title}
          {/* Dışa açılan ok: bu kart seni başka bir bölüme götürüyor. */}
          {isShortcut ? (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          ) : null}
        </span>
        <span className="tool-blurb">{tool.blurb}</span>
      </span>
      <span className="tool-meta">
        {plus ? (
          <span className="tool-kind is-plus">Plus</span>
        ) : (
          <span className={cn("tool-kind", isShortcut ? "is-shortcut" : "is-hesap")}>
            {isShortcut ? "Kısayol" : "Hesap"}
          </span>
        )}
        <span className="tool-subject">{tool.subject}</span>
      </span>
    </Link>
  );
}
