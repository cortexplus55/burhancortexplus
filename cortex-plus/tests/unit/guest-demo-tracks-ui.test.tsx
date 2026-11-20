// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} />,
}));

import { AudienceHero } from "@/components/landing/audience-hero";
import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { TourPlusPreview } from "@/components/landing/tour/plus-previews";
import { TourProductScreen } from "@/components/landing/tour/product-screens";
import { DEMO_PODCASTS } from "@/lib/demo/demo-podcasts";
import { GUEST_TOUR_CONTENT } from "@/lib/demo/guest-tour-tracks";
import { clearGuestDocuments } from "@/lib/documents/guest-handoff";
import { TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import { GUEST_DEMO_TRACKS, GUEST_TRACK_IDS } from "@/lib/marketing/guest-demo-tracks";
import { JOURNEY_TRACKS_COPY, journeyFile, journeyRoadmap, journeyWarning } from "@/lib/marketing/landing-journey";

/*
  Faz 7 (20 Kasım 2026): kahramanın sekmeleri ve turun branş şeridi tek durum. Şeritten branş seçilince tur o branşın
  notuyla birinci adımdan kurulur ve sekme eşlenir; sekme seçilince tur sekmenin branşına geçer. Ürün ekranları ve Plus
  önizlemeleri branşın verisini çizer; hiç ağ isteği atılmaz.
*/

Element.prototype.scrollIntoView = vi.fn();
window.HTMLMediaElement.prototype.pause = () => undefined;

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await clearGuestDocuments();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const noop = () => undefined;
const strip = () => screen.getByRole("radiogroup", { name: JOURNEY_TRACKS_COPY.aria });
const chip = (label: string) => within(strip()).getByRole("radio", { name: label });

describe("branş şeridi", () => {
  it("turun üstünde dört branş; seçili olan sekmenin branşı; tek seçimli grup ve ok tuşları", () => {
    render(<FuturisticGuidedJourney segmentId="universite" />);
    const radios = within(strip()).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(Object.values(GUEST_DEMO_TRACKS).map((track) => track.label));
    expect(chip("Üniversite · Mühendislik").getAttribute("aria-checked")).toBe("true");
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
    // Şerit konsolun hemen üstünde (turun kartı).
    const wrap = document.querySelector(".lj-wrap")!;
    expect(wrap.firstElementChild?.getAttribute("role")).toBe("radiogroup");
    expect(wrap.firstElementChild?.nextElementSibling?.className).toContain("lj-console");
    // Ok tuşu seçimi ve odağı kaydırır.
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    expect(chip("TUS / Tıp · Farmakoloji").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(chip("TUS / Tıp · Farmakoloji"));
    expect(screen.getByRole("button", { name: new RegExp(journeyFile("tus").name) })).toBeTruthy();
  });

  it("şerit dokunma alanı 44 px, dar ekranda sarar; mavi yok", () => {
    const css = readFileSync("src/styles/landing-journey.css", "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/\.lj-track \{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(/\.lj-tracks \{[^}]*flex-wrap: wrap;/);
    const block = css.slice(css.indexOf(".lj-tracks {"), css.indexOf("/* ---------- Konsol ---------- */"));
    expect(block).not.toMatch(/overflow-x|#4353f3|#6366f1|#4f46e5/i);
  });

  it("branş değişince tur birinci adımdan, o branşın notuyla yeniden kurulur; eski cevaplar silinir", async () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    // Lise turunda doğru/yanlış oynanır, sonuç halkası çizilir; stüdyo kapanır, ilerleme korunur.
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım \d: / })[5]!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const app = within(document.querySelector(".tp-app") as HTMLElement);
    fireEvent.click(app.getByRole("button", { name: /^Doğru/ }));
    fireEvent.click(app.getByRole("button", { name: "Sonraki önerme" }));
    fireEvent.click(app.getByRole("button", { name: /^Yanlış/ }));
    fireEvent.click(app.getByRole("button", { name: "Sonucu gör" }));
    expect(screen.getByText("2 sorudan 2 doğru")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    const homeStops = () => within(container.querySelector(".lj-console") as HTMLElement).getAllByRole("button", { name: /^Adım \d: / });
    expect(homeStops()[5]!.getAttribute("aria-current")).toBe("step");

    // Hukuk seçilir: tur başa döner, örnek not anayasa notu, bağlam satırı hukukun.
    fireEvent.click(chip("KPSS / Hukuk · Anayasa"));
    expect(homeStops()[0]!.getAttribute("aria-current")).toBe("step");
    expect(container.querySelector(".lj-context")?.textContent).toBe(GUEST_DEMO_TRACKS.hukuk.context);
    expect(screen.getByRole("button", { name: new RegExp(journeyFile("hukuk").name) })).toBeTruthy();
    expect(container.querySelector(".lj-file-text.is-switched")).toBeTruthy();

    // Doğru/yanlışa dönülünce hukukun önermeleri, sonuç yok (lise cevapları karışmaz).
    fireEvent.click(homeStops()[5]!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.queryByText("2 sorudan 2 doğru")).toBeNull();
    expect(document.querySelector('.tp-frame[data-track="hukuk"][data-screen="check"]')).toBeTruthy();
    expect(screen.getByText(GUEST_TOUR_CONTENT.hukuk.trueFalse[0]!.text)).toBeTruthy();
  });

  it("taramada branşın bulguları, yol haritasında branşın konuları, üst çubukta branşın uyarısı", () => {
    vi.useFakeTimers();
    render(<FuturisticGuidedJourney segmentId="akademik" />);
    fireEvent.click(chip("TUS / Tıp · Farmakoloji"));
    const file = journeyFile("tus");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(file.name) }));
    const finds = [...document.body.querySelectorAll(".lj-studio [data-scan-findings] [data-finding]")].map((node) => node.textContent);
    expect(finds[0]).toBe("18 sayfa");
    expect(finds[1]).toBe("4 konu");
    expect(finds[2]).toContain("Amiodaron");
    act(() => {
      vi.advanceTimersByTime(file.scanMs);
    });
    for (const day of journeyRoadmap("tus").days) expect(screen.getByText(day.title)).toBeTruthy();
    const badge = document.body.querySelector<HTMLElement>(".lj-studio [data-warning]")!;
    expect(badge.textContent).toContain(journeyWarning("tus").label);
    expect(badge.getAttribute("title")).toBe(GUEST_DEMO_TRACKS.tus.warning);
  });

  it("mühendislik uyarısının alt simgesi turun yazısında da düşmez (d_sıvı → d<sub>sıvı</sub>)", () => {
    render(<FuturisticGuidedJourney segmentId="universite" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(journeyFile("muhendislik").name) }));
    const warning = document.body.querySelector(".lj-studio [data-finding='warning']")!;
    expect(warning.querySelector("sub")?.textContent).toBe("sıvı");
    expect(warning.textContent).not.toContain("_");
  });

  it("stüdyo kapalıyken tur ilerlemesi yalnız lise branşında yazılır (kayıttan sonraki kart Köklü Sayılar'ı açar)", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: noop, removeEventListener: noop })),
    );
    render(<FuturisticGuidedJourney segmentId="universite" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(journeyFile("muhendislik").name) }));
    expect(window.sessionStorage.getItem("cp:guest-tour")).toBeNull();
  });
});

