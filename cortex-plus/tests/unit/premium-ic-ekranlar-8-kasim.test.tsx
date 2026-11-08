// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { SourceModePill } from "@/components/chat/source-mode-pill";
import { PrepCard } from "@/components/parity/exam-prep";
import { nextPrepStep, toPrepCard } from "@/lib/learning/prep-cards";
import { nodeHeading } from "@/lib/learning/node-heading";
import { PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";

afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8");

/*
  İç ekranlar, premium turu (8 Kasım 2026). Ürün sahibi kurucu hesabıyla bütün sayfaları gezdirdi; sekiz öneri
  onaylandı (sohbet altı kompakt, Soru Çöz stüdyo dili, yol önce, anket şeridi, stüdyo renkleri, kartta sıradaki
  adım, renkli öneri çipleri, öğrenci balonu + öğretmen imzası) ve gezide bulunan altı kusur kapandı.
*/
describe("sohbet altı tek satır: kaynak hapı", () => {
  it("dokununca üç seçenek açılır, seçim bildirilir ve menü kapanır", () => {
    const onChange = vi.fn();
    render(<SourceModePill value="general" onChange={onChange} />);
    const pill = screen.getByRole("button", { name: "Kaynak: Genel sohbet" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(pill);
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: /Genel sohbet/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Yalnızca belgem/ }));
    expect(onChange).toHaveBeenCalledWith("only");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape menüyü kapatır", () => {
    render(<SourceModePill value="mixed" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Kaynak: Belgem + genel bilgi" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("sohbet paneli kaynak, mod ve ders seçimini tek satırda çizer; açık sohbette sınav geri sayımı gizlenir", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('className="cp-sor-controls"');
    expect(panel).toContain("<SourceModePill");
    expect(panel).toContain("cp-ctrl-pill cp-sor-subject-pill");
    const css = read("src/styles/chat-teaching.css");
    expect(css).toMatch(/:has\(\.cp-sor-view > \.cp-sor-messages\) \.cp-exam-due-bar\s*\{\s*display:\s*none/);
  });
});

describe("öğretmen imzası, öğrenci balonu, renkli öneriler", () => {
  it("öğretmen cevabı imzayla başlar; öneri çipleri simgeli ve türüne göre sınıflı", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('className="cp-teacher-sign"');
    expect(panel).toContain("Cortex öğretmen");
    expect(panel).toContain("`cp-followup--${item.id}`");
    for (const icon of ["🧩", "🔁", "✅"]) expect(panel).toContain(icon);
    const css = read("src/styles/chat-teaching.css");
    expect(css).toContain(".cp-sor-root .cp-sor-messages .cp-sor-msg-user");
    expect(css).toContain(".cp-followup--quiz");
  });
});

describe("Sınavlar kartında sıradaki adım", () => {
  const nodes = [
    { status: "done" as const, id: "n0", kind: "lesson", title: "Giriş Dersi", sortOrder: 0 },
    { status: "ready" as const, id: "n2", kind: "quiz", title: "Konu testi", sortOrder: 2, sessionMeta: { topicTitle: "Hücre bölünmesi" } },
    { status: "ready" as const, id: "n1", kind: "podcast", title: "Podcast Dinle", sortOrder: 1, sessionMeta: { topicTitle: "Hücre bölünmesi", activityMinutes: 7 } },
  ];

  it("ilk açık adım sıra numarasıyla seçilir; ücretsiz hesapta Plus adımı atlanır", () => {
    const plus = nextPrepStep("p1", nodes);
    expect(plus).toMatchObject({ kind: "podcast", heading: "Hücre bölünmesi", minutes: 7, href: "/deneme-sinavlari/p1/dugum/n1" });
    const free = nextPrepStep("p1", nodes, PLUS_ONLY_NODE_KINDS);
    expect(free).toMatchObject({ kind: "quiz", kindLabel: "Konu testi", href: "/deneme-sinavlari/p1/dugum/n2" });
    expect(nextPrepStep("p1", [{ status: "done", id: "x", kind: "lesson" }])).toBeNull();
  });

  it("sınavı geçmiş hazırlıkta sıradaki adım yazılmaz", () => {
    const past = toPrepCard(
      { id: "p1", title: "Biyoloji", exam_type: "YKS", target_score: 70, exam_date: "2026-10-01" },
      [],
      nodes,
      "2026-11-08",
    );
    expect(past.next).toBeNull();
  });

  it("kart sıradaki adımı türünün renginde gösterir, Devam et oraya gider", () => {
    const card = toPrepCard(
      { id: "p1", title: "Biyoloji", exam_type: "YKS", target_score: 70, exam_date: "2026-12-01" },
      [],
      nodes,
      "2026-11-08",
    );
    render(<PrepCard card={card} showTargetLabel={false} />);
    expect(screen.getByText("Sıradaki · Podcast Dinle")).toBeTruthy();
    expect(screen.getByText("~7 dk")).toBeTruthy();
    expect(document.querySelector(".cp-prep-card-next")?.getAttribute("data-kind")).toBe("podcast");
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe("/deneme-sinavlari/p1/dugum/n1");
  });

  it("hazırlık sayfası ve kart aynı adı yazar (tek kaynak)", () => {
    expect(nodeHeading({ kind: "lesson", title: "9. Sınıf · Hücre" })).toBe("Hücre");
    expect(nodeHeading({ kind: "final_check", title: "Son kontrol" })).toContain("Tüm konular");
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain('import { nodeHeading } from "@/lib/learning/node-heading"');
  });
});

describe("Soru Çöz stüdyo dilinde", () => {
  it("kartla aynı simge, ad ve renk; geri Çalışma Stüdyosu'na; fotoğraf hakkı yalnız ücretsiz hesapta", () => {
    const page = read("src/app/soru-coz/page.tsx");
    const hero = read("src/components/learning/solver-hero.tsx");
    expect(hero).toContain('STUDIOS.find((item) => item.id === "soru-coz")');
    expect(page).toContain('href="/araclar"');
    expect(page).toContain("<SolverHero freeAccount={freeAccount} />");
    expect(hero).toMatch(/freeAccount \? <span className="cp-solver-hero-quota">/);
    expect(page).not.toContain("Ücretsiz hesapta günde 1 fotoğraf sorusu");
  });
});

describe("hazırlık sayfası: yol önce", () => {
  it("sınav sabahı kâğıdı ve paylaşım yolun altında", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home.indexOf("<PrepShareTools")).toBeGreaterThan(home.indexOf("<PathSections"));
  });
});

