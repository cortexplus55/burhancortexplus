// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HeroStage } from "@/components/landing/hero-stage";
import { InteractiveShowcase } from "@/components/landing/interactive-showcase";
import {
  AUDIENCE_SEGMENT_IDS,
  heroStageFor,
  SHOWCASE,
  twoOptionHeading,
} from "@/lib/marketing/landing-showcase";

/*
  10 Kasım 2026, canlı denetim: ana sayfada hangi hedef kitle sekmesi seçilirse seçilsin kahramandaki maket aynı
  (tıp) notunu gösteriyordu; vitrindeki "İki şık arasında kaldım" kutusu hangi iki şıktan söz ettiğini açıkça
  yazmıyordu.
*/

afterEach(() => cleanup());

describe("kahraman maketi seçili sekmeyi izler", () => {
  it("her sekmenin notu, ders ekranı ve yolu kendi vitrin örneğinden gelir", () => {
    const files = new Set<string>();
    for (const id of AUDIENCE_SEGMENT_IDS) {
      const stage = heroStageFor(id);
      const item = SHOWCASE[id];
      files.add(stage.note.file);
      expect(item.topic).toContain(stage.note.heading);
      expect(stage.lesson.topic).toBe(item.topic);
      expect(stage.lesson.prompt).toBe(item.trap.wrong);
      expect(stage.lesson.corrected).toBe(item.trap.right);
      expect(stage.path.nodes[1]?.label).toBe(`Ders · ${stage.note.heading}`);
      expect(stage.note.badge).toBe(stage.note.file.split(".").pop()!.toLocaleUpperCase("tr"));
    }
    // Dört sekme dört ayrı dosya adı gösterir.
    expect(files.size).toBe(AUDIENCE_SEGMENT_IDS.length);
  });

  it("sekme değişince maketteki dosya adı ve konu da değişir", () => {
    const { rerender, container } = render(<HeroStage segmentId="lise" />);
    const lise = heroStageFor("lise");
    expect(container.textContent).toContain(lise.note.file);
    expect(container.textContent).toContain(lise.lesson.topic);

    rerender(<HeroStage segmentId="universite" />);
    const uni = heroStageFor("universite");
    expect(container.textContent).toContain(uni.note.file);
    expect(container.textContent).toContain(uni.lesson.topic);
    expect(container.textContent).not.toContain(lise.note.file);
    expect(container.querySelector(".lp-stage")?.getAttribute("data-segment")).toBe("universite");
  });

  it("maket 'gerçek bir ders' iddiası taşımaz: örnek olduğu yazılır", () => {
    const { container } = render(<HeroStage segmentId="akademik" />);
    expect(container.textContent).toContain("Ders ekranı örneği");
    expect(container.textContent).not.toContain("Gerçek bir ders ekranı");
  });
});

describe("vitrin: iki şık ipucu hangi şıkları kastettiğini söyler", () => {
  it("başlık iki şıkkı harfi ve değeriyle yazar, cevabı söylemez", () => {
    for (const id of AUDIENCE_SEGMENT_IDS) {
      const { question } = SHOWCASE[id];
      const heading = twoOptionHeading(question);
      expect(heading).toMatch(/^Bu soruda en çok karıştırılan iki şık [A-E] \(.+\) ve [A-E] \(.+\) şıklarıdır — aralarındaki fark:$/);
      for (const option of question.twoOption.pair) expect(heading).toContain(`(${option})`);
      expect(heading).not.toMatch(/doğru cevap|cevap\s+[A-E]\b/i);
    }
  });

  it("şık seçmeden düğmeye basınca başlıklı ipucu açılır", () => {
    render(<InteractiveShowcase segmentId="lise" onPickSegment={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Şimdi kendini dene/ }));
    fireEvent.click(screen.getByRole("button", { name: /İki şık arasında kaldım/ }));
    const hint = screen.getByRole("status");
    expect(hint.textContent).toContain(twoOptionHeading(SHOWCASE.lise.question));
    expect(hint.textContent).toContain(SHOWCASE.lise.question.twoOption.hint);
  });
});