describe("kahraman sekmesi ↔ branş şeridi: tek durum", () => {
  const tab = (name: RegExp) => screen.getByRole("tab", { name });

  it("sekme seçilince tur sekmenin branşına geçer; şeritten seçilen branş sekmeyi eşler", () => {
    render(<AudienceHero />);
    expect(tab(/Lise & Yazılı/).getAttribute("aria-selected")).toBe("true");
    expect(chip("Lise & YKS · Matematik").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(tab(/Üniversite/));
    expect(chip("Üniversite · Mühendislik").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: new RegExp(journeyFile("muhendislik").name) })).toBeTruthy();

    // TUS akademik sekmenin kapsamında; adres de güncellenir.
    fireEvent.click(chip("TUS / Tıp · Farmakoloji"));
    expect(tab(/KPSS · TUS/).getAttribute("aria-selected")).toBe("true");
    expect(window.location.search).toContain("hedef=akademik");
    expect(screen.getByRole("link", { name: /Sınav kampını ücretsiz başlat/ }).getAttribute("href")).toBe("/kayit?hedef=akademik");

    // Akademik sekme seçiliyken hukuk seçilirse sekme yerinde kalır.
    fireEvent.click(chip("KPSS / Hukuk · Anayasa"));
    expect(tab(/KPSS · TUS/).getAttribute("aria-selected")).toBe("true");

    // YKS/LGS sekmesi lise branşını açar; şeritten lise seçilince YKS/LGS sekmesi yerinde kalır.
    fireEvent.click(tab(/YKS & LGS/));
    expect(chip("Lise & YKS · Matematik").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(chip("Lise & YKS · Matematik"));
    expect(tab(/YKS & LGS/).getAttribute("aria-selected")).toBe("true");

    // Mühendislik seçilince sekme üniversiteye geçer.
    fireEvent.click(chip("Üniversite · Mühendislik"));
    expect(tab(/Üniversite/).getAttribute("aria-selected")).toBe("true");
  });
});

