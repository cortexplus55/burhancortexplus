// @vitest-environment jsdom
/**
 * Sınav Radyosu çubuğu (Faz 7, 20 Kasım 2026): kilit ekranı denetimleri (`navigator.mediaSession`) bağlanır ve
 * radyoyu yönetir; satır bitince sıradaki satıra, bölüm bitince sıradaki bölüme kendiliğinden geçilir; önbellekte
 * olmayan bölüm (409) atlanır; ses ucu yalnız radyo ucudur (podcast ses ucu hiç çağrılmaz).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PrepRadio, PrepRadioBar, PREP_RADIO_URL } from "@/components/parity/prep-radio";
import { RADIO_MEDIA_ACTIONS, bindRadioMediaSession } from "@/lib/learning/radio-media-session";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const PREP = "33333333-3333-4333-8333-333333333333";
const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Birinci bölüm", topicLabel: "Birinci" };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "İkinci bölüm", topicLabel: "İkinci" };

const handlers = new Map<string, (() => void) | null>();
const session = {
  metadata: null as unknown,
  playbackState: "none",
  setActionHandler: vi.fn((action: string, run: (() => void) | null) => {
    handlers.set(action, run);
  }),
};
const players: HTMLMediaElement[] = [];
const requested: string[] = [];

function linesFor(id: string) {
  return [
    { chapterIndex: 0, speaker: "ada", text: `${id} bir`, url: `https://cdn.example/${id}/1.mp3`, durationMs: 20_000 },
    { chapterIndex: 0, speaker: "kerem", text: `${id} iki`, url: `https://cdn.example/${id}/2.mp3`, durationMs: 20_000 },
  ];
}

beforeEach(() => {
  handlers.clear();
  players.length = 0;
  requested.length = 0;
  session.setActionHandler.mockClear();
  Object.defineProperty(window.navigator, "mediaSession", { value: session, configurable: true });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      constructor(public init: Record<string, string>) {}
    },
  );
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    players.push(this);
    return Promise.resolve();
  });
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { podcastId: string };
      requested.push(`${url}#${body.podcastId}`);
      if (body.podcastId === B.id && (globalThis as { __skipB?: boolean }).__skipB) {
        return new Response(JSON.stringify({ code: "not_cached" }), { status: 409 });
      }
      const item = body.podcastId === A.id ? A : B;
      return new Response(JSON.stringify({ ok: true, item, lines: linesFor(item.id), creditsSpent: 0 }), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { __skipB?: boolean }).__skipB;
});

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("Sınav Radyosu çubuğu", () => {
  it("altı kilit ekranı eylemi bağlanır; başlık bölümün adı; duraklat / 15 sn ileri / sonraki çalışır", async () => {
    render(<PrepRadioBar prepId={PREP} prepTitle="Örnek hazırlık" items={[A, B]} onClose={() => undefined} />);
    await flush();
    await flush();
    expect(requested[0]).toBe(`${PREP_RADIO_URL}#${A.id}`);
    for (const action of RADIO_MEDIA_ACTIONS) expect(typeof handlers.get(action)).toBe("function");
    expect((session.metadata as { init: Record<string, string> }).init).toMatchObject({ title: A.title, artist: "Cortex Plus" });
    expect(screen.getByRole("region", { name: "Sınav Radyosu" })).toBeTruthy();
    expect(players.at(-1)?.src).toContain(`/${A.id}/1.mp3`);
    expect(screen.getByRole("button", { name: "Duraklat" })).toBeTruthy();

    await act(async () => handlers.get("pause")!());
    expect(screen.getByRole("button", { name: "Oynat" })).toBeTruthy();
    expect(session.playbackState).toBe("paused");

    await act(async () => handlers.get("seekforward")!());
    expect(screen.getByText(/0:15 \/ 0:40/)).toBeTruthy();

    await act(async () => handlers.get("nexttrack")!());
    await flush();
    await flush();
    expect(requested.at(-1)).toBe(`${PREP_RADIO_URL}#${B.id}`);
    expect((session.metadata as { init: Record<string, string> }).init.title).toBe(B.title);
  });

  it("satır bitince sıradaki satır, bölüm bitince sıradaki bölüm kendiliğinden çalar; önbellekte olmayan bölüm atlanır", async () => {
    (globalThis as { __skipB?: boolean }).__skipB = true;
    render(<PrepRadioBar prepId={PREP} prepTitle="Örnek hazırlık" items={[A, B]} onClose={() => undefined} />);
    await flush();
    await flush();
    expect(players.at(-1)?.src).toContain(`/${A.id}/1.mp3`);
    await act(async () => players.at(-1)!.onended?.(new Event("ended")));
    expect(players.at(-1)?.src).toContain(`/${A.id}/2.mp3`);
    await act(async () => players.at(-1)!.onended?.(new Event("ended")));
    await flush();
    await flush();
    expect(requested).toContain(`${PREP_RADIO_URL}#${B.id}`);
    // B önbellekte değil (409): atlandı, liste bitti; oynat baştan başlatır.
    expect(screen.getByText(/Liste bitti/)).toBeTruthy();
    expect(requested.every((entry) => !entry.includes("/api/learning/podcast/audio"))).toBe(true);
  });

  it("hız düğmesi 1× → 1,25× → 1,5× → 2× → 1× döner; kapatınca kilit ekranı eylemleri kaldırılır", async () => {
    const onClose = vi.fn();
    const view = render(<PrepRadioBar prepId={PREP} prepTitle="Örnek hazırlık" items={[A]} onClose={onClose} />);
    await flush();
    await flush();
    const speed = screen.getByRole("button", { name: /^Hız:/ });
    for (const label of ["1,25×", "1,5×", "2×", "1×"]) {
      fireEvent.click(speed);
      expect(speed.textContent).toBe(label);
    }
    expect(players.at(-1)?.playbackRate).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Radyoyu kapat" }));
    expect(onClose).toHaveBeenCalled();
    view.unmount();
    for (const action of RADIO_MEDIA_ACTIONS) expect(handlers.get(action)).toBeNull();
    expect(document.documentElement.dataset.cxRadio).toBeUndefined();
  });

  it("giriş düğmesi yalnız hazır bölüm varken görünür ve çubuğu açar", async () => {
    const empty = render(<PrepRadio prepId={PREP} prepTitle="Örnek" items={[]} />);
    expect(empty.container.innerHTML).toBe("");
    empty.unmount();
    render(<PrepRadio prepId={PREP} prepTitle="Örnek" items={[A, B]} />);
    const entry = screen.getByRole("button", { name: /Sınav Radyosu \(Ücretsiz Dinle\)/ });
    expect(entry.textContent).toContain("0 kredi");
    fireEvent.click(entry);
    await flush();
    expect(screen.getByRole("region", { name: "Sınav Radyosu" })).toBeTruthy();
    expect(document.documentElement.dataset.cxRadio).toBe("open");
  });

  it("desteklemeyen tarayıcıda bağlama sessizce geçer", () => {
    expect(() => bindRadioMediaSession({}, { title: "x", artist: "y", album: "z" }, {
      play: () => undefined,
      pause: () => undefined,
      previous: () => undefined,
      next: () => undefined,
      seekBackward: () => undefined,
      seekForward: () => undefined,
    })()).not.toThrow();
    const throwing = { mediaSession: { metadata: null, setActionHandler: () => { throw new Error("desteksiz"); } } };
    expect(() => bindRadioMediaSession(throwing, { title: "x", artist: "y", album: "z" }, {
      play: () => undefined,
      pause: () => undefined,
      previous: () => undefined,
      next: () => undefined,
      seekBackward: () => undefined,
      seekForward: () => undefined,
    })()).not.toThrow();
  });
});
