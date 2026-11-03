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

describe("buton doğru kazanımı açar (canlı hata: açık ünitede indeks 5 → başka ünitenin kazanımı)", () => {
  const two = [
    {
      unitId: "u-ilk",
      title: "İlk Türk-İslam Devletleri",
      outcomes: [{ outcomeId: "a1", code: "KPSS.DKTR.2.A", text: "Karahanlı ve Gazneli devletlerini açıklar.", state: weak, extra: 0 }],
    },
    {
      unitId: "u-osm",
      title: "Osmanlı Duraklama, Gerileme ve Dağılma",
      outcomes: [
        { outcomeId: "b1", code: "KPSS.DKTR.5.A", text: "Duraklama dönemini açıklar.", state: weak, extra: 0 },
        { outcomeId: "b2", code: "KPSS.DKTR.5.B", text: "Gerileme dönemi ıslahatlarını açıklar.", state: weak, extra: 0 },
      ],
    },
  ];
  it("açık ünite satırındaki buton o satırın kazanımını açar, kutu satırın altında ve başlıkta kazanım yazar", async () => {
    const start = vi.fn(async () => new Promise(() => {}));
    render(<MasteryMap prepId="p" units={two as never} daysLeft={null} dailyMinutes={null} api={{ start, answer: vi.fn() } as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Osmanlı Duraklama/ }));
    const rowBtns = screen.getAllByTestId("mm-new-test");
    expect(rowBtns.map((b) => b.getAttribute("data-code"))).toEqual(["KPSS.DKTR.5.A", "KPSS.DKTR.5.B"]);
    fireEvent.click(rowBtns[1]);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: "reinforce_new", code: "KPSS.DKTR.5.B", unit: "u-osm" }));
    const row = rowBtns[1].closest("li")!;
    expect(row.querySelector('[data-testid="reinforce"]')).not.toBeNull();
    expect(row.textContent).toContain("Yeni pekiştirme · KPSS.DKTR.5.B · Gerileme dönemi");
  });
  it("Pekiştirme önerisi butonları kendi zayıf kazanım adını görünür etiketler", () => {
    render(<MasteryMap prepId="p" units={two as never} daysLeft={null} dailyMinutes={null} api={{ start: vi.fn(async () => new Promise(() => {})) } as never} />);
    const weakBtns = screen.getAllByTestId("mm-weak-new-test");
    for (const b of weakBtns) {
      const li = b.closest("li")!;
      const code = b.getAttribute("data-code")!;
      expect(li.textContent).toContain(code);
      expect(b.getAttribute("aria-label")).toContain(code);
    }
    expect(weakBtns[0].closest("li")!.textContent).toContain("Karahanlı ve Gazneli");
  });
});
