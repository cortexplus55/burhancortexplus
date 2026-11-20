// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Fark vitrini (20 Kasım 2026, Faz 7). Ürün sahibi: ana sayfadaki "Aynı not, iki ayrı sonuç" bölümünde misafirin kayıt
  olmadan kullanabildiği üç kart (Sınav Radyosu, Kırmızı Kalemli Hoca, Sınıfla Paylaş + QR'lı sınav sabahı kâğıdı);
  /ornek'in sonunda ikisi; /ozellikler tablosunda beş yeni satır.

  Bu test şunları tutar:
  - Kartlar ürün sahibinin başlık ve rozetleriyle çizilir.
  - Radyo kayıtlı kesitleri `demoRadioPlaylist()` sırasıyla çalar, `ended`da sıradakine geçer; tıklamadan önce ses
    kaynağı yok (`preload="none"`, kaynaksız `<audio>`): sayfa açılışında sıfır istek.
  - QR kodu yerel üreticiden gelir (gömülü SVG; resim isteği, dış adres yok).
  - Metinde rakip adı ve tutulamayan söz yok; sayfalarda model, ses ya da ağ çağrısı yok.
*/

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ClassShareShowcaseCard, SuperGuclerStrip } from "@/components/landing/fark-vitrini";
import { RadioShowcaseCard } from "@/components/landing/fark-vitrini-radio";
import { RedPenShowcaseCard } from "@/components/landing/fark-vitrini-red-pen";
import { LandingDuel } from "@/components/landing/landing-duel";
import { AdvantageComparison, AdvantageCompact } from "@/components/marketing/advantage-sections";
import { demoRadioPlaylist, type DemoPodcast } from "@/lib/demo/demo-podcasts";
import { ADVANTAGE_ROWS, FORBIDDEN_BRAND_NAMES } from "@/lib/marketing/advantage-content";
import {
  CLASS_SHARE_SHOWCASE,
  FARK_VITRINI,
  RADIO_SHOWCASE,
  RED_PEN_SHOWCASE,
  SHARE_SAMPLE_URL,
  SHOWCASE_COMPARE_LABELS,
  allShowcaseCopy,
} from "@/lib/marketing/fark-vitrini";
import { HOME_COPY } from "@/lib/marketing/landing-content";
import { qrSvgMarkup } from "@/lib/utils/qr-svg";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const CLIP = (n: number, unit: string): DemoPodcast => ({
  src: `/ornek/radyo-${n}.mp3`,
  source: `${unit} ders notu`,
  unit,
  durationMs: 12_000 + n * 1000,
  lines: [{ speaker: "ada", name: "Ada", text: `${unit} kesiti`, startMs: 0, endMs: 12_000 + n * 1000 }],
});

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const title = (card: HTMLElement) => within(card).getByRole("heading", { level: 3 }).textContent;

