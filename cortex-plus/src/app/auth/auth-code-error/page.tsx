import { LinkIcon } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";

export default function AuthCodeErrorPage() {
  return (
    <MarketingPage
      variant="auth"
      title="Bağlantı çalışmadı"
      description="Doğrulama bağlantısının süresi dolmuş ya da daha önce kullanılmış olabilir."
    >
      <ResultCard
        icon={LinkIcon}
        tone="error"
        detail="Doğrulama bağlantıları tek kullanımlıktır ve bir süre sonra geçersiz olur. Giriş ekranından yeniden dene; gerekirse yeni bir bağlantı gönderilir."
        primaryHref="/giris"
        primaryLabel="Giriş ekranına dön"
        secondaryHref="/yardim"
        secondaryLabel="Yardım sayfası"
      />
    </MarketingPage>
  );
}
