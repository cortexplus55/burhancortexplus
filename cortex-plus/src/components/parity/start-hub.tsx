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
  { id: "quiz", href: "/studio/quiz", label: "Quiz", hint: "Çoktan seçmeli", icon: FileQuestion },
  { id: "sozlu", href: "/studio/sozlu", label: "Sözlü deneme", hint: "Sesli pratik", icon: Mic },
  { id: "tf", href: "/studio/dogru-yanlis", label: "Doğru / Yanlış", hint: "Hızlı tur", icon: Check },
  { id: "podcast", href: "/studio/podcast", label: "Podcast", hint: "Dinleyerek öğren", icon: Headphones },
  { id: "flash", href: "/studio/flashcard", label: "Flash kartlar", hint: "Kart çalışması", icon: Layers },
  { id: "yazili", href: "/studio/yazili", label: "Yazılı deneme", hint: "Sınav kağıdı", icon: Timer },
] as const;

export function StartHub({
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
      className="cp-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Başla"
      onClick={onClose}
    >
      <div className="cp-hub-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-hub-head">
          <h2 className="cp-hub-title">Bugün ne çalışıyoruz?</h2>
          <button
            type="button"
            className="cp-hub-close"
            aria-label="Kapat"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button type="button" className="cp-hub-scan" onClick={onScanProblem}>
          <span className="cp-hub-scan-scene" aria-hidden />
          <span className="cp-hub-scan-icon" aria-hidden>
            <Camera className="h-6 w-6" />
          </span>
          <span className="cp-hub-scan-copy">
            <strong>Problemi tara</strong>
            <span>Fotoğraf çek ve adım adım yardım al</span>
          </span>
        </button>

        <p className="cp-hub-section">Ders oluştur</p>
        <div className="cp-hub-tools">
          {LESSON_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={`cp-hub-tool cp-hub-tool--${tool.id}`}
              >
                <span className="cp-hub-tool-scene" aria-hidden />
                <span className="cp-hub-tool-glow" aria-hidden />
                <span className="cp-hub-tool-icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="cp-hub-tool-copy">
                  <span className="cp-hub-tool-label">{tool.label}</span>
                  <span className="cp-hub-tool-hint">{tool.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="cp-hub-foot">
          <Link
            href="/deneme-sinavlari"
            className="cp-hub-foot-card cp-hub-foot-card--exam"
            onClick={onClose}
          >
            <span className="cp-hub-foot-scene" aria-hidden />
            <Target className="h-5 w-5" aria-hidden />
            <span>
              <strong>Sınav hazırlığı</strong>
              <em>{examDaysLabel}</em>
            </span>
          </Link>
          <Link href="/siniflar" className="cp-hub-foot-card cp-hub-foot-card--class" onClick={onClose}>
            <span className="cp-hub-foot-scene" aria-hidden />
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
