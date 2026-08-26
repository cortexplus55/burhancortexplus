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
          <details key={faq.question} className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {faq.question}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
          </details>
        ))}
      </div>

      <p className="mt-6 text-sm">
        Hâlâ takıldın mı?{" "}
        <Link href="/iletisim" className="underline">
          İletişim sayfasından
        </Link>{" "}
        bize ulaş.
      </p>
    </MarketingPage>
  );
}
