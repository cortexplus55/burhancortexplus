// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LaneProgress, laneSummary, type Lane } from "@/components/arena/lane-progress";
import { TimerRing, timerAnnouncement } from "@/components/arena/timer-ring";
import { ComboChip } from "@/components/arena/combo-chip";
import { LaunchSequence } from "@/components/arena/launch-sequence";
import { RESULT_MAX_MS, ResultReveal } from "@/components/arena/result-reveal";
import { SquareStrip, squareSummary } from "@/components/arena/square-strip";
import { ShareSheet, canShareFiles } from "@/components/arena/share-sheet";
import { DEFAULT_FEEDBACK_PREFS, readFeedbackPrefs } from "@/components/arena/feedback-prefs";

/*
  Faz 4A: heyecan kiti bileşenleri (görünür değişiklik yok; hiçbir ekran çağırmaz). Her bileşen birim; bot rozeti tip
  düzeyinde; paylaşım kabuğunu Faz 10'a kadar hiçbir ekran çağırmaz; ses/titreşim varsayılan kapalı.
*/

let reduced = false;
vi.mock("framer-motion", async (original) => ({ ...(await original<typeof import("framer-motion")>()), useReducedMotion: () => reduced }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  reduced = false;
});

describe("LaneProgress", () => {
  const lanes: Lane[] = [
    { id: "sen", label: "Sen", value: 6, max: 10, tone: "you" },
    { id: "atlas", label: "Atlas", value: 5, max: 10, tone: "bot", badge: "BOT" },
  ];
  it("tek özet: 'Sen 6, Atlas 5'; bot rozeti görünür", () => {
    render(<LaneProgress lanes={lanes} />);
    expect(screen.getByRole("img", { name: "Sen 6, Atlas 5" })).toBeTruthy();
    expect(screen.getByText("BOT")).toBeTruthy();
    expect(laneSummary(lanes)).toBe("Sen 6, Atlas 5");
  });
  it("tek şerit modu", () => {
    render(<LaneProgress single lanes={lanes} />);
    expect(screen.getByRole("img", { name: "Sen 6" })).toBeTruthy();
  });
  it("tip: rozetsiz bot şeridi derlenmez", () => {
    // @ts-expect-error bot şeridinde badge: "BOT" zorunlu
    const wrong: Lane = { id: "b", label: "Atlas", value: 1, max: 2, tone: "bot" };
    expect(wrong.tone).toBe("bot");
  });
});

describe("TimerRing", () => {
  it("role=timer, sürekli okuma yok; yalnız 10 ve 5 sn'de bir kez duyurur", () => {
    const { rerender } = render(<TimerRing total={20} remaining={12} />);
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("aria-live")).toBe("off");
    rerender(<TimerRing total={20} remaining={10} />);
    expect(screen.getByText("10 saniye kaldı")).toBeTruthy();
    rerender(<TimerRing total={20} remaining={9} />);
    expect(screen.getByText("10 saniye kaldı")).toBeTruthy();
    rerender(<TimerRing total={20} remaining={5} />);
    expect(screen.getByText("5 saniye kaldı")).toBeTruthy();
    expect(timer.hasAttribute("data-warn")).toBe(true);
    expect(timerAnnouncement(4, new Set([10, 5]))).toBeNull();
    expect(timerAnnouncement(7, new Set())).toBe(10);
  });
});

describe("ComboChip", () => {
  it("2'den başlar: ×2 ve ekran okuyucuya '2 seri'", () => {
    const { container, rerender } = render(<ComboChip combo={1} />);
    expect(container.textContent).toBe("");
    rerender(<ComboChip combo={2} />);
    expect(screen.getByText("×2")).toBeTruthy();
    expect(screen.getByText("2 seri").className).toContain("sr-only");
  });
});

