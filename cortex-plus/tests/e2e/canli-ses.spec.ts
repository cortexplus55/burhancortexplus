import { expect, test, type Page } from "@playwright/test";

/*
  Canlı sesli öğretmen çubuğu (21 Kasım 2026), /e2e/sesli-ders fikstüründe. WebRTC ve mikrofon taklit edilir (tarayıcıda
  sahte RTCPeerConnection ve sessiz mikrofon), uçlar `page.route` ile karşılanır: OpenAI'ye ve veritabanına istek yok.
  375, 360 ve 1280 px'te: durum metinleri sırayla, canlı döküm ve tahta kartı sohbet akışında, yana taşma yok, dokunma
  hedefleri ≥ 44 px, Durdur konuşmayı /end'e gönderir. Ücretsiz deneme: süre dolunca Plus daveti.
  Gerçek bağlantı (OpenAI Realtime) yerel canlı denemede ölçüldü (rapor).
*/

const fakeRtc = () => {
  type Listener = ((event: { data: string }) => void) | null;
  class FakeChannel {
    readyState = "connecting";
    onopen: (() => void) | null = null;
    onmessage: Listener = null;
    send(data: string) {
      ((window as unknown as { __sent: string[] }).__sent ||= []).push(data);
    }
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
    value: {
      getUserMedia: async () => {
        const context = new AudioContext();
        return context.createMediaStreamDestination().stream;
      },
    },
  });
  (window as unknown as { __emit: (event: unknown) => void }).__emit = (event) =>
    (window as unknown as { __channel: FakeChannel }).__channel.onmessage?.({ data: JSON.stringify(event) });
};

type Mock = { access?: "paid" | "trial" };

async function setup(page: Page, mock: Mock = {}) {
  const ended: unknown[] = [];
  await page.addInitScript(fakeRtc);
  await page.route("**/api/e2e/realtime-session/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/end")) {
      ended.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, conversationId: "conv-e2e", seconds: 12, chargedMinutes: 1, saved: true } });
    }
    if (url.endsWith("/tick")) return route.fulfill({ json: { ok: true, minute: 2, paidSeconds: 120 } });
    const trial = mock.access === "trial";
    return route.fulfill({
      json: {
        ok: true,
        sessionId: "00000000-0000-4000-8000-0000000000aa",
        sdp: "v=0\r\nfake-answer",
        access: trial ? "trial" : "paid",
        trialSeconds: trial ? 3 : null,
        minuteSeconds: 60,
        maxSeconds: trial ? 3 : 1800,
        tickLeadSeconds: 5,
        boardCardMax: 6,
      },
    });
  });
  return ended;
}

const emit = (page: Page, event: Record<string, unknown>) => page.evaluate((e) => (window as unknown as { __emit: (x: unknown) => void }).__emit(e), event);

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function targetsAtLeast(page: Page, min: number) {
  const small = await page.$$eval(".cx-rv button, .cx-rv a", (nodes, limit) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { name: node.getAttribute("aria-label") ?? node.textContent, width: Math.round(box.width), height: Math.round(box.height) };
      })
      .filter((box) => box.width < limit || box.height < limit),
  min);
  expect(small).toEqual([]);
}

for (const width of [375, 360, 1280]) {
  test(`sesli ders ${width} px: durumlar, döküm, tahta kartı, sustur ve Durdur`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 780 : 860 });
    const ended = await setup(page);
    await page.goto(`/e2e/sesli-ders${width < 768 ? "?yer=alt" : ""}`);
    const bar = page.locator("section.cx-rv");
    await expect(bar).toHaveAttribute("data-status", "thinking");
    await expect(page.getByText("Eğitmen düşünüyor...")).toBeVisible();

    await emit(page, { type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } });
    await emit(page, { type: "output_audio_buffer.started" });
    await emit(page, { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Merhaba! Bugün ne çalışmak istersin?" });
    await expect(page.getByText("Eğitmen konuşuyor...")).toBeVisible();
    await expect(page.locator('[data-role="assistant"]')).toHaveText("Merhaba! Bugün ne çalışmak istersin?");
    await emit(page, {
      type: "response.function_call_arguments.done",
      name: "tahtaya_yaz",
      call_id: "call_1",
      arguments: JSON.stringify({ kind: "formula", title: "Pisagor bağıntısı", body: "$a^2+b^2=c^2$" }),
    });
    await expect(page.locator(".cx-rv-card[data-kind='formula']")).toBeVisible();
    await expect(page.locator(".cx-rv-card .katex")).toHaveCount(1);
    await emit(page, { type: "output_audio_buffer.stopped" });
    await emit(page, { type: "response.done", response: { id: "r1" } });
    await expect(page.getByText("Eğitmen dinliyor")).toBeVisible();

    await noOverflow(page);
    if (width < 768) await targetsAtLeast(page, 44);
    // Çubuk ekranın içinde (telefonda altta, güvenli alanla).
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);

    await page.getByRole("button", { name: "Mikrofonu kapat" }).click();
    await expect(page.getByRole("button", { name: "Mikrofonu aç" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Mikrofonu aç" }).click();

    await page.getByRole("button", { name: "Dersi bitir" }).click();
    await expect(page.getByText("Sesli ders bitti")).toBeVisible();
    await expect(page.getByTestId("rv-ended")).toContainText("conv-e2e");
    expect(ended[0]).toMatchObject({
      reason: "user",
      turns: [{ role: "assistant", text: "Merhaba! Bugün ne çalışmak istersin?" }],
      cards: [{ kind: "formula", title: "Pisagor bağıntısı" }],
    });
  });
}

test("ücretsiz deneme: kalan süre görünür, süre dolunca Plus daveti", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await setup(page, { access: "trial" });
  await page.goto("/e2e/sesli-ders?erisim=deneme&yer=alt");
  await expect(page.getByText(/Ücretsiz deneme · 0:0\d/)).toBeVisible();
  await expect(page.getByText("Canlı sesli öğretmen Plus'ta")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("link", { name: "Plus'a geç" })).toHaveAttribute("href", "/pay?plan=plus");
  await noOverflow(page);
  await targetsAtLeast(page, 44);
});

test("hareket azaltmada küre sabit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await page.goto("/e2e/sesli-ders");
  await expect(page.locator("section.cx-rv")).toHaveAttribute("data-status", "thinking");
  await emit(page, { type: "output_audio_buffer.started" });
  await expect(page.locator(".cx-rv-orb")).toHaveAttribute("data-mode", "speaking");
  const animation = await page.locator(".cx-rv-orb-core").evaluate((node) => getComputedStyle(node).animationName);
  expect(animation).toBe("none");
});
