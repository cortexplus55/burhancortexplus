import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { AdvantageComparison, AdvantageShowcase } from "@/components/marketing/advantage-sections";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { FREE_PHOTO_PER_MONTH, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_FIRST_LESSON_SENTENCE } from "@/lib/billing/free-tier-copy";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";
import { FREE_RESTUDY_BAND } from "@/lib/credits/price-table";
import "@/styles/landing.css";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { JsonLd } from "@/components/seo/json-ld";
import { ANSWER_FAQ } from "@/lib/marketing/answer-faq";
import { PRODUCT_SUMMARY } from "@/lib/marketing/product-definition";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";

const OZELLIKLER_DESCRIPTION =
  "Ders, podcast, video, kartlar, konu testi, yazılı ve sözlü deneme, yanlışlar defteri ve AI öğretmen — hepsi kendi notundan.";

// Kanonik adres ve sayfaya özel paylaşım bilgisi (20 Kasım 2026, Faz 3).
export const metadata = pageMetadata({
  title: "Özellikler",
  description: OZELLIKLER_DESCRIPTION,
  path: "/ozellikler",
});

/*
  19 Ekim 2026: sayfa "gelişmiş model", "çalışma planı ve günlük görevler", "her işlem öncesi kredi
  gösterilir" diyordu; üçü de yoktu. Her kart bugün çalışan bir araca karşılık gelir.

  24 Ekim 2026 (kredi v3): ücretsiz hesap sayaçla — günde 3 mesaj, fotoğraf (Faz 4: ayda 7)
  (`free-meters.ts`). "Plus" etiketliler ücretsiz hesapta hiç açılmayan işler (`PLUS_ONLY_ACTIONS`:
  podcast, sözlü, yazılı deneme, video, ses); sayılar koddan okunur, sayfaya elle yazılmaz.

  11 Kasım 2026: ücretsizde ilk hazırlığın ilk dersi süreye takılmaz (`first-lesson-cycle.ts`). Aynı akşam haftalık
  ders hakkı kalktı: ücretsiz hesap = tek ders, devamı Plus'ta (`free-lesson-gate.ts`). Cümleler `free-tier-copy.ts`
  ve `free-meters.ts`ten.
*/

type Feature = { icon: Icon3DName; title: string; body: string; plus?: boolean };

/** Ücretsiz hesabın tek cümlesi, cümle içinde (küçük harfle başlar). */
const FREE_TIER_LOWER = `${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)}`;

const GROUPS: { title: string; lead: string; items: Feature[] }[] = [
  {
    title: "Öğren",
    lead: "Bir konuyu sana uyan yoldan çalış.",
    items: [
      { icon: "ders", title: "Ders", body: "Kısa ekranlar, önce dene soruları, tablolar ve ezber kodları. Sınavda sorulacak yer turuncu." },
      { icon: "podcast", title: "Podcast", body: "İki öğretmen konuyu konuşarak anlatır; beş farklı tür, indirip dinleyebilirsin.", plus: true },
      { icon: "video", title: "Video ders", body: "Bir dakikalık anlatım; kilit bilgi ekranda büyük yazılı.", plus: true },
      { icon: "kartlar", title: "Kartlar ve tekrar", body: "Zorlandığın kart önce gelir; aralıklı tekrarla unutmazsın." },
      { icon: "ogretmen", title: "Anlatarak öğren", body: "Konuyu kendi cümlelerinle anlat; atladığın noktalar ve kuramadığın bağlar tek tek önüne konur." },
    ],
  },
  {
    title: "Pratik yap",
    lead: "Bildiğini sına, bilmediğini kaybetme.",
    items: [
      { icon: "konu-testi", title: "Konu testi", body: "Her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı açıklanır." },
      { icon: "dogru-yanlis", title: "Doğru / Yanlış", body: "Hızlı kontrol; yanlış cümlenin doğrusu yanında." },
      { icon: "tekrar", title: "Yanlışlar defteri", body: "Testlerde yanlış yaptığın soru konusuyla deftere yazılır; her gün defterinden 10 soruluk tur, üst üste iki doğruyla çıkar." },
      { icon: "denklem", title: "Fotoğraftan çözüm", body: `Sorunun fotoğrafını çek ya da yaz; adım adım çözüm ve her şıkkın açıklaması. Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH}.` },
    ],
  },
  {
    title: "Sınavı provala",
    lead: "Gerçek sınavdan önce kendini dene.",
    items: [
      { icon: "yazili", title: "Yazılı deneme", body: "Bütün konulardan, çoktan seçmeli ve açık uçlu. Açık uçlu cevabın, cevabından alıntıyla puanlanır.", plus: true },
      { icon: "resmi-sinavlar", title: "Kâğıtta çöz", body: "Denemeyi yazdır, kâğıda çöz, fotoğrafını çek; işaretlerin ve yazdıkların okunup notlanır.", plus: true },
      { icon: "sozlu", title: "Sözlü deneme", body: "Sesli ya da yazılı cevapla; eksik bıraktığın yeri öğretmen bir kez sorar.", plus: true },
    ],
  },
  {
    title: "Yanında",
    lead: "Takıldığında ve motivasyon gerektiğinde.",
    items: [
      { icon: "bos-sohbet", title: "AI öğretmen", body: "Takıldığın yeri sor; cevap notuna dayanır ve hangi sayfadan geldiği yazar." },
      { icon: "yildiz", title: "Düello", body: "Aynı sorularla arkadaşına meydan oku." },
      { icon: "seri", title: "Seri ve yıldızlar", body: "Günlük hedef, haftalık seri ve sıralama; istersen Ayarlar'dan gizlersin." },
      { icon: "mufredat", title: "İlerleme", body: "Hazırlık puanı, sınav günü tahmini, bilgi eksikleri ve konu konu durum." },
    ],
  },
];

