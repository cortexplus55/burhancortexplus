// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeEngine, IMAGE_TURN_TEXT } from "@/lib/tutor/realtime/engine";
import { RealtimeVoiceBar, STATUS_TEXT, PLUS_INVITE_TITLE } from "@/components/chat/realtime/realtime-voice-bar";
import { MIC_DENIED_MESSAGE, type RealtimeClientDeps } from "@/lib/tutor/realtime/use-realtime-tutor";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/*
  İstemci tarafı (21 Kasım 2026): olay makinesi (durumlar, döküm, tahta aracı, kullanım), kanca ve ses çubuğu. WebRTC
  sahte: veri kanalına elle olay verilir. Gerçek bağlantı yerel canlı denemede (rapor).
*/

describe("olay makinesi", () => {
  it("bağlanıyor → düşünüyor → konuşuyor → dinliyor; dökümler sıralı ve kelime kelime", () => {
    const engine = new RealtimeEngine();
    expect(engine.status).toBe("connecting");
    const opened = engine.opened();
    expect(opened).toContainEqual({ type: "send", event: { type: "response.create" } });
    expect(engine.status).toBe("thinking");
    engine.handle({ type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } });
    const delta = engine.handle({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Merhaba" });
    expect(delta).toContainEqual({ type: "transcript", turn: { id: "a1", role: "assistant", text: "Merhaba", final: false } });
    engine.handle({ type: "output_audio_buffer.started" });
    expect(engine.status).toBe("speaking");
    engine.handle({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: " Elif" });
    const done = engine.handle({ type: "response.output_audio_transcript.done", item_id: "a1", transcript: "Merhaba Elif" });
    expect(done).toContainEqual({ type: "transcript", turn: { id: "a1", role: "assistant", text: "Merhaba Elif", final: true } });
    engine.handle({ type: "response.done", response: { id: "r1", usage: { input_token_details: { text_tokens: 1000, audio_tokens: 0, cached_tokens_details: { text_tokens: 0 } }, output_token_details: { text_tokens: 40, audio_tokens: 300 } } } });
    engine.handle({ type: "output_audio_buffer.stopped" });
    expect(engine.status).toBe("listening");
    engine.handle({ type: "input_audio_buffer.speech_started" });
    expect(engine.status).toBe("listening");
    engine.handle({ type: "conversation.item.added", item: { id: "u1", type: "message", role: "user" } });
    engine.handle({ type: "input_audio_buffer.speech_stopped" });
    expect(engine.status).toBe("thinking");
    engine.handle({ type: "conversation.item.input_audio_transcription.delta", item_id: "u1", delta: "Kesir " });
    engine.handle({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "Kesir nedir?",
      usage: { type: "tokens", input_tokens: 40, input_token_details: { audio_tokens: 40 } },
    });
    expect(engine.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ["assistant", "Merhaba Elif"],
      ["user", "Kesir nedir?"],
    ]);
    expect(engine.usage).toMatchObject({ textIn: 1000, textOut: 40, audioOut: 300, transcribeAudio: 40, responses: 1 });
  });

  it("öğretmen konuşurken öğrenci başlarsa dinliyor; kesilen ses temizlenince durum doğru", () => {
    const engine = new RealtimeEngine();
    engine.handle({ type: "output_audio_buffer.started" });
    engine.handle({ type: "input_audio_buffer.speech_started" });
    expect(engine.status).toBe("listening");
    engine.handle({ type: "output_audio_buffer.cleared" });
    expect(engine.status).toBe("listening");
  });

  it("tahta aracı: kart çıkar, araca onay döner, cevap bitince konuşma sürer; sınır ve bozuk kart", () => {
    const engine = new RealtimeEngine({ boardCardMax: 1 });
    engine.handle({ type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } });
    engine.handle({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Pisagor bağıntısı" });
    const effects = engine.handle({
      type: "response.function_call_arguments.done",
      name: "tahtaya_yaz",
      call_id: "call_1",
      response_id: "r9",
      arguments: '{"kind":"formula","title":"Pisagor","body":"$a^2+b^2=c^2$"}',
    });
    expect(effects).toContainEqual({ type: "card", card: { id: "card_1", kind: "formula", title: "Pisagor", body: "$a^2+b^2=c^2$" } });
    expect(effects).toContainEqual({
      type: "send",
      event: { type: "conversation.item.create", item: { type: "function_call_output", call_id: "call_1", output: '{"ok":true}' } },
    });
    const after = engine.handle({ type: "response.done", response: { id: "r9" } });
    expect(after).toContainEqual({ type: "send", event: { type: "response.create" } });
    const limited = engine.handle({
      type: "response.function_call_arguments.done",
      name: "tahtaya_yaz",
      call_id: "call_2",
      arguments: '{"kind":"concept","title":"İkinci","body":"Fazla kart."}',
    });
    expect(limited.some((effect) => effect.type === "card")).toBe(false);
    expect(JSON.stringify(limited)).toContain('\\"reason\\":\\"limit\\"');
    expect(engine.handle({ type: "response.function_call_arguments.done", name: "baska_arac", call_id: "c3", arguments: "{}" })).toEqual([]);
    expect(engine.transcriptForEnd()).toEqual({
      turns: [{ role: "assistant", text: "Pisagor bağıntısı" }],
      cards: [{ kind: "formula", title: "Pisagor", body: "$a^2+b^2=c^2$", afterTurn: 0 }],
    });
  });

  it("görsel konuşmaya eklenir (input_image) ve satırda adıyla görünür", () => {
    const engine = new RealtimeEngine();
    const effects = engine.image("data:image/jpeg;base64,AAAA");
    const create = effects.find((effect) => effect.type === "send" && (effect.event as { type: string }).type === "conversation.item.create");
    expect(JSON.stringify(create)).toContain('"type":"input_image"');
    expect(effects).toContainEqual({ type: "send", event: { type: "response.create" } });
    expect(engine.turns[0]).toMatchObject({ role: "user", text: IMAGE_TURN_TEXT, final: true });
  });
});

/* ---------------------------------------------------------------- kanca ve çubuk (sahte WebRTC) */

class FakeChannel {
  readyState = "connecting";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = "closed";
  }
  open() {
    this.readyState = "open";
    this.onopen?.();
  }
  emit(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

class FakePeer {
  static last: FakePeer | null = null;
  channel = new FakeChannel();
  connectionState = "new";
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  remote: unknown = null;
  closed = false;
  constructor() {
    FakePeer.last = this;
  }
  addTrack() {}
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0\r\noffer" };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: unknown) {
    this.remote = description;
  }
  close() {
    this.closed = true;
  }
}

function fakeTrack() {
  return { enabled: true, stop: vi.fn() };
}

type Call = { url: string; body: Record<string, unknown> | null };

function makeDeps(options: { create?: Record<string, unknown>; createStatus?: number; micError?: string } = {}) {
  const calls: Call[] = [];
  const track = fakeTrack();
  const clock = { now: 0 };
  const deps: Partial<RealtimeClientDeps> = {
    now: () => clock.now,
    getUserMedia: vi.fn(async () => {
      if (options.micError) throw Object.assign(new Error("x"), { name: options.micError });
      return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    }),
    createPeerConnection: () => new FakePeer() as unknown as RTCPeerConnection,
    createAudio: () => ({ play: vi.fn(async () => undefined), pause: vi.fn(), srcObject: null }) as unknown as HTMLAudioElement,
    createAudioContext: () => null,
    fetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/end")) return new Response(JSON.stringify({ ok: true, conversationId: "conv-9", seconds: 10, chargedMinutes: 1, saved: true }));
      if (String(url).endsWith("/tick")) return new Response(JSON.stringify({ ok: true, minute: 2, paidSeconds: 120 }));
      return new Response(
        JSON.stringify(
          options.create ?? {
            ok: true,
            sessionId: "s-1",
            sdp: "v=0\r\nanswer",
            access: "paid",
            trialSeconds: null,
            minuteSeconds: 60,
            maxSeconds: 1800,
            tickLeadSeconds: 5,
            boardCardMax: 6,
          },
        ),
        { status: options.createStatus ?? 200 },
      );
    }) as unknown as typeof fetch,
  };
  return { deps, calls, track, clock };
}

