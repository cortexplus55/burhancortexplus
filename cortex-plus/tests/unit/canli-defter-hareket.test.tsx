// @vitest-environment jsdom
/**
 * Canlı Defter Modu, hareket azaltma (28 Kasım 2026): `prefers-reduced-motion: reduce` açıkken yazım hiç başlamaz;
 * içerik ve vurgular anında tam görünür, hız ve "Hepsini göster" / "Tekrar oynat" düğmesi çizilmez. Gece / Defter
 * yine seçilebilir. (Ayrı dosya: hareket tercihi modül yüklenirken bir kez okunur.)
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

beforeAll(() => {
  // Tarayıcı canlandırabiliyor: yazımı durduran tek şey hareket azaltma olsun.
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(16), 16)) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => cleanup());

describe("hareket azaltma", () => {
  it("yazım yok, içerik tam açık, yazım düğmeleri yok; Gece / Defter var", async () => {
    const { ExamLessonSteps } = await import("@/components/parity/exam-lesson-steps");
    const { sealLessonV3ForPlay } = await import("@/lib/learning/lesson-play-v3");
    const lesson = sealLessonV3ForPlay({
      format: 3,
      title: "Köklü Sayılar",
      overview: "Kök dışına çıkarma.",
      screens: [
        {
          heading: "Kök dışına çıkarma",
          concept: "Kök dışına çıkarma",
          lead: "Tam kare çarpan kökün dışına çıkar.",
          blocks: [{ type: "text", text: "Bir **tam kare çarpan** ve ==kilit bilgi== ile $\\sqrt{12} = 2\\sqrt{3}$ yazılır." }],
        },
        {
          heading: "Paydayı rasyonel yapma",
          concept: "Paydayı rasyonel yapma",
          lead: "Paydadaki kök eşleniğiyle kaldırılır.",
          blocks: [{ type: "text", text: "Pay ve payda aynı sayıyla çarpılır." }],
        },
      ],
      summary: ["Tam kare çarpan kökün dışına çıkar.", "Paydadaki kök eşleniğiyle kaldırılır."],
    } as never);
    const { container } = render(
      <ExamLessonSteps lesson={lesson} closeHref="/x" plannedMinutes={4} brief={{ autoOpen: true }} live={{ autoplay: true }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Derse başla" }));
    const scope = container.querySelector(".als-step-content") as HTMLElement;
    expect(scope.classList.contains("lw-playing")).toBe(false);
    expect(container.querySelector(".lw-pen.is-on")).toBeNull();
    expect(container.querySelector("mark.lw-hl--key")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Hepsini göster" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tekrar oynat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Yazım hızı/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Defter" })).toBeTruthy();
  });
});
