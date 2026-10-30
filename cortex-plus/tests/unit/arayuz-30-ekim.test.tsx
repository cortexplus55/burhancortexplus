// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioEntry } from "@/components/learning/studio/studio-shared";
import { startActionLabel } from "@/lib/learning/feedback-copy";
import { openAnswerHint, questionTypeChip } from "@/lib/learning/mock-exam";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

afterEach(cleanup);

describe("arayüz kusurları (30 Ekim 2026, canlı tur)", () => {
  it("Araçlar: örnek konuya dokunmak konuyu yazar, üretimi düğme başlatır", () => {
    const onSubmit = vi.fn();
    render(
      <StudioEntry
        tool="quiz"
        title="Test"
        placeholder="Konu"
        submitLabel="Testi başlat"
        creditCost={null}
        suggestions={["Belgenin tamamı", "Enflasyon"]}
        onSubmit={onSubmit}
      />,
    );
    const chip = screen.getByRole("button", { name: "Enflasyon" });
    fireEvent.click(chip);
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Konu") as HTMLInputElement).value).toBe("Enflasyon");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Testi başlat" }));
    expect(onSubmit).toHaveBeenCalledWith("Enflasyon");
  });

  it("Araçlar podcast'i yalnız konuşan sesleri gösterir", () => {
    const studio = read("src/components/learning/studio/podcast-studio.tsx");
    expect(studio).toContain("shownVoices.map((speaker)");
    expect(studio).toContain("soloVoice ? null");
    expect(studio).not.toContain("{SPEAKERS.map((speaker) => {");
  });

  it("yazılı deneme: hesap sorusu adım ister, tanım sorusu düzenli açıklama; puan bir kez yazar", () => {
    expect(openAnswerHint("Yıllık enflasyon %40 ise fiyat endeksindeki artışı hesaplayınız.")).toBe(
      "Adım adım yaz; ara sonuçlarını göster.",
    );
    expect(openAnswerHint("Stagflasyon kavramını açıklayınız.")).toBe("Kendi cümlelerinle, ana noktaları sırayla yaz.");
    expect(questionTypeChip("open")).toBe("Klasik");
    expect(read("src/components/parity/exam-runner.tsx")).toContain("{questionTypeChip(type)}");
  });

  it("doğru/yanlış kurulumu test demez; sonuç kaçırılan önermeleri gösterir", () => {
    expect(startActionLabel("true_false")).toBe("Önermeleri hazırla");
    expect(startActionLabel("quiz")).toBe("Testi oluştur");
    const studio = read("src/components/learning/studio/true-false-studio.tsx");
    expect(studio).toContain('className="ls-missed"');
    expect(studio).toContain("setMissed((list) => [...list, item])");
  });

  it("kart adımının kurulum başlığı yoldaki adıyla aynı", () => {
    expect(PLAN_NODE_META.spaced.setupLabel).toBe(PLAN_NODE_META.spaced.title);
  });
});
