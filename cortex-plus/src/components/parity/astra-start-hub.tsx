"use client";

import Link from "next/link";
import {
  Camera,
  Check,
  FileQuestion,
  Headphones,
  Layers,
  Mic,
  Target,
  Timer,
  Users,
  X,
} from "lucide-react";

const LESSON_TOOLS = [
  { href: "/quizler", label: "Quiz", icon: FileQuestion },
  { href: "/ogretmen?mod=sozlu", label: "Sözlü deneme", icon: Mic },
  { href: "/quizler", label: "Doğru / Yanlış", icon: Check },
  { href: "/ogretmen?mod=podcast", label: "Podcast", icon: Headphones },
  { href: "/flashcardlar", label: "Flash kartlar", icon: Layers },
  { href: "/deneme-sinavlari", label: "Yazılı deneme", icon: Timer },
] as const;

export function AstraStartHub({
  open,
  onClose,
  onScanProblem,
  examDaysLabel = "Sınav hazırlığına başla",
}: {
  open: boolean;
  onClose: () => void;
  onScanProblem: () => void;
  examDaysLabel?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="ap-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Başla"
      onClick={onClose}
    >
      <div className="ap-hub-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-hub-head">
          <h2 className="ap-hub-title">Bugün ne çalışıyoruz?</h2>
          <button
            type="button"
            className="ap-hub-close"
            aria-label="Kapat"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button type="button" className="ap-hub-scan" onClick={onScanProblem}>
          <span className="ap-hub-scan-icon" aria-hidden>
            <Camera className="h-6 w-6" />
          </span>
          <span className="ap-hub-scan-copy">
            <strong>Problemi tara</strong>
            <span>Fotoğraf çek ve adım adım yardım al</span>
          </span>
        </button>

        <p className="ap-hub-section">Ders oluştur</p>
        <div className="ap-hub-tools">
          {LESSON_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.label}
                href={tool.href}
                className="ap-hub-tool"
                onClick={onClose}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {tool.label}
              </Link>
            );
          })}
        </div>

        <div className="ap-hub-foot">
          <Link
            href="/deneme-sinavlari"
            className="ap-hub-foot-card"
            onClick={onClose}
          >
            <Target className="h-5 w-5" aria-hidden />
            <span>
              <strong>Sınav hazırlığı</strong>
              <em>{examDaysLabel}</em>
            </span>
          </Link>
          <Link href="/siniflar" className="ap-hub-foot-card" onClick={onClose}>
            <Users className="h-5 w-5" aria-hidden />
            <span>
              <strong>Sınıf arkadaşlarınla bağlantı kur</strong>
              <em>Bir sınıf oluştur veya katıl</em>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
