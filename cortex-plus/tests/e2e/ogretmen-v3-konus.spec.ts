import { expect, test, type Page } from "@playwright/test";

/*
  Öğretmen v3 (21 Kasım 2026): sohbetin içindeki canlı sesli ders. Fikstür `/e2e/ana-ekran?ogretmen=v2&durum=karsilama`
  (veritabanısız); "Konuş" sohbetin kendi ses çubuğunu açar. WebRTC ve mikrofon taklit edilir, sesli ders uçları
  `page.route` ile karşılanır: OpenAI'ye ve veritabanına istek yok. 390 ve 1280 px'te: öğrencinin sözü, öğretmenin sözü ve
  tahta kartı sohbet akışına canlı düşer, çubuk yazma kapsülünün yerinde ve ekranın içinde, yana taşma yok; "Dersi bitir"
  konuşmayı kaydeder, çubuk kalkar, kapsül geri gelir ve konuşma sohbetin mesajı olarak kalır.
*/

const fakeRtc = () => {
  type Listener = ((event: { data: string }) => void) | null;
  class FakeChannel {
    readyState = "connecting";
    onopen: (() => void) | null = null;
    onmessage: Listener = null;
    send() {}
    close() {
      this.readyState = "closed";
    }
  }
  class FakePeer {
    connectionState = "new";
    channel = new FakeChannel();
    ontrack: unknown = null;
    onconnectionstatechange: unknown = null;
    constructor() {
      (window as unknown as { __channel: FakeChannel }).__channel = this.channel;
    }
    addTrack() {}
    createDataChannel() {
      return this.channel;
    }
    async createOffer() {
      return { type: "offer", sdp: "v=0\r\nfake-offer" };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      setTimeout(() => {
        this.connectionState = "connected";
        this.channel.readyState = "open";
        this.channel.onopen?.();
      }, 30);
    }
    close() {}
  }
  (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeer;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => new AudioContext().createMediaStreamDestination().stream },
  });
  (window as unknown as { __emit: (event: unknown) => void }).__emit = (event) =>
    (window as unknown as { __channel: FakeChannel }).__channel.onmessage?.({ data: JSON.stringify(event) });
};

async function setup(page: Page) {
  const ended: unknown[] = [];
  await page.addInitScript(fakeRtc);
  await page.route("**/api/tutor/realtime-session**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/end")) {
      ended.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, conversationId: "conv-e2e", seconds: 12, chargedMinutes: 1, saved: true } });
    }
    if (url.endsWith("/tick")) return route.fulfill({ json: { ok: true, minute: 2, paidSeconds: 120 } });
    return route.fulfill({
      json: {
        ok: true,
        sessionId: "00000000-0000-4000-8000-0000000000bb",
        sdp: "v=0\r\nfake-answer",
        access: "paid",
        trialSeconds: null,
        minuteSeconds: 60,
        maxSeconds: 1800,
        tickLeadSeconds: 5,
        boardCardMax: 6,
      },
    });
  });
  return ended;
}

const emit = (page: Page, event: Record<string, unknown>) =>
  page.evaluate((e) => (window as unknown as { __emit: (x: unknown) => void }).__emit(e), event);

for (const width of [390, 1280]) {
  test(`sohbetin içinde sesli ders ${width} px: söz ve kart akışa düşer, bitince mesaj olur`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 800 });
    const ended = await setup(page);
    // 27 Kasım 2026: canlı ses yalnız ücretli planlarda (Sınav Haftası, Plus, Sigma); fikstürde Plus hesabı. Plus
    // kabuğunda tek seferlik "Seri" karşılaması (`GamificationGate`) ekranı kaplayıp "Konuş"a tıklamayı kesiyordu (CI):
    // karşılaması görülmüş tarayıcıyla başlanır (`donusum.spec.ts` ile aynı yol).
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalıysa pencere zaten test edilen şey değil */
      }
    });
    await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=karsilama&plan=plus");
    await page.getByRole("button", { name: "Konuş" }).click();

    const bar = page.locator("section.cx-rv");
    await expect(bar).toHaveAttribute("data-status", "thinking");
    await expect(page.getByPlaceholder("Sor, konuş veya dosya gönder")).toHaveCount(0);

    await emit(page, { type: "conversation.item.added", item: { id: "u1", type: "message", role: "user" } });
    await emit(page, { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Hücre zarı ne işe yarar?" });
    await emit(page, { type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } });
    await emit(page, { type: "output_audio_buffer.started" });
    await emit(page, { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Hücreye giren ve çıkan maddeleri seçer." });
    await emit(page, {
      type: "response.function_call_arguments.done",
      name: "tahtaya_yaz",
      call_id: "call_1",
      arguments: JSON.stringify({ kind: "concept", title: "Seçici geçirgenlik", body: "Zar her maddeyi geçirmez." }),
    });

    await expect(page.locator(".cx-v3-turn--student").last()).toHaveText("Hücre zarı ne işe yarar?");
    await expect(page.locator(".cx-v3-turn--voice")).toContainText("Hücreye giren ve çıkan maddeleri seçer.");
    await expect(page.locator(".cx-v3-turn--board .cx-rv-card[data-kind='concept']")).toBeVisible();
    // Karşılama, söz gelince kalkar.
    await expect(page.getByText("Selam", { exact: false }).first()).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await bar.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);

    await emit(page, { type: "output_audio_buffer.stopped" });
    await emit(page, { type: "response.done", response: { id: "r1" } });
    await page.getByRole("button", { name: "Dersi bitir" }).click();

    await expect(bar).toHaveCount(0);
    await expect(page.getByPlaceholder("Sor, konuş veya dosya gönder")).toBeVisible();
    await expect(page.locator(".cx-v3-turn--voice")).toHaveCount(0);
    await expect(page.locator(".cx-v3-turn--teacher").last()).toContainText("Hücreye giren ve çıkan maddeleri seçer.");
    await expect(page.locator(".cx-v3-turn--teacher").last()).toContainText("Seçici geçirgenlik");
    expect(ended[0]).toMatchObject({
      reason: "user",
      turns: [
        { role: "user", text: "Hücre zarı ne işe yarar?" },
        { role: "assistant", text: "Hücreye giren ve çıkan maddeleri seçer." },
      ],
      cards: [{ kind: "concept", title: "Seçici geçirgenlik" }],
    });
  });
}

/*
  27 Kasım 2026 (Burhan): ücretsiz hesapta "Konuş" görünür ama canlı ses açılmaz; dokununca mikrofon istenmeden ve sesli
  ders ucuna gidilmeden Plus yükseltme penceresi açılır.
*/
for (const width of [390, 1280]) {
  test(`ücretsiz hesap ${width} px: Konuş Plus penceresini açar, mikrofon ve uç isteği yok`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 800 });
    let sessionRequests = 0;
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalıysa pencere zaten test edilen şey değil */
      }
      (window as unknown as { __mic: number }).__mic = 0;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            (window as unknown as { __mic: number }).__mic += 1;
            return new AudioContext().createMediaStreamDestination().stream;
          },
        },
      });
    });
    await page.route("**/api/tutor/realtime-session**", (route) => {
      sessionRequests += 1;
      return route.fulfill({ status: 402, json: { ok: false, code: "plus_required", message: "" } });
    });
    await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=karsilama");
    const talk = page.getByRole("button", { name: "Konuş" });
    await expect(talk).toBeVisible();
    await talk.click();
    await expect(page.getByText(/Canlı sesli öğretmen Plus'ta\./)).toBeVisible();
    await expect(page.locator("section.cx-rv")).toHaveCount(0);
    expect(sessionRequests).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
