import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FarkAccordion } from "@/components/landing/fark-accordion";
import { SameNoteScene, ShareScene, TwinExamScene } from "@/components/landing/fark-scenes";
import { TwinScene } from "@/components/landing/fark-twin-scene";
import { HAS_RADIO } from "@/components/landing/fark-vitrini";
import { RadioShowcaseCard } from "@/components/landing/fark-vitrini-radio";
import { RedPenShowcaseCard } from "@/components/landing/fark-vitrini-red-pen";
import { FARK_SECTION } from "@/lib/marketing/fark-accordion";
import { HOME_COPY } from "@/lib/marketing/landing-content";
import "@/styles/fark-vitrini.css";
import "@/styles/home-farklar.css";

/**
 * Ana sayfanın karşılaştırma bölümü, "Aynı not, iki ayrı sonuç" (`#farklar`).
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi): bölümde üç ayrı düzende on kart vardı (aynı not kartı, üç kartlık fark vitrini,
 * dört açılır fark satırı). Hepsi tek, bölünmüş, görsel bir akordeona indi (`FarkAccordion`): solda altı başlık, sağda
 * açık başlığın canlı sahnesi; telefonda sahne açık başlığın içinde. Altında tek bağlantı: tam karşılaştırma tablosu
 * Özellikler sayfasında.
 *
 * Sahneler (sırayla): aynı not iki sonuç (`SameNoteScene`, `SAME_NOTE_CASE`), Sınav Radyosu ve Kırmızı Kalem (Faz 7
 * kartları, `compact`), tuzak → yanlışın ikizi (`TwinScene`), ikiz sınav + sessiz sözlü (`TwinExamScene`), sınıfla paylaş
 * + velime ödeme linki (`ShareScene`). Bu dosya sunucu bileşeni: QR sunucuda çizilir; istek yok, ses yalnız tıklamayla.
 */
export function LandingDuel() {
  const copy = HOME_COPY.duel;
  return (
    <section id="farklar" className="hm-section hm-farklar" aria-labelledby="hm-duel-title" data-testid="advantage-comparison">
      <div className="lp-wrap">
        <div className="hm-head" data-cinematic-reveal>
          <h2 id="hm-duel-title" className="hm-h2">
            {copy.title}
          </h2>
          <p className="hm-sub">{copy.lead}</p>
        </div>

        <FarkAccordion
          scenes={{
            "notuna-sadik": <SameNoteScene />,
            "sinav-radyosu": HAS_RADIO ? <RadioShowcaseCard compact /> : null,
            "kirmizi-kalem": <RedPenShowcaseCard compact />,
            "ikiz-soru": <TwinScene />,
            "ikiz-sinav": <TwinExamScene />,
            "sinifla-paylas": <ShareScene />,
          }}
        />

        <p className="fk-more">
          <Link href={FARK_SECTION.moreHref}>
            {copy.more}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
