import { LegalDocument } from "@/components/layout/legal-document";
import { CookiePreferencesButton } from "@/components/legal/cookie-banner";
import { COOKIE_CATEGORY_LABELS, COOKIE_ROWS, COOKIE_SECTIONS } from "@/lib/legal/cookie-text";
import { COOKIE_POLICY_VERSION } from "@/lib/legal/versions";
import "@/styles/legal-consent.css";

export const metadata = {
  title: "Çerez politikası",
  description: "Cortex Plus'ın kullandığı çerezler, amaçları ve süreleri; tercihini nasıl değiştirirsin.",
};

/**
 * Çerez Politikası (7 Kasım 2026, uyum paketi). Tablo `cookie-text.ts`'ten: kodun gerçekte yazdığı çerezler.
 * Sayfanın altındaki düğme tercih penceresini açar (bant kapanmış olsa da).
 */
export default function CerezPolitikasiPage() {
  return (
    <LegalDocument
      title="Çerez politikası"
      description="Hangi çerezleri neden kullandığımızı ve tercihini nasıl değiştireceğini anlatır."
      version={COOKIE_POLICY_VERSION}
      sections={COOKIE_SECTIONS}
    >
      <section className="mt-10" aria-labelledby="cerez-tablosu">
        <h2 id="cerez-tablosu" className="text-lg font-semibold text-[var(--mk-text)]">
          Kullandığımız çerezler ve benzeri teknolojiler
        </h2>
        <div className="cp-cookie-table-wrap">
          <table className="cp-cookie-table">
            <thead>
              <tr>
                <th scope="col">Ad</th>
                <th scope="col">Tür</th>
                <th scope="col">Amaç</th>
                <th scope="col">Süre</th>
                <th scope="col">Taraf</th>
              </tr>
            </thead>
            <tbody>
              {COOKIE_ROWS.map((row) => (
                <tr key={row.name}>
                  <td>
                    <code>{row.name}</code>
                    <br />
                    <span>{row.kind}</span>
                  </td>
                  <td>{COOKIE_CATEGORY_LABELS[row.category].title}</td>
                  <td>{row.purpose}</td>
                  <td>{row.duration}</td>
                  <td>{row.party}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6">
          <CookiePreferencesButton className="mk-btn-outline inline-flex min-h-11 items-center px-6 text-sm font-medium" />
        </div>
      </section>
    </LegalDocument>
  );
}
