// @vitest-environment jsdom
/**
 * Canlı Defter Modu (28 Kasım 2026): yol dersinde anlatım ve kapanış kelime kelime yazılır.
 *
 * - Metin önce dersin kendi ayrıştırıcısıyla bölünür; formül, kalın terim ve "==kilit==" tek parça açılır, ham "$" yok.
 * - 1× → 2× hız ilerlemeyi iki katına çıkarır; "Hepsini göster" anında tam açar, yerini "Tekrar oynat"a bırakır.
 * - Gece / Defter ve hız bu cihazda saklanır.
 * - Geri dönülen adım ve başlanmış ders tam açık gelir; `live` verilmeyen kullanımlar bugünkü gibi.
 * Animasyon kareleri elle ilerletilir (gerçek zaman beklenmez).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { LiveWords } from "@/components/parity/live-notebook/live-words";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import {
  LIVE_PREF_KEYS,
  liveAutoplay,
  liveRate,
  liveRevealedCount,
  liveStarts,
  parseLiveLook,
  parseLiveSpeed,
  splitLiveWords,
} from "@/lib/learning/live-writing";

const LESSON = sealLessonV3ForPlay({
  format: 3,
  title: "Köklü Sayılar",
  overview: "Kökün dışına çıkarma ve paydayı rasyonel yapma.",
  screens: [
    {
      heading: "Kök dışına çıkarma",
      concept: "Kök dışına çıkarma",
      lead: "Tam kare çarpan kökün dışına çıkar.",
      blocks: [
        {
          type: "text",
          text: "Kökün içindeki sayıyı bir **tam kare çarpan** ile başka bir çarpanın çarpımı olarak yaz. ==Tam kare çarpan kökün dışına çıkar==; geri kalan çarpan kökün içinde kalır: $\\sqrt{12} = 2\\sqrt{3}$. Aynı yol $\\sqrt{50} = 5\\sqrt{2}$ için de geçerlidir ve sadeleştirme tek adımda biter.",
        },
        { type: "formula", formula: { title: "Kök dışına çıkarma", expression: "$\\sqrt{a^2 \\cdot b} = a\\sqrt{b}$" } },
      ],
    },
    {
      heading: "Paydayı rasyonel yapma",
      concept: "Paydayı rasyonel yapma",
      lead: "Paydadaki kök eşleniğiyle çarpılarak kaldırılır.",
      blocks: [{ type: "text", text: "Pay ve payda aynı sayıyla çarpılır: $\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$. Payda iki terimliyse **eşlenik** kullanılır." }],
    },
  ],
  summary: ["Tam kare çarpan kökün dışına çıkar.", "Kök yalnız çarpıma dağılır.", "Paydadaki kök eşleniğiyle kaldırılır."],
} as unknown as LessonV3);

/** Animasyon karelerini elle ilerletir. */
function frames() {
  let queue: FrameRequestCallback[] = [];
  let id = 0;
  let now = 0;
  const raf = window.requestAnimationFrame;
  const caf = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => {
    queue.push(callback);
    id += 1;
    return id;
  };
  window.cancelAnimationFrame = () => {
    queue = [];
  };
  return {
    advance(ms: number) {
      act(() => {
        for (let elapsed = 0; elapsed < ms; elapsed += 16) {
          now += 16;
          const run = queue;
          queue = [];
          for (const callback of run) callback(now);
        }
      });
    },
    restore() {
      window.requestAnimationFrame = raf;
      window.cancelAnimationFrame = caf;
    },
  };
}

let clock: ReturnType<typeof frames>;

beforeEach(() => {
  window.localStorage.clear();
  clock = frames();
});

afterEach(() => {
  cleanup();
  clock.restore();
});

function renderLesson(options: { autoplay?: boolean; live?: boolean } = {}) {
  const autoplay = options.autoplay ?? true;
  return render(
    <ExamLessonSteps
      lesson={LESSON}
      closeHref="/x"
      plannedMinutes={5}
      brief={{ autoOpen: autoplay, levelLabel: "Temel", cramHref: "/kagit", cramLocked: false }}
      live={options.live === false ? null : { autoplay }}
    />,
  );
}

function scope(container: HTMLElement) {
  return container.querySelector(".als-step-content") as HTMLElement;
}

function startLesson() {
  fireEvent.click(screen.getByRole("button", { name: "Derse başla" }));
}

