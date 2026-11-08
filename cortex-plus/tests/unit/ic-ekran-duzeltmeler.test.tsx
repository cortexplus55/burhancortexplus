// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PrepRadarChart } from "@/components/parity/prep-radar-chart";
import { StudioHero } from "@/components/learning/studio/studio-shared";

/*
  8 Kasım 2026, iç ekranlar canlıda tek tek gezildi; bulunan beş kusur:
  1) Kayıtlı sohbet açılınca son satır (devam önerileri) yazma alanının arkasında kalıyordu.
  2) İlerleme'nin beşgeninde "Tempo & Düzen" solda kesiliyordu.
  3) Stüdyo sayfalarında altın ışık ve boş kutu gibi görünen CSS çizimi; renkler kartlarla uyuşmuyordu.
  4) Yanlışlar Defteri'nde altın birincil düğme ve "quiz".
  5) Cevabı gelmemiş son soru: tekrar sorma yolu yoktu.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

describe("1) sohbet sona iner ve orada kalır", () => {
  const chat = read("src/components/chat/chat-panel.tsx");
  const shell = read("src/styles/parity-shell.css");

  it("açık sohbette kabuk sabit yükseklikte, kayan yalnız mesaj kutusu", () => {
    expect(shell).toContain(".cp-sor-root:not(.cp-sor-root--exam):has(.cp-sor-view > .cp-sor-messages) {");
  });

  it("sona kaydırma kutunun kendisinde; içerik büyüdükçe (formül, öneri satırı) sona yapışık kalır", () => {
    expect(chat).toContain("box.scrollTo({ top: box.scrollHeight, behavior });");
    expect(chat).not.toMatch(/messagesEndRef\.current\?\.scrollIntoView\(\{\n\s*behavior: window\.matchMedia/);
    expect(chat).toContain("new MutationObserver(pin)");
    expect(chat).toContain("stickToEndRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;");
    // İlk ölçümde alt boşluk büyür: sohbet yeniden sona iner.
    expect(chat).toContain("if (firstMeasure) requestAnimationFrame(() => scrollThreadToEndRef.current(false));");
  });
});

describe("2) beşgen etiketleri kutuya sığar", () => {
  it("yan etiketler dışa hizalı, kutu iki yana genişler", () => {
    const { container } = render(
      <PrepRadarChart
        view={{
          label: "x",
          readinessPct: 0,
          targetScore: 95,
          axes: [
            { id: "coverage", label: "Konu Kapsamı", pct: 0 },
            { id: "accuracy", label: "Test Doğruluğu", pct: 0 },
            { id: "mock", label: "Deneme Performansı", pct: 0 },
            { id: "retention", label: "Tekrar & Kalıcılık", pct: 0 },
            { id: "tempo", label: "Tempo & Düzen", pct: 0 },
          ],
        }}
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("-104 0 488 280");
    const anchors = [...container.querySelectorAll(".cp-radar-num")].map((node) => node.getAttribute("text-anchor"));
    expect(anchors).toEqual(["middle", "start", "start", "end", "end"]);
  });
});

describe("3) stüdyo sayfası kartıyla aynı dilde", () => {
  it("başta kartın 3B simgesi, adı ve tek cümlesi; eski CSS çizimi ve tırnaklı yazı yüklemesi yok", () => {
    render(<StudioHero tool="quiz" />);
    expect(screen.getByText("Konu Testi")).toBeTruthy();
    const css = read("src/styles/learning-studio.css");
    expect(css).not.toContain(".ls-world");
    expect(css).not.toContain("DM+Serif");
    expect(css).toContain(".ls-studio--quiz { --ls-accent: #9b6bff; }");
    expect(css).toContain(".ls-studio--anlat { --ls-accent: #c46bff; }");
    expect(css).not.toMatch(/--ls-accent: #f4ae0b/);
  });

  it("geri bağlantısı Çalışma Stüdyosu'na; birincil düğmeler altın değil, stüdyonun rengi", () => {
    const shared = read("src/components/learning/studio/studio-shared.tsx");
    expect(shared).toContain('<Link href="/araclar" className="ls-back">');
    for (const file of [
      "src/components/learning/studio/quiz-studio.tsx",
      "src/components/learning/studio/explain-studio.tsx",
      "src/components/learning/flashcard-deck.tsx",
      "src/components/learning/quiz-runner.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/bg-amber-500 px-5|bg-amber-400 transition-\[width\]|"w-4 bg-amber-400"/);
    }
  });
});

describe("4) Yanlışlar Defteri", () => {
  it("birincil düğme mavi ve Türkçe", () => {
    const view = read("src/components/parity/mistake-notebook-view.tsx");
    expect(view).toContain("İlk testini çöz");
    expect(view).not.toMatch(/quiz(ini|de)\b|Quiz çöz/);
    expect(view).toContain("bg-[var(--c-action)]");
  });
});

describe("5) cevapsız son soru", () => {
  it("son mesaj öğrencinin sorusuysa 'Tekrar sor' çıkar ve son soruyu yeniden sorar", () => {
    const chat = read("src/components/chat/chat-panel.tsx");
    expect(chat).toContain('messages[messages.length - 1]?.role === "user" ? (');
    expect(chat).toMatch(/<div className="cp-sor-unanswered" role="status">[\s\S]*?onClick=\{regenerateLast\}/);
  });
});
