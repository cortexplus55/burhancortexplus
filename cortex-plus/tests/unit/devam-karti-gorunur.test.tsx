// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContinueLine } from "@/components/parity/continue-line";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

afterEach(cleanup);

/**
 * "Kaldığın yerden devam" kartı ilk ekranda görünür (10 Kasım 2026, canlı ölçüm): Başla'nın altındayken telefonda
 * (375×667) hiç, dizüstünde (1366×768) yarısı görünmüyordu; sınav şeridi, selam ve dost satırı yeri dolduruyordu.
 */
describe("devam kartı ilk ekranda", () => {
  it("ana ekran kartı selamla Başla'nın arasına koyar (heroLead), ilk adım kartı Başla'nın altında kalır", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain("const heroLead = continueStep ? <ContinueLine step={continueStep} /> : undefined;");
    expect(page).toContain("heroLead={heroLead}");
    expect(page).not.toMatch(/continueStep \? \(\s*<ContinueLine/);
    const chat = read("src/components/chat/chat-panel.tsx");
    const sub = chat.indexOf('<p className="cp-sor-hero-sub">');
    const lead = chat.indexOf("{heroLead}", sub);
    const start = chat.indexOf('className="cp-sor-start"', sub);
    expect(sub).toBeGreaterThan(0);
    expect(lead).toBeGreaterThan(sub);
    expect(start).toBeGreaterThan(lead);
  });

  it("kompakt hâl yalnız kısa ekranda; bağlam satırı hazırlığın adını, kalan günü ve yüzdeyi taşır", () => {
    const css = read("src/styles/parity-shell.css");
    expect(css).toContain("@media (max-height: 740px), (max-width: 480px) and (max-height: 820px) {");
    expect(css).toMatch(/\.cp-resume-kind-min,\n\.cp-resume-ctx \{\n {2}display: none;/);
    const { container } = render(
      <ContinueLine
        step={{
          prepId: "p",
          prepTitle: "Termodinamik",
          subject: "Fizik",
          progress: { done: 4, total: 20, pct: 20 },
          daysLeft: 12,
          next: { kind: "lesson", kindLabel: "Ders", heading: "Isı ve sıcaklık", minutes: 9, href: "/x" },
        }}
      />,
    );
    const ctx = container.querySelector(".cp-resume-ctx")!;
    expect(ctx.textContent).toContain("Termodinamik");
    expect(ctx.textContent).toContain("12 gün");
    expect(ctx.textContent).toContain("%20");
    expect(container.querySelector(".cp-resume-kind-min")!.textContent).toContain("~9 dk");
  });
});