describe("saf yardımcılar", () => {
  it("kelime bölme metni değiştirmez; boşluk kelimenin sonunda kalır", () => {
    const text = "Kök  yalnız çarpıma dağılır. ";
    const words = splitLiveWords(text);
    expect(words.join("")).toBe(text);
    expect(words).toEqual(["Kök  ", "yalnız ", "çarpıma ", "dağılır. "]);
    expect(splitLiveWords("")).toEqual([]);
  });

  it("hız: 2× iki katı; uzun adım en çok 10 saniye sürer", () => {
    expect(liveRate(20, 2)).toBe(liveRate(20, 1) * 2);
    expect(400 / liveRate(400, 1)).toBeLessThanOrEqual(10);
    const starts = liveStarts([1, 2, 4, 1]);
    expect(starts).toEqual([0, 1, 3, 7]);
    expect(liveRevealedCount(starts, 0)).toBe(1);
    expect(liveRevealedCount(starts, 3)).toBe(3);
    expect(liveRevealedCount(starts, 100)).toBe(4);
  });

  it("kendiliğinden yazım yalnız ilk girişte, hareket azaltma kapalıyken", () => {
    const base = { typeable: true, autoplay: true, reducedMotion: false, visited: false };
    expect(liveAutoplay(base)).toBe(true);
    expect(liveAutoplay({ ...base, visited: true })).toBe(false);
    expect(liveAutoplay({ ...base, autoplay: false })).toBe(false);
    expect(liveAutoplay({ ...base, reducedMotion: true })).toBe(false);
    expect(liveAutoplay({ ...base, typeable: false })).toBe(false);
    expect(parseLiveLook("defter")).toBe("defter");
    expect(parseLiveLook("bilinmeyen")).toBe("gece");
    expect(parseLiveSpeed("2")).toBe(2);
    expect(parseLiveSpeed(null)).toBe(1);
  });
});

describe("formül ve vurgu tek parça", () => {
  it("canlı RichBody: düz metin kelime kelime; formül, kalın ve kilit bilgi tek parça; ham '$' yok", async () => {
    const text = "Bir **tam kare** ve ==kilit bilgi== ile $\\sqrt{12} = 2\\sqrt{3}$ birlikte.";
    const { container } = render(
      <p>
        <LiveWords>
          <RichBody text={text} />
        </LiveWords>
      </p>,
    );
    await waitFor(() => expect(container.querySelector(".lw-atom .katex")).not.toBeNull());
    expect(container.querySelectorAll(".lw-atom")).toHaveLength(1);
    expect(container.querySelectorAll("strong.lw-hl--term")).toHaveLength(1);
    expect(container.querySelector("strong.lw-hl--term")!.textContent).toBe("tam kare");
    expect(container.querySelectorAll("mark.lw-hl--key")).toHaveLength(1);
    expect(container.querySelector("mark.lw-hl--key")!.textContent).toBe("kilit bilgi");
    // Formülün içinde kelime parçası yok (bölünmedi).
    expect(container.querySelectorAll(".katex .lw")).toHaveLength(0);
    for (const word of Array.from(container.querySelectorAll(".lw:not(.lw-atom)"))) expect(word.textContent).not.toContain("$");
    // Canlı çıktı canlı olmayan çıktıyla aynı metni taşır.
    const plain = render(
      <p>
        <RichBody text={text} />
      </p>,
    );
    await waitFor(() => expect(plain.container.querySelector(".katex")).not.toBeNull());
    expect(container.textContent).toBe(plain.container.textContent);
    expect(plain.container.querySelector(".lw")).toBeNull();
  });

  it("derste formül bir birim, ham '$' hiç görünmez", async () => {
    const { container } = renderLesson();
    startLesson();
    const box = scope(container);
    await waitFor(() => expect(box.querySelector(".lw-atom .katex")).not.toBeNull());
    expect(box.querySelectorAll(".katex .lw")).toHaveLength(0);
    expect(box.querySelector(".als-body")!.textContent).not.toContain("$");
  });
});

