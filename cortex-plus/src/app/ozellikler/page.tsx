import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AdvantageCompact } from "@/components/marketing/advantage-sections";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { FREE_LESSONS_PER_WEEK, FREE_PHOTO_PER_DAY, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import "@/styles/landing.css";

export const metadata = {
  title: "Özellikler",
  description:
    "Ders, podcast, video, kartlar, konu testi, yazılı ve sözlü deneme, yanlışlar defteri ve AI öğretmen — hepsi kendi notundan.",
};

/*
  19 Ekim 2026: sayfa "gelişmiş model", "çalışma planı ve günlük görevler", "her işlem öncesi kredi
  gösterilir" diyordu; üçü de yoktu. Her kart bugün çalışan bir araca karşılık gelir.

  24 Ekim 2026 (kredi v3): ücretsiz hesap sayaçla — haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf
  (`free-meters.ts`). "Plus" etiketliler ücretsiz hesapta hiç açılmayan işler (`PLUS_ONLY_ACTIONS`:
  podcast, sözlü, yazılı deneme, video, ses); sayılar koddan okunur, sayfaya elle yazılmaz.
*/

type Feature = { icon: Icon3DName; title: string; body: string; plus?: boolean };

/** "haftada 3 ders (testleri ve kartlarıyla), günde 3 sohbet mesajı ve günde 1 fotoğraftan soru çözümü" */
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
      { icon: "denklem", title: "Fotoğraftan çözüm", body: `Sorunun fotoğrafını çek ya da yaz; adım adım çözüm ve her şıkkın açıklaması. Ücretsiz hesapta günde ${FREE_PHOTO_PER_DAY}.` },
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
      <div className="lp">
        <section className="lp-hero" aria-labelledby="oz-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Özellikler</p>
            <h1 id="oz-title" className="lp-hero-title">
              Her konu için birçok yol, hepsi kendi notundan
            </h1>
            <p className="lp-hero-lead">
              Aşağıdaki her şey bugün çalışıyor. Etiketsizler ücretsiz hesapta da açık: {FREE_TIER_LOWER}.
              &quot;Plus&quot; etiketliler Plus&apos;ta açık.
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

        <div className="lp-wrap">
          <AdvantageCompact />
        </div>

        <section className="lp-final" aria-labelledby="oz-final">
          <div className="lp-wrap lp-final-inner">
            <h2 id="oz-final" className="lp-h2">
              Notunla dene
            </h2>
            <p className="lp-muted">Kart istemiyoruz. İlk hazırlığının 1. konusu ücretsiz (haftada {FREE_LESSONS_PER_WEEK} derse kadar).</p>
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
