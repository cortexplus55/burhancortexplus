// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UnitLevelCheck } from "@/components/level-check/unit-level-check";
import { ReinforceBox } from "@/components/level-check/reinforce-box";
import { fakeLevelApi } from "@/app/e2e/level-fake";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  window.localStorage.clear();
});

async function answerAll(count: number, wrongAt: (i: number) => boolean) {
  for (let i = 0; i < count; i++) {
    const runner = await screen.findByTestId("level-runner");
    await within(runner).findByText(`${i + 1} / ${count}`, { exact: false });
    fireEvent.click(within(runner).getByRole("button", { name: wrongAt(i) ? /Yanlış şık C/ : /Doğru şık/ }));
    const fb = await screen.findByTestId("level-feedback");
    fireEvent.click(within(fb).getByRole("button"));
  }
}

describe("hazırlık ana sayfası tazelenir (tam gezinti gerekmez)", () => {
  it("Ünite Seviye Kontrolü kaydedilince ve 'Kapat'ta router.refresh()", async () => {
    render(<UnitLevelCheck prepId="p" unitId="e2e-tyt#1" unitTitle="Mantık" api={fakeLevelApi({ guest: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "Kontrolü başlat" }));
    await answerAll(4, (i) => i % 2 === 1);
    await screen.findByTestId("unit-check-result");
    expect(refresh).toHaveBeenCalledTimes(1);
    // Zayıf kazanım var → pekiştirme önerisi, toplamıyla dürüst.
    expect(screen.getByTestId("reinforce").textContent).toMatch(/kazanım başına en çok 2 ek soru \(toplam \d+\)/);
    fireEvent.click(screen.getAllByRole("button", { name: "Kapat" }).at(-1)!);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("Pekiştirme bitince/kapatılınca onDone (harita onu router.refresh'e bağlar); öneri toplamı = 2 × zayıf kazanım", async () => {
    const onDone = vi.fn();
    render(<ReinforceBox prepId="p" unitId="e2e-tyt#1" unitTitle="Mantık" weakCount={3} api={fakeLevelApi({ guest: false })} onDone={onDone} />);
    expect(screen.getByTestId("reinforce").textContent).toContain("zorlandığın 3 kazanım için doğrulanmış havuzdan kazanım başına en çok 2 ek soru (toplam 6).");
    fireEvent.click(screen.getByRole("button", { name: "Ek soruları çöz" }));
    await answerAll(2, () => false);
    await screen.findByTestId("reinforce-result");
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