describe("yazım, hız ve 'Hepsini göster'", () => {
  it("ilk girişte kelime kelime açılır; 2× aynı sürede iki kat ilerler", () => {
    const slow = renderLesson();
    startLesson();
    const box = scope(slow.container);
    expect(box.classList.contains("lw-playing")).toBe(true);
    clock.advance(400);
    const slowCount = box.querySelectorAll(".lw.is-in").length;
    const total = box.querySelectorAll(".lw").length;
    expect(slowCount).toBeGreaterThan(0);
    expect(slowCount).toBeLessThan(total);
    expect(slow.container.querySelector(".lw-pen.is-on")).not.toBeNull();
    cleanup();

    window.localStorage.setItem(LIVE_PREF_KEYS.speed, "2");
    const fast = renderLesson();
    startLesson();
    clock.advance(400);
    const fastCount = scope(fast.container).querySelectorAll(".lw.is-in").length;
    expect(fastCount).toBeGreaterThanOrEqual(slowCount * 1.6);
  });

  it("hız düğmesi 1× → 2×'e geçer ve tercihi saklar; yazım sürerken hızlanır", () => {
    const { container } = renderLesson();
    startLesson();
    clock.advance(160);
    const before = scope(container).querySelectorAll(".lw.is-in").length;
    clock.advance(320);
    const slowStep = scope(container).querySelectorAll(".lw.is-in").length - before;
    fireEvent.click(screen.getByRole("button", { name: /Yazım hızı 1 kat/ }));
    expect(window.localStorage.getItem(LIVE_PREF_KEYS.speed)).toBe("2");
    expect(screen.getByRole("button", { name: /Yazım hızı 2 kat/ })).toBeTruthy();
    const mid = scope(container).querySelectorAll(".lw.is-in").length;
    clock.advance(320);
    const fastStep = scope(container).querySelectorAll(".lw.is-in").length - mid;
    expect(fastStep).toBeGreaterThan(slowStep);
  });

  it("'Hepsini göster' anında tam açar ve yerini 'Tekrar oynat'a bırakır; tekrar baştan yazar", () => {
    const { container } = renderLesson();
    startLesson();
    clock.advance(100);
    fireEvent.click(screen.getByRole("button", { name: "Hepsini göster" }));
    const box = scope(container);
    expect(box.classList.contains("lw-playing")).toBe(false);
    expect(screen.queryByRole("button", { name: "Hepsini göster" })).toBeNull();
    expect(container.querySelector(".lw-pen.is-on")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar oynat" }));
    expect(box.classList.contains("lw-playing")).toBe(true);
    expect(box.querySelectorAll(".lw.is-in").length).toBeLessThan(box.querySelectorAll(".lw").length);
    expect(screen.getByRole("button", { name: "Hepsini göster" })).toBeTruthy();
  });

  it("yazım bitince hepsi açık, kalem kaybolur, 'Tekrar oynat' görünür", () => {
    const { container } = renderLesson();
    startLesson();
    clock.advance(15_000);
    const box = scope(container);
    expect(box.querySelectorAll(".lw:not(.is-in)")).toHaveLength(0);
    expect(container.querySelector(".lw-pen.is-on")).toBeNull();
    expect(screen.getByRole("button", { name: "Tekrar oynat" })).toBeTruthy();
  });
});

describe("tekrar davranışı ve tercihler", () => {
  it("geri dönülen adım tam açık gelir (yazılmaz)", () => {
    const { container } = renderLesson();
    startLesson();
    fireEvent.click(screen.getByRole("button", { name: "Hepsini göster" }));
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Paydayı rasyonel yapma" })).toBeTruthy();
    expect(scope(container).classList.contains("lw-playing")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Geri" }));
    expect(screen.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeTruthy();
    expect(scope(container).classList.contains("lw-playing")).toBe(false);
    expect(screen.getByRole("button", { name: "Tekrar oynat" })).toBeTruthy();
  });

  it("başlanmış ders (Tekrar incele, kaldığı yer): hiçbir adım kendiliğinden yazılmaz", () => {
    const { container } = renderLesson({ autoplay: false });
    expect(screen.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeTruthy();
    expect(scope(container).classList.contains("lw-playing")).toBe(false);
    expect(screen.getByRole("button", { name: "Tekrar oynat" })).toBeTruthy();
  });

  it("Gece / Defter tercihi saklanır ve yeniden açılışta korunur", () => {
    const first = renderLesson();
    const sheet = () => document.querySelector("article.als") as HTMLElement;
    expect(sheet().getAttribute("data-gorunum")).toBe("gece");
    fireEvent.click(screen.getByRole("button", { name: "Defter" }));
    expect(sheet().getAttribute("data-gorunum")).toBe("defter");
    expect(screen.getByRole("button", { name: "Defter" }).getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem(LIVE_PREF_KEYS.look)).toBe("defter");
    first.unmount();
    renderLesson();
    expect(sheet().getAttribute("data-gorunum")).toBe("defter");
    fireEvent.click(screen.getByRole("button", { name: "Gece" }));
    expect(window.localStorage.getItem(LIVE_PREF_KEYS.look)).toBe("gece");
  });

  it("renk anahtarı vurgunun gerçek görünümünü söyler: canlı modda 'Fosforlu', değilse 'Turuncu'", () => {
    const live = renderLesson();
    expect(live.container.querySelector(".als-intro-legend mark.lw-hl--key")!.textContent).toBe("Fosforlu");
    expect(live.container.querySelector(".als-intro-legend")!.textContent).toBe("Fosforlu: konunun kilit bilgisi.");
    cleanup();
    const plain = renderLesson({ live: false });
    expect(plain.container.querySelector(".als-intro-legend")!.textContent).toBe("Turuncu: konunun kilit bilgisi.");
  });

  it("'live' verilmeyen ders bugünkü gibi: şerit, kalem, kelime parçası yok", () => {
    const { container } = renderLesson({ live: false });
    startLesson();
    expect(container.querySelector(".lw-controls")).toBeNull();
    expect(container.querySelector(".lw-pen")).toBeNull();
    expect(container.querySelector(".lw")).toBeNull();
    expect(container.querySelector("article.als")!.getAttribute("data-gorunum")).toBeNull();
  });
});
