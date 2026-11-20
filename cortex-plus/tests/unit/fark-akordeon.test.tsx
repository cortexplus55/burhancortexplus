// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  "Aynı not, iki ayrı sonuç" akordeonu, güven satırı ve beş soruluk SSS (Faz 9, 20 Kasım 2026). Ürün sahibi: bölümde üç
  ayrı düzende on kart vardı (aynı not kartı, üç kartlık fark vitrini, dört açılır fark satırı); tek, bölünmüş, görsel bir
  akordeon olsun. Plan kartlarının altındaki üç paragraf tek satıra, SSS dokuz sorudan beşe insin.

  Bu test şunları tutar:
  - Akordeon: altı başlık, bir anda tek başlık açık, ilk yüklemede 1. başlık açık; başka başlık sahneyi değiştirir; açık
    başlık kapanmaz; ↑ ↓ Home End başlıklar arasında gezer; WAI-ARIA bağları doğru.
  - Altı başlığın sözü bugün üründe doğru: sayılar sabitlerden, Plus işleri etiketli, rakip adı yok, tutulamayan söz yok.
  - Sahnelerin örnek hesapları yeniden hesaplanınca tutar; ipucu cevabı ve rakamı söylemez.
  - Güven satırı tek satır, üç öğe; SSS beş soru, altında Yardım Merkezi bağlantısı.
  - CSS: iki sütun 5/12 – 7/12, sahne yapışkan, telefonda sahne başlığın içinde; mavi yok; yazı ve dokunma tabanı.
*/

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Sayfa testi yalnız SSS ve güven satırına bakar: kahraman/kokpit ve logo hareketi başka testlerin işi.
vi.mock("@/components/landing/audience-hero", () => ({ AudienceHero: () => null }));
vi.mock("@/components/brand/cortex-logo-reveal", () => ({ CortexLogoReveal: () => null }));

