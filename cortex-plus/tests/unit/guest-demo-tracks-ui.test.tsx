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
import { GUEST_DEMO_TRACKS, GUEST_TRACK_IDS, HERO_PICK_ARIA, heroPickName } from "@/lib/marketing/guest-demo-tracks";
import { JOURNEY_FILE, journeyFile, journeyRoadmap, journeyWarning } from "@/lib/marketing/landing-journey";

/*
  Faz 7 (20 Kasım 2026): tur seçilen branşın örnek notuyla oynanır; ürün ekranları ve Plus önizlemeleri branşın
  verisini çizer; hiç ağ isteği atılmaz.

  Faz 9 (20 Kasım 2026): kahramanın dört sekmesi ile turun branş şeridi TEK seçicide birleşti. Seçici kahramanda;
  seçilen branş kahramanın cümlesini, kayıt düğmesini ve turu birlikte değiştirir. Turun kendisinde seçici yok.
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
const picker = () => screen.getByRole("radiogroup", { name: HERO_PICK_ARIA });
const option = (track: (typeof GUEST_TRACK_IDS)[number]) => within(picker()).getByRole("radio", { name: heroPickName(track) });
const start = () => screen.getByRole("button", { name: JOURNEY_FILE.start });
/** Ana sayfadaki bırakma alanının rozeti: seçili branşın örnek notu. */
const badge = (container: HTMLElement) => container.querySelector(".lj-drop-badge") as HTMLElement;

