// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ReelSceneRenderer, VisualSceneRenderer } from "@/components/learning/visual-scenes";
import { LAW_COLORS, LEAF_FILL_OPACITY, TONE_TEXT, lawSpine, layoutLawDecision, sharedMajority } from "@/components/learning/visual-scenes/LawDecisionScene";
import { TRAP_COLORS, layoutExamTrap } from "@/components/learning/visual-scenes/ExamTrapScene";
import { TourPlusPreview } from "@/components/landing/tour/plus-previews";
import { HUKUK_LESSON, HUKUK_QUIZ, HUKUK_SKETCH, HUKUK_TRUE_FALSE } from "@/lib/demo/guest-tracks/hukuk";
import { VIDEO_PORTRAIT_FONT_FLOOR, layoutIssues, sceneFrame, type Rect, type SceneChrome, type SceneMode, type TextBox } from "@/lib/learning/visual-scenes/layout";
import { lawTreeDepth, lawTreeOf, parseReelVisual, parseVisualScene, type LawDecisionData, type ReelTrap } from "@/lib/learning/visual-scenes/schema";
import { JOURNEY_PLUS_PLAY } from "@/lib/marketing/landing-journey";

/*
  Faz 9 (20 Kasım 2026, canlı misafir denetimi): misafir turunun KPSS / Hukuk branşında, Plus adımındaki çizimli videonun
  1/2 sahnesi ("ANAYASA · KARAR AKIŞI") soluk ve ortası boştu. İki kök neden:
  (1) Büyüt / Küçült sahneyi başka kaba taşıyınca CSS çizim animasyonu baştan başlıyordu; duraklatılmış önizlemede ilk
      karede donup büyütülen sahneyi boş bırakıyordu (bütün branşlar, iki sahne).
  (2) Dikey videoda üç kademeli ağaç girintiyle daralıp sonuçları kesiyor ("Yayım ya da halk…"), barometre tek satıra
      düşüyordu. Ağaç artık merdiven (usul akışı), barometre 600 sandalyelik tek ölçek (200 / 360 / 400, örnek oylama 380).
*/

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mainScene(): LawDecisionData {
  const visual = parseReelVisual(HUKUK_SKETCH.scenes[0]!.visual, HUKUK_SKETCH.scenes[0]!.beat);
  if (visual?.kind !== "archetype" || visual.scene.archetype !== "LAW_SOCIAL_FLOWCHART") throw new Error("hukuk sahnesi bekleniyordu");
  return visual.scene;
}

function trapScene(): ReelTrap {
  const visual = parseReelVisual(HUKUK_SKETCH.scenes[1]!.visual, HUKUK_SKETCH.scenes[1]!.beat);
  if (visual?.kind !== "exam_trap") throw new Error("tuzak sahnesi bekleniyordu");
  return visual;
}

