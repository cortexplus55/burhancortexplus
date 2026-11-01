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
    // Zayıf kazanım var ama doğrulanmış soruları tükenmiş → söz yok, dürüst satır; "Ek soruları çöz" yok.
    expect((await screen.findByTestId("reinforce-empty")).textContent).toContain("Şu an ek soru kalmadı; yeni sorular eklendikçe burada görünecek");
    expect(screen.queryByRole("button", { name: "Ek soruları çöz" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Kapat" }).at(-1)!);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("Pekiştirme bitince/kapatılınca onDone (harita onu router.refresh'e bağlar); öneri = gerçekten sunulacak soru", async () => {
    const onDone = vi.fn();
    render(<ReinforceBox prepId="p" unitId="e2e-prog#2" unitTitle="B" api={fakeLevelApi({ guest: false })} onDone={onDone} />);
    // Sunucu sayımı: 2 zayıf kazanımdan yalnız E2E.1'in 2 sorusu var → öneri 1 kazanım, 2 soru (yanlış "toplam 4" yok).
    expect((await screen.findByTestId("reinforce-offer")).textContent).toContain("zorlandığın 1 kazanım için doğrulanmış havuzdan 2 ek soru.");
    expect(screen.getByTestId("reinforce-offer-list").textContent).toContain("E2E.1: 2 soru");
    expect(screen.getByTestId("reinforce-offer-list").textContent).not.toContain("E2E.2");
    fireEvent.click(screen.getByRole("button", { name: "Ek soruları çöz" }));
    await answerAll(2, () => false);
    await screen.findByTestId("reinforce-result");
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("hiç ek soru yoksa öneri gösterilmez, dürüst satır", async () => {
    const api = fakeLevelApi({ guest: false });
    render(<ReinforceBox prepId="p" unitId="e2e-tyt#1" unitTitle="Mantık" api={api} />);
    expect((await screen.findByTestId("reinforce-empty")).textContent).toContain("Şu an ek soru kalmadı");
    expect(screen.queryByTestId("reinforce-offer")).toBeNull();
  });
});