describe("LaunchSequence", () => {
  it("hazırlanırken geri sayım yok, Atla yok; hazırken Atla; geri sayım 3 sn sonra bitirir", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { rerender } = render(<LaunchSequence phase="preparing" slots={["Sorular", "Rakip"]} progress={0.5} onDone={onDone} onSkip={onDone} />);
    expect(screen.queryByText("Atla")).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
    rerender(<LaunchSequence phase="ready" slots={["Sorular", "Rakip"]} progress={1} onDone={onDone} onSkip={onDone} />);
    expect(screen.getByRole("button", { name: "Atla" })).toBeTruthy();
    rerender(<LaunchSequence phase="countdown" slots={["Sorular", "Rakip"]} progress={1} onDone={onDone} />);
    expect(screen.getByText("3")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("hareket azaltmada düz adımlar ve doğrudan bitiş", () => {
    reduced = true;
    const onDone = vi.fn();
    render(<LaunchSequence phase="countdown" slots={["Sorular"]} progress={1} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("3")).toBeNull();
    expect(screen.getByText("Sorular")).toBeTruthy();
  });
});

describe("ResultReveal", () => {
  it("en çok 1 sn; ekran okuyucu yalnız son değer; hareket azaltmada doğrudan son değer", () => {
    expect(RESULT_MAX_MS).toBe(1000);
    reduced = true;
    render(<ResultReveal from={0} value={7} duration={5000} />);
    expect(screen.getAllByText("7")).toHaveLength(2);
  });
});

describe("SquareStrip", () => {
  it("şekil + glif; özet '7 doğru, 3 yanlış'", () => {
    const items = [...Array(6).fill({ state: "correct" }), { state: "double" }, ...Array(3).fill({ state: "wrong" })];
    render(<SquareStrip items={items} />);
    expect(screen.getByRole("img", { name: "7 doğru, 3 yanlış" })).toBeTruthy();
    expect(squareSummary([{ state: "skipped" }])).toBe("0 doğru, 0 yanlış, 1 boş");
    expect(screen.getAllByText("✕")).toHaveLength(3);
    expect(screen.getByText("×2")).toBeTruthy();
  });
});

describe("ShareSheet", () => {
  it("ad ve soru varsayılan KAPALI; dosya paylaşılamıyorsa indirilir; bağlantı kopyalanır", async () => {
    const getFiles = vi.fn(async () => [new File(["x"], "kart.png", { type: "image/png" })]);
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareSheet formats={["story", "link"]} url="https://cortexplus.app/d/K7QX2ABC" getFiles={getFiles} />);
    const [name, question] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(name!.checked).toBe(false);
    expect(question!.checked).toBe(false);
    expect(canShareFiles([])).toBe(false);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Hikâye" })));
    expect(getFiles).toHaveBeenCalledWith("story", { showName: false, showQuestion: false });
    expect(URL.createObjectURL).toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Bağlantı" })));
    expect(writeText).toHaveBeenCalledWith("https://cortexplus.app/d/K7QX2ABC");
  });

  it("bekçi: Faz 10'a kadar hiçbir ekran heyecan kitini çağırmaz (yalnız galeri)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(name)) files.push(full.replace(/\\/g, "/"));
      }
    };
    walk("src");
    const users = files.filter((f) => !f.startsWith("src/components/arena/") && /@\/components\/arena\//.test(readFileSync(f, "utf8")));
    expect(users).toEqual(["src/app/(dev)/arena/gallery.tsx"]);
  });
});

describe("useFeedbackPrefs", () => {
  it("varsayılan KAPALI; bozuk kayıt varsayılana düşer", () => {
    expect(DEFAULT_FEEDBACK_PREFS).toEqual({ sound: false, haptics: false });
    window.localStorage.setItem("cx-feedback-prefs", "{bozuk");
    expect(readFeedbackPrefs()).toEqual({ sound: false, haptics: false });
    window.localStorage.setItem("cx-feedback-prefs", JSON.stringify({ sound: true }));
    expect(readFeedbackPrefs()).toEqual({ sound: true, haptics: false });
  });
  it("ses dosyası yok", () => {
    const audio = readdirSync("public", { recursive: true }).map(String).filter((f) => /\.(mp3|wav|ogg)$/i.test(f) && /arena|feedback|combo/i.test(f));
    expect(audio).toEqual([]);
  });
});