import { LandingDuel } from "@/components/landing/landing-duel";
import { TwinScene } from "@/components/landing/fark-twin-scene";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";
import { PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { CLONE_REWARD_CREDITS, CLONE_REWARD_MONTHLY_CAP } from "@/lib/learning/class-share";
import { PAST_MIN_QUESTIONS, TWIN_EXAM_QUESTION_COUNT } from "@/lib/learning/mock-exam/past-questions";
import { TWIN_BUTTON, TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import { FORBIDDEN_BRAND_NAMES, SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import {
  FARK_ITEMS,
  FARK_LABELS,
  FARK_SECTION,
  NOTE_SCENE,
  PARENT_LINK_SCENE,
  SILENT_ORAL_SCENE,
  TWIN_EXAM_SCENE,
  TWIN_SCENE,
  allFarkAccordionCopy,
  twinSceneHint,
} from "@/lib/marketing/fark-accordion";
import { CLASS_SHARE_SHOWCASE, RADIO_SHOWCASE, RED_PEN_SHOWCASE } from "@/lib/marketing/fark-vitrini";
import { FAQ, FAQ_MORE, HOME_COPY, TRUST_LINE } from "@/lib/marketing/landing-content";
import { AUTO_RENEW_SUPPORTED } from "@/lib/payments/paytr-capability";
import { PARENT_LINK_TTL_HOURS, PARENT_LINK_TTL_MS } from "@/lib/payments/parent-link-ttl";
import { PARENT_LINK_TTL_MS as SIGNED_TTL } from "@/lib/payments/parent-link";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const triggers = () => FARK_ITEMS.map((item) => document.getElementById(`fk-trigger-${item.id}`) as HTMLButtonElement);
const panels = () => FARK_ITEMS.map((item) => document.getElementById(`fk-panel-${item.id}`) as HTMLElement);
const scenes = () => [...document.querySelectorAll<HTMLElement>('[data-testid="fark-scene"]')];

describe("akordeon: tek başlık açık, sahne değişir", () => {
  it("bölüm #farklar çapası ve başlığıyla; altı başlık; ilk yüklemede 1. başlık açık ve sahnesi çizili", () => {
    render(<LandingDuel />);
    const section = document.querySelector("section#farklar") as HTMLElement;
    expect(section.getAttribute("data-testid")).toBe("advantage-comparison");
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Aynı not, iki ayrı sonuç");
    expect(HOME_COPY.duel.title).toBe("Aynı not, iki ayrı sonuç");

    expect(FARK_ITEMS).toHaveLength(6);
    const headings = within(section).getAllByRole("heading", { level: 3 }).filter((node) => node.classList.contains("fk-head"));
    expect(headings.map((node) => node.querySelector(".fk-title")?.textContent)).toEqual(FARK_ITEMS.map((item) => item.title));

    const [first, ...rest] = triggers();
    expect(first!.getAttribute("aria-expanded")).toBe("true");
    expect(first!.getAttribute("aria-disabled")).toBe("true");
    for (const trigger of rest) {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.hasAttribute("aria-disabled")).toBe(false);
    }
    const [firstPanel, ...restPanels] = panels();
    expect(firstPanel!.hidden).toBe(false);
    for (const panel of restPanels) expect(panel.hidden).toBe(true);
    expect(scenes()).toHaveLength(1);
    expect(scenes()[0]!.getAttribute("data-scene")).toBe("notuna-sadik");
    expect(within(scenes()[0]!).getByTestId("same-note-case")).toBeTruthy();
    // Eski yığın gitti: üç kartlık ızgara ve açılır fark satırları yok.
    expect(section.querySelector('[data-testid="fark-vitrini"]')).toBeNull();
    expect(section.querySelector("ol.hm-duel-list, details.hm-duel-item")).toBeNull();
  });

  it("WAI-ARIA: düğme panelini, panel düğmesini gösterir; sahne başlığın adıyla etiketli", () => {
    render(<LandingDuel />);
    FARK_ITEMS.forEach((item, at) => {
      const trigger = triggers()[at]!;
      const panel = panels()[at]!;
      expect(trigger.tagName).toBe("BUTTON");
      expect(trigger.getAttribute("type")).toBe("button");
      expect(trigger.parentElement?.tagName).toBe("H3");
      expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.getAttribute("role")).toBe("region");
      expect(panel.getAttribute("aria-labelledby")).toBe(trigger.id);
    });
    expect(scenes()[0]!.getAttribute("role")).toBe("group");
    expect(scenes()[0]!.getAttribute("aria-label")).toBe(`${FARK_ITEMS[0]!.title}: ${FARK_SECTION.sceneSuffix}`);
  });

  it("başka başlığa dokununca o açılır, öbürü kapanır, sahne değişir; açık başlığa dokunmak kapatmaz", () => {
    render(<LandingDuel />);
    const expected: Record<string, string> = {
      "notuna-sadik": "same-note-case",
      "sinav-radyosu": "showcase-radio",
      "kirmizi-kalem": "showcase-red-pen",
      "ikiz-soru": "twin-scene",
      "ikiz-sinav": "twin-exam-scene",
      "sinifla-paylas": "share-scene",
    };
    FARK_ITEMS.forEach((item, at) => {
      fireEvent.click(triggers()[at]!);
      triggers().forEach((trigger, other) => {
        expect(trigger.getAttribute("aria-expanded"), `${item.id} → ${other}`).toBe(String(other === at));
      });
      panels().forEach((panel, other) => expect(panel.hidden).toBe(other !== at));
      expect(scenes()).toHaveLength(1);
      const scene = scenes()[0]!;
      expect(scene.getAttribute("data-scene")).toBe(item.id);
      expect(within(scene).getByTestId(expected[item.id]!)).toBeTruthy();
      expect(document.querySelector('[data-testid="fark-accordion"]')?.getAttribute("data-open")).toBe(item.id);
      // Sahne açık başlığın içinde: başlığın sarmalayıcısında, metninin hemen ardından (telefonda böyle görünür).
      const wrapper = scene.parentElement as HTMLElement;
      expect(wrapper.getAttribute("data-item")).toBe(item.id);
      expect(panels()[at]!.nextElementSibling).toBe(scene);
      expect(wrapper.classList.contains("is-open") && wrapper.classList.contains("has-scene")).toBe(true);
    });
    // Açık başlığa yeniden dokunmak hiçbir şeyi kapatmaz.
    fireEvent.click(triggers()[5]!);
    expect(triggers()[5]!.getAttribute("aria-expanded")).toBe("true");
    expect(scenes()).toHaveLength(1);
  });

  it("klavye: ↓ ↑ başlıklar arasında gezer (sarar), Home ilk, End son; Enter/Space yerel düğme", () => {
    render(<LandingDuel />);
    const list = triggers();
    list[0]!.focus();
    fireEvent.keyDown(list[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(list[1]);
    fireEvent.keyDown(list[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(list[5]);
    fireEvent.keyDown(list[5]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0]!, { key: "End" });
    expect(document.activeElement).toBe(list[5]);
    fireEvent.keyDown(list[5]!, { key: "Home" });
    expect(document.activeElement).toBe(list[0]);
    // Gezinmek açmaz; açmak düğmenin kendi işi (Enter/Space yerel düğmede tıklama olur).
    expect(list[0]!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(list[0]!, { key: "ArrowDown" });
    fireEvent.click(document.activeElement as HTMLElement);
    expect(list[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(list[0]!.getAttribute("aria-expanded")).toBe("false");
  });

  it("açılan başlık görünür alana getirilir; ilk yüklemede kaydırma yok", () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      render(<LandingDuel />);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(triggers()[3]!);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.calls[0]![0]).toMatchObject({ block: "nearest" });
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("bölümün altında tek bağlantı: tam karşılaştırma Özellikler sayfasında", () => {
    render(<LandingDuel />);
    const link = screen.getByRole("link", { name: HOME_COPY.duel.more });
    expect(HOME_COPY.duel.more).toBe("Tüm özellikleri karşılaştır");
    expect(link.getAttribute("href")).toBe(FARK_SECTION.moreHref);
    expect(FARK_SECTION.moreHref.startsWith("/ozellikler")).toBe(true);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("altı başlığın sözü bugün üründe doğru", () => {
  it("her başlık en çok iki kısa cümle ve tek satırlık fark; ekranda iki etiketle", () => {
    render(<LandingDuel />);
    FARK_ITEMS.forEach((item, at) => {
      expect(item.body.length, item.id).toBeGreaterThanOrEqual(1);
      expect(item.body.length, item.id).toBeLessThanOrEqual(2);
      for (const sentence of item.body) {
        // Her parça tek cümle: sonda nokta, içeride cümle bitişi yok (kısaltma ve sayı yok sayılarak).
        expect(sentence.trim().endsWith("."), sentence).toBe(true);
        expect(sentence.slice(0, -1).match(/[.!?]\s+[A-ZÇĞİÖŞÜ]/g), sentence).toBeNull();
        expect(sentence.length, sentence).toBeLessThanOrEqual(200);
      }
      expect(`${item.diff.them}${item.diff.us}`.length, item.id).toBeLessThanOrEqual(110);
      fireEvent.click(triggers()[at]!);
      const panel = panels()[at]!;
      for (const sentence of item.body) expect(within(panel).getByText(sentence)).toBeTruthy();
      const diff = panel.querySelector(".fk-diff") as HTMLElement;
      expect(diff.textContent).toBe(`${FARK_LABELS.them}: ${item.diff.them} ${FARK_LABELS.us}: ${item.diff.us}`);
      expect(diff.querySelector(".fk-diff-them")?.textContent).toBe(`${FARK_LABELS.them}: ${item.diff.them}`);
      expect(diff.querySelector(".fk-diff-us")?.textContent).toBe(`${FARK_LABELS.us}: ${item.diff.us}`);
    });
    expect(FARK_LABELS).toEqual({ them: "Genel botlar", us: "Cortex Plus", plus: "Plus" });
  });

  it("başlıklar ürün sahibinin; Plus işleri 'Plus' etiketli ve etiketler gerçek kilitlerle aynı", () => {
    expect(FARK_ITEMS.map((item) => item.title)).toEqual([
      "Notuna Sadık & Çift Kontrollü",
      "Otobüste Kesintisiz Sınav Radyosu",
      "Kırmızı Kalemli Hoca (Kâğıda Çöz, Fotoğrafla)",
      "Yanlışın İkizi & İki Şık İpucu",
      "Hocanın İkiz Sınavı (20 Soru) & Sessiz Sözlü",
      "Sınıfla Paylaş (+50 Kredi) & Velime Ödeme Linki",
    ]);
    const plus = Object.fromEntries(FARK_ITEMS.map((item) => [item.id, item.plus]));
    expect(plus).toEqual({
      "notuna-sadik": false,
      "sinav-radyosu": true, // podcast üretimi
      "kirmizi-kalem": true, // yazılı deneme ("Kâğıtta çöz")
      "ikiz-soru": false, // ikiz soru ve iki şık ipucu ücretsiz ilk derste de açık (plan kapısı yok)
      "ikiz-sinav": true, // yazılı deneme ve sözlü
      "sinifla-paylas": false, // paylaşım her hesapta; kâğıdın Plus olduğu sahnede yazılı
    });
    for (const code of ["PODCAST_GENERATE", "PRACTICE_EXAM_GENERATE", "ORAL_EXAM_GENERATE"] as const) expect(isPlusOnlyAction(code)).toBe(true);
    expect(PLUS_ONLY_FEATURES).toEqual(expect.arrayContaining(["Podcast", "Sözlü", "Yazılı Deneme", "Sınav Sabahı Kâğıdı"]));
    // Ücretsiz başlıkların anlattığı uçlarda plan kapısı yok.
    for (const route of ["src/app/api/learning/twin-question/route.ts", "src/app/api/learning/two-option-hint/route.ts"]) {
      expect(read(route), route).not.toMatch(/premium_required|free_lesson_limit|isPlusOnlyAction|plusOnly/);
    }
    render(<LandingDuel />);
    FARK_ITEMS.forEach((item, at) => {
      const badge = triggers()[at]!.querySelector(".fk-plus");
      expect(Boolean(badge), item.id).toBe(item.plus);
      if (badge) expect(badge.textContent).toBe("Plus");
    });
    // Sınıfla paylaş sahnesindeki kâğıdın Plus olduğu yazılı.
    expect(CLASS_SHARE_SHOWCASE.note).toContain("Sınav sabahı kâğıdı Plus'ta");
  });

  it("sayılar sabitlerden: ikiz sınav 20 soru ve en az 4 çıkmış soru, +50 kredi ve ayda 5 arkadaş, link 48 saat", () => {
    const byId = Object.fromEntries(FARK_ITEMS.map((item) => [item.id, item]));
    expect(TWIN_EXAM_QUESTION_COUNT).toBe(20);
    expect(PAST_MIN_QUESTIONS).toBe(4);
    expect(byId["ikiz-sinav"]!.body[0]).toBe(
      `Belgelerinde en az ${PAST_MIN_QUESTIONS} çıkmış soru varsa hocanın tarzında ${TWIN_EXAM_QUESTION_COUNT} soruluk ikiz sınav çözersin.`,
    );
    expect(byId["ikiz-sinav"]!.title).toContain(`(${TWIN_EXAM_QUESTION_COUNT} Soru)`);
    expect(CLONE_REWARD_CREDITS).toBe(50);
    expect(CLONE_REWARD_MONTHLY_CAP).toBe(5);
    expect(byId["sinifla-paylas"]!.title).toContain(`+${CLONE_REWARD_CREDITS} Kredi`);
    expect(byId["sinifla-paylas"]!.body[0]).toContain(`o ünitenin konu testini bitirince sen +${CLONE_REWARD_CREDITS} kredi kazanırsın`);
    expect(byId["sinifla-paylas"]!.body[0]).toContain(`ayda en çok ${CLONE_REWARD_MONTHLY_CAP} arkadaş`);
    expect(PARENT_LINK_TTL_MS).toBe(SIGNED_TTL);
    expect(PARENT_LINK_TTL_HOURS).toBe(48);
    expect(byId["sinifla-paylas"]!.body[1]).toContain(`link ${PARENT_LINK_TTL_HOURS} saat geçerli`);
    expect(byId["sinifla-paylas"]!.body[1]).toMatch(/hesap açmadan, şifresiz/);
    expect(byId["sinifla-paylas"]!.body[1]).toContain("PayTR");
    expect(PARENT_LINK_SCENE.facts).toContain(`${PARENT_LINK_TTL_HOURS} saat geçerli`);
    // Ürünün düğme adları: iki şık ipucu ve ikiz soru (sahne bu sabitleri çizer).
    expect(TWIN_SCENE.chip).toBe(TWO_OPTION_CHIP);
    expect(TWIN_SCENE.twinButton).toBe(TWIN_BUTTON);
  });

  it("dürüstlük: radyo kilit ekranında çalmayı vaat etmez; kırmızı kalem 'Kâğıtta çöz'; rakip adı ve mutlak söz yok", () => {
    const byId = Object.fromEntries(FARK_ITEMS.map((item) => [item.id, item]));
    const radio = byId["sinav-radyosu"]!.body.join(" ");
    expect(radio).toContain("kilit ekranından yönet");
    expect(radio).toContain("Tekrar dinlemek ücretsiz");
    expect(radio).toContain("podcast üretimi Plus'ta");
    expect(byId["kirmizi-kalem"]!.body[0]).toContain("“Kâğıtta çöz”");
    expect(byId["kirmizi-kalem"]!.body[0]).toMatch(/^Yazılı denemeyi/);
    expect(byId["notuna-sadik"]!.body).toEqual([
      "Hocanın notun kenarına düştüğü uyarıyı unutmaz, sayfadaki şekil ve tabloyu derse alır.",
      "Sorularını çift kontrolden geçirir.",
    ]);
    const copy = allFarkAccordionCopy();
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(copy.toLocaleLowerCase("tr")).not.toContain(brand.toLocaleLowerCase("tr"));
    expect(copy).not.toMatch(/%100|garanti|her zaman|asla|sınırsız|kilit ekranında bile|telefon kilitliyken|kilitliyken bile/i);
    expect(copy).not.toMatch(/yabancı|sembolik|birebir/i);
    // Her başlığın kanıt dosyası var.
    for (const item of FARK_ITEMS) {
      expect(item.evidence.length, item.id).toBeGreaterThan(0);
      for (const ref of item.evidence) expect(() => readFileSync(ref.split(" ")[0]!), ref).not.toThrow();
    }
  });
});

describe("sahneler: örnekler tutar, ipucu cevabı söylemez", () => {
  it("1 — aynı not: genel botlar 4 şık, Cortex Plus 5 şık; x < 0 iken √(x²) = −x; SAME_NOTE_CASE'in sözleri sahnede", () => {
    render(<LandingDuel />);
    const card = screen.getByTestId("same-note-case");
    expect(within(card).getByText(SAME_NOTE_CASE.input.file)).toBeTruthy();
    for (const line of SAME_NOTE_CASE.input.lines) expect(within(card).getByText(line)).toBeTruthy();
    const them = within(card).getByRole("region", { name: FARK_LABELS.them });
    const us = within(card).getByRole("region", { name: FARK_LABELS.us });
    for (const point of SAME_NOTE_CASE.others.points) expect(within(them).getByText(point)).toBeTruthy();
    for (const point of SAME_NOTE_CASE.cortex.points) expect(within(us).getByText(point.text)).toBeTruthy();
    expect(within(us).getByText(SAME_NOTE_CASE.cortex.badge)).toBeTruthy();
    expect([...us.querySelectorAll(".fk-checks li")].map((node) => node.textContent)).toEqual([...NOTE_SCENE.checks]);
    expect(them.querySelectorAll(".fk-opts--ghost li")).toHaveLength(4);
    const options = [...us.querySelectorAll(".fk-opts li")];
    expect(options.map((node) => node.querySelector(".fk-opt-letter")?.textContent)).toEqual(["A", "B", "C", "D", "E"]);
    expect(options.map((node) => node.querySelector(".fk-opt-text")?.textContent)).toEqual([...NOTE_SCENE.options]);
    expect(options.findIndex((node) => node.classList.contains("is-right"))).toBe(NOTE_SCENE.answerIndex);
    // Doğru şık renkle değil, adı olan simgeyle de söylenir.
    expect(within(us).getByRole("img", { name: "Doğru cevap" }).closest("li")).toBe(options[NOTE_SCENE.answerIndex]);
    // Hesap: x negatifken √(x²) = |x| = −x.
    for (const x of [-3, -0.5, -12]) {
      expect(Math.sqrt(x * x)).toBe(Math.abs(x));
      expect(Math.sqrt(x * x)).toBe(-x);
    }
    expect(NOTE_SCENE.options[NOTE_SCENE.answerIndex]).toBe("−x");
  });

  it("4 — ipucu: hangi iki şık seçilirse seçilsin cevabı, hesabı ve rakamı söylemez; elenen şık yanlış ve çiftin dışında", () => {
    const question = TWIN_SCENE.question;
    for (let a = 0; a < question.options.length; a += 1) {
      for (let b = a + 1; b < question.options.length; b += 1) {
        const pair = [question.options[a]!, question.options[b]!];
        const { hint, eliminated } = twinSceneHint(question, pair);
        expect(hint, pair.join(" | ")).not.toMatch(/\d/);
        expect(hint).not.toContain(question.answer);
        expect(hint.toLocaleLowerCase("tr")).not.toMatch(/azalır|artar|değişmez/);
        expect(eliminated, pair.join(" | ")).not.toBeNull();
        expect(eliminated).not.toBe(question.answer);
        expect(pair).not.toContain(eliminated);
      }
    }
  });

  it("4 — örnek ve ikizi aynı kavram, sayıları farklı; anahtarlar hesapla tutar", () => {
    const loss = (rate: number) => Math.round((1 - (1 + rate) * (1 - rate)) * 10_000) / 100;
    expect(loss(0.2)).toBe(4);
    expect(loss(0.1)).toBe(1);
    expect(TWIN_SCENE.question.answer).toBe(`%${loss(0.2)} azalır`);
    expect(TWIN_SCENE.twin.answer).toBe(`%${loss(0.1)} azalır`);
    expect(100 * 1.2 * 0.8).toBeCloseTo(96, 10);
    expect(100 * 1.1 * 0.9).toBeCloseTo(99, 10);
    for (const q of [TWIN_SCENE.question, TWIN_SCENE.twin]) {
      expect(q.options).toHaveLength(5);
      expect(new Set(q.options).size).toBe(5);
      expect(q.options).toContain(q.answer);
      // Her yanlış şıkkın tek cümlelik açıklaması var; doğru şıkkın yok.
      expect(Object.keys(q.whyWrong).sort()).toEqual(q.options.filter((option) => option !== q.answer).sort());
    }
    expect(TWIN_SCENE.question.explanation).toContain("96 TL");
    expect(TWIN_SCENE.twin.explanation).toContain("99 TL");
    expect(TWIN_SCENE.question.prompt).not.toBe(TWIN_SCENE.twin.prompt);
  });

  it("4 — etkileşim: iki şık ipucu (bir çeldirici elenir) → yanlış cevap 'Tuzak yakalandı' → ikiz soru → sonuç → baştan", async () => {
    render(<TwinScene />);
    const scene = screen.getByTestId("twin-scene");
    expect(scene.getAttribute("data-phase")).toBe("ask");
    expect(within(scene).getAllByRole("listitem").find((node) => node.getAttribute("aria-current") === "step")?.textContent).toContain(
      TWIN_SCENE.steps[0],
    );
    fireEvent.click(within(scene).getByRole("button", { name: TWO_OPTION_CHIP }));
    fireEvent.click(within(scene).getByRole("button", { name: "A şıkkı: Değişmez" }));
    fireEvent.click(within(scene).getByRole("button", { name: "B şıkkı: %4 azalır" }));
    const hint = within(scene).getByTestId("twin-scene-hint");
    const expected = twinSceneHint(TWIN_SCENE.question, ["Değişmez", "%4 azalır"]);
    expect(hint.textContent).toContain(expected.hint);
    expect(hint.textContent).toContain(`${String.fromCharCode(65 + TWIN_SCENE.question.options.indexOf(expected.eliminated!))} şıkkı çeldirici olarak elendi`);
    expect(document.activeElement).toBe(hint.querySelector(".fk-two-hint"));
    const goneLetter = String.fromCharCode(65 + TWIN_SCENE.question.options.indexOf(expected.eliminated!));
    const gone = within(scene).getByRole("button", { name: `${goneLetter}) ${expected.eliminated} · elendi` });
    expect((gone as HTMLButtonElement).disabled).toBe(true);

    // Tuzak: "Değişmez".
    fireEvent.click(within(scene).getByRole("button", { name: "A) Değişmez" }));
    // Durum düğmenin adında da: seçilen yanlış ve doğru cevap.
    expect(within(scene).getByRole("button", { name: "A) Değişmez · senin cevabın, yanlış" })).toBeTruthy();
    expect(within(scene).getByRole("button", { name: "B) %4 azalır · doğru cevap" })).toBeTruthy();
    const result = within(scene).getByTestId("twin-scene-result");
    expect(result.textContent).toContain(TWIN_SCENE.trapCaught);
    expect(result.textContent).toContain(TWIN_SCENE.question.whyWrong["Değişmez"]!);
    expect(result.textContent).toContain(TWIN_SCENE.question.explanation);
    expect(document.activeElement).toBe(result.querySelector(".fk-result-head"));
    for (const option of scene.querySelectorAll<HTMLButtonElement>(".fk-twin-opt")) expect(option.disabled).toBe(true);
    expect(scene.querySelector(".fk-twin-opt.is-right .fk-twin-opt-text")?.textContent).toBe(TWIN_SCENE.question.answer);

    await act(async () => {
      fireEvent.click(within(scene).getByRole("button", { name: TWIN_BUTTON }));
    });
    expect(scene.getAttribute("data-phase")).toBe("twin");
    expect(within(scene).getByText(TWIN_SCENE.twin.prompt)).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(TWIN_SCENE.twin.prompt);
    expect(within(scene).queryByRole("button", { name: TWO_OPTION_CHIP })).toBeNull();
    fireEvent.click(within(scene).getByRole("button", { name: /%1 azalır/ }));
    expect(within(scene).getByTestId("twin-scene-result").textContent).toContain(TWIN_SCENE.twinRight);

    fireEvent.click(within(scene).getByRole("button", { name: TWIN_SCENE.restart }));
    expect(scene.getAttribute("data-phase")).toBe("ask");
    expect(scene.querySelectorAll(".fk-twin-opt:disabled")).toHaveLength(0);
  });

  it("4 — doğru cevapta da ikiz soru açılabilir ve sahne bunu dürüstçe söyler", () => {
    render(<TwinScene />);
    fireEvent.click(screen.getByRole("button", { name: "B) %4 azalır" }));
    const result = screen.getByTestId("twin-scene-result");
    expect(result.textContent).toContain(TWIN_SCENE.right);
    expect(result.textContent).toContain(TWIN_SCENE.rightTwinOffer);
    expect(within(result).getByRole("button", { name: TWIN_BUTTON })).toBeTruthy();
  });

  it("5 — ikiz sınav önizlemesi: 20 hücre, dağılımın toplamı soru sayısı, 'Örnek'; sessiz sözlü ürünün ekran yazılarıyla", () => {
    render(<LandingDuel />);
    fireEvent.click(triggers()[4]!);
    const scene = screen.getByTestId("twin-exam-scene");
    const total = TWIN_EXAM_SCENE.topics.reduce((sum, topic) => sum + topic.count, 0);
    expect(total).toBe(TWIN_EXAM_QUESTION_COUNT);
    expect(scene.querySelectorAll(".fk-cells li")).toHaveLength(TWIN_EXAM_QUESTION_COUNT);
    expect(within(scene).getByText(TWIN_EXAM_SCENE.sample)).toBeTruthy();
    expect(within(scene).getByText(TWIN_EXAM_SCENE.unlock)).toBeTruthy();
    expect(TWIN_EXAM_SCENE.unlock).toContain(`en az ${PAST_MIN_QUESTIONS} çıkmış soru`);
    expect(scene.querySelectorAll(".fk-plus")).toHaveLength(2);
    const desk = read("src/components/parity/oral-answer-desk.tsx");
    expect(desk).toContain(`placeholder="${SILENT_ORAL_SCENE.placeholder}"`);
    expect(desk).toContain(`"${SILENT_ORAL_SCENE.mic}"`);
    expect(scene.textContent).toContain(SILENT_ORAL_SCENE.answer);
    // Sahne durağan: düğme, giriş alanı yok (sahte denetim çizilmez).
    expect(scene.querySelectorAll("button, input, textarea")).toHaveLength(0);
  });

  it("2, 3, 6 — Faz 7 kartları sahnede: başlık ve fark satırı akordeonda, kart yalnız canlı içeriği çizer", () => {
    render(<LandingDuel />);
    fireEvent.click(triggers()[1]!);
    const radio = screen.getByTestId("showcase-radio");
    expect(radio.querySelector("h3")).toBeNull();
    expect(radio.querySelector(".fv-compare")).toBeNull();
    expect(radio.querySelector(".fv-badge--ok")?.textContent).toBe(RADIO_SHOWCASE.badge);
    expect(within(radio).getByText("Plus")).toBeTruthy();
    expect(within(radio).getByRole("button", { name: RADIO_SHOWCASE.play })).toBeTruthy();
    expect((radio.querySelector("audio") as HTMLAudioElement).hasAttribute("src")).toBe(false);

    fireEvent.click(triggers()[2]!);
    const pen = screen.getByTestId("showcase-red-pen");
    expect(pen.querySelector("h3")).toBeNull();
    expect(pen.querySelector(".fv-compare")).toBeNull();
    // Faz 8'in örneği aynen.
    expect(within(pen).getByTestId("red-pen-earned").textContent).toBe("+15 Puan · a) Denklem kurulumu ve çözüm tam");
    expect(within(pen).getByTestId("red-pen-lost").textContent).toBe(
      "-5 Puan · Hoca Buradan Kırar: Ara basamakta işaret / mutlak değer hatası",
    );
    expect([...pen.querySelectorAll(".fv-ink")].map((node) => node.textContent)).toEqual([...RED_PEN_SHOWCASE.lines]);
    expect(within(pen).getByRole("button", { name: RED_PEN_SHOWCASE.views.plain })).toBeTruthy();

    fireEvent.click(triggers()[5]!);
    const share = screen.getByTestId("share-scene");
    expect(within(share).getByTestId("showcase-class-share").querySelector("h3")).toBeNull();
    expect(within(share).getByText("+50 Bonus Kredi")).toBeTruthy();
    expect(within(share).getByTestId("share-qr").querySelector("svg")).toBeTruthy();
    const parent = within(share).getByTestId("parent-link-scene");
    expect(parent.textContent).toContain("📲 Velime WhatsApp Ödeme Linki");
    for (const fact of PARENT_LINK_SCENE.facts) expect(within(parent).getByText(fact)).toBeTruthy();
  });
});

describe("güven satırı ve sık sorulanlar", () => {
  it("güven satırı tek satır, üç simgeli öğe; eski üç paragraf yok", () => {
    expect([...TRUST_LINE]).toEqual(["Notuna sadık", "Otomatik yenileme yok", "PayTR ile güvenli ödeme"]);
    expect(AUTO_RENEW_SUPPORTED).toBe(false);
    const page = withoutComments(read("src/components/landing/landing-page.tsx"));
    expect(page).toContain("TRUST_LINE.map((label, at) =>");
    expect(page).toContain("const TRUST_ICONS: readonly LucideIcon[] = [BookCheck, RefreshCwOff, ShieldCheck];");
    expect(page).not.toMatch(/TRUST_FACTS|fact\.body/);
    const css = withoutComments(read("src/styles/home-farklar.css"));
    expect(css).toMatch(/\.hm \.lp-trustline \{[^}]*display: flex;[^}]*justify-content: center;/);
    expect(withoutComments(read("src/styles/landing.css"))).not.toMatch(/\.lp-trustline/);
  });

  it("SSS beş soru, ürün sahibinin sırasıyla; altında Yardım Merkezi bağlantısı", () => {
    expect(FAQ.map((item) => item.q)).toEqual([
      "Cortex Plus tam olarak ne yapıyor?",
      "Ücretsiz neler yapabilirim?",
      "Ders notum yoksa kullanabilir miyim?",
      "Kartım yok, velim nasıl ödeyebilir?",
      "Abonelik kendiliğinden yenilenir mi?",
    ]);
    expect(FAQ_MORE).toEqual({ label: "Tüm sorular için Yardım Merkezi", href: "/yardim" });
    const page = withoutComments(read("src/components/landing/landing-page.tsx"));
    expect(page).toContain("{FAQ.map((item) => (");
    expect(page).toContain("<Link href={FAQ_MORE.href}>");
    expect(page).toContain("item.link ?");
    // Kısa cevap: en uzunu ücretsiz hak, cümlesi tek kaynaktan geldiği için.
    for (const item of FAQ) expect(item.a.length, item.q).toBeLessThanOrEqual(400);
  });

  it("SSS cevapları doğru: notun yoksa hazır müfredat, veli linki 48 saat ve hesapsız, yenileme yok ve 3 gün önce hatırlatma", () => {
    const byQ = Object.fromEntries(FAQ.map((item) => [item.q, item]));
    const noNotes = byQ["Ders notum yoksa kullanabilir miyim?"]!;
    expect(noNotes.a).toMatch(/MEB kazanımlarına ve ÖSYM kılavuzlarına dayalı, doğrulanmış/);
    expect(noNotes.link).toEqual({ label: "Hazır müfredata göz at", href: "/mufredat" });
    const parent = byQ["Kartım yok, velim nasıl ödeyebilir?"]!.a;
    expect(parent).toContain("“Velime WhatsApp'tan Ödeme Linki Gönder”");
    expect(parent).toContain("hesap açmadan ve şifre girmeden");
    expect(parent).toContain("PayTR");
    expect(parent).toContain(`link ${PARENT_LINK_TTL_HOURS} saat geçerli`);
    expect(parent).toContain("paket senin hesabına tanımlanır");
    const renew = byQ["Abonelik kendiliğinden yenilenir mi?"]!.a;
    expect(renew).toMatch(/^Hayır, otomatik yenileme yok\./);
    expect(renew).toContain("3 gün kala hatırlatırız");
    expect(renew).toContain("ücretsize döner");
    const what = byQ["Cortex Plus tam olarak ne yapıyor?"]!.a;
    expect(what).toContain("Plus'ta podcast, çizimli video, sözlü ve yazılı deneme");
    // Hatırlatma işi bitişe 3 gün kala çalışır (yenilemeyeceğim diyene gitmez; o zaten yenilemeyi beklemiyor).
    expect(read("src/lib/notifications/jobs/lifecycle.ts")).toContain('left === 3 ? ("3d" as const)');
  });

  it("SSS sayfada çizilir: beş soru, müfredat bağlantısı cevabın altında, Yardım Merkezi bağlantısı", async () => {
    const { LandingPage } = await import("@/components/landing/landing-page");
    render(<LandingPage prices={{ plusMonthly: null, plusWeekly: null } as never} />);
    const faq = screen.getByTestId("home-faq");
    expect(faq.querySelectorAll("details")).toHaveLength(5);
    expect(within(faq).getByRole("link", { name: "Hazır müfredata göz at" }).getAttribute("href")).toBe("/mufredat");
    expect(screen.getByRole("link", { name: FAQ_MORE.label }).getAttribute("href")).toBe("/yardim");
    const trust = screen.getByTestId("trust-line");
    expect([...trust.querySelectorAll("li")].map((node) => node.textContent)).toEqual([...TRUST_LINE]);
    expect(trust.querySelectorAll("li svg")).toHaveLength(3);
  });
});

describe("CSS: yerleşim, palet, taban", () => {
  const css = withoutComments(read("src/styles/home-farklar.css"));

  it("geniş ekranda 5/12 – 7/12, sahne yapışkan ve bütün satırları kaplar; satır sayısı başlık sayısıyla tutar", () => {
    expect(css).toMatch(
      /@media \(min-width: 960px\) \{\s*\.fk \{\s*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 7fr\);\s*grid-template-rows: repeat\(7, auto\) 1fr;/,
    );
    expect(FARK_ITEMS.length + 1).toBe(7);
    expect(css).toMatch(/\.fk-item \{\s*display: contents;\s*\}/);
    expect(css).toMatch(/\.fk-scene\.fv \{\s*position: sticky;\s*top: 6rem;\s*grid-column: 2;\s*grid-row: 1 \/ -1;/);
    // Telefonda ve tablette sahne açık başlığın içinde: başlık, metin ve sahne tek kart.
    expect(css).toMatch(/@media \(max-width: 959px\) \{\s*\.fk-item\.has-scene \.fk-panel \{\s*border-radius: 0;/);
    expect(css).toMatch(/\.fk-panel\[hidden\] \{\s*display: none;/);
  });

  it("dokunma 44 px, yazı 12 px altına inmez; hareket azaltmada geçiş yok; mavi yok", () => {
    expect(css).toMatch(/\.fk-trigger \{[^}]*min-height: 3\.5rem;/);
    for (const control of ["fk-twin-opt", "fk-twin-go"]) expect(css, control).toMatch(new RegExp(`\\.${control} \\{[^}]*min-height: 2\\.75rem;`));
    expect(css).toMatch(/\.fk-chip,\s*\.fk-twin-again \{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(/\.fk-two-letter \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.fk-more a,\s*\.lp-faq-more a \{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(/\.hm \.lp-faq-item summary \{[^}]*min-height: 3rem;/);
    expect(css).toMatch(/\.lp-faq-link \{[^}]*min-height: 2\.75rem;/);
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(20);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.fk-panel:not\(\[hidden\]\),\s*\.fk-scene \{\s*animation: none;/);
    expect(reduced).toMatch(/\.fk-caret \{\s*animation: none;/);
    for (const blue of [/#4353f3/i, /#5463ff/i, /#6366f1/i, /#4f46e5/i, /#22d3ee/i, /indigo/i, /rgba\(99, 102, 241/, /rgba\(6, 182, 212/]) {
      expect(css).not.toMatch(blue);
    }
    // Altın yalnız Plus etiketinde.
    const gold = css
      .split("}")
      .filter((block) => /#fdc94a|253, 179, 0/.test(block))
      .map((block) => block.slice(0, block.indexOf("{")).trim());
    expect(gold).toEqual([".fk-plus"]);
  });

  it("sıfır istek: akordeon ve sahne dosyalarında ağ, model ya da kendiliğinden ses yok; Suspense/dinamik yükleme yok", () => {
    for (const file of [
      "src/lib/marketing/fark-accordion.ts",
      "src/components/landing/fark-accordion.tsx",
      "src/components/landing/fark-scenes.tsx",
      "src/components/landing/fark-twin-scene.tsx",
      "src/components/landing/landing-duel.tsx",
    ]) {
      // Veri dosyasındaki kanıt yolları (`evidence`) uç adresi taşır; istek değildir, taranmaz.
      const src = withoutComments(read(file)).replace(/evidence: \[[^\]]*\]/g, "");
      expect(src, file).not.toMatch(/fetch\(|\/api\/|openai|speechSynthesis|XMLHttpRequest|sendBeacon|autoPlay|autoplay/i);
      expect(src, file).not.toMatch(/Suspense|next\/dynamic|React\.lazy|\blazy\(/);
    }
    // Sahneleri çizen sunucu dosyaları istemci işareti taşımaz: QR çizimi istemci paketine girmez.
    expect(read("src/components/landing/landing-duel.tsx")).not.toContain('"use client"');
    expect(read("src/components/landing/fark-scenes.tsx")).not.toContain('"use client"');
    expect(read("src/components/landing/fark-accordion.tsx")).not.toContain("qr-svg");
    expect(read("src/lib/marketing/fark-accordion.ts")).not.toMatch(/parent-link"|node:crypto/);
  });
});
