import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Yardım",
  description: "Cortex Plus hakkında sık sorulan sorular ve destek kanalları.",
};

const faqs = [
  {
    question: "Kredi nasıl çalışıyor?",
    answer:
      "Her AI işleminin sabit bir kredi bedeli vardır ve işlem öncesinde ekranda gösterilir. İşlem başarısız olursa kredin otomatik iade edilir.",
  },
  {
    question: "Ücretsiz olarak ne yapabilirim?",
    answer:
      "Hesap açtığında tanımlı ücretsiz hakkınla AI öğretmeni deneyebilir, quiz ve çalışma planı üretebilirsin.",
  },
  {
    question: "Dosyalarım güvende mi?",
    answer:
      "Yüklediğin dosyalar özel (private) depolama alanında tutulur, yalnızca senin hesabınla ilişkilendirilir ve imzalı bağlantı ile erişilir.",
  },
  {
    question: "Öğretmen hesabı nasıl alınır?",
    answer:
      "Profil sayfasından kurum bilgini ve doğrulama belgeni yükleyerek başvurursun. Başvurun yönetici tarafından incelendikten sonra öğretmen paneli açılır.",
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
      <div className="space-y-3">
        {faqs.map((faq) => (
          <details key={faq.question} className="mk-details">
            <summary>{faq.question}</summary>
            <p className="mk-prose mt-2">{faq.answer}</p>
          </details>
        ))}
      </div>

      <p className="mk-prose mt-6">
        Hâlâ takıldın mı?{" "}
        <Link href="/iletisim" className="mk-link-accent">
          İletişim sayfasından
        </Link>{" "}
        bize ulaş.
      </p>
    </MarketingPage>
  );
}
