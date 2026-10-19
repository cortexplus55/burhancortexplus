import Link from "next/link";
import { LifeBuoy, Mail } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { supportSlaLine } from "@/lib/support/sla";

export const metadata = {
  title: "Yardım",
  description: "Cortex Plus hakkında sık sorulan sorular ve destek kanalları.",
};

// 19 Ekim 2026: "çalışma planı", "gelişmiş model" ve "öncelikli destek" yoktu; cevaplar bugünkü ürüne göre.
const faqs = [
  {
    question: "Kullanım hakkı nasıl çalışıyor?",
    answer:
      "Her yapay zekâ işlemi kullanım hakkından düşer; ne kadarını kullandığını Profil → Kullanım'da yüzde olarak görürsün. Bir içerik hiç hazırlanamazsa o işlemin hakkı iade edilir.",
  },
  {
    question: "Ücretsiz olarak ne yapabilirim?",
    answer: `Ücretsiz hesap her gün yenilenen bir hak alır: günde bir ders ya da iki sohbet mesajı. Bir sınav hazırlığı kurabilir, toplam ${FREE_PAGE_TOTAL} sayfa belge işletebilirsin. Ders, podcast, test, kartlar ve sözlü deneme açık; video ders yalnız Plus'ta.`,
  },
  {
    question: "Dosyalarım güvende mi?",
    answer:
      "Yüklediğin dosyalar özel (private) depolama alanında tutulur, yalnızca senin hesabınla ilişkilendirilir ve imzalı bağlantı ile erişilir. Dilediğin zaman Belgelerim'den silebilirsin.",
  },
  {
    question: "Plus ile ücretsiz arasındaki fark nedir?",
    answer:
      "Plus hacim ve hız satar: ayda yaklaşık 1.200 ders ya da 2.400 mesaj, belgenin tamamı, sınırsız hazırlık, video ders ve hazır içerik yokken daha hızlı yazım. Abonelik kendiliğinden yenilenmez.",
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

export default function YardimPage() {
  return (
    <MarketingPage
      title="Yardım"
      description="Aradığın yanıt burada yoksa bize yazabilirsin."
    >
      <p className="mk-eyebrow">Sık sorulanlar</p>

      {/*
        `details` bilerek korundu: JavaScript olmadan açılıp kapanıyor, klavye
        ve ekran okuyucu desteği tarayıcıdan geliyor. Değişen yalnızca görünüm.
      */}
      <div className="mk-faq mt-5">
        {faqs.map((faq) => (
          <details key={faq.question} className="mk-faq__item">
            <summary className="mk-faq__q">{faq.question}</summary>
            <p className="mk-faq__a">{faq.answer}</p>
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
    </MarketingPage>
  );
}
