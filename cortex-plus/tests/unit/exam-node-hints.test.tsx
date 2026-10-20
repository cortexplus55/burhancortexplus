// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

/*
  Eğitmenle çözülen soru bağımsız doğru sayılıyordu (20 Ekim 2026): `hintsUsed` her çizimde boş
  bir nesneydi, hiç doldurulmuyordu. Şimdi cevap kilitlenmeden önce gelen eğitmen yardımı o soruyu
  "ipuçlu" işaretler; kilitten sonraki açıklama işaretlemez.
*/

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QUIZ = {
  type: "quiz",
  questions: [
    { text: "Basınç hangi birimle ölçülür?", options: ["Pascal", "Newton"], correct: ["Pascal"], multi: false },
  ],
};

function renderQuiz() {
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push({ url, ...body });
    if (url.includes("/coach")) {
      return Promise.resolve(new Response(JSON.stringify({ reply: "Kuvvetin alana oranını düşün." }), { status: 200 }));
    }
    const data =
      body.action === "resume"
        ? { resumed: true, attemptId: "attempt-1", payload: QUIZ }
        : body.action === "complete"
          ? { score: 1, total: 1, retried: 0 }
          : {};
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ExamNodeSession prepId="prep-1" nodeId="node-1" kind="quiz" prepTitle="Fizik" topicLabel="Basınç" resumeEnabled />,
  );
  const completeBody = () =>
    bodies.find((body) => body.action === "complete") as { answers?: { __meta?: { hintsUsed?: unknown } } } | undefined;
  return { completeBody };
}

async function askCoach() {
  fireEvent.click(screen.getByRole("button", { name: "Bilmiyorum, sen anlat" }));
  await screen.findByText("Kuvvetin alana oranını düşün.");
}

async function answerAndFinish() {
  fireEvent.click(screen.getByRole("button", { name: /Pascal/ }));
  fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
}

describe("eğitmen yardımı ipucu sayılır", () => {
  it("cevaplamadan önce eğitmen → bitişte o soru ipuçlu", async () => {
    const { completeBody } = renderQuiz();
    await screen.findByText("Basınç hangi birimle ölçülür?");
    await askCoach();
    await answerAndFinish();
    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    await waitFor(() => expect(completeBody()).toBeTruthy());
    expect(completeBody()!.answers?.__meta?.hintsUsed).toEqual({ "0": true });
  });

  it("cevap kilitlendikten sonra eğitmen açıklaması ipucu değil", async () => {
    const { completeBody } = renderQuiz();
    await screen.findByText("Basınç hangi birimle ölçülür?");
    await answerAndFinish();
    await askCoach();
    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    await waitFor(() => expect(completeBody()).toBeTruthy());
    expect(completeBody()!.answers?.__meta?.hintsUsed).toEqual({});
  });
});
