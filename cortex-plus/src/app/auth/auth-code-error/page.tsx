import { LinkIcon } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { ResultCard } from "@/components/marketing/result-card";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ neden?: string; next?: string }>;
}) {
  const { neden, next: rawNext } = await searchParams;

  /*
    Bağlantı başka bir tarayıcıda açıldı (lib/auth/link-failure.ts).
    Supabase bağlantıyı kabul etti — kayıt onayında e-posta doğrulandı —
    ama oturum yalnızca isteğin yapıldığı tarayıcıda açılabiliyor. Eskiden
    bu durum "bağlantının süresi dolmuş" diye gösteriliyordu; öğrenci
    çalışan bir bağlantıyı yeniden istiyor, yine telefonda açıp aynı
    sayfaya düşüyordu.
  */
  if (neden === "baska-tarayici") {
    const next = safeNextPath(rawNext ?? null);
    if (next === "/sifre-yenile") {
      return (
        <MarketingPage
          variant="auth"
          title="Şifre sıfırlama bu tarayıcıda açılamadı"
          description="Bağlantıyı, sıfırlamayı istediğin tarayıcıdan farklı bir yerde açtın."
        >
          <ResultCard
            icon={LinkIcon}
            tone="error"
            detail="Güvenlik gereği şifre yalnızca sıfırlamayı istediğin tarayıcıda değiştirilebiliyor. Bağlantıyı orada aç ya da buradan yeni bir bağlantı iste ve onu bu cihazda aç."
            primaryHref="/sifremi-unuttum"
            primaryLabel="Yeni sıfırlama bağlantısı iste"
            secondaryHref="/giris"
            secondaryLabel="Giriş ekranına dön"
          />
        </MarketingPage>
      );
    }
    return (
      <MarketingPage
        variant="auth"
        title="Bağlantı onaylandı, giriş yapman gerekiyor"
        description="Bağlantıyı kayıt olduğun tarayıcıdan farklı bir yerde açtın; burada oturum açılmadı."
      >
        <ResultCard
          icon={LinkIcon}
          tone="success"
          detail="E-postan doğrulandı. Güvenlik gereği oturum yalnızca kayıt olduğun tarayıcıda kendiliğinden açılıyor. Burada e-posta ve şifrenle giriş yapıp kaldığın yerden devam edebilirsin."
          primaryHref={`/giris?next=${encodeURIComponent(next)}`}
          primaryLabel="Giriş yap"
          secondaryHref="/yardim"
          secondaryLabel="Yardım sayfası"
        />
      </MarketingPage>
    );
  }

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
