import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export default async function OdemeBasariliPage({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const { kaynak } = await searchParams;
  const forParent = kaynak === "veli";

  return (
    <MarketingPage
      variant="auth"
      title="Ödeme alındı"
      description={
        forParent
          ? "Kota birkaç saniye içinde çocuğunun hesabına yansır. Raporların ücretsiz kalır."
          : "Kredilerin birkaç saniye içinde hesabına yansır."
      }
    >
      <p className="mk-card p-6 text-center text-sm">
        {forParent ? (
          <>
            <Link href="/veli/plus" className="text-[var(--mk-primary)] underline">
              Plus sayfasına dön
            </Link>
            {" · "}
            <Link href="/veli" className="text-[var(--mk-primary)] underline">
              Çocuklarım
            </Link>
          </>
        ) : (
          <>
            <Link href="/krediler" className="text-[var(--mk-primary)] underline">
              Kredileri gör
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