/* ───────── WCAG kontrastı ───────── */

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** `fg` rengin `alpha` opaklıkla `bg` üstünde görünen hâli. */
function blend(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg);
  const b = rgb(bg);
  return `#${f.map((channel, at) => Math.round(channel * alpha + b[at]! * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

const TONE_STROKE = { positive: LAW_COLORS.yes, negative: LAW_COLORS.no, neutral: LAW_COLORS.branch } as const;

const inside = (box: TextBox, rect: Rect) => {
  const cx = box.rect.x + box.rect.w / 2;
  const cy = box.rect.y + box.rect.h / 2;
  return cx > rect.x && cx < rect.x + rect.w && cy > rect.y && cy < rect.y + rect.h;
};

describe("hukuk sahnesinin verisi: TBMM 600 üye, eşikler dersle aynı", () => {
  it("barometre: 1/3 = 200, 3/5 = 360, 2/3 = 400 (600 üyeden); örnek oylama 380 → 360 geçilir, 400 geçilmez", () => {
    const data = mainScene();
    const rows = Object.fromEntries(data.majority.map((row) => [row.fraction, row]));
    expect(rows["1/3"]).toMatchObject({ count: 200, total: 600 });
    expect(rows["3/5"]).toMatchObject({ count: 360, total: 600, actual: 380 });
    expect(rows["2/3"]).toMatchObject({ count: 400, total: 600, actual: 380 });
    expect(rows["1/3"]!.actual).toBeUndefined();
    // Kesirler sayıyla tutarlı.
    for (const row of data.majority) {
      const [num, den] = row.fraction.split("/").map(Number);
      expect(Math.ceil((row.total! * num!) / den!), row.fraction).toBe(row.count);
    }
    expect(sharedMajority(data.majority)).toEqual({ total: 600, actual: 380 });
  });

  it("karar ağacı merdiven: teklif (200, 1/3) → gizli oyla kabul (360, 3/5) → 360–399 halkoyu, 400 ve üstü yayım ya da halkoyu", () => {
    const data = mainScene();
    const root = lawTreeOf(data)!;
    expect(lawTreeDepth(root)).toBe(3);
    const steps = lawSpine(root)!;
    expect(steps).toHaveLength(3);
    expect(steps[0]!.node.text).toMatch(/200 \(1\/3\)/);
    expect(steps[1]!.node.text).toMatch(/360 \(3\/5\)/);
    expect(steps.slice(0, 2).map((step) => step.next?.label)).toEqual(["EVET", "EVET"]);
    expect(steps.slice(0, 2).map((step) => step.exits.map((exit) => [exit.label, exit.node.tone]))).toEqual([[["HAYIR", "negative"]], [["HAYIR", "negative"]]]);
    const last = steps[2]!;
    expect(last.next).toBeNull();
    expect(last.exits.map((exit) => exit.label)).toEqual(["360–399 OY", "400 VE ÜSTÜ"]);
    // Halkoyu bir ret değildir: iki kabul yolu da olumlu sonuç.
    expect(last.exits.map((exit) => exit.node.tone)).toEqual(["positive", "positive"]);
    expect(last.exits.map((exit) => exit.node.text)).toEqual(["Halkoyuna sunulur", "Yayım ya da halkoyu"]);
  });

  it("sayılar dersin, konu testinin ve doğru/yanlışın sayılarıyla aynı", () => {
    const corpus = JSON.stringify([HUKUK_LESSON, HUKUK_QUIZ, HUKUK_TRUE_FALSE]);
    for (const count of [200, 360, 400, 600]) expect(corpus, String(count)).toContain(String(count));
    expect(corpus).toContain("üçte bir");
    expect(corpus).toContain("beşte üç");
    expect(corpus).toContain("üçte iki");
    // Konu testinin açıklaması: 2/3 ile kabul edilen değişikliği Cumhurbaşkanı yayımlar ya da halkoyuna sunar.
    expect(HUKUK_QUIZ[0]!.optionWhy![4]).toMatch(/üçte ikisidir; .*yayımlar ya da halkoyuna sunar/);
  });
});

describe("sahne çizimi: merdiven ağaç ve sandalye ölçeği", () => {
  const FRAMES: [SceneMode, SceneChrome][] = [
    ["9:16", "video"],
    ["9:16", "lesson"],
    ["16:9", "lesson"],
    ["16:9", "video"],
  ];

  it("her oranda: merdiven + ölçek, kesik yazı yok, taşma/çakışma yok; dikey videoda her yazı ≥ 13,5", () => {
    const data = mainScene();
    for (const [mode, chrome] of FRAMES) {
      const layout = layoutLawDecision(data, sceneFrame(mode, chrome, data.pedagogicalLevel), "constitution");
      const label = `${mode} ${chrome}`;
      expect(layout.tree.mode, label).toBe("ladder");
      expect(layout.majority?.kind, label).toBe("meter");
      expect(layout.texts.filter((box) => box.truncated).map((box) => box.id), label).toEqual([]);
      expect(layoutIssues(layout), label).toEqual([]);
      expect(Math.min(...layout.texts.map((box) => box.fontSize)), label).toBeGreaterThanOrEqual(layout.frame.text.floor);
      if (layout.majority?.kind !== "meter") continue;
      // Üç eşik de etiketli; 3/5 geçildi, 2/3 geçilmedi, teklif nötr.
      expect(layout.majority.ticks.map((tick) => [tick.count, tick.pass]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
        [200, null],
        [360, true],
        [400, false],
      ]);
      expect(layout.majority.blocks.filter((block) => block.filled)).toHaveLength(38);
      expect(layout.majority.blocks).toHaveLength(60);
      // Çentik eşiğin sandalye konumunda.
      for (const tick of layout.majority.ticks) {
        expect(tick.x).toBeCloseTo(layout.majority.bar.x + (layout.majority.bar.w * tick.count) / 600, 5);
      }
    }
    const video = layoutLawDecision(data, sceneFrame("9:16", "video", data.pedagogicalLevel), "constitution");
    expect(Math.min(...video.texts.map((box) => box.fontSize))).toBeGreaterThanOrEqual(VIDEO_PORTRAIT_FONT_FLOOR);
  });

  it("dikey videoda orta boş kalmaz: ağaç ve ölçek içerik alanının en az %85'ini doldurur", () => {
    const data = mainScene();
    const frame = sceneFrame("9:16", "video", data.pedagogicalLevel);
    const layout = layoutLawDecision(data, frame, "constitution");
    const title = layout.texts.find((box) => box.id === "title")!;
    const top = title.rect.y + title.rect.h;
    const bottom = frame.content.y + frame.content.h;
    const used = layout.tree.height + (layout.majority?.height ?? 0);
    expect(used / (bottom - top)).toBeGreaterThan(0.85);
    const majorityBottom = Math.max(...layout.majority!.texts.map((box) => box.rect.y + box.rect.h));
    expect(bottom - majorityBottom).toBeLessThan(24);
  });

  it("SVG: ağaç ve barometre düğümleri (3 soru, 4 sonuç, 3 eşik çentiği, 60 sandalye bloğu, 38'i dolu)", () => {
    const data = mainScene();
    const { container } = render(<VisualSceneRenderer scene={data} mode="9:16" chrome="video" domain="constitution" animate="none" />);
    const tree = container.querySelector("[data-section='decision-tree']")!;
    expect(tree.getAttribute("data-tree-mode")).toBe("ladder");
    expect(tree.querySelectorAll("[data-node='question']")).toHaveLength(3);
    expect(tree.querySelectorAll("[data-node='leaf']")).toHaveLength(4);
    expect(tree.querySelectorAll("[data-arrow]").length).toBeGreaterThanOrEqual(6);
    const meter = container.querySelector("[data-majority='meter']")!;
    expect(meter.getAttribute("data-total")).toBe("600");
    expect(meter.getAttribute("data-actual")).toBe("380");
    const ticks = [...meter.querySelectorAll("[data-threshold]")];
    expect(ticks.map((tick) => [tick.getAttribute("data-count"), tick.getAttribute("data-pass")]).sort()).toEqual([
      ["200", null],
      ["360", "1"],
      ["400", "0"],
    ]);
    expect(meter.querySelectorAll("rect[data-filled]")).toHaveLength(38);
    expect(meter.querySelector("[data-seats]")!.getAttribute("data-seats")).toBe("60");
    const text = container.textContent ?? "";
    for (const part of ["ÇOĞUNLUK BAROMETRESİ", "380/600", "1/3 = 200", "3/5 = 360", "2/3 = 400", "Halkoyuna sunulur", "Yayım ya da halkoyu", "Teklif yapılamaz", "Reddedilir"]) {
      expect(text, part).toContain(part);
    }
    expect(text).not.toContain("…");
  });

  it("her yazı arka planına karşı WCAG AA (≥ 4,5:1): sahne zemini, soru kutusu, sonuç kartının renkli zemini, rozet", () => {
    const data = mainScene();
    for (const [mode, chrome] of FRAMES) {
      const frame = sceneFrame(mode, chrome, data.pedagogicalLevel);
      const layout = layoutLawDecision(data, frame, "constitution");
      const { container } = render(<VisualSceneRenderer scene={data} mode={mode} chrome={chrome} domain="constitution" animate="none" />);
      const boxes = new Map(layout.texts.map((box) => [box.id, box]));
      const texts = [...container.querySelectorAll("text[data-text-id]")];
      expect(texts.length).toBe(layout.texts.length);
      const low: string[] = [];
      for (const node of texts) {
        const id = node.getAttribute("data-text-id")!;
        const box = boxes.get(id)!;
        const fill = node.getAttribute("fill")!;
        const leaf = layout.tree.nodes.find((item) => item.leaf && inside(box, item.rect));
        const question = layout.tree.nodes.find((item) => !item.leaf && inside(box, item.rect));
        const background =
          id === "badge"
            ? blend(LAW_COLORS.question, LAW_COLORS.bg, 0.18)
            : leaf
              ? blend(TONE_STROKE[leaf.tone], LAW_COLORS.bg, LEAF_FILL_OPACITY)
              : question
                ? LAW_COLORS.panel
                : LAW_COLORS.bg;
        const ratio = contrast(fill, background);
        if (ratio < 4.5) low.push(`${mode} ${chrome} ${id} ${fill} / ${background} = ${ratio.toFixed(2)}`);
      }
      // Soru simgesindeki "?" (zemin renginde, mor dairenin üstünde).
      expect(contrast(LAW_COLORS.bg, LAW_COLORS.question)).toBeGreaterThanOrEqual(4.5);
      expect(low).toEqual([]);
      cleanup();
    }
    // Kırmızı yazı açık tonda: koyu kırmızı, kırmızı kartın zemininde AA'nın altında kalıyordu.
    const redChip = blend(LAW_COLORS.no, LAW_COLORS.bg, LEAF_FILL_OPACITY);
    expect(contrast(LAW_COLORS.no, redChip)).toBeLessThan(4.5);
    expect(contrast(TONE_TEXT.negative, redChip)).toBeGreaterThanOrEqual(4.5);
  });

  it("2/2 sahnesi (sınav tuzağı): her yazı kendi panelinin zemininde AA", () => {
    const trap = trapScene();
    const layout = layoutExamTrap(trap, sceneFrame("9:16", "video"));
    const { container } = render(<ReelSceneRenderer visual={trap} mode="9:16" domain="constitution" animate="none" />);
    const backgrounds: Record<string, string> = {
      warning: blend(TRAP_COLORS.wrong, TRAP_COLORS.bg, 0.18),
      title: TRAP_COLORS.bg,
      "wrong-kicker": TRAP_COLORS.panelWrong,
      "wrong-body": TRAP_COLORS.panelWrong,
      "right-kicker": TRAP_COLORS.panelRight,
      "right-body": TRAP_COLORS.panelRight,
      "tell-kicker": blend(TRAP_COLORS.tell, TRAP_COLORS.bg, 0.12),
      "tell-text": blend(TRAP_COLORS.tell, TRAP_COLORS.bg, 0.12),
    };
    const nodes = [...container.querySelectorAll("text[data-text-id]")];
    expect(nodes.map((node) => node.getAttribute("data-text-id")).sort()).toEqual(layout.texts.map((box) => box.id).sort());
    for (const node of nodes) {
      const id = node.getAttribute("data-text-id")!;
      expect(contrast(node.getAttribute("fill")!, backgrounds[id]!), id).toBeGreaterThanOrEqual(4.5);
    }
    expect(layout.texts.some((box) => box.truncated)).toBe(false);
  });
});

describe("ortak ölçek veriden seçilir; ürün derslerinin öbür biçimleri aynen", () => {
  const base = { label: "Eşik", fraction: "2/3", count: 40, total: 60 };

  it("aynı toplam ve tek gerçekleşen → tek ölçek; farklı gerçekleşen, farklı toplam ya da tek satır → satırlar", () => {
    expect(sharedMajority([base, { ...base, fraction: "1/2", count: 30 }])).toEqual({ total: 60, actual: null });
    expect(sharedMajority([{ ...base, actual: 45 }, { ...base, fraction: "1/2", count: 30, actual: 45 }])).toEqual({ total: 60, actual: 45 });
    expect(sharedMajority([{ ...base, actual: 45 }, { ...base, fraction: "1/2", count: 30, actual: 50 }])).toBeNull();
    expect(sharedMajority([base, { ...base, total: 80 }])).toBeNull();
    expect(sharedMajority([base])).toBeNull();
    expect(sharedMajority([{ ...base, actual: 70 }, base])).toBeNull();
  });

  it("gerçekleşenleri farklı satırlar (oy ve katılım) satır satır kalır; tek kararlı ağaç katmanlı kalır", () => {
    const deep = parseVisualScene({
      archetype: "LAW_SOCIAL_FLOWCHART",
      title: "Üç kademeli karar",
      nodes: [
        { id: "q1", text: "Birinci şart sağlandı mı?", yes: "q2", no: "Başvuru reddedilir" },
        { id: "q2", text: "İkinci şart sağlandı mı?", yes: "q3", no: "Eksik tamamlanır" },
        { id: "q3", text: "Süre içinde mi?", yes: "İşlem geçerli", no: "Hak düşer" },
      ],
      majority: [
        { label: "Gerekli oy", fraction: "2/3", count: 400, total: 600, actual: 380 },
        { label: "Toplantı yeter sayısı", fraction: "1/3", count: 200, total: 600, actual: 450 },
      ],
    }) as LawDecisionData;
    const layout = layoutLawDecision(deep, sceneFrame("16:9", "lesson"));
    expect(layout.majority?.kind).toBe("rows");
    expect(layout.tree.mode).toBe("ladder");
    const single = parseVisualScene({
      archetype: "LAW_SOCIAL_FLOWCHART",
      title: "Tek şart",
      decision: { question: "Şart sağlandı mı?", yes: "Geçerli", no: "Geçersiz" },
    }) as LawDecisionData;
    expect(lawSpine(lawTreeOf(single))).toBeNull();
    expect(layoutLawDecision(single, sceneFrame("16:9", "lesson")).tree.mode).toBe("tidy");
  });
});

describe("Büyüt / Küçült: taşınan sahne tam çizilmiş açılır", () => {
  it("duraklatılmış önizlemede büyütülen ve küçültülen sahne animasyonsuz (boş kalmaz); sıradaki sahne yine çizilerek gelir", () => {
    vi.useFakeTimers();
    render(<TourPlusPreview preview="video" track="hukuk" />);
    const slotSvg = () => document.querySelector(".tpp-video-slot svg[data-archetype]")!;
    expect(slotSvg().getAttribute("data-archetype")).toBe("LAW_SOCIAL_FLOWCHART");
    expect(slotSvg().classList.contains("is-animated")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.pause }));
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.enlarge }));
    const dialog = screen.getByRole("dialog");
    const enlarged = dialog.querySelector("svg[data-archetype]")!;
    // Eskiden: is-animated + is-paused → çizgiler ve yazılar ilk karede (opaklık 0) donuyordu.
    expect(enlarged.classList.contains("is-static")).toBe(true);
    expect(enlarged.classList.contains("is-animated")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.shrink }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slotSvg().classList.contains("is-static")).toBe(true);
    // Oynatınca sıradaki sahne (sınav tuzağı) çizilerek gelir.
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.video }));
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText("Sahne 2/2")).toBeTruthy();
    expect(slotSvg().getAttribute("data-archetype")).toBe("REEL_EXAM_TRAP");
    expect(slotSvg().classList.contains("is-animated")).toBe(true);
  });

  it("oynarken büyütülen sahne de tam çizilmiş açılır; Esc kapatır ve odak Büyüt düğmesine döner", () => {
    vi.useFakeTimers();
    render(<TourPlusPreview preview="video" track="muhendislik" />);
    const button = screen.getByRole("button", { name: JOURNEY_PLUS_PLAY.enlarge });
    fireEvent.click(button);
    const enlarged = screen.getByRole("dialog").querySelector("svg[data-archetype]")!;
    expect(enlarged.classList.contains("is-static")).toBe(true);
    // Saat ilerlerken pencere açık kalır, odak kapatma düğmesinde durur (her çizimde arkadaki düğmeye gitmez).
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(document.activeElement?.textContent).toContain(JOURNEY_PLUS_PLAY.shrink);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
