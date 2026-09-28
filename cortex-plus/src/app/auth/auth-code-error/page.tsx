import { LinkIcon } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ neden?: string }>;
}) {
  const { neden } = await searchParams;

  // Google onayı iptal edildiğinde ya da sağlayıcı hata verdiğinde e-posta
  // bağlantısı diye bir şey yok; "bağlantının süresi doldu" demek öğrenciyi
  // olmayan bir e-postayı aramaya gönderiyordu.
  if (neden === "saglayici") {
    return (
      <MarketingPage
        variant="auth"
        title="Google ile giriş tamamlanmadı"
        description="Google onayı iptal edilmiş ya da Google bir hata döndürmüş olabilir."
      >
        <ResultCard
          icon={LinkIcon}
          tone="error"
          detail="Hesabında bir değişiklik yapılmadı. Giriş ekranından Google ile yeniden deneyebilir ya da e-posta ve şifrenle giriş yapabilirsin."
          primaryHref="/giris"
          primaryLabel="Giriş ekranına dön"
          secondaryHref="/yardim"
          secondaryLabel="Yardım sayfası"
        />
      </MarketingPage>
    );
  }

  return (
    <MarketingPage
      variant="auth"
      title="Bağlantı çalışmadı"
      description="Doğrulama bağlantısının süresi dolmuş ya da daha önce kullanılmış olabilir."
    >
      <ResultCard
        icon={LinkIcon}
        tone="error"
        detail="Doğrulama bağlantıları tek kullanımlıktır ve bir süre sonra geçersiz olur. E-postanı zaten doğruladıysan doğrudan giriş yapabilirsin; doğrulamadıysan yeni bir bağlantı iste."
        primaryHref="/giris"
        primaryLabel="Giriş ekranına dön"
        secondaryHref="/email-dogrula"
        secondaryLabel="Yeni doğrulama bağlantısı gönder"
      />
    </MarketingPage>
  );
}