export default function OzelliklerPage() {
  return (
    <ParityMarketingPage variant="marketing">
      {/* Kurum, site, sayfa, gezinme yolu ve sık sorulanlar tek @graph içinde (27 Kasım 2026, GEO). */}
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          webPageJsonLd({
            name: "Özellikler",
            description: OZELLIKLER_DESCRIPTION,
            path: "/ozellikler",
            breadcrumb: true,
            about: "software",
          }),
          breadcrumbJsonLd([
            { name: "Cortex Plus", path: "/" },
            { name: "Özellikler", path: "/ozellikler" },
          ]),
          faqPageJsonLd(
            ANSWER_FAQ.map((item) => ({ question: item.q, answer: item.a })),
            "/ozellikler",
          ),
        ]}
      />
      <div className="lp">
        <section className="lp-hero" aria-labelledby="oz-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Özellikler</p>
            <h1 id="oz-title" className="lp-hero-title">
              Her konu için birçok yol, hepsi kendi notundan
            </h1>
            {/* Ürünün tanımı (27 Kasım 2026, GEO): sayfanın ilk kelimeleri arasında, tek başına alıntılanabilir. */}
            <p className="lp-hero-lead" data-product-definition>
              {PRODUCT_SUMMARY}
            </p>
            <p className="lp-hero-lead">
              Aşağıdaki her şey bugün çalışıyor. Ücretsiz hesapta {FREE_TIER_LOWER} var; etiketsizleri ilk
              dersinde denersin. Dersin devamı ve &quot;Plus&quot; etiketliler Plus&apos;ta açık.
            </p>
            <div className="lp-cta-row">
              <Link href="/kayit" className="lp-btn lp-btn--primary">
                Ücretsiz başla
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/fiyatlandirma" className="lp-btn lp-btn--ghost">
                Planları karşılaştır
              </Link>
            </div>
          </div>
        </section>

        {GROUPS.map((group, index) => (
          <section
            key={group.title}
            className={index % 2 ? "lp-section lp-section--alt" : "lp-section"}
            aria-labelledby={`oz-${index}`}
          >
            <div className="lp-wrap">
              <p className="lp-kicker">{group.title}</p>
              <h2 id={`oz-${index}`} className="lp-h2">
                {group.lead}
              </h2>
              <div className="lp-features">
                {group.items.map((feature) => (
                  <article key={feature.title} className="lp-feature">
                    <Icon3D name={feature.icon} size={44} />
                    <div className="min-w-0">
                      <h3 className="lp-h3">
                        {feature.title}
                        {feature.plus ? <span className="lp-plus-chip">Plus</span> : null}
                      </h3>
                      <p className="lp-muted">{feature.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* 11 Kasım 2026: ana sayfa üç bölüme inince kanıt kartı ve tam karşılaştırma buraya taşındı (#farklar). */}
        <AdvantageShowcase />
        <AdvantageComparison />

        {/* Faz 5 §4 (19 Kasım 2026): planların karşılığı fiyat sayfasıyla aynı tek merkezden (`plan-copy.ts`). */}
        <section className="lp-section" aria-labelledby="oz-plans" data-testid="oz-plan-copy">
          <div className="lp-wrap">
            <p className="lp-kicker">Planlar</p>
            <h2 id="oz-plans" className="lp-h2">
              Aylık hakkın ne kadar iş eder
            </h2>
            <ul className="lp-trust">
              {PLAN_MARKETING_COPY.plans.map((plan) => (
                <li key={plan.id}>
                  <Check className="lp-trust-icon" aria-hidden />
                  <div>
                    <h3 className="lp-h3">{plan.name}</h3>
                    <p className="lp-muted">{plan.periodLine}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="lp-muted">
              Sayılar yaklaşıktır ve tek başınadır: hepsi aynı dönem hakkından düşer. {FREE_RESTUDY_BAND}.
            </p>
          </div>
        </section>

        {/* "Cevap önce" sık sorulanlar (27 Kasım 2026, GEO); aynı metin FAQPage yapılandırılmış verisine gider. */}
        <AnswerFaqSection id="oz-faq" title="Sık sorulanlar" items={ANSWER_FAQ} />

        <section className="lp-final" aria-labelledby="oz-final">
          <div className="lp-wrap lp-final-inner">
            <h2 id="oz-final" className="lp-h2">
              Notunla dene
            </h2>
            <p className="lp-muted">Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}</p>
            <Link href="/kayit" className="lp-btn lp-btn--primary">
              Ücretsiz başla
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
