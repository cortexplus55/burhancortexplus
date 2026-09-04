import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";

export function LegalDocument({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <MarketingPage title={title} description={description} variant="legal">
      <div className="max-w-2xl text-[var(--mk-text)]">
        <div className="space-y-10">
          {sections.map((section, index) => (
            <section key={section.heading}>
              {/* Numara okuyana nerede olduğunu söylüyor: hukuki metinler
                  uzun ve birbirine benzeyen başlıklarla ilerliyor. */}
              <p className="mk-eyebrow">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--mk-text)]">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--mk-muted)]">
                {section.body.map((paragraph) => (
                  // Düz metin `p` olarak yazılıyor. Önce `ul`/`li` idi: madde
                  // işareti olmayan bir listeydi, ama ekran okuyucu yine de
                  // "liste, 3 öğe" diye okuyordu — bunlar paragraf.
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/*
          Buradaki not eskiden okuyucuya değil site sahibine sesleniyordu
          ("yayına almadan önce hukuk danışmanınla gözden geçir") ve canlıda
          duruyordu — ziyaretçiye belge taslakmış gibi görünüyordu.
        */}
        <div className="mk-card mt-12 p-5 text-sm text-[var(--mk-muted)]">
          Bu sayfadaki bir maddeyle ilgili sorun varsa ya da verilerine dair bir
          talepte bulunmak istiyorsan{" "}
          <Link
            href="/iletisim"
            className="text-[var(--mk-primary)] underline underline-offset-4"
          >
            bize yazabilirsin
          </Link>
          .
        </div>
      </div>
    </MarketingPage>
  );
}