describe("ürün ekranları ve önizlemeler branşın verisini çizer, istek atmaz", () => {
  it("TUS konu testi: iki şık ipucu yerel, cevabı söylemez; doğru şık kilitlenince bildirilir", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onQuestion = vi.fn();
    const { container } = render(<TourProductScreen screen="question" track="tus" onDone={noop} onExit={noop} onQuestion={onQuestion} onTruth={noop} />);
    const question = GUEST_TOUR_CONTENT.tus.quiz[0]!;
    expect(screen.getByText(/K⁺ kanallarını bloke ederek QT aralığını uzatır/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: TWO_OPTION_CHIP }));
    const pair = within(container.querySelector(".cp-two") as HTMLElement);
    fireEvent.click(pair.getByRole("button", { name: "B" }));
    fireEvent.click(pair.getByRole("button", { name: "C" }));
    const hint = await screen.findByText(/repolarizasyonu uzatan bir kanalı/);
    expect(hint.textContent).not.toMatch(/sotalol/i);
    fireEvent.click(screen.getByText("Sotalol", { selector: "button *, button" }));
    fireEvent.click(screen.getByRole("button", { name: /Kontrol et/ }));
    expect(onQuestion).toHaveBeenCalledWith(true);
    expect(screen.getByText(question.explanation!)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hukuk dersi ürünün ders ekranında açılır; mühendislik kartı ve önermesi kendi branşının", () => {
    render(<TourProductScreen screen="lesson" track="hukuk" onDone={noop} onExit={noop} onQuestion={noop} onTruth={noop} />);
    expect(screen.getByText(GUEST_TOUR_CONTENT.hukuk.lesson.title)).toBeTruthy();
    cleanup();
    const { container } = render(<TourProductScreen screen="cards" track="muhendislik" onDone={noop} onExit={noop} onQuestion={noop} onTruth={noop} />);
    expect(screen.getByText(GUEST_TOUR_CONTENT.muhendislik.cards[0]!.front)).toBeTruthy();
    expect(container.querySelector('.tp-frame[data-track="muhendislik"]')).toBeTruthy();
    cleanup();
    const onTruth = vi.fn();
    render(<TourProductScreen screen="check" track="muhendislik" onDone={noop} onExit={noop} onQuestion={noop} onTruth={onTruth} />);
    fireEvent.click(screen.getByRole("button", { name: /^Doğru/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonraki önerme" }));
    fireEvent.click(screen.getByRole("button", { name: /^Yanlış/ }));
    expect(screen.getByText(/✏️ Doğrusu: Tamamen batmış bir cisme etki eden kaldırma kuvveti derinlikle değişmez/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sonucu gör" }));
    expect(onTruth).toHaveBeenCalledWith(2, 2);
  });

  it("çizimli video: hukukta karar ağacı + çoğunluk barometresi, TUS'ta kanal blokajı; sahneler döner", () => {
    vi.useFakeTimers();
    const { container } = render(<TourPlusPreview preview="video" track="hukuk" />);
    expect(container.querySelector('[data-video="reel"] svg[data-archetype="LAW_SOCIAL_FLOWCHART"]')).toBeTruthy();
    expect(container.textContent).toContain("ÇOĞUNLUK BAROMETRESİ");
    expect(screen.getByText("Sahne 1/2")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(7300);
    });
    expect(screen.getByText("Sahne 2/2")).toBeTruthy();
    cleanup();
    const tus = render(<TourPlusPreview preview="video" track="tus" />);
    expect(tus.container.querySelector('svg[data-archetype="MEDICAL_BIOLOGY_PATHWAY"]')).toBeTruthy();
    expect(tus.container.textContent).toContain("K⁺");
  });

  it("Büyüt: sahne sığdırma katmanının dışında (portal) iletişim penceresinde açılır; Esc kapatır, odak düğmeye döner", () => {
    vi.useFakeTimers();
    const { container } = render(<TourPlusPreview preview="video" track="tus" />);
    const open = screen.getByRole("button", { name: "Büyüt" });
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Pencere önizlemenin kabının dışında (body altında); sahne yalnız pencerede çizilir, yuva boşalır.
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.querySelector('svg[data-archetype="MEDICAL_BIOLOGY_PATHWAY"]')).toBeTruthy();
    expect(container.querySelector(".tpp-video-slot svg")).toBeNull();
    expect(document.activeElement?.textContent).toContain("Küçült");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
    expect(container.querySelector(".tpp-video-slot svg")).toBeTruthy();
    // Lise tahtası da büyür; zemine dokunmak kapatır.
    cleanup();
    render(<TourPlusPreview preview="video" track="lise" />);
    fireEvent.click(screen.getByRole("button", { name: "Büyüt" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sınav sabahı kâğıdı branşın dersinden; podcast kesiti yoksa önizleme hiçbir şey çizmez", () => {
    const { container } = render(<TourPlusPreview preview="sheet" track="hukuk" />);
    const paper = container.querySelector(".tpp-paper .cp-cram.cp-cram-preview") as HTMLElement;
    expect(paper.textContent).toContain("301");
    expect(paper.querySelector("h3#cram-title")).toBeTruthy();
    expect(paper.textContent).toContain(GUEST_TOUR_CONTENT.hukuk.prep.title);
    cleanup();
    // Kesiti olmayan branşta tur podcast sekmesini göstermez; önizleme de boş kalır (yer tutucu yazı yok). Kesiti
    // olan branşta podcast çizilir. (Kesitler sonradan eklenir; test hangisi eksikse onu dener.)
    for (const id of GUEST_TRACK_IDS) {
      const shown = render(<TourPlusPreview preview="podcast" track={id} />);
      const pod = shown.container.querySelector('[data-preview="podcast"]');
      if (DEMO_PODCASTS[id]) {
        expect(pod, id).toBeTruthy();
        expect(shown.container.querySelector("audio")?.getAttribute("src"), id).toBe(DEMO_PODCASTS[id]!.src);
      } else {
        expect(pod, id).toBeNull();
        expect(shown.container.textContent, id).toBe("");
      }
      cleanup();
    }
  });
});
