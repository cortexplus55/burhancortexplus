import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";
import Link from "next/link";
import { LifeBuoy, Mail } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { loadOptionalStudentShell } from "@/lib/student/optional-shell";
import { FREE_DOCUMENT_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { supportSlaLine } from "@/lib/support/sla";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { faqPageJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/json-ld";

// Kanonik adres ve sayfaya özel paylaşım bilgisi (20 Kasım 2026, Faz 3).
export const metadata = pageMetadata({
  title: "Yardım",
  description:
    "Cortex Plus hakkında sık sorulan sorular ve destek kanalları.",
  path: "/yardim",
});

type Faq = {
  question: string;
  answer: string;
  /** Yalnız tarayıcıda görünen ek cümle (web satışına özgü). */
  webOnly?: string;
  /** Yalnız mobil uygulamada görünen ek cümle (mağaza aboneliğine özgü). */
  appOnly?: string;
  link?: { label: string; href: string };
};

// 19 Ekim 2026: "çalışma planı", "gelişmiş model" ve "öncelikli destek" yoktu; cevaplar bugünkü ürüne göre.
const faqs: Faq[] = [
  {
    question: "Kullanım hakkı nasıl çalışıyor?",
    answer:
      "Her yapay zekâ işlemi kullanım hakkından düşer; ne kadarını kullandığını Profil → Kullanım'da yüzde olarak görürsün. Bir içerik hiç hazırlanamazsa o işlemin hakkı iade edilir.",
  },
  {
    question: "Ücretsiz olarak ne yapabilirim?",
    // 11 Kasım 2026: ilk dersin döngüsü süreye takılmaz; aynı akşam haftalık ders hakkı kalktı (ücretsiz hesap =
    // tek ders). Cümleler tek kaynaktan (`free-meters.ts`, `free-tier-copy.ts`).
    answer: `Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} var; mesaj hakkı gece yarısı, fotoğraf hakkı ay başında yenilenir. İlk dersten sonraki konular, yeni anlatımlar ("Farklı anlat") ve Çalışma Stüdyosu'ndaki test, kart ve doğru/yanlış üretimi Plus'ta açılır. ${FREE_DOCUMENT_SENTENCE} ${PLUS_ONLY_SENTENCE} Sesli dinleme de Plus'ta.`,
  },
  {
    question: "Dosyalarım güvende mi?",
    answer:
      "Yüklediğin dosyalar özel (private) depolama alanında tutulur, yalnızca senin hesabınla ilişkilendirilir ve imzalı bağlantı ile erişilir. Dilediğin zaman Belgelerim'den silebilirsin.",
  },
  {
    question: "Plus ile ücretsiz arasındaki fark nedir?",
    answer:
      `Plus hacim ve hız satar: ${PLAN_MARKETING_COPY.plus.periodLine.replace(/^A/, "a")}, belgenin tamamı ve bütün konular, birden çok hazırlık, podcast, video ders, sözlü ve yazılı deneme, sınav sabahı kâğıdı ve hazır içerik yokken daha hızlı yazım.`,
    // 26 Kasım 2026 (mağaza uyumluluğu): yenileme cümlesi satın alınan yere göre. Web'de PayTR satışı yenilenmez;
    // uygulamada mağaza aboneliği otomatik yenilenir (`AUTO_RENEW_SUPPORTED` yalnız web içindir).
    webOnly: "Abonelik kendiliğinden yenilenmez.",
    appOnly:
      "Uygulamada alınan abonelik, mağazanın abonelik ayarlarından dönem bitiminden en az 24 saat önce iptal edilmezse otomatik yenilenir.",
  },
  {
    question: "Hesabımı ve verilerimi nasıl silerim?",
    answer:
      "Ayarlar → Hesabı sil bölümünden «Hesabımı kalıcı olarak sil»e dokun; silme hemen başlar. Uygulamaya giremiyorsan Hesap silme sayfasındaki formdan e-postanla talep oluştur. Ödeme ve fatura kayıtları yalnız mevzuatın öngördüğü süre saklanır.",
    link: { label: "Hesap silme sayfası", href: "/hesap-silme" },
  },
  {
    // Faz 5 §4 (19 Kasım 2026): üç planın karşılığı tek merkezden; Sigma da burada.
    question: "Plus, Sınav Haftası ve Sigma arasındaki fark nedir?",
    answer: `${PLAN_MARKETING_COPY.helpPlansAnswer} Sigma, Plus'taki her şeyi en yüksek aylık hak ve en yüksek yükleme limitiyle verir.`,
  },
  {
    question: "Destek ne kadar sürede döner?",
    answer: `${supportSlaLine()} Bu süre her plan için aynı.`,
  },
  {
    question: "Şifremi unuttum, ne yapmalıyım?",
    answer:
      "Giriş ekranındaki bağlantıdan e-posta adresini gir; sıfırlama bağlantısı gönderilir.",
  },
];

const TITLE = "Yardım";
const DESCRIPTION = "Aradığın yanıt burada yoksa bize yazabilirsin.";

/**
 * 13 Kasım 2026 (Faz 2): oturum açık öğrenci aynı içeriği uygulama kabuğunda görür (üst çubuk, Kütüphane, profil);
 * misafir bugünkü pazarlama sayfasını. İçerik ikisinde de aynı; görünüm kabuğun sınıflarından.
 */
export default async function YardimPage() {
  const shell = await loadOptionalStudentShell();
  if (shell) {
    return (
      <ParitySorShell {...shell}>
        <PageShell width="read" title={TITLE} lead={DESCRIPTION} className="cx-mk-body">
          <YardimContent />
        </PageShell>
      </ParitySorShell>
    );
  }
  return (
    <MarketingPage title={TITLE} description={DESCRIPTION}>
      <YardimContent />
    </MarketingPage>
  );
}

function YardimContent() {
  return (
    <>
      {/* Sık sorulanların yapılandırılmış verisi: soru ve cevap aşağıdaki metnin aynısı (20 Kasım 2026, Faz 3). */}
      {/* Yapılandırılmış veri her iki hâlde de doğru olan ortak cevabı taşır (web/uygulama ek cümlesi hariç). */}
      <JsonLd data={faqPageJsonLd(faqs)} />
      <p className="mk-eyebrow">Sık sorulanlar</p>

      {/*
        `details` bilerek korundu: JavaScript olmadan açılıp kapanıyor, klavye
        ve ekran okuyucu desteği tarayıcıdan geliyor. Değişen yalnızca görünüm.
      */}
      <div className="mk-faq mt-5">
        {faqs.map((faq) => (
          <details key={faq.question} className="mk-faq__item">
            <summary className="mk-faq__q">{faq.question}</summary>
            <p className="mk-faq__a">
              {faq.answer}
              {faq.webOnly ? <span data-web-only> {faq.webOnly}</span> : null}
              {faq.appOnly ? <span data-app-only> {faq.appOnly}</span> : null}
            </p>
            {faq.link ? (
              <Link href={faq.link.href} className="text-[var(--mk-primary)] underline underline-offset-4">
                {faq.link.label}
              </Link>
            ) : null}
          </details>
        ))}
      </div>

      <div className="mk-card mt-10 grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="mk-icon shrink-0" aria-hidden>
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-[var(--mk-text)]">Hâlâ takıldın mı?</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
              Hesabın varsa uygulama içindeki Destek sayfasından talep aç; durumunu
              orada görürsün, cevabı e-postana gelir.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <span className="mk-icon shrink-0" aria-hidden>
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-[var(--mk-text)]">Bize yaz</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
              <Link
                href="/iletisim"
                className="text-[var(--mk-primary)] underline underline-offset-4"
              >
                İletişim sayfasından
              </Link>{" "}
              ulaşabilirsin — destek, geri bildirim ve KVKK talepleri aynı adrese
              gider.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
