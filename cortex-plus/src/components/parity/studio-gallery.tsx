import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { Gate } from "@/components/entitlements/gate";
import type { Action } from "@/lib/entitlements/types";
import { STUDIOS, studioNeedsPlus } from "@/lib/parity/studios";
import { cn } from "@/lib/utils";
import "@/styles/studio-gallery.css";

/**
 * Çalışma Stüdyosu sekmesinin ana bölümü (8 Kasım 2026). Her stüdyo kendi rengiyle bir kart: büyük 3B simge, ad,
 * ne işe yaradığı, iki kısa bilgi ve "Başla". İlk iki stüdyo (en çok kullanılanlar) masaüstünde geniş kart.
 *
 * `gated` (Faz 8, `ui.v2.studyo` açıkken): Plus'a özel stüdyonun (podcast, sözlü, yazılı) kartı `<Gate>` içinde;
 * kilitliyken basınca stüdyo sayfası yerine yükseltme penceresi açılır, açıkken bağlantı aynen.
 */
export function StudioGallery({ freeAccount, gated = false }: { freeAccount: boolean; gated?: boolean }) {
  return (
    <section className="sg" aria-labelledby="sg-title">
      <h2 id="sg-title" className="sg-heading">
        Stüdyolar
        <span>{STUDIOS.length}</span>
      </h2>
      <ul className="sg-grid">
        {STUDIOS.map((studio, index) => {
          const plus = studioNeedsPlus(studio, freeAccount);
          const gateAction = gated ? STUDIO_GATE_ACTION[studio.id] : undefined;
          const card = (
            <Link
              href={studio.href}
              className={cn("sg-card", studio.featured && "sg-card--featured")}
              style={{ "--sg-accent": studio.accent } as CSSProperties}
              data-studio={studio.id}
            >
              <span className="sg-glow" aria-hidden />
              <span className="sg-art" aria-hidden>
                <span className="sg-art-plate" />
                <Icon3D name={studio.icon} size={studio.featured ? 84 : 64} />
              </span>
              <span className="sg-body">
                <span className="sg-name">
                  {studio.title}
                  {plus && !gateAction ? (
                    <span className="sg-plus">
                      <Lock className="h-3 w-3" aria-hidden />
                      Plus
                    </span>
                  ) : null}
                </span>
                <span className="sg-blurb">{studio.blurb}</span>
                <span className="sg-facts">
                  {studio.facts.map((fact) => (
                    <span key={fact} className="sg-fact">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      {fact}
                    </span>
                  ))}
                </span>
              </span>
              <span className="sg-cta">
                {plus ? "İncele" : "Başla"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          );
          return (
            <li
              key={studio.id}
              className={cn("sg-cell", studio.featured && "sg-cell--featured")}
              style={{ "--sg-i": index } as CSSProperties}
            >
              {gateAction ? (
                <Gate action={gateAction} asChild>
                  {card}
                </Gate>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Plus'a özel stüdyoların hak sistemi eylemi (`lib/entitlements`); öbür stüdyolar bugünkü rozetle kalır. */
const STUDIO_GATE_ACTION: Partial<Record<string, Action>> = {
  podcast: "podcast.create",
  sozlu: "oral.start",
  yazili: "written.start",
};
