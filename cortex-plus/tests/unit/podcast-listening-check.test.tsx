// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PodcastListeningCheck } from "@/components/parity/podcast-listening-check";

afterEach(cleanup);

/*
  20 Ekim 2026: podcast bitince üç soruluk dinleme kontrolü, testteki gibi anında geri bildirimle.
  "Şimdi değil" ilk seçimden önce durur (ürün sahibinin kararı: atlanabilir).
*/
const questions = [
  { text: "Tek ölçüm neden yetmez?", options: ["Değişimi göstermez", "Alet hatalıdır"], multi: false, correct: ["Değişimi göstermez"], explanation: "Zaman içindeki seyir gerekir." },
  { text: "Akut beslenmede önce ne düşer?", options: ["Kilo", "Boy"], multi: false, correct: ["Kilo"], explanation: "Kilo hızlı etkilenir." },
  { text: "Gerileme nasıl değerlendirilir?", options: ["Her yaşta ciddi", "Normal varyasyon"], multi: false, correct: ["Her yaşta ciddi"], explanation: "Kazanılmış beceri kaybı ciddidir." },
];

describe("podcast dinleme kontrolü", () => {
  it("'Şimdi değil' atlar; ilk seçimden sonra görünmez", () => {
    const onSkip = vi.fn();
    render(<PodcastListeningCheck questions={questions} onDone={vi.fn()} onSkip={onSkip} />);
    expect(screen.getByText("Dinleme kontrolü")).toBeTruthy();
    expect(screen.getByText("Az önce dinlediklerinden 3 kısa soru.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Şimdi değil" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Değişimi göstermez/ }));
    expect(screen.queryByRole("button", { name: "Şimdi değil" })).toBeNull();
  });

  it("üç soru cevaplanınca cevaplar 0, 1, 2 anahtarlarıyla döner", () => {
    const onDone = vi.fn();
    render(<PodcastListeningCheck questions={questions} onDone={onDone} onSkip={vi.fn()} />);
    const picks = ["Değişimi göstermez", "Boy", "Her yaşta ciddi"];
    picks.forEach((pick, index) => {
      expect(screen.getByText(`Soru ${index + 1} / 3`)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: new RegExp(pick) }));
      fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
      fireEvent.click(screen.getByRole("button", { name: index < 2 ? "Devam et" : "Testi bitir" }));
    });
    expect(onDone).toHaveBeenCalledWith({ "0": "Değişimi göstermez", "1": "Boy", "2": "Her yaşta ciddi" });
  });

  it("oturum: oynatıcı bitince kontrol varsa önce kontrol; atlama boş cevapla tamamlar", () => {
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("onFinish={() => (podcastCheck.length ? setPodcastCheckOpen(true) : void finish())}");
    expect(session).toContain("onDone={(checkAnswers) => void finish(checkAnswers)}");
    expect(session).toContain("onSkip={() => void finish({})}");
    // Geri bildirim ucu yalnız test ve doğru/yanlış okur: podcast'te düğme yok.
    expect(session).toContain('{unscored || kind === "podcast" ? null : (');
    expect(session).toContain("setPodcastCheckOpen(false);");
  });

  it("atlama düğmesi telefonda dokunulabilir (≥ 32 px)", () => {
    const css = readFileSync("src/styles/parity-shell.css", "utf8");
    const rule = css.slice(css.indexOf(".cp-pod-check-skip {"), css.indexOf("}", css.indexOf(".cp-pod-check-skip {")));
    expect(rule).toContain("min-height: 2.25rem;");
  });
});
