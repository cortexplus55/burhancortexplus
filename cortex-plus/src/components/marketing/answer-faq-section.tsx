import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FaqItem } from "@/lib/marketing/landing-content";

/**
 * "Cevap önce" sık sorulanlar bölümü (27 Kasım 2026, GEO): `/ozellikler` ve `/fiyatlandirma`. Ana sayfanın SSS'siyle aynı
 * görünüm (`lp-faq`, `landing.css`); cevaplar `<details>` içinde, ilk sunucu HTML'inde (yapay zekâ tarayıcıları ve ekran
 * okuyucu tıklamadan okur). Aynı dizi sayfanın FAQPage yapılandırılmış verisine gider. Sunucu bileşeni, istemci kodu yok.
 * `.lp` kökünün içinde çizilir (renk değişkenleri oradan).
 */
export function AnswerFaqSection({ id, title, items }: { id: string; title: string; items: readonly FaqItem[] }) {
  return (
    <section className="lp-section" aria-labelledby={id} data-testid="answer-faq">
      <div className="lp-wrap lp-faq-wrap">
        <h2 id={id} className="lp-h2">
          {title}
        </h2>
        <div className="lp-faq lp-faq--answer">
          {items.map((item) => (
            <details key={item.q} className="lp-faq-item">
              <summary>{item.q}</summary>
              <p className="lp-muted">{item.a}</p>
              {item.link ? (
                <Link href={item.link.href} className="lp-faq-link">
                  {item.link.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