describe("stüdyo seçimleri kendi renginde", () => {
  it("seçili düğme --ls-accent'le; podcast örnek bölümü başlığın altında küçük düğme", () => {
    const css = read("src/styles/learning-studio.css");
    expect(css).toMatch(/\.ls-seg button\[aria-pressed="true"\]\s*\{[^}]*var\(--ls-accent\)/);
    const podcast = read("src/components/learning/studio/podcast-studio.tsx");
    expect(podcast).toContain("belowHero={");
    expect(podcast).not.toContain('className="ls-pod-lock"');
  });
});

describe("gezide bulunan kusurlar", () => {
  it("tablette kurucu çipi kısa adıyla, menü ortada (Daha fazla üstüne binmez)", () => {
    const css = read("src/styles/parity-shell.css");
    expect(css).toMatch(/@media \(min-width: 768px\) and \(max-width: 1179px\)\s*\{[^@]*\.cp-founder-chip__full \{\s*display: none;/);
  });

  it("kamp teklifi kurucuya ve Plus'a çıkmaz", () => {
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain(
      "showsUpgradeChrome: ent.showsUpgradeChrome && (shell.account?.showsUpgradeChrome ?? false)",
    );
  });

  it("Yanlışlar Defteri'nde altın düğme yok; Krediler sekme adı sayfayla aynı", () => {
    const notebook = read("src/components/parity/mistake-notebook-view.tsx");
    expect(notebook).not.toMatch(/amber-/);
    expect(read("src/app/krediler/page.tsx")).toContain('title: "Kullanım limitleri"');
  });

  it("beşgenin ortasındaki yüzde noktayla karışmasın diye zeminle çevrelenir", () => {
    expect(read("src/styles/parity-shell.css")).toMatch(/\.cp-radar-score,\s*\.cp-radar-goal\s*\{[^}]*paint-order: stroke/);
  });
});

/* İkinci tur (8 Kasım 2026, "kendini kullanıcı yerine koy"): kalan sayfalar kurucu hesabıyla ve açık temada gezildi. */
describe("ikinci tur: kalan sayfalar", () => {
  it("beşgen her eksenin adını ve yüzdesini okunur listede verir; telefonda çizimde numara", async () => {
    const { PrepRadarChart } = await import("@/components/parity/prep-radar-chart");
    render(
      <PrepRadarChart
        compact
        view={{
          label: "Hazırlık",
          readinessPct: 40,
          targetScore: 80,
          axes: [
            { id: "coverage", label: "Konu Kapsamı", pct: 40 },
            { id: "accuracy", label: "Test Doğruluğu", pct: 55 },
            { id: "mock", label: "Deneme Performansı", pct: 0 },
          ],
        }}
      />,
    );
    const items = document.querySelectorAll(".cp-radar-legend li");
    expect(items).toHaveLength(3);
    expect(items[1]?.textContent).toContain("Test Doğruluğu");
    expect(items[1]?.textContent).toContain("%55");
    expect(document.querySelectorAll(".cp-radar-num")).toHaveLength(3);
    const css = read("src/styles/parity-shell.css");
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{\s*\.cp-radar \.cp-radar-label \{\s*display: none;/);
  });

  it("profil listesinde Ayarlar ikinci kez yok; menü adları sayfa adlarıyla aynı", () => {
    const panel = read("src/components/parity/profile-panel.tsx");
    expect(panel).not.toMatch(/label: "Ayarlar"/);
    expect(panel).toContain('label: "Kullanım limitleri"');
    expect(read("src/components/parity/sor-shell.tsx")).toContain('label: "Kullanım limitleri"');
    expect(read("src/components/parity/student-shell-nav.ts")).not.toContain('label: "Limitler"');
  });

  it("Ayarlar penceresi telefonda tam genişlik", () => {
    expect(read("src/styles/parity-shell.css")).toMatch(/@media \(max-width: 560px\)\s*\{\s*\.cp-profile-scrim \{\s*display: none;/);
  });

  it("boş durum düğmesi mavi birincil (altın sınıf öğrenci kabuğunda yüklenmiyordu)", () => {
    const empty = read("src/components/ui-kit/empty-state.tsx");
    expect(empty).toContain('className="cp-empty-action"');
    expect(empty).not.toContain("cortex-premium-btn-primary");
  });

  it("Stüdyo: laboratuvar 'Hesap' yazmaz; kısayollar tek satır hap", () => {
    const hub = read("src/components/parity/tools-hub.tsx");
    expect(hub).toContain('tool.category === "simulasyon" ? "Laboratuvar" : "Hesap"');
    expect(hub).toContain('className="tools-shortcut"');
  });

  it("müfredat ve resmî sınav kartları dersin simgesi ve rengiyle, Başla hapı", () => {
    const catalog = read("src/components/parity/exam-catalog-pages.tsx");
    expect(catalog).toContain('className="cp-catalog-icon"');
    expect(catalog).toContain('["--cat-accent" as string]: look.accent');
  });

  it("açık temada yeni parçalar koyu yazı alır", () => {
    expect(read("src/styles/parity-shell.css")).toContain(":root:not(.dark) .cp-prep-card-days");
    expect(read("src/styles/question-solver.css")).toContain(":root:not(.dark) .cp-solver-hero-facts > span");
    expect(read("src/styles/chat-teaching.css")).toContain(":root:not(.dark) .cp-teacher-sign");
    // Kaynak menüsü zemini temadan (açık temada koyu yazı koyu zeminde kalıyordu).
    expect(read("src/styles/chat-teaching.css")).toContain("background: var(--c-surface-1, #19191b);");
  });

  it("küçük kusurlar: Sınıflar emekli öğretmen paneline gönderme yapmaz; düelloda tek robot simgesi; belge bağlantıları hap", () => {
    expect(read("src/app/siniflar/page.tsx")).not.toContain("öğretmen koduyla");
    expect(read("src/components/duel/new-duel-button.tsx")).not.toContain("🤖");
    expect(read("src/app/dokumanlar/page.tsx")).toContain("<MessageCircle");
    expect(read("src/app/ilerleme/page.tsx")).not.toContain("Uydurma");
  });
});

/* Üçüncü tur (8 Kasım 2026): ayarlar tek merkezde, abonelik sayfası kurucuya satış yapmıyor. */
describe("ayarlar tek merkez", () => {
  const page = read("src/app/ayarlar/page.tsx");

  it("Ayarlar sayfası profil, okul ve tercih satırlarıyla pencereyi doğru sekmede açar; tema burada", () => {
    for (const tab of ["hesap", "okul", "tercihler"]) expect(page).toContain(`/ayarlar?dialog=profile&sekme=${tab}`);
    expect(page).toContain("<AppearanceRow />");
    expect(page).not.toContain("Hızlı ayarlar paneli");
    expect(page).not.toContain("<ThemeToggle");
  });

  it("pencere sekmesi adresten; tema yalnız Ayarlar'da", () => {
    const host = read("src/components/parity/parity-dialog-host.tsx");
    expect(host).toContain('{ hesap: "account", okul: "school", tercihler: "learning" }');
    expect(read("src/components/parity/profile-dialog.tsx")).not.toContain("AppearanceRow");
    expect(read("src/components/parity/profile-panel.tsx")).not.toContain("AppearanceRow");
  });

  it("bütün 'Ayarlar' girişleri /ayarlar'a gider", () => {
    expect(read("src/components/parity/profile-panel.tsx")).toContain('<Link href="/ayarlar" className="cp-pp-settings">');
    expect(read("src/components/parity/sor-shell.tsx")).toMatch(/href="\/ayarlar"\s*className="cp-sor-settings-link/);
    expect(read("src/components/chat/chat-panel.tsx")).toContain('<Link href="/ayarlar" role="menuitem" className="cp-mood-menu-more">');
  });

  it("abonelik sayfası kurucuya satış göstermez, durumunu söyler", () => {
    const pay = read("src/app/pay/page.tsx");
    expect(pay).toContain("Bütün özellikler açık");
    expect(pay).toContain("entitlements.showsUpgradeChrome && !founder");
  });
});

describe("ayarlar penceresi anında açılır ve kapanır", () => {
  it("satırlar sunucuya gitmeden adresi yazar; kapanış geçmişi değiştirir, yalnız profil penceresinde tazeler", async () => {
    const { DialogLink } = await import("@/components/parity/dialog-link");
    const push = vi.spyOn(window.history, "pushState");
    render(<DialogLink href="/ayarlar?dialog=profile&sekme=okul">Okulum</DialogLink>);
    fireEvent.click(screen.getByText("Okulum"));
    expect(push).toHaveBeenCalledWith(null, "", "/ayarlar?dialog=profile&sekme=okul");
    push.mockRestore();
    const host = read("src/components/parity/parity-dialog-host.tsx");
    expect(host).toContain("window.history.replaceState(");
    expect(host).toContain('if (dialog === "profile") router.refresh();');
    expect(read("src/app/ayarlar/page.tsx")).toContain('href.includes("dialog=") ? DialogLink : Link');
  });
});

/* Dördüncü tur (8 Kasım 2026): ürün sahibiyle birlikte seçilen mantık düzeltmeleri. */
describe("mantık düzeltmeleri", () => {
  it("Başla genel bir soruyla açılır; kayıtta seçilen ders ilk mesaja yazılmaz", async () => {
    // 8 Kasım 2026 ikinci tur: öğretmen ilk sözü kendisi söyler (öğrenci adına talimat cümlesi yok, model çağrısı yok).
    const { startGreetingFor } = await import("@/lib/student/first-prompts");
    expect(startGreetingFor("Ada")).toMatch(/^Merhaba Ada! Bugün ne çalışmak istersin?/);
    expect(startGreetingFor(null)).toMatch(/^Merhaba! /);
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain("startGreeting={startGreeting}");
    expect(page).not.toContain("startPrompt=");
  });

  it("kurulumun ilk ekranı sınav türünü ve dersi birlikte sorar", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("<h1>Hangi sınava, hangi derse?</h1>");
    expect(wizard).not.toContain("<h1>Hangi ders?</h1>");
    expect(wizard).toContain('className="apw-quick apw-tracks"');
  });

  // Haftalık anketin ekibe çıkmadığı davranış testinde: plus-yasam-dongusu-davranis.test.ts.

  it("tek ad İlerleme; Sınıflar 'Çalışma grupları'", () => {
    expect(read("src/app/ilerleme/page.tsx")).toContain('title: "İlerleme"');
    expect(read("src/lib/parity/tools.ts")).not.toContain("İlerleme Analizi");
    expect(read("src/components/parity/sor-shell.tsx")).toContain('label: "Çalışma grupları"');
    expect(read("src/app/siniflar/page.tsx")).toContain('title: "Çalışma grupları"');
  });

  it("rol seviyeden: Mezun yazan mezun sayılır", async () => {
    const { roleForGrade } = await import("@/components/parity/profile-dialog");
    expect(roleForGrade("Mezun")).toBe("graduate");
    expect(roleForGrade("11. sınıf")).toBe("student");
    expect(read("src/components/parity/profile-dialog.tsx")).not.toContain("cp-profile-heading mt-6\">Rolüm");
  });

  it("beşgen her genişlikte numaralı (ad yalnız alttaki listede)", () => {
    expect(read("src/styles/parity-shell.css")).toMatch(/\n\.cp-radar \.cp-radar-label \{\s*display: none;/);
  });
});