describe("ses çubuğu", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    FakePeer.last = null;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("bağlanır, durumları yazar, dökümü ve kartı iletir, sustur/aç, Durdur konuşmayı gönderir", async () => {
    const { deps, calls, track } = makeDeps();
    const onTranscript = vi.fn();
    const onBoardCard = vi.fn();
    const onEnded = vi.fn();
    render(
      <RealtimeVoiceBar
        conversationId="c-1"
        prepId="p-1"
        onTranscript={onTranscript}
        onBoardCard={onBoardCard}
        onEnded={onEnded}
        deps={deps}
      />,
    );
    expect(await screen.findByText(STATUS_TEXT.connecting)).toBeTruthy();
    await waitFor(() => expect(FakePeer.last?.remote).toEqual({ type: "answer", sdp: "v=0\r\nanswer" }));
    expect(calls[0]).toMatchObject({ url: "/api/tutor/realtime-session", body: { sdp: "v=0\r\noffer", conversationId: "c-1", prepId: "p-1" } });
    const channel = FakePeer.last!.channel;
    act(() => channel.open());
    // Öğretmen ilk sözü söylesin.
    expect(channel.sent).toContain(JSON.stringify({ type: "response.create" }));
    expect(screen.getByText(STATUS_TEXT.thinking)).toBeTruthy();
    act(() => {
      channel.emit({ type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } });
      channel.emit({ type: "output_audio_buffer.started" });
      channel.emit({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Merhaba" });
    });
    expect(screen.getByText(STATUS_TEXT.speaking)).toBeTruthy();
    expect(onTranscript).toHaveBeenLastCalledWith({ id: "a1", role: "assistant", text: "Merhaba", final: false });
    act(() => {
      channel.emit({
        type: "response.function_call_arguments.done",
        name: "tahtaya_yaz",
        call_id: "call_1",
        arguments: '{"kind":"concept","title":"Pay","body":"Kesrin üstündeki sayı."}',
      });
      channel.emit({ type: "output_audio_buffer.stopped" });
      channel.emit({ type: "response.done", response: { id: "r1" } });
    });
    expect(onBoardCard).toHaveBeenCalledWith({ id: "card_1", kind: "concept", title: "Pay", body: "Kesrin üstündeki sayı." });
    expect(screen.getByText(STATUS_TEXT.listening)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mikrofonu kapat" }));
    expect(track.enabled).toBe(false);
    expect(screen.getByRole("button", { name: "Mikrofonu aç" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mikrofonu aç" }));
    expect(track.enabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Dersi bitir" }));
    await waitFor(() => expect(onEnded).toHaveBeenCalledWith({ conversationId: "conv-9", seconds: expect.any(Number), reason: "user" }));
    const end = calls.find((call) => call.url.endsWith("/end"))!;
    expect(end.body).toMatchObject({
      sessionId: "s-1",
      reason: "user",
      connected: true,
      turns: [{ role: "assistant", text: "Merhaba" }],
      cards: [{ kind: "concept", title: "Pay", afterTurn: 0 }],
    });
    expect(FakePeer.last!.closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByText(STATUS_TEXT.ended)).toBeTruthy();
  });

  it("dakika dolmadan /tick ile süre uzatılır", async () => {
    const { deps, calls, clock } = makeDeps();
    render(<RealtimeVoiceBar onTranscript={vi.fn()} onEnded={vi.fn()} deps={deps} />);
    await waitFor(() => expect(FakePeer.last?.remote).toBeTruthy());
    clock.now = 55_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/tick"))).toBe(true));
    expect(calls.find((call) => call.url.endsWith("/tick"))!.body).toMatchObject({ sessionId: "s-1", minute: 2 });
  });

  it("deneme: sayaç görünür, süre dolunca Plus daveti; davet kapatılınca çubuğun işi biter", async () => {
    const { deps, clock } = makeDeps({
      create: {
        ok: true,
        sessionId: "s-t",
        sdp: "v=0\r\nanswer",
        access: "trial",
        trialSeconds: 60,
        minuteSeconds: 60,
        maxSeconds: 60,
        tickLeadSeconds: 5,
        boardCardMax: 6,
      },
    });
    const onEnded = vi.fn();
    const onUpgrade = vi.fn();
    render(<RealtimeVoiceBar onTranscript={vi.fn()} onEnded={onEnded} onUpgrade={onUpgrade} deps={deps} />);
    await waitFor(() => expect(screen.getByText(/Ücretsiz deneme · 1:00/)).toBeTruthy());
    clock.now = 60_500;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(await screen.findByText(PLUS_INVITE_TITLE)).toBeTruthy();
    expect(onEnded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Plus'a geç" }));
    expect(onUpgrade).toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ reason: "trial_over" }));
  });

  it("ücretsiz deneme kullanılmışsa açılışta Plus daveti; kredi sayısı yazmaz", async () => {
    const { deps } = makeDeps({ create: { ok: false, code: "trial_used", message: "Ücretsiz denemeni kullandın." }, createStatus: 402 });
    const onEnded = vi.fn();
    const { container } = render(<RealtimeVoiceBar onTranscript={vi.fn()} onEnded={onEnded} deps={deps} />);
    expect(await screen.findByText(PLUS_INVITE_TITLE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plus'a geç" }).getAttribute("href")).toBe("/pay?plan=plus");
    expect(container.textContent).not.toMatch(/\bkredi\b/i);
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ reason: "plus" }));
  });

  it("mikrofon izni reddedilirse dostça yol gösterir; yeniden denenebilir", async () => {
    const { deps } = makeDeps({ micError: "NotAllowedError" });
    render(<RealtimeVoiceBar onTranscript={vi.fn()} onEnded={vi.fn()} deps={deps} />);
    expect(await screen.findByText(MIC_DENIED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Yeniden dene/ })).toBeTruthy();
  });

  it("bağlantı koparsa konuşma yine gönderilir ve söylenir", async () => {
    const { deps, calls } = makeDeps();
    const onEnded = vi.fn();
    render(<RealtimeVoiceBar onTranscript={vi.fn()} onEnded={onEnded} deps={deps} />);
    await waitFor(() => expect(FakePeer.last?.remote).toBeTruthy());
    const peer = FakePeer.last!;
    act(() => {
      peer.connectionState = "failed";
      peer.onconnectionstatechange?.();
    });
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/end"))).toBe(true));
    expect(calls.find((call) => call.url.endsWith("/end"))!.body).toMatchObject({ reason: "disconnected" });
    expect(await screen.findByText(/Bağlantı koptu/)).toBeTruthy();
  });

  it("dokunma hedefleri ≥ 44 px, Durdur 52 px; hareket azaltmada küre sabit", () => {
    const css = readFileSync("src/styles/realtime-voice.css", "utf8");
    expect(css).toMatch(/\.cx-rv-icon \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(css).toMatch(/\.cx-rv-stop \{[^}]*width: 52px;[^}]*height: 52px;/);
    expect(css).toMatch(/\.cx-rv-cta \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.cx-rv-orb-core[\s\S]*animation: none !important;/);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("dvh");
    expect(css).not.toMatch(/backdrop-filter/);
    const bar = readFileSync("src/components/chat/realtime/realtime-voice-bar.tsx", "utf8");
    expect(bar).toContain("prefers-reduced-motion: reduce");
    expect(bar).toContain('aria-live="polite"');
  });
});