describe("üç kart ürün sahibinin başlık ve rozetleriyle", () => {
  it("ana sayfada 'Aynı not, iki ayrı sonuç' bölümünün içinde, karşılaştırma kartının altında", () => {
    render(<LandingDuel />);
    const section = document.querySelector("section#farklar") as HTMLElement;
    const vitrin = within(section).getByTestId("fark-vitrini");
    // Sıra: aynı not kartı → vitrin → fark satırları.
    const caseCard = within(section).getByTestId("same-note-case");
    const list = section.querySelector("ol.hm-duel-list") as HTMLElement;
    expect(caseCard.compareDocumentPosition(vitrin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vitrin.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(vitrin).getByText(FARK_VITRINI.kicker)).toBeTruthy();

    const radio = within(vitrin).getByTestId("showcase-radio");
    const pen = within(vitrin).getByTestId("showcase-red-pen");
    const share = within(vitrin).getByTestId("showcase-class-share");
    expect(title(radio)).toBe("🎧 Otobüste / Yolda Kesintisiz Sınav Radyosu");
    expect(title(pen)).toBe("🖊️ Kırmızı Kalemli Hoca — Yazılı Kağıdını Fotoğrafla, Puan Kırılan Yeri Gör");
    expect(title(share)).toBe("📲 Sınıfla Paylaş (+50 Kredi) & QR Kodlu Sınav Sabahı Kağıdı");

    // Rozetler: zümrüt "0 KREDİ · KAYITLI PODCAST" (büyük harf CSS ile), +50 Bonus Kredi, kırmızı kalemin iki rozeti.
    const zero = radio.querySelector(".fv-badge--ok") as HTMLElement;
    expect(zero.textContent?.toLocaleUpperCase("tr")).toBe("0 KREDİ · KAYITLI PODCAST");
    expect(within(radio).getByRole("button", { name: RADIO_SHOWCASE.play }).textContent).toBe("▶ Örnek Radyo Akışını Dinle");
    expect(within(share).getByText("+50 Bonus Kredi")).toBeTruthy();
    expect(within(pen).getByTestId("red-pen-earned").textContent).toBe("+15 Puan · Formül kurulumu tam");
    expect(within(pen).getByTestId("red-pen-lost").textContent).toBe("-5 Puan · Hoca Buradan Kırar: Birim yazılmamış!");
    expect(within(pen).getByText(RED_PEN_SHOWCASE.paperLabel)).toBeTruthy();

    // Plus işleri etiketli (podcast üretimi ve "Kâğıtta çöz" Plus'ta); paylaşım kartında kâğıdın Plus olduğu yazılı.
    expect(within(radio).getByText(FARK_VITRINI.plus)).toBeTruthy();
    expect(within(pen).getByText(FARK_VITRINI.plus)).toBeTruthy();
    expect(within(share).getByText(CLASS_SHARE_SHOWCASE.note)).toBeTruthy();

    // Her kartta karşılaştırma: Cortex Plus ve Genel yapay zekâ botları (düello etiketleriyle aynı).
    for (const card of [radio, pen, share]) {
      expect(within(card).getByText(SHOWCASE_COMPARE_LABELS.us)).toBeTruthy();
      expect(within(card).getByText(SHOWCASE_COMPARE_LABELS.them)).toBeTruthy();
    }
    expect(SHOWCASE_COMPARE_LABELS).toEqual({ us: HOME_COPY.duel.us, them: HOME_COPY.duel.them });
    expect(within(radio).getByText(RADIO_SHOWCASE.compare.cortex)).toBeTruthy();
    expect(within(pen).getByText(RED_PEN_SHOWCASE.compare.others)).toBeTruthy();
    expect(within(share).getByText(CLASS_SHARE_SHOWCASE.compare.cortex)).toBeTruthy();
  });

  it("CSS: zümrüt rozet anlamsal belirteçle, büyük harf yalnız CSS'te; yazı 12 px, dokunma 44 px; mavi yok", () => {
    const css = withoutComments(read("src/styles/fark-vitrini.css"));
    expect(css).toContain("--fv-success: #34d399;");
    expect(css).toMatch(/\.fv-badge--ok \{[^}]*color: var\(--fv-success-text\);[^}]*text-transform: uppercase;/);
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(10);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    for (const control of ["fv-play", "fv-seg-btn", "fv-steps-summary"]) {
      expect(css, control).toMatch(new RegExp(`\\.${control} \\{[^}]*min-height: 2\\.75rem;`));
    }
    expect(css).toMatch(/\.fv-icon-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    for (const blue of [/#4353f3/i, /#5463ff/i, /#6366f1/i, /#4f46e5/i, /indigo/i]) expect(css).not.toMatch(blue);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Karşı taraf ve kâğıt yazıları sabit tonlarla: pazarlama kabuğu temadan bağımsız koyu.
    expect(css).not.toMatch(/:root|\.dark|prefers-color-scheme/);
  });
});

describe("Kart A — Sınav Radyosu", () => {
  it("tıklamadan önce ses kaynağı yok: preload none, kaynaksız audio, play çağrılmaz", () => {
    render(<RadioShowcaseCard />);
    const card = screen.getByTestId("showcase-radio");
    const audio = card.querySelector("audio") as HTMLAudioElement;
    expect(audio.getAttribute("preload")).toBe("none");
    expect(audio.hasAttribute("src")).toBe(false);
    expect(audio.hasAttribute("autoplay")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(card.getAttribute("data-state")).toBe("idle");
  });

  it("varsayılan liste demoRadioPlaylist(): ünite adları sırayla, tek kesitte 'sonraki' düğmesi yok", () => {
    const playlist = demoRadioPlaylist();
    expect(playlist.length).toBeGreaterThanOrEqual(1);
    render(<RadioShowcaseCard />);
    const queue = screen.getByRole("list", { name: RADIO_SHOWCASE.queueLabel });
    const items = within(queue).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(playlist.map((item, at) => `Ünite ${at + 1} · ${item.unit}`));
    expect(screen.getByTestId("radio-now").textContent).toBe(`Ünite 1 · ${playlist[0]!.unit}`);
    if (playlist.length === 1) expect(screen.queryByRole("button", { name: RADIO_SHOWCASE.next })).toBeNull();
  });

  it("dört kesitlik akış: sırayla çalar, ended'da sıradakine geçer, sonda başa döner ve durur", async () => {
    const list = [CLIP(1, "Köklü Sayılar"), CLIP(2, "Üslü Sayılar"), CLIP(3, "Mantık"), CLIP(4, "Kümeler")];
    render(<RadioShowcaseCard playlist={list} />);
    const card = screen.getByTestId("showcase-radio");
    const audio = card.querySelector("audio") as HTMLAudioElement;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: RADIO_SHOWCASE.play }));
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(audio.getAttribute("src")).toBe(list[0]!.src);
    expect(card.getAttribute("data-state")).toBe("playing");
    expect(card.classList.contains("is-playing")).toBe(true);
    expect(screen.getByRole("button", { name: RADIO_SHOWCASE.pause }).textContent).toBe("⏸ Duraklat");

    for (let at = 1; at < list.length; at += 1) {
      await act(async () => {
        fireEvent.ended(audio);
      });
      expect(audio.getAttribute("src")).toBe(list[at]!.src);
      expect(screen.getByTestId("radio-now").textContent).toBe(`Ünite ${at + 1} · ${list[at]!.unit}`);
      const current = screen.getByRole("list", { name: RADIO_SHOWCASE.queueLabel }).querySelector('[aria-current="true"]');
      expect(current?.textContent).toBe(`Ünite ${at + 1} · ${list[at]!.unit}`);
      expect(card.getAttribute("data-state")).toBe("playing");
    }
    expect(play).toHaveBeenCalledTimes(list.length);

    // Son kesit bitti: akış başa döner ve durur.
    await act(async () => {
      fireEvent.ended(audio);
    });
    expect(play).toHaveBeenCalledTimes(list.length);
    expect(card.getAttribute("data-state")).toBe("idle");
    expect(screen.getByTestId("radio-now").textContent).toBe(`Ünite 1 · ${list[0]!.unit}`);
    expect(screen.getByRole("button", { name: RADIO_SHOWCASE.play })).toBeTruthy();
  });

  it("duraklat / sürdür ve 'sonraki ünite': duraklatılmışken sıradaki seçilir, ses yüklenmez", async () => {
    const list = [CLIP(1, "Köklü Sayılar"), CLIP(2, "Üslü Sayılar")];
    render(<RadioShowcaseCard playlist={list} />);
    const card = screen.getByTestId("showcase-radio");
    const audio = card.querySelector("audio") as HTMLAudioElement;

    // Çalmadan "sonraki": kaynak atanmaz (sıfır istek sürer).
    fireEvent.click(screen.getByRole("button", { name: RADIO_SHOWCASE.next }));
    expect(audio.hasAttribute("src")).toBe(false);
    expect(screen.getByTestId("radio-now").textContent).toBe("Ünite 2 · Üslü Sayılar");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: RADIO_SHOWCASE.play }));
    });
    expect(audio.getAttribute("src")).toBe(list[1]!.src);
    fireEvent.click(screen.getByRole("button", { name: RADIO_SHOWCASE.pause }));
    expect(pause).toHaveBeenCalled();
    expect(card.getAttribute("data-state")).toBe("paused");
  });

  it("oynatma reddedilirse ekran söyler ve durur", async () => {
    play.mockImplementation(() => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })));
    render(<RadioShowcaseCard playlist={[CLIP(1, "Köklü Sayılar")]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: RADIO_SHOWCASE.play }));
    });
    expect(screen.getByRole("status").textContent).toBe(RADIO_SHOWCASE.failed);
    expect(screen.getByTestId("showcase-radio").getAttribute("data-state")).toBe("paused");
  });

  it("boş liste: kart çizilmez", () => {
    const { container } = render(<RadioShowcaseCard playlist={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Kart B — Kırmızı Kalemli Hoca", () => {
  it("açılışta kırmızı kalemli hâl; öğrencinin kâğıdına geçince işaretler kalkar, dönünce yeniden çizilir", async () => {
    vi.useFakeTimers();
    try {
      render(<RedPenShowcaseCard />);
      const card = screen.getByTestId("showcase-red-pen");
      const plain = within(card).getByRole("button", { name: RED_PEN_SHOWCASE.views.plain });
      const marked = within(card).getByRole("button", { name: RED_PEN_SHOWCASE.views.marked });
      expect(marked.getAttribute("aria-pressed")).toBe("true");
      expect(within(card).getByText(RED_PEN_SHOWCASE.total)).toBeTruthy();
      // Öğrencinin satırları sırayla; hesap doğru (1200 / 60 = 20), son satırda birim yok.
      const lines = [...card.querySelectorAll(".fv-ink")].map((node) => node.textContent);
      expect(lines).toEqual([...RED_PEN_SHOWCASE.lines]);
      expect(1200 / 60).toBe(20);

      fireEvent.click(plain);
      expect(plain.getAttribute("aria-pressed")).toBe("true");
      expect(within(card).queryByTestId("red-pen-earned")).toBeNull();
      expect(within(card).queryByTestId("red-pen-lost")).toBeNull();

      fireEvent.click(marked);
      const paper = card.querySelector(".fv-paper") as HTMLElement;
      expect(paper.hasAttribute("data-drawing")).toBe(true);
      expect(within(card).getByTestId("red-pen-lost")).toBeTruthy();
      // An en çok 2,5 sn: süre dolunca çizim biter, işaretler yerinde kalır.
      await act(async () => {
        vi.advanceTimersByTime(2600);
      });
      expect(paper.hasAttribute("data-drawing")).toBe(false);
      expect(within(card).getByTestId("red-pen-earned")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Kart C — Sınıfla paylaş ve QR'lı sınav sabahı kâğıdı", () => {
  it("QR yerel üreticiden: gömülü SVG, resim isteği ve dış adres yok; örnek olduğu yazılı", () => {
    render(<ClassShareShowcaseCard />);
    const card = screen.getByTestId("showcase-class-share");
    const qr = within(card).getByTestId("share-qr");
    const svg = qr.querySelector("svg") as SVGElement;
    expect(svg).toBeTruthy();
    const expected = document.createElement("div");
    expected.innerHTML = qrSvgMarkup(SHARE_SAMPLE_URL, { size: 96, margin: 2, title: CLASS_SHARE_SHOWCASE.qrTitle });
    expect(svg.querySelector("path")?.getAttribute("d")).toBe(expected.querySelector("path")?.getAttribute("d"));
    expect(svg.getAttribute("role")).toBe("img");
    expect(card.querySelectorAll("img")).toHaveLength(0);
    for (const node of card.querySelectorAll("[src], [href]")) {
      expect(node.getAttribute("src") ?? node.getAttribute("href") ?? "").not.toMatch(/^https?:/);
    }
    expect(SHARE_SAMPLE_URL).toBe("https://cortexplus.app/davet/ORNEK");
    const caption = card.querySelector(".fv-qr-caption") as HTMLElement;
    expect(caption.textContent).toBe("Örnek QRcortexplus.app/davet/ORNEK");
    expect(CLASS_SHARE_SHOWCASE.qrCaption.label).toBe("Örnek QR");
    expect(`https://${CLASS_SHARE_SHOWCASE.qrCaption.url}`).toBe(SHARE_SAMPLE_URL);
    // Adres yalnız eğik çizgilerden bölünür.
    expect(caption.querySelectorAll("wbr")).toHaveLength(2);
    // Paylaşımın koşulu metinde: konu testi ve aylık sınır.
    const steps = within(card).getByRole("group");
    expect(steps.tagName).toBe("DETAILS");
    expect(card.textContent).toContain("1. ünitenin konu testini bitirince sen +50 kredi kazanırsın (ayda en çok 5 arkadaş)");
  });
});

describe("/ornek ve /ozellikler", () => {
  it("/ornek sonunda 'Kayıtlı Hesapta Açılan Süper Güçler': radyo ve kırmızı kalem, aynı kartlar", () => {
    render(<SuperGuclerStrip />);
    const strip = screen.getByTestId("super-gucler");
    expect(within(strip).getByRole("heading", { level: 2 }).textContent).toBe("Kayıtlı Hesapta Açılan Süper Güçler");
    expect(within(strip).getByTestId("showcase-radio")).toBeTruthy();
    expect(within(strip).getByTestId("showcase-red-pen")).toBeTruthy();
    expect(within(strip).queryByTestId("showcase-class-share")).toBeNull();

    const page = withoutComments(read("src/app/ornek/page.tsx"));
    expect(page.indexOf("<AdvantageCompact")).toBeGreaterThan(page.indexOf("<DemoWalkthrough"));
    expect(page.indexOf("<SuperGuclerStrip />")).toBeGreaterThan(page.indexOf("<AdvantageCompact"));
    expect(page).toContain("omit={[RADIO_SHOWCASE.id, RED_PEN_SHOWCASE.id]}");
  });

  it("/ornek'teki kısa liste şeritte kartla gösterilen iki satırı ikinci kez yazmaz", () => {
    render(<AdvantageCompact omit={[RADIO_SHOWCASE.id, RED_PEN_SHOWCASE.id]} />);
    const list = screen.getByTestId("advantage-compact");
    expect(within(list).queryByText("🎧 Kesintisiz Sınav Radyosu")).toBeNull();
    expect(within(list).queryByText("🖊️ Kırmızı Kalemli Hoca Puanlaması")).toBeNull();
    expect(within(list).getByText("📲 Sınıf Klonlama +50 Kredi")).toBeTruthy();
    expect(within(list).getAllByRole("listitem")).toHaveLength(ADVANTAGE_ROWS.length - 2);
  });

  it("/ozellikler karşılaştırma tablosunda beş yeni satır", () => {
    const features = [
      "📲 Sınıf Klonlama +50 Kredi",
      "🧾 QR Kodlu Sınav Sabahı PDF'i",
      "🎧 Kesintisiz Sınav Radyosu",
      "🖊️ Kırmızı Kalemli Hoca Puanlaması",
      "🎓 Sınav Sonrası Başarı Karnesi",
    ];
    render(<AdvantageComparison />);
    const table = screen.getByRole("table");
    for (const feature of features) {
      const header = within(table).getByRole("rowheader", { name: feature });
      const row = header.closest('[role="row"]') as HTMLElement;
      const data = ADVANTAGE_ROWS.find((item) => item.feature === feature)!;
      expect(within(row).getByText(data.cortex.body)).toBeTruthy();
      expect(within(row).getByText(data.others.body)).toBeTruthy();
    }
    // Satır kimlikleri kartlarla aynı (ornek sayfası bunlarla süzer).
    expect(ADVANTAGE_ROWS.map((row) => row.id)).toEqual(
      expect.arrayContaining([RADIO_SHOWCASE.id, RED_PEN_SHOWCASE.id, CLASS_SHARE_SHOWCASE.id]),
    );
    // Ana sayfanın fark satırlarına yenileri girmez (orada kartla anlatılıyor); sınav sabahı kâğıdı satırı da çıktı:
    // kâğıdı "Sınıfla paylaş" kartı ve turun Plus adımı anlatıyor (aynı özellik sayfada üç kez anlatılmaz).
    const home = render(<LandingDuel />);
    const rows = home.container.querySelectorAll("ol.hm-duel-list > li");
    expect(rows).toHaveLength(4);
    expect(home.container.querySelector("ol.hm-duel-list")?.textContent ?? "").not.toMatch(/Sınav Sabahı/i);
  });
});

describe("dürüstlük ve sıfır çağrı", () => {
  it("metinde rakip adı yok; karşı taraf her yerde 'Genel yapay zekâ botları'; tutulamayan söz yok", () => {
    const copy = allShowcaseCopy();
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(copy.toLocaleLowerCase("tr")).not.toContain(brand.toLocaleLowerCase("tr"));
    expect(copy).toContain(SHOWCASE_COMPARE_LABELS.them);
    expect(copy).not.toMatch(/%100|garanti|her zaman|asla|sınırsız|kilit ekranında bile/i);
    // Radyo kilit ekranında çalmayı vaat etmez; yönetimden söz eder (MediaSession).
    expect(RADIO_SHOWCASE.compare.cortex).toContain("kilit ekranından ve kulaklıktan yönetilir");
    expect(read("src/components/landing/fark-vitrini-radio.tsx")).toContain("mediaSession");
    // Kırmızı kalem bugünkü yolu söyler: yazılı denemenin "Kâğıtta çöz" seçeneği, Plus.
    expect(RED_PEN_SHOWCASE.note).toContain("Kâğıtta çöz");
    expect(RED_PEN_SHOWCASE.compare.cortex).toMatch(/^Yazılı denemeyi kâğıda çözüp fotoğrafını çekersin/);
    // +50 kredinin koşulu: arkadaş 1. ünitenin konu testini bitirir; ayda en çok 5 arkadaş.
    const reward = ADVANTAGE_ROWS.find((row) => row.id === "sinif-klonlama")!.cortex.body;
    expect(reward).toContain("konu testini bitirince");
    expect(reward).toContain("ayda en çok 5 arkadaş");
    for (const row of ADVANTAGE_ROWS) {
      for (const ref of row.evidence) expect(() => readFileSync(ref.split(" ")[0]!), ref).not.toThrow();
    }
  });

  it("vitrin dosyalarında model, ses üretimi ya da ağ çağrısı yok; ses yalnız public/ornek kayıtlarından", () => {
    const files = [
      "src/lib/marketing/fark-vitrini.ts",
      "src/components/landing/fark-vitrini.tsx",
      "src/components/landing/fark-vitrini-radio.tsx",
      "src/components/landing/fark-vitrini-red-pen.tsx",
      "src/components/landing/fark-vitrini-parts.tsx",
    ];
    for (const file of files) {
      const src = withoutComments(read(file));
      expect(src, file).not.toMatch(/fetch\(|\/api\/|openai|speechSynthesis|SpeechSynthesisUtterance|XMLHttpRequest|sendBeacon|autoPlay|autoplay/i);
    }
    for (const clip of demoRadioPlaylist()) {
      expect(clip.src.startsWith("/ornek/")).toBe(true);
      expect(() => readFileSync(`public${clip.src}`)).not.toThrow();
    }
    // Pazarlama kabuğu Google Fonts'a gitmez: emekli DM Serif @import'u kalktı (sayfa yalnız kendi sunucusundan yüklenir).
    expect(read("src/styles/parity-app.css")).not.toMatch(/@import url\("https?:/);
    // Sınıfla paylaş kartı sunucu bileşeni: QR üreticisi istemci paketine girmez.
    expect(read("src/components/landing/fark-vitrini.tsx")).not.toContain('"use client"');
    expect(read("src/components/landing/fark-vitrini-radio.tsx")).not.toContain("qr-svg");
  });
});