describe("tek seçici: kahramanda dört seçenek, turda seçici yok", () => {
  it("dört seçenek sırayla; tek seçimli grup; ok tuşları, Home ve End seçimi ve odağı birlikte kaydırır", () => {
    render(<AudienceHero />);
    const radios = within(picker()).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Lise & YKS · Matematik",
      "Üniversite · Mühendislik",
      "TUS / Tıp · Farmakoloji",
      "KPSS / Hukuk · Anayasa",
    ]);
    // Görünen iki satır: seçeneğin adı ve örnek notun alanı.
    expect(radios.map((radio) => radio.querySelector(".lp-pick-name")?.textContent)).toEqual(["Lise & YKS", "Üniversite", "TUS / Tıp", "KPSS / Hukuk"]);
    expect(radios.map((radio) => radio.querySelector(".lp-pick-field")?.textContent)).toEqual(["Matematik", "Mühendislik", "Farmakoloji", "Anayasa"]);
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(option("lise").getAttribute("aria-checked")).toBe("true");
    // Yalnız seçili seçenek sekmeyle odak alır.
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1]);
    fireEvent.keyDown(picker(), { key: "ArrowRight" });
    expect(option("muhendislik").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(option("muhendislik"));
    fireEvent.keyDown(picker(), { key: "End" });
    expect(option("hukuk").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(option("hukuk"));
    fireEvent.keyDown(picker(), { key: "ArrowRight" });
    expect(option("lise").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(picker(), { key: "ArrowLeft" });
    expect(option("hukuk").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(picker(), { key: "Home" });
    expect(option("lise").getAttribute("aria-checked")).toBe("true");
    // Seçici kahramanda; turun içinde ikinci bir seçici (eski branş şeridi) yok.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(document.querySelector("[data-tracks], .lj-tracks, .lj-track")).toBeNull();
    expect(document.querySelector("section#nasil")?.contains(picker())).toBe(false);
  });

  it("seçim kahramanın cümlesini, kayıt düğmesini, adresi ve turun örnek notunu birlikte değiştirir", () => {
    const { container } = render(<AudienceHero />);
    const cta = () => container.querySelector("[data-hero-cta]") as HTMLAnchorElement;
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=lise");
    expect(badge(container).textContent).toContain(journeyFile("lise").name);

    fireEvent.click(option("muhendislik"));
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=universite");
    expect(cta().textContent).toContain("Vize-final kampını ücretsiz başlat");
    expect(container.querySelector(".hm-lead")?.textContent).toContain("vizeden önce");
    expect(badge(container).textContent).toContain(journeyFile("muhendislik").name);
    expect(badge(container).textContent).toContain("14 sayfa");
    expect(window.location.search).toBe("?hedef=universite");

    // TUS kendi profili: kendi cümlesi, kendi düğmesi, kayıtta TUS.
    fireEvent.click(option("tus"));
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=tus");
    expect(cta().textContent).toContain("TUS kampını ücretsiz başlat");
    expect(container.querySelector(".hm-lead")?.textContent).toContain("TUS");
    expect(badge(container).textContent).toContain("Kardiyoloji_Antiaritmikler_TUS_Notu.pdf");
    expect(window.location.search).toBe("?hedef=tus");

    fireEvent.click(option("hukuk"));
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=akademik");
    expect(badge(container).textContent).toContain("Anayasa_Yasama_Sureci_Notu.pdf");
    expect(window.location.search).toBe("?hedef=akademik");
    // Bırakma alanının rozeti branş değişince yeniden belirir (ilk yükte hareket yok).
    expect(badge(container).className).toContain("is-switched");
  });

  it("eski bağlantı ?hedef=yks-lgs: 'Lise & YKS' seçili, kayıt bağlantısında yks-lgs kalır; seçeneğe yeniden basmak profili ezmez", () => {
    window.history.replaceState(null, "", "/?hedef=yks-lgs");
    const { container } = render(<AudienceHero />);
    expect(option("lise").getAttribute("aria-checked")).toBe("true");
    const cta = () => container.querySelector("[data-hero-cta]") as HTMLAnchorElement;
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=yks-lgs");
    fireEvent.click(option("lise"));
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=yks-lgs");
    // Başka branşa gidip dönünce seçeneğin varsayılan profili (lise).
    fireEvent.click(option("tus"));
    fireEvent.click(option("lise"));
    expect(cta().getAttribute("href")).toBe("/kayit?hedef=lise");
    expect(window.location.search).toBe("?hedef=lise");
  });

  it("eski bağlantılar: universite → Üniversite, akademik → KPSS / Hukuk, tus → TUS / Tıp; utm'de dus → TUS", () => {
    for (const [query, track] of [
      ["?hedef=universite", "muhendislik"],
      ["?hedef=akademik", "hukuk"],
      ["?hedef=tus", "tus"],
      ["?hedef=lise", "lise"],
      ["?utm_campaign=dus-2027", "tus"],
      ["?utm_campaign=kpss_2027", "hukuk"],
    ] as const) {
      window.history.replaceState(null, "", `/${query}`);
      render(<AudienceHero />);
      expect(option(track).getAttribute("aria-checked"), query).toBe("true");
      cleanup();
    }
  });

  it("seçici dokunma alanı 56 px, dar ekranda iki sütun; seçili seçenek kâğıt beyazı, mavi yok", () => {
    const css = readFileSync("src/styles/landing-showcase.css", "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/\.lp-pick-opt \{[^}]*min-height: 3\.5rem;/);
    expect(css).toMatch(/@media \(max-width: 599px\) \{\s*\.lp-pick \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).not.toMatch(/overflow-x|#4353f3|#6366f1|#4f46e5|indigo/i);
  });

  it("branş değişince tur birinci adımdan, o branşın notuyla yeniden kurulur; eski cevaplar silinir", async () => {
    const { container, rerender } = render(<FuturisticGuidedJourney segmentId="lise" />);
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

    // Kahramanda KPSS / Hukuk seçilir: tur başa döner, örnek not anayasa notu.
    rerender(<FuturisticGuidedJourney segmentId="akademik" />);
    expect(homeStops()[0]!.getAttribute("aria-current")).toBe("step");
    expect(badge(container).textContent).toContain(journeyFile("hukuk").name);
    expect(badge(container).className).toContain("is-switched");

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
    render(<FuturisticGuidedJourney segmentId="tus" />);
    const file = journeyFile("tus");
    fireEvent.click(start());
    const finds = [...document.body.querySelectorAll(".lj-studio [data-scan-findings] [data-finding]")].map((node) => node.textContent);
    expect(finds[0]).toBe("18 sayfa");
    expect(finds[1]).toBe("4 konu");
    expect(finds[2]).toContain("Amiodaron");
    act(() => {
      vi.advanceTimersByTime(file.scanMs);
    });
    for (const day of journeyRoadmap("tus").days) expect(screen.getByText(day.title)).toBeTruthy();
    const warn = document.body.querySelector<HTMLElement>(".lj-studio [data-warning]")!;
    expect(warn.textContent).toContain(journeyWarning("tus").label);
    expect(warn.getAttribute("title")).toBe(GUEST_DEMO_TRACKS.tus.warning);
  });

  it("mühendislik uyarısının alt simgesi turun yazısında da düşmez (d_sıvı → d<sub>sıvı</sub>)", () => {
    render(<FuturisticGuidedJourney segmentId="universite" />);
    fireEvent.click(start());
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
    fireEvent.click(start());
    expect(window.sessionStorage.getItem("cp:guest-tour")).toBeNull();
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
