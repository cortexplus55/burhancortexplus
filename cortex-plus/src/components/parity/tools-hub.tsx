"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  FileText,
  CircleDot,
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
import { TOOLS, type Tool } from "@/lib/parity/tools";
import { StudioGallery } from "@/components/parity/studio-gallery";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";

/**
 * Çalışma Stüdyosu sekmesi (eski adı Araçlar; 8 Kasım 2026). Sayfanın ana bölümü sekiz stüdyo (StudioGallery):
 * her biri kendi rengiyle büyük kart ve doğrudan stüdyosunu açar. Altında bu sayfada açılan interaktif
 * laboratuvarlar ve hesap araçları, en altta başka bölüme götüren kısayollar (dışa açılan okla).
 * Önceki sekmeli ve aramalı düzen kalktı: on sekiz araçtan ders filtresiyle arama, öğrencinin asıl işi olan
 * stüdyoları üçüncü sekmenin arkasına saklıyordu.
 */

const ICONS: Record<string, LucideIcon> = {
  denklem: Superscript,
  integral: Sigma,
  periyodik: FlaskConical,
  birim: Ruler,
  "birim-cember": CircleDot,
  parabol: LineChart,
  hucre: FlaskConical,
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

export function ToolsHub({ deck }: { deck?: { dueCount: number; total: number } }) {
  const shellAccount = useStudentShellAccount();
  const freeAccount = shellAccount ? shellAccount.showsUpgradeChrome : false;
  // Stüdyolar kendi galerisinde (studios.ts); burada yalnız laboratuvar, hesap aracı ve kısayol.
  const labs = TOOLS.filter((t) => t.category === "simulasyon");
  const calculators = TOOLS.filter((t) => t.category === "odak" && t.kind === "hesap");
  const shortcuts = TOOLS.filter((t) => t.category === "odak" && t.kind === "kisayol");

  return (
    <div className="tools">
      <header className="tools-hero">
        <p className="tools-kicker">
          <span aria-hidden className="tools-kicker-dot" />
          Çalışma Stüdyosu
        </p>
        <h1>Bugün nasıl çalışmak istersin?</h1>
        <p>Bir stüdyo seç; konunu yaz ya da belgeni seç, saniyeler içinde hazır.</p>
      </header>

      {deck && deck.total > 0 ? (
        // Genel tekrar destesi (8 Kasım 2026): sohbetten eklenen bilgiler günü gelince burada.
        <Link href="/tekrar" className={cn("tools-deck", deck.dueCount > 0 && "is-due")}>
          <Icon3D name="tekrar" size={52} />
          <span className="tools-deck-text">
            <strong>Tekrar destem</strong>
            <span>
              {deck.dueCount > 0
                ? `Bugün ${deck.dueCount} kart seni bekliyor`
                : `Destende ${deck.total} kart; bugün tekrar yok`}
            </span>
          </span>
          <span className="tools-deck-go">{deck.dueCount > 0 ? "Başla" : "Aç"}</span>
        </Link>
      ) : null}

      <StudioGallery freeAccount={freeAccount} />

      <section className="tools-section">
        <h2>
          İnteraktif laboratuvarlar
          <span>{labs.length}</span>
        </h2>
        <div className="tools-grid">
          {labs.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h2>
          Hesap araçları
          <span>{calculators.length}</span>
        </h2>
        <div className="tools-grid">
          {calculators.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      {/* 8 Kasım 2026 (kurucu turu): kısayollar menüdeki sayfaları tekrar ediyordu, dört büyük kart ekranın yarısını
          alıyordu. Tek satırlık haplar; hepsi yine bir dokunuşta. */}
      <section className="tools-section tools-section--shortcuts" aria-label="Kısayollar">
        <h2>Kısayollar</h2>
        <div className="tools-shortcuts">
          {shortcuts.map((t) => {
            const Icon = ICONS[t.id] ?? Layers;
            return (
              <Link key={t.id} href={t.href} className="tools-shortcut">
                <Icon className="h-4 w-4" aria-hidden />
                {t.title}
              </Link>
            );
          })}
        </div>
      </section>
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

function ToolCard({ tool }: { tool: Tool }) {
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
        <span className={cn("tool-kind", isShortcut ? "is-shortcut" : "is-hesap")}>
          {/* Laboratuvar "Hesap" yazıyordu (8 Kasım 2026). */}
          {isShortcut ? "Kısayol" : tool.category === "simulasyon" ? "Laboratuvar" : "Hesap"}
        </span>
        <span className="tool-subject">{tool.subject}</span>
      </span>
    </Link>
  );
}
