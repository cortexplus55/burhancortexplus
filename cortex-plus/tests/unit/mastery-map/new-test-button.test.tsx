// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MasteryMap, NetCard, NET_TOP_TITLE } from "@/components/level-check/mastery-map";
import { NEW_TEST_LABEL } from "@/components/level-check/reinforce-box";
import { estimateGainOnly } from "@/lib/mastery-map/net";
import type { LevelApi } from "@/lib/level-check/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const weak = { alpha: 1, beta: 4, n: 3 };
const units = [
  {
    unitId: "kpss-2026-deep-tarih#1",
    title: "Kök Türkler",
    outcomes: [{ outcomeId: "o1", code: "T.1", text: "Kök Türk devletini açıklar.", state: weak, extra: 0 }],
  },
];

describe("🔥 Yeni Pekiştirme Testi butonu", () => {
  it("ek havuz sorusu kalmasa da zayıf kazanımda görünür ve reinforce_new başlatır", async () => {
    const start = vi.fn(async () => ({ status: "limit", limit: 3 }));
    const api = { start, answer: vi.fn() } as unknown as LevelApi;
    render(<MasteryMap prepId="11111111-1111-1111-1111-111111111111" units={units as never} daysLeft={null} dailyMinutes={null} api={api} />);
    const btns = screen.getAllByTestId("mm-weak-new-test");
    expect(btns[0].textContent).toBe(NEW_TEST_LABEL);
    fireEvent.click(btns[0]);
    await screen.findByTestId("reinforce-new-notice");
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: "reinforce_new", code: "T.1", unit: "kpss-2026-deep-tarih#1" }));
  });
  it("açılan ünite detayında her kazanım satırında buton var", () => {
    render(<MasteryMap prepId="p" units={units as never} daysLeft={null} dailyMinutes={null} api={{ start: vi.fn(async () => ({ status: "empty" })) } as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Kök Türkler/ }));
    expect(screen.getAllByTestId("mm-new-test")).toHaveLength(1);
  });
});

describe("net kartı metni", () => {
  it("resmî sayı yokken ustalık puanı değil, hakimiyet % ve gelişme payı %", () => {
    const net = estimateGainOnly([{ unitId: "b", title: "B", subjectKey: "", outcomes: [{ state: weak }, { state: weak }] }]);
    render(<NetCard net={net} />);
    const card = screen.getByTestId("net-card").textContent ?? "";
    expect(card).toContain(NET_TOP_TITLE);
    expect(card).not.toContain("ustalık puanı");
    expect(card).not.toContain("+3 konu");
    expect(card).toMatch(/şu an %\d+ hakimsin · doğru oranında \+%\d+ gelişme payı/);
  });
});
