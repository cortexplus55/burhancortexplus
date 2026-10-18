import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Telefon denetimi (18 Ekim 2026, 375×812, giriş yapılmış 90+ sayfa tek tek gezildi).
  Dört sayfa türü yana kayıyor ya da kırpılıyordu; hepsi tek satırlık CSS sebepliydi.
  Bu bekçi o satırların geri gelmesini engeller; gerekçeler ilgili CSS yorumlarında.
*/
// Windows'ta dosyalar CRLF gelebiliyor; kalıplar \n ile yazıldı.
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
};

describe("telefon denetimi bekçileri", () => {
  it("'Geri'li üst çubuk sınav kabuğunda da daralır; kurucu çipi telefonda gizlenir", () => {
    const shell = read("src/styles/parity-shell.css");
    const narrow = shell.slice(shell.indexOf("/* Telefonda Astra gibi tek satır"));
    const media = narrow.slice(0, narrow.indexOf("\n}\n") + 3);
    expect(media).toContain("@media (max-width: 480px)");
    expect(media).toMatch(/\.cp-sor-root--exam \.cp-sor-more-label \{\s*display: none;/);
    expect(media).toMatch(/\.cp-sor-root--exam \.cp-sor-top \{[^}]*flex-wrap: nowrap;/);
    expect(media).toMatch(
      /\.cp-sor-root--focus \.cp-founder-chip,\s*\.cp-sor-root--exam \.cp-founder-chip \{\s*display: none;/,
    );
  });

  it("Belgelerim ızgara hücresi dosya adına göre genişlemez", () => {
    expect(block(read("src/styles/parity-shell.css"), ".cp-docs")).toContain("min-width: 0;");
  });

  it("kayıt sihirbazının ışık katmanı yanlara taşmaz", () => {
    const ambient = block(read("src/styles/signup-wizard.css"), ".onboarding-ambient");
    expect(ambient).toMatch(/inset:\s*-3rem 0 -2rem;/);
  });

  it("düello kodu büyük harfle yazılsa da aynı düelloyu açar", () => {
    const page = read("src/app/duello/[code]/page.tsx");
    expect(page).toContain(".code.toLowerCase()");
    expect(page.indexOf("toLowerCase()")).toBeLessThan(page.indexOf("/^[a-z0-9]{6,16}$/"));
  });

  it("belge kartındaki Sil ve belge sayfasındaki geri bağlantısı parmakla basılır boyda", () => {
    expect(read("src/components/documents/document-delete-button.tsx")).toMatch(
      /className="inline-flex min-h-8 items-center[^"]*"\s*\n\s*onClick=\{\(\) => setConfirming\(true\)\}/,
    );
    expect(read("src/app/dokumanlar/[documentId]/page.tsx")).toContain(
      'className="inline-flex min-h-8 items-center text-xs text-[var(--cs-muted)] underline"',
    );
  });
});
