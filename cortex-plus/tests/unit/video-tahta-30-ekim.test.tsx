// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoLessonPlayer } from "@/components/parity/video-lesson";
import { formulaStepHtml, renderMath, textifyFormulaWords } from "@/lib/learning/math-text";
import { SKETCH_TARGET_WORDS, SKETCH_TOTAL_WORDS, sketchSystem } from "@/lib/learning/video-lesson";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** KaTeX çıktısının okunan metni (görünmeyen MathML hariç). */
function visibleText(html: string): string {
  const host = document.createElement("div");
  host.innerHTML = html;
  host.querySelectorAll(".katex-mathml").forEach((node) => node.remove());
  return (host.textContent ?? "").replace(/ /g, " ");
}

describe("çizimli video tahtası (30 Ekim 2026, canlı tur)", () => {
  it("TeX'siz adım düz yazıyla çizilir: boşluk ve ü korunur", () => {
    const step = "Genel fiyat düzeyi ↑ sürekli ve belirgin";
    const html = formulaStepHtml(step);
    expect(html).not.toContain("katex");
    expect(visibleText(html)).toBe(step);
    expect(formulaStepHtml("a < b")).toContain("a &lt; b");
  });

  it("TeX taşıyan adımda kelimeler metin olur, formül KaTeX'te kalır", () => {
    expect(textifyFormulaWords("Genel fiyat düzeyi ↑ sürekli ve belirgin")).toBe(
      "\\text{Genel fiyat düzeyi} ↑ \\text{sürekli ve belirgin}",
    );
    const html = formulaStepHtml("Hız = \\frac{Yol}{Zaman}");
    expect(html).toContain("katex");
    // KaTeX kesirde paydayı DOM'da önce yazar; sıra değil, kelimelerin bütün kalması önemli.
    for (const word of ["Hız", "Yol", "Zaman"]) expect(visibleText(html)).toContain(word);
    expect(visibleText(renderMath(textifyFormulaWords("Genel fiyat düzeyi = M"), true))).toContain("Genel fiyat d");
  });

  it("değişken, komut ve işlev adları matematik kalır", () => {
    expect(textifyFormulaWords("MV = PY")).toBe("MV = PY");
    expect(textifyFormulaWords("F_1 d_1 = F_2 d_2")).toBe("F_1 d_1 = F_2 d_2");
    expect(textifyFormulaWords("\\frac{a}{b} \\cdot x")).toBe("\\frac{a}{b} \\cdot x");
    expect(textifyFormulaWords("sin x + log y")).toBe("sin x + log y");
    expect(textifyFormulaWords("\\text{Hız} = v")).toBe("\\text{Hız} = v");
  });

  it("metnin yanındaki sayı ve değişkenle arası açık kalır", () => {
    expect(textifyFormulaWords("Deflasyon: fiyatlar ↓")).toBe("\\text{Deflasyon}: \\text{fiyatlar} ↓");
    expect(textifyFormulaWords("toplam 5 adet")).toBe("\\text{toplam}\\  5 \\ \\text{adet}");
    expect(textifyFormulaWords("Enerji mc^2")).toBe("\\text{Enerji}\\ mc^2");
    expect(textifyFormulaWords("\\frac{Kütle}{Hacim}")).toBe("\\frac{\\text{Kütle}}{\\text{Hacim}}");
  });

  it("şema kuralları şemanın kendi dosyasında: videoda da yüklenir", () => {
    expect(read("src/components/parity/diagram-card.tsx")).toContain('import "@/styles/diagram-card.css"');
    const css = read("src/styles/diagram-card.css");
    expect(css).toMatch(/\.als-diagram-stage \{[\s\S]*position: relative/);
    expect(css).toMatch(/\.als-diagram-label \{[\s\S]*position: absolute/);
    expect(read("src/styles/exam-lesson-steps.css")).not.toMatch(/\.als-diagram-label \{/);
  });

  it("çizimli sahnede kilit bilgi tahtanın akışında, üst katmanda değil", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(
      <VideoLessonPlayer
        prepId="prep-1"
        videoId="video-1"
        title="Enflasyon"
        topicLabel="Enflasyon"
        styleLabel="1 Dk Çizimli Video"
        completed={false}
        scenes={[
          {
            narration: "Yüksek işsizlik ve enflasyon birlikte görülür.",
            durationMs: 4000,
            imageUrl: "",
            audioUrl: "/a.mp3",
            sceneTitle: "Stagflasyon",
            keyFact: "Yüksek işsizlik ve enflasyon birlikte",
            formula: "Durgunluk + enflasyon",
            diagram: {
              diagramKind: "process_network",
              title: "Birlikte görülen durumlar",
              items: [
                { label: "Durgunluk", value: "" },
                { label: "Enflasyon", value: "" },
                { label: "Stagflasyon", value: "", highlight: true },
              ],
            },
          },
        ]}
      />,
    );
    const facts = container.querySelectorAll(".cp-video-fact");
    expect(facts).toHaveLength(1);
    expect(facts[0].closest(".cp-video-board-body")).toBeTruthy();
    expect(container.querySelector(".cp-sketch-formula")?.textContent).toBe("Durgunluk + enflasyon");
    const css = read("src/styles/video-lesson.css");
    expect(css).toMatch(/\.cp-video-board \{[\s\S]*container-type: size/);
    // Canlı ölçüm (639 px yüksek pencere): üst çubuk 137 px, formül satırları 0 yüksekliğe eziliyordu.
    expect(css).toMatch(/\.cp-video-board-body \{[\s\S]*padding: calc\(var\(--cp-top-h, 7\.2rem\) \+ 0\.35rem\)/);
    expect(css).toMatch(/\.cp-video-frame\.is-sketch \.cp-video-caption \{\s*bottom: 0\.6rem;/);
    // Canlı ölçüm 2: iki satıra sarılan formülle 19 rem payı alt yazıya 5 px biniyordu; taşma yukarı da gitmesin.
    expect(css).toMatch(/\.cp-video-board-body \{[\s\S]*justify-content: safe center;/);
    expect(css).toContain("- 21.5rem) * 600 / 220)");
    expect(css).toMatch(/\.cp-sketch-formulas \{\s*display: flex;\s*flex: none;/);
    expect(css).not.toMatch(/\.cp-sketch-formulas \{[^}]*max-height: 28%/);
    expect(container.querySelector(".cp-video-frame")?.className).toContain("is-sketch");
    expect(read("src/components/parity/video-lesson.tsx")).toContain('box.style.setProperty("--cp-top-h"');
  });
  it("yazar 1 dakikaya yakın yazar; bekleme sözü ölçülen süreyle", () => {
    // Seslendirme saniyede ~1,64 kelime: 92 kelime ≈ 56 sn. Denetim aralığı değişmez (yeni düzeltme turu açılmaz).
    expect(SKETCH_TARGET_WORDS.min).toBeGreaterThanOrEqual(90);
    expect(SKETCH_TARGET_WORDS.max).toBeLessThanOrEqual(SKETCH_TOTAL_WORDS.max);
    expect(SKETCH_TOTAL_WORDS.min).toBe(72);
    expect(sketchSystem("document")).toContain(`toplam ${SKETCH_TARGET_WORDS.min}-${SKETCH_TARGET_WORDS.max} kelime`);
    expect(sketchSystem("document")).toContain("Sözle yazılan kuralda KaTeX komutu kullanma");
    const player = read("src/components/parity/video-lesson.tsx");
    expect(player).toContain("Yaklaşık yarım dakika sürer.");
    expect(player).not.toContain("15–25 saniye");
  });
});
