// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";

/*
  Yazılı cevap (18 Ekim 2026 canlı deneme): mikrofon yokken alt yazı "yazarak da
  sürebilirsin" diyordu ama yazı kutusu yoktu. Şimdi her iki kabukta (soru-cevap ve sözlü)
  bir kutu var; yazılan metin sesle aynı uca, aynı geçmişle gider.
*/
const h = vi.hoisted(() => ({
  speakFromServer: vi.fn(async () => null),
  speakTurkish: vi.fn((_text: string, options: { onEnd: () => void }) => options.onEnd()),
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
  vi.unstubAllGlobals();
});

function voiceFetch() {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/learning/exam-prep/voice")) {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ reply: `Soru ${bodies.length}.`, done: false }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
  return bodies;
}

function renderTutor(kind: "qa" | "oral") {
  render(
    <ExamVoiceTutor
      prepId="11111111-1111-4111-8111-111111111111"
      nodeId="22222222-2222-4222-8222-222222222222"
      kind={kind}
      topicLabel="Büyüme ve Gelişme"
      difficulty="kolay"
      returnPath="/deneme-sinavlari/prep"
      teacherStyle={kind === "oral" ? "helpful" : undefined}
      onFinish={vi.fn()}
    />,
  );
}

describe("sözlü / soru-cevap yazılı cevap", () => {
  for (const kind of ["qa", "oral"] as const) {
    it(`${kind}: mikrofon yokken yazı kutusu var ve yazılan cevap eğitmene gider`, async () => {
      const bodies = voiceFetch();
      renderTutor(kind);
      await waitFor(() => expect(bodies).toHaveLength(1));
      // Eğitmen konuştu (tarayıcı sesi anında bitti) → dinleme denendi → mikrofon yok → boşta.
      const input = await screen.findByLabelText("Cevabını yaz");
      const send = screen.getByRole("button", { name: "Gönder" }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);

      fireEvent.change(input, { target: { value: "Gelişmeye örnektir; dil becerisi olgunlaşır." } });
      expect(send.disabled).toBe(false);
      fireEvent.click(send);

      await waitFor(() => expect(bodies).toHaveLength(2));
      const sent = bodies[1].messages;
      expect(sent[sent.length - 1]).toEqual({
        role: "user",
        content: "Gelişmeye örnektir; dil becerisi olgunlaşır.",
      });
      expect(sent[0]).toEqual({ role: "assistant", content: "Soru 1." });
      expect((input as HTMLInputElement).value).toBe("");
    });
  }
});
