import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";
import type { ActionCode } from "@/lib/env";
import { cn } from "@/lib/utils";
import "@/styles/home-studios.css";

/**
 * Ana ekrandaki Çalışma Stüdyoları (8 Kasım 2026, ürün sahibi: "stüdyolardaki özellikler arka planda kalmasın, ana
 * ekranda çok iyi düşünülmüş şekilde dursun"). Selamın altında, yazma alanının üstünde kalan akışta; her kart doğrudan
 * kendi stüdyosunu açar. Ücretsiz hesapta yalnız Plus'ta açılan işler "Plus" rozeti taşır (açık liste
 * `PLUS_ONLY_ACTIONS`: fiyattan türetilmez).
 */
export type HomeStudio = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  icon: Icon3DName;
  /** Ücretsiz hesapta açılmayan iş (Plus rozeti). */
  action?: ActionCode;
};

export const HOME_STUDIOS: readonly HomeStudio[] = [
  {
    id: "soru-coz",
    title: "Fotoğraftan Çözüm",
    blurb: "Fotoğrafını çek, adım adım çözüm al",
    href: "/soru-coz",
    icon: "alistirma",
  },
  {
    id: "quiz",
    title: "Konu Testi",
    blurb: "Konudan ya da notundan test hazırla",
    href: "/studio/quiz",
    icon: "konu-testi",
  },
  {
    id: "flashcard",
    title: "Kartlar",
    blurb: "Kart üret, aralıklı tekrarla ezberle",
    href: "/studio/flashcard",
    icon: "kartlar",
  },
  {
    id: "dogru-yanlis",
    title: "Doğru / Yanlış",
    blurb: "Hızlı kontrol, yanlışın doğrusu yanında",
    href: "/studio/dogru-yanlis",
    icon: "dogru-yanlis",
  },
  {
    id: "podcast",
    title: "Podcast",
    blurb: "Notunu iki sesle dinleyerek tekrar et",
    href: "/studio/podcast",
    icon: "podcast",
    action: "PODCAST_GENERATE",
  },
  {
    id: "sozlu",
    title: "Sözlü Sınav",
    blurb: "Anlat, anında puan ve geri bildirim al",
    href: "/studio/sozlu",
    icon: "sozlu",
    action: "ORAL_EXAM_GENERATE",
  },
  {
    id: "yazili",
    title: "Yazılı Deneme",
    blurb: "Gerçek sınav düzeninde dene, notunu gör",
    href: "/studio/yazili",
    icon: "yazili",
    action: "PRACTICE_EXAM_GENERATE",
  },
  {
    id: "anlat",
    title: "Anlatarak Öğren",
    blurb: "Sen anlat, eksiğini birlikte bulalım",
    href: "/studio/anlat",
    icon: "ogretmen",
  },
];

/** Ücretsiz hesapta bu stüdyo Plus rozeti taşır mı. */
export function studioNeedsPlus(
  studio: HomeStudio,
  freeAccount: boolean,
): boolean {
  return (
    freeAccount && Boolean(studio.action && isPlusOnlyAction(studio.action))
  );
}

export function HomeStudios({ freeAccount }: { freeAccount: boolean }) {
  return (
    <section className="hs" aria-labelledby="hs-title">
      <div className="hs-glow" aria-hidden />
      <header className="hs-head">
        <div className="hs-head-text">
          <p className="hs-kicker">
            <span className="hs-kicker-dot" aria-hidden />
            Çalışma Stüdyoları
          </p>
          <h2 id="hs-title" className="hs-title">
            Bugün nasıl çalışmak istersin?
          </h2>
        </div>
        <Link href="/araclar" className="hs-all">
          Tüm araçlar
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>
      <ul className="hs-grid">
        {HOME_STUDIOS.map((studio, index) => {
          const plus = studioNeedsPlus(studio, freeAccount);
          return (
            <li
              key={studio.id}
              className="hs-cell"
              style={{ ["--hs-i" as string]: index }}
            >
              <Link
                href={studio.href}
                className={cn("hs-card", plus && "hs-card--plus")}
                data-studio={studio.id}
              >
                <span className="hs-art" aria-hidden>
                  <Icon3D name={studio.icon} size={52} />
                </span>
                <span className="hs-text">
                  <span className="hs-name">
                    {studio.title}
                    {plus ? <span className="hs-plus">Plus</span> : null}
                  </span>
                  <span className="hs-blurb">{studio.blurb}</span>
                </span>
                <ArrowUpRight className="hs-go" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
