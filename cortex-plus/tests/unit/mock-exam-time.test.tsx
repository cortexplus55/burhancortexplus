// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MockExamSetup } from "@/components/parity/mock-exam-setup";
import { clampMockMinutes, isUntimed, mockDurationLabel } from "@/lib/learning/mock-exam/time-limit";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* Astra gibi serbest süre ve "Süre sınırı yok" (1 Ekim 2026). */
describe("yazılı deneme süresi", () => {
  it("süre 10–180 dk arası 5'in katına oturur; 0 süresiz", () => {
    expect(clampMockMinutes(0)).toBe(0);
    expect(clampMockMinutes(-4)).toBe(0);
    expect(clampMockMinutes(3)).toBe(10);
    expect(clampMockMinutes(43)).toBe(45);
    expect(clampMockMinutes(500)).toBe(180);
    expect(clampMockMinutes("40")).toBeNull();
    expect(isUntimed(0)).toBe(true);
    expect(isUntimed(null)).toBe(false);
    expect(isUntimed(40)).toBe(false);
    expect(mockDurationLabel(0)).toBe("Süresiz");
    expect(mockDurationLabel(90)).toBe("90 dk");
    expect(mockDurationLabel(null)).toBe("—");
  });

  function renderSetup() {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ examId: "e1" }), { status: 200 });
      }),
    );
    render(
      <MockExamSetup
        prepId="p1"
        topics={[{ id: "t1", label: "Birim Çember" }]}
        formatSummary={null}
        isAdmin={false}
        allocationPreview={[{ topicLabel: "Birim Çember", count: 20, examHeavy: false }]}
      />,
    );
    return bodies;
  }

  it("seçilen süre isteğe gider; uzunluk değişince önerilen süreye döner", async () => {
    const bodies = renderSetup();
    expect(screen.getByText("40")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "5 dakika artır" }));
    fireEvent.click(screen.getByRole("button", { name: "5 dakika artır" }));
    expect(screen.getByText("50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kısa · 10 soru/ }));
    expect(screen.getByText("20")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Süre (dakika)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Sınavı başlat" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ preset: "short", durationMinutes: 90 });
  });

  it("süre sınırı yok: 0 gider, otomatik gönderim cümlesi değişir", async () => {
    const bodies = renderSetup();
    fireEvent.click(screen.getByLabelText("Süre sınırı yok"));
    expect(screen.getByText("Süresiz")).toBeTruthy();
    expect(screen.getByText(/bitirdiğinde cevaplarını sen gönderirsin/)).toBeTruthy();
    expect((screen.getByLabelText("Süre (dakika)") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sınavı başlat" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ durationMinutes: 0 });
  });

  it("oturum süresizde bitiş yazmaz; çözme ekranı Süresiz der", () => {
    const route = readFileSync("src/app/api/learning/exam/session/route.ts", "utf8");
    expect(route).toContain("const untimed = isUntimed(exam.duration_minutes);");
    expect(route).toContain("timeLeftSec: untimed ? null : remainingExamSeconds(deadlineAt)");
    expect(readFileSync("src/components/parity/exam-runner.tsx", "utf8")).toContain('untimed ? "Süresiz"');
  });

  it("sayfa başlıklarında marka iki kez geçmez", () => {
    for (const page of [
      "src/app/deneme-sinavlari/[prepId]/deneme/kurulum/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8")).not.toMatch(/title: "[^"]*· Cortex Plus"/);
    }
  });

  it("ders filtre çiplerinin stili var (Uygulamalar ile silinen sınıf kullanılmıyor)", () => {
    expect(readFileSync("src/styles/parity-shell.css", "utf8")).toContain(".cp-filter-chip {");
    for (const file of ["src/components/parity/school-feed-view.tsx", "src/components/parity/prep-search-view.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("cp-filter-chip");
      expect(source).not.toContain("cp-lab-chip");
    }
  });
});
