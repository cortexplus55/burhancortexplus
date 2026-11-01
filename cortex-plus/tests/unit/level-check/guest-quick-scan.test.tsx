// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestQuickScan } from "@/components/level-check/guest-quick-scan";

const subjects = [{ key: "tyt-tarih", label: "TYT Tarih", unitIds: ["yks-2026-tarih#0"] }];

describe("GuestQuickScan", () => {
  it("oturum açıkken 3 soruluk ön izleme yerine kurulumdaki tam taramaya yönlendirir", () => {
    render(<GuestQuickScan subjects={subjects} initialKey="tyt-tarih" nextHref="/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt" signedIn />);
    expect(screen.queryByText(/3 soru/)).toBeNull();
    expect(screen.queryByTestId("level-runner")).toBeNull();
    expect(screen.getByRole("link", { name: "Tam taramaya başla" }).getAttribute("href")).toBe("/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt");
  });
  it("misafirde ders etiketi tekrarlanmaz", () => {
    render(<GuestQuickScan subjects={subjects} initialKey={null} nextHref="/x" />);
    expect(screen.getByText("Ücretsiz ön izleme · 3 soru")).toBeTruthy();
    expect(screen.getByRole("button", { name: "TYT Tarih" })).toBeTruthy();
    expect(screen.queryByText(/TYT TYT/)).toBeNull();
  });
});
