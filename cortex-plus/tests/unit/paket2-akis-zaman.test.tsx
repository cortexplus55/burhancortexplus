// @vitest-environment jsdom
/* Tanışma testi (6 Kasım 2026): askıda kalan model isteği 60 sn'de kesilir, öğrenci nedenini görür ve yeniden dener. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));
vi.mock("@/components/paywall/credit-gate", () => ({ CreditGate: () => null }));
vi.mock("@/components/parity/exam-quiz-play", () => ({ ExamQuizPlay: () => null }));

import {
  ExamIntroQuiz,
  INTRO_TIMEOUT_MESSAGE,
  INTRO_TIMEOUT_MS,
  introDeadline,
} from "@/components/parity/exam-intro-quiz";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

describe("tanışma testi süre sınırı", () => {
  it("introDeadline süre dolunca isteği keser ve bunu bildirir", () => {
    vi.useFakeTimers();
    const d = introDeadline(1000);
    expect(d.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(true);
  });

  it("clear sonrası kesmez", () => {
    vi.useFakeTimers();
    const d = introDeadline(1000);
    d.clear();
    vi.advanceTimersByTime(5000);
    expect(d.signal.aborted).toBe(false);
    expect(d.timedOut()).toBe(false);
  });

  it("askıda kalan başlatma 60 sn'de zaman aşımı mesajı ve 'Tekrar dene' gösterir", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ExamIntroQuiz prepId="p1" topicLabel="Hücre" />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    await act(async () => {
      vi.advanceTimersByTime(INTRO_TIMEOUT_MS);
    });
    expect(screen.getByRole("alert").textContent).toBe(INTRO_TIMEOUT_MESSAGE);
    expect(toastError).toHaveBeenCalledWith(INTRO_TIMEOUT_MESSAGE);
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
  });
});
