// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuestionReportButton } from "@/components/learning/question-report-button";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { REPORT_THANKS, VOIDED_FIXED_LINE } from "@/lib/learning/question-report/copy";

/* Paket J2 #10 (31 Ekim 2026): "🚩 Soruda hata bildir" ekranı. */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("soruda hata bildir düğmesi", () => {
  it("neden seçilmeden gönderilmez; gönderince sunucunun cevabını yazar ve düzeltmeyi verir", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ verdict: "valid", message: REPORT_THANKS, rewarded: true, action: "fix", question: { text: "q", options: ["a", "b"], multi: false, correct: ["b"], voided: true, keyFixed: true } }),
    }));
    vi.stubGlobal("fetch", fetch);
    const resolved = vi.fn();
    render(<QuestionReportButton source="node" targetId="11111111-1111-4111-8111-111111111111" questionRef="2" onResolved={resolved} />);
    fireEvent.click(screen.getByRole("button", { name: /Soruda hata bildir/ }));
    const send = screen.getByRole("button", { name: "Bildir" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Cevap anahtarı yanlış" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Doğrusu B" } });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/learning/question-report");
    expect(JSON.parse(String(init.body))).toEqual({
      source: "node",
      targetId: "11111111-1111-4111-8111-111111111111",
      questionRef: "2",
      reason: "key",
      note: "Doğrusu B",
    });
    expect(screen.getByRole("status").textContent).toBe(REPORT_THANKS);
    expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ verdict: "valid", rewarded: true }));
  });

  it("sunucu hatasında kutu açık kalır ve nedeni yazar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Test hâlâ hazırlanıyor." }) })));
    render(<QuestionReportButton source="mock" targetId="11111111-1111-4111-8111-111111111111" questionRef="q1" />);
    fireEvent.click(screen.getByRole("button", { name: /Soruda hata bildir/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Yazım hatası" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bildir" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Test hâlâ hazırlanıyor.");
    expect(screen.getByRole("button", { name: "Bildir" })).toBeTruthy();
  });
});

describe("testte düzeltilen soru", () => {
  it("açıklamada 'tam puan' ve düzeltme satırı; bildir düğmesi açıklamanın altında", () => {
    render(
      <ExamQuizPlay
        questions={[{ text: "Hangi element soy gazdır?", options: ["Sodyum", "Neon"], multi: false, correct: ["Neon"], voided: true, keyFixed: true }]}
        index={0}
        value="Sodyum"
        onChange={() => undefined}
        onContinue={() => undefined}
        continueLabel="Testi bitir"
        report={() => <span>bildir-yuvası</span>}
      />,
    );
    expect(screen.queryByText("bildir-yuvası")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.getByText(VOIDED_FIXED_LINE)).toBeTruthy();
    expect(screen.getByText("Tam puan")).toBeTruthy();
    expect(screen.getByText("bildir-yuvası")).toBeTruthy();
  });
});
