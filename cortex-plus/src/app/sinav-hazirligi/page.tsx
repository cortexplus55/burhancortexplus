import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import "@/styles/landing.css";

export const metadata = {
  title: "Sınav hazırlığı",
  description:
    "Notunu ya da sınavını ver; konular sırayla bir yola dizilir. Sıradaki adımın, hazırlık puanın ve sınav günü tahminin hep görünür.",
};

/*
  19 Ekim 2026: sayfa eski ürünü anlatıyordu ("net" analizi, saatli günlük plan, "planına dön") ve
  SSS'nin dört cevabı aynı yer tutucu cümleydi. Şimdi yalnız bugün çalışan hazırlık akışı: sıralı yol,
  İlerleme sekmesi (`exam-prep-progress.tsx`), zorluk önerisi (`prep-level.ts`).
*/

const PATH: { icon: Icon3DName; title: string; body: string }[] = [
  { icon: "alistirma", title: "Seviye tespiti", body: "İstersen kısa bir testle başla; sıran ve düzeyin buna göre ayarlanır." },
  { icon: "ders", title: "Ders", body: "Her konu kısa ekranlarla anlatılır; önce dene soruları ve tablolarla." },
  { icon: "podcast", title: "Podcast", body: "Aynı konuyu iki öğretmenin konuşmasından dinle." },
  { icon: "konu-testi", title: "Konu testi", body: "Konunun sonunda kontrol; her şıkkın açıklamasıyla." },
  { icon: "yazili", title: "Yazılı deneme", body: "Bütün konulardan, gerçek sınav gibi. Kâğıda çözüp fotoğrafla da gönderebilirsin." },
  { icon: "sozlu", title: "Sözlü deneme", body: "Sesli ya da yazılı cevapla, sonunda puanını al." },
];

const PROGRESS = [
  { title: "Hazırlık puanı", body: "Konu hâkimiyetinden hesaplanır; hedef puanına ne kadar kaldığı görünür." },
  { title: "Sınav günü tahmini", body: "İlk dersinden sonra: bu tempoyla sınav günü nerede olacağın ve günde kaç ders gerektiği." },
  { title: "Bilgi eksikleri", body: "Yanlış cevaplarından çıkan eksik konular burada birikir; hangisine dönmen gerektiği görünür." },
  { title: "Konu konu durum", body: "Her konunun hâkimiyet yüzdesi, kaç soru çözdüğün ve kaç ders yaptığın." },
];

const FAQ = [
  {
    q: "Hangi sınavlar için kullanabilirim?",
    a: "Elinde ders notu olan her sınav için: üniversite vize ve finalleri, KPSS, YKS, TUS, okul yazılıları. Notun yoksa sınavını ve konularını yazarak da hazırlık kurabilirsin.",
  },
  {
    q: "Yol neden sırayla açılıyor?",
    a: "Her adım bir öncekinin üstüne kuruluyor: önce ders, sonra podcast, sonra test. İstersen \"Başka birini seç\" ile sırayı atlayıp başka bir etkinliği açabilirsin; yazılı deneme her zaman açık.",
  },
  {
    q: "Zorluk bana uymazsa?",
    a: "Son iki sonucun çok düşük ya da çok yüksekse hazırlık sayfası bunu söyler ve tek dokunuşla bütün konuların düzeyini kaydırır; bekleyen içerik yeni düzeyde yeniden yazılır.",
  },
  {
    q: "Birden fazla sınavım var.",
    a: "Her sınav ayrı bir hazırlık ve kendi yolu olur; belgeler birbirine karışmaz. Ücretsiz planda bir hazırlık, Plus'ta sınırsız.",
  },
];

export default function SinavHazirligiPage() {
  return (
    <ParityMarketingPage variant="marketing">
      <div className="lp">
        <section className="lp-hero" aria-labelledby="sh-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Sınav hazırlığı</p>
            <h1 id="sh-title" className="lp-hero-title">
              Sınavına kadar sıradaki adımın hep belli
            </h1>
            <p className="lp-hero-lead">
              Notunu ya da sınavını ver; konular sırayla bir yola dizilir. Her adımda ne çalışacağın, hedefine ne kadar
              kaldığı ve bu tempoyla sınav günü nerede olacağın görünür.
            </p>
            <div className="lp-cta-row">
              <Link href="/kayit" className="lp-btn lp-btn--primary">
                Hazırlığını kur
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/fiyatlandirma" className="lp-btn lp-btn--ghost">
                Planları gör
              </Link>
            </div>
            <p className="lp-fineprint">Ücretsiz planda bir hazırlık · kart istemiyoruz</p>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="sh-path">
          <div className="lp-wrap">
            <p className="lp-kicker">Yol</p>
            <h2 id="sh-path" className="lp-h2">
              Her konu aynı sırayla pekişir
            </h2>
            <ol className="lp-steps">
              {PATH.map((step, index) => (
                <li key={step.title} className="lp-step">
                  <Icon3D name={step.icon} size={52} />
                  <span className="lp-step-no">{index + 1}</span>
                  <h3 className="lp-h3">{step.title}</h3>
                  <p className="lp-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section--alt" aria-labelledby="sh-progress">
          <div className="lp-wrap lp-split">
            <div className="lp-split-copy">
              <p className="lp-kicker">İlerleme</p>
              <h2 id="sh-progress" className="lp-h2">
                Nerede olduğunu tahmin etmek zorunda değilsin
              </h2>
              <ul className="lp-trust">
                {PROGRESS.map((item) => (
                  <li key={item.title}>
                    <Check className="lp-trust-icon" aria-hidden />
                    <div>
                      <h3 className="lp-h3">{item.title}</h3>
                      <p className="lp-muted">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="lp-lesson-card" aria-label="Test sonrası konu hâkimiyeti kartı">
              <p className="lp-lesson-chip">Testten sonra</p>
              <h3 className="lp-lesson-heading">+%20 kazandın</h3>
              <p className="lp-lesson-text">
                Bir test ya da doğru/yanlış konu hâkimiyetini artırdığında sonuç ekranı bunu gösterir; sonra yolda
                sıradaki adım açılır.
              </p>
              <figcaption className="lp-caption">Konu hâkimiyeti yalnız kanıt üreten etkinlikle (test) değişir</figcaption>
            </figure>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="sh-faq">
          <div className="lp-wrap lp-faq-wrap">
            <h2 id="sh-faq" className="lp-h2">
              Sık sorulanlar
            </h2>
            <div className="lp-faq">
              {FAQ.map((item) => (
                <details key={item.q} className="lp-faq-item">
                  <summary>{item.q}</summary>
                  <p className="lp-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="sh-final">
          <div className="lp-wrap lp-final-inner">
            <Icon3D name="bos-hazirlik" size={72} />
            <h2 id="sh-final" className="lp-h2">
              İlk hazırlığın ücretsiz
            </h2>
            <Link href="/kayit" className="lp-btn lp-btn--primary">
              Hazırlığını kur
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
