import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { SellerWarning } from "@/components/layout/seller-warning";
import { ACCEPTED_OMISSIONS, SELLER, sellerField } from "@/lib/legal/seller";

export const metadata = {
  title: "Künye",
  description:
    "Cortex Plus satıcı künyesi: unvan, adres, vergi dairesi ve iletişim.",
};

const SELLER_ROWS = [
  { label: "Ad soyad / Ünvan", value: sellerField("legalName") },
  { label: "Adres", value: sellerField("address") },
  ...(SELLER.phone.trim()
    ? [{ label: "Telefon", value: sellerField("phone") }]
    : []),
  { label: "E-posta", value: sellerField("email") },
  { label: "Vergi dairesi", value: sellerField("taxOffice") },
  ...(SELLER.taxNumber.trim()
    ? [{ label: "Vergi numarası", value: sellerField("taxNumber") }]
    : []),
  { label: "İnternet sitesi", value: SELLER.website },
];

/**
 * Yasal künye / imprint. Hakkımızda ilkeler sayfasıdır; PayTR ve 6563 için
 * satıcı kimliği ayrı, net bir URL'de durmalı.
 */
export default function KunyePage() {
  return (
    <MarketingPage
      title="Künye"
      description="Elektronik ticaret satıcı bilgileri ve iletişim."
    >
      <p className="mk-eyebrow">Satıcı bilgileri</p>

      <SellerWarning />

      <section className="mk-card mt-5 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">
          Ticari unvan ve iletişim
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          {SELLER_ROWS.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-[var(--mk-muted)]">{row.label}</dt>
              <dd className="text-[var(--mk-text)]">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm leading-relaxed text-[var(--mk-muted)]">
          Destek için{" "}
          <Link
            href="/iletisim"
            className="text-[var(--mk-primary)] underline underline-offset-4"
          >
            iletişim
          </Link>{" "}
          sayfasını veya{" "}
          <a
            href={`mailto:${SELLER.email}`}
            className="text-[var(--mk-primary)] underline underline-offset-4"
          >
            {SELLER.email}
          </a>{" "}
          adresini kullan.
        </p>
      </section>

      <section className="mk-card mt-5 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">
          Bilerek yayınlanmayan alanlar
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--mk-muted)]">
          {ACCEPTED_OMISSIONS.map((item) => (
            <li key={item.label}>
              <span className="font-medium text-[var(--mk-text)]">
                {item.label}:
              </span>{" "}
              {item.reason}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-sm text-[var(--mk-muted)]">
        Ürün ilkeleri için{" "}
        <Link
          href="/hakkimizda"
          className="text-[var(--mk-primary)] underline underline-offset-4"
        >
          Hakkımızda
        </Link>
        .
      </p>
    </MarketingPage>
  );
}