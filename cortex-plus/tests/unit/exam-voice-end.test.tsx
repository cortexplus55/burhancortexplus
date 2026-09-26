// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";

const h = vi.hoisted(() => ({
  speakFromServer: vi.fn(),
  speakTurkish: vi.fn(),
  stopSpeech: vi.fn(),
}));

vi.mock("@/lib/learning/voice-recorder", () => ({
  isRecordingSupported: () => false,
  speakFromServer: h.speakFromServer,
  startRecording: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/learning/studio-speech", () => ({
  createRecognizer: () => null,
  speakTurkish: h.speakTurkish,
  stopSpeech: h.stopSpeech,
}));

afterEach(() => {
  cleanup();
  h.speakFromServer.mockReset();
  h.speakTurkish.mockReset();
  h.stopSpeech.mockReset();
  vi.unstubAllGlobals();
});

function voiceFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/learning/exam-prep/voice")) {
        return new Response(
          JSON.stringify({ reply: "Birinci soru burada.", done: false }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
  return calls;
}

function renderTutor(onFinish = vi.fn()) {
  render(
    <ExamVoiceTutor
      prepId="11111111-1111-4111-8111-111111111111"
      nodeId="22222222-2222-4222-8222-222222222222"
      kind="oral"
      topicLabel="Limit +1 konu"
      difficulty="orta"
      returnPath="/deneme-sinavlari/prep"
      teacherStyle="helpful"
      onFinish={onFinish}
    />,
  );
  return onFinish;
}

describe("oral exam end stops speech", () => {
  it("does not start server audio that arrives after the end dialog opens", async () => {
    const calls = voiceFetch();
    const stop = vi.fn();
    let audioEnded: (() => void) | undefined;
    let resolveSpeak: (handle: { stop: () => void } | null) => void = () => {};
    h.speakFromServer.mockImplementation((_text: string, _speaker: string, onEnd: () => void) => {
      audioEnded = onEnd;
      return new Promise((resolve) => {
        resolveSpeak = resolve;
      });
    });

    const onFinish = renderTutor();
    await waitFor(() => expect(h.speakFromServer).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    resolveSpeak({ stop });
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(h.speakTurkish).not.toHaveBeenCalled();
    expect(h.stopSpeech).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Evet, gönder" }));
    expect(onFinish).toHaveBeenCalled();
    audioEnded?.();
    expect(screen.queryByText("Öğretmen dinliyor")).toBeNull();
    expect(calls.filter((url) => url.includes("/api/learning/exam-prep/voice"))).toHaveLength(1);
  });

  it("stops audio that is already playing when the exam ends", async () => {
    voiceFetch();
    const stop = vi.fn();
    h.speakFromServer.mockResolvedValue({ stop });
    renderTutor();
    await waitFor(() => expect(screen.getByText("Öğretmen konuşuyor…")).toBeTruthy());
    await waitFor(() => expect(h.speakFromServer).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(screen.queryByText("Öğretmen konuşuyor…")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Sınav değerlendirmeye gönderilsin mi?" })).toBeTruthy();
  });
});
