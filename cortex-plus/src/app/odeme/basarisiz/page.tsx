import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export default async function OdemeBasarisizPage({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const { kaynak } = await searchParams;
  const forParent = kaynak === "veli";

  return (
    <MarketingPage
      variant="auth"
      title="Ödeme tamamlanamadı"
      description="İşlem iptal edildi veya başarısız oldu. Paketler sayfasından tekrar deneyebilirsin."
    >
      <p className="mk-card p-6 text-center text-sm">
        {forParent ? (
          <>
            <Link href="/veli/plus" className="text-[var(--mk-primary)] underline">
              Plus’a dön
            </Link>
            {" · "}
            <Link href="/veli" className="text-[var(--mk-primary)] underline">
              Çocuklarım
            </Link>
          </>
        ) : (
          <>
            <Link href="/paketler" className="text-[var(--mk-primary)] underline">
              Paketlere dön
            </Link>
            {" · "}
            <Link href="/ogretmen" className="text-[var(--mk-primary)] underline">
              Sor ekranına git
            </Link>
          </>
        )}
      </p>
    </MarketingPage>
  );
}
