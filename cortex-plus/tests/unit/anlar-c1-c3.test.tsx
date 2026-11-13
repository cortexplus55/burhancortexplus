// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
  Anlar, uygulamanın içi, C işleri (13 Kasım 2026, ürün sahibinin kararı).

  C1: kurulumun materyal adımında dosya bırakılınca ya da seçilince "tarama çekirdeği" anı (en çok 2,5 sn, atlanır,
      hareket azaltmada yok). An yalnız görsel: yükleme anla aynı anda başlar; an bitince bugünkü ilerleme satırları.
  C2: ana ekranın "Not yükle" kapısı aynı çekirdek. Bırakılan / seçilen dosya sunucuya gitmez: misafir dosya köprüsüyle
      tarayıcıda bekler, kısa tarama anından sonra kuruluma gidilir. Bugünkü bağlantı yerinde.
  C3: turda yol haritasına ulaşan misafir kayıttan sonra ana ekranda tek kart görür; kart turdaki konuyu resmî
      kurulumda seçili açar. Turdaki cevaplar ölçüm sayılmaz.
*/

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ogretmen",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/student/student-shell-context", () => ({
  useStudentShellAccount: () => ({ audience: "plus" }),
  useDocumentLimits: () => ({ isAdmin: false }),
  useIsFounder: () => false,
}));

import { toast } from "sonner";
import { MOMENT_MAX_MS } from "@/lib/ui/moment";
import { fileFindings, SCAN_CORE_MS, ScanCore, useScanMoment } from "@/components/learning/scan-core";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { FIRST_STEP_CORE_TITLE, FIRST_STEP_UPLOAD_HREF } from "@/lib/student/first-step";
import {
  clearTourProgress,
  readTourProgress,
  TOUR_PROGRESS_KEY,
  TOUR_PROGRESS_TTL_MS,
  writeTourProgress,
} from "@/lib/marketing/guest-tour-progress";
import { JOURNEY_STEP_IDS, JOURNEY_STEPS } from "@/lib/marketing/landing-journey";
import { AUDIENCE_SEGMENT_IDS } from "@/lib/marketing/landing-showcase";
import { TOUR_RESUME_LINE, TOUR_TOPIC_TERM, tourResumeHref, tourResumeTarget } from "@/lib/student/tour-resume";
import { buildSetupTree } from "@/lib/curriculum/official-setup";
import { plannedTopics, selectionCounts, selectionForTopic } from "@/lib/curriculum/official-setup-select";
import { OfficialSetupFlow } from "@/components/parity/official-setup-flow";
import { ExamCreateWizard } from "@/components/parity/exam-create-wizard";
import { examWizardDraftKey, setExamWizardDraftOwner, type ExamWizardDraft } from "@/lib/learning/exam-wizard-draft";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function motion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const realFetch = globalThis.fetch;
let fetches: string[] = [];
let clicks: string[] = [];

beforeEach(() => {
  motion(false);
  fetches = [];
  clicks = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    fetches.push(String(input));
    return new Response(JSON.stringify({ error: "yok" }), { status: 401 });
  }) as typeof fetch;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.getAttribute("href") ?? "");
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/* ---------- Çekirdek ve an ---------- */

function Harness({ onDone }: { onDone?: (skipped: boolean) => void }) {
  const scan = useScanMoment();
  return (
    <div>
      <ScanCore playing={scan.playing} />
      <button type="button" onClick={() => scan.play(onDone)}>
        oynat
      </button>
    </div>
  );
}

describe("tarama çekirdeği anı", () => {
  it("süre an kuralının altında; durağan hâlde hareket yok, an sonunda durağana döner", () => {
    expect(SCAN_CORE_MS).toBeLessThanOrEqual(MOMENT_MAX_MS);
    vi.useFakeTimers();
    const done = vi.fn();
    const { container } = render(<Harness onDone={done} />);
    const core = () => container.querySelector(".cx-scan-core")!;
    expect(core().hasAttribute("data-playing")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "oynat" }));
    expect(core().hasAttribute("data-playing")).toBe(true);
    act(() => vi.advanceTimersByTime(SCAN_CORE_MS - 1));
    expect(core().hasAttribute("data-playing")).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(core().hasAttribute("data-playing")).toBe(false);
    expect(done).toHaveBeenCalledWith(false);
  });

  it("tıklama anı hemen bitirir; hareket azaltmada an hiç başlamaz", async () => {
    const done = vi.fn();
    const { container } = render(<Harness onDone={done} />);
    fireEvent.click(screen.getByRole("button", { name: "oynat" }));
    expect(container.querySelector(".cx-scan-core[data-playing]")).not.toBeNull();
    await act(nextFrame);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(container.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(done).toHaveBeenCalledWith(true);

    cleanup();
    motion(true);
    const instant = vi.fn();
    const second = render(<Harness onDone={instant} />);
    fireEvent.click(screen.getByRole("button", { name: "oynat" }));
    expect(second.container.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(instant).toHaveBeenCalledWith(false);
  });

  it("bulgular yalnız elimizdeki değerler: dosya adı ve boyutu, en çok üçü adıyla", () => {
    const files = ["a.pdf", "b.docx", "c.jpg", "d.jpg", "e.jpg"].map((name) => new File(["x".repeat(2048)], name));
    const items = fileFindings(files);
    expect(items.map((item) => item.text)).toEqual(["a.pdf · 2 KB", "b.docx · 2 KB", "c.jpg · 2 KB", "ve 2 dosya daha"]);
  });

  it("çekirdek uygulama paletinde: misafir turunun CSS'i ve renkleri taşınmaz", () => {
    const css = read("src/styles/scan-core.css");
    expect(css).not.toMatch(/--lj-|#[0-9a-f]{3,8}\b/i);
    expect(css).toContain("var(--cx-cyan)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    const component = read("src/components/learning/scan-core.tsx");
    expect(component).not.toMatch(/import[^\n]*landing/);
    expect(component).toContain("startMoment(");
  });
});

/* ---------- C1: kurulumun materyal adımı ---------- */

function seedMaterialStep() {
  setExamWizardDraftOwner("anlar-c1");
  const key = examWizardDraftKey("anlar-c1")!;
  const exam = new Date(Date.now() + 36 * 86_400_000).toISOString().slice(0, 10);
  const draft: ExamWizardDraft = {
    v: 1,
    step: "material",
    subject: "Biyoloji",
    examDate: exam,
    target: 80,
    language: "tr",
    modality: "auto",
    modalities: [],
    equalFocus: true,
    focusTopics: [],
    materials: [],
    failedMaterials: [],
    processing: null,
    title: "",
    orderEdited: false,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(key, JSON.stringify(draft));
}

describe("C1 kurulumun materyal adımı", () => {
  it("dosya seçilince an oynar ve dosyanın adı belirir; yükleme anı beklemeden başlar; an bitince ilerleme satırları", async () => {
    // Yükleme isteği cevapsız kalır (yavaş ağ): an kendi süresinde ya da tıklamayla biter.
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      fetches.push(String(input));
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    seedMaterialStep();
    const { container } = render(<ExamCreateWizard onUseChat={() => undefined} gradeLevel="11. sınıf" />);
    await screen.findByRole("heading", { name: "Çalışma materyalini ekle" });
    const zone = container.querySelector(".apw-drop")!;
    expect(zone.querySelector(".cx-scan-core")).not.toBeNull();
    expect(zone.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(zone.textContent).toContain("Sekmeyi kapatırsan");

    const input = zone.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["%PDF-1.4 örnek"], "Hücre notu.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(zone.querySelector(".cx-scan-core[data-playing]")).not.toBeNull();
    expect(zone.querySelector("[data-scan-findings]")?.textContent).toContain("Hücre notu.pdf");
    // An sürerken ilerleme satırları bekler.
    expect(zone.textContent).not.toContain("Sekmeyi kapatırsan");
    // Yükleme anı beklemedi: hazırlık isteği an sürerken gitti.
    await waitFor(() => expect(fetches.some((url) => url.includes("/api/"))).toBe(true));
    expect(zone.querySelector(".cx-scan-core[data-playing]")).not.toBeNull();

    // Tıklama anı atlar; bugünkü satırlar döner.
    await act(nextFrame);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(zone.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(zone.textContent).toContain("Sekmeyi kapatırsan");
  });

  it("yüklenemeyen dosya: an hemen biter, hata bildirimi bugünkü gibi", async () => {
    vi.mocked(toast.error).mockClear();
    seedMaterialStep();
    const { container } = render(<ExamCreateWizard onUseChat={() => undefined} gradeLevel="11. sınıf" />);
    await screen.findByRole("heading", { name: "Çalışma materyalini ekle" });
    const zone = container.querySelector(".apw-drop")!;
    const input = zone.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "not.pdf", { type: "application/pdf" })] } });
    expect(zone.querySelector(".cx-scan-core[data-playing]")).not.toBeNull();
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    await waitFor(() => expect(zone.querySelector(".cx-scan-core[data-playing]")).toBeNull());
    expect(zone.textContent).toContain("Sekmeyi kapatırsan");
  });

  it("hareket azaltmada an oynamaz; ilerleme satırları hemen görünür", async () => {
    motion(true);
    seedMaterialStep();
    const { container } = render(<ExamCreateWizard onUseChat={() => undefined} gradeLevel="11. sınıf" />);
    await screen.findByRole("heading", { name: "Çalışma materyalini ekle" });
    const zone = container.querySelector(".apw-drop")!;
    const input = zone.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["metin"], "not.txt", { type: "text/plain" })] } });
    expect(zone.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(zone.textContent).toContain("Sekmeyi kapatırsan");
  });

  it("kaynak: an yüklemeden önce başlar ama onu beklemez; bekçi seçicisi ve otomatik devam yerinde", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    const take = wizard.slice(wizard.indexOf("async function takeFiles("), wizard.indexOf("Telefondan gelen dosyalar"));
    expect(take.indexOf("scan.play()")).toBeGreaterThan(0);
    expect(take.indexOf("scan.play()")).toBeLessThan(take.indexOf("await upload.run(batch)"));
    expect(take).not.toMatch(/await[^\n]*scan/);
    expect(wizard).toContain('className={dragOver ? "apw-drop apw-drop--over" : "apw-drop"}');
    expect(wizard).toContain("autoContinueLine(autoCountdown)");
    expect(wizard).toContain("WIZARD_COPY.continueEarly");
    // Uyarılar an sırasında da görünür; yalnız ilerleme satırı ve çubuğu bekler.
    expect(wizard).toContain("processAlert={processAlert}");
    expect(wizard).toContain("processDetail={scan.playing ? null : processDetail}");
  });
});

/* ---------- C2: ana ekranın "Not yükle" kapısı ---------- */

describe("C2 'Not yükle' kapısında çekirdek", () => {
  it("başlık depoda olan söz: misafir turunun ilk adımıyla aynı", () => {
    expect(FIRST_STEP_CORE_TITLE).toBe(JOURNEY_STEPS.find((step) => step.id === "upload")!.title);
  });

  it("bugünkü bağlantı yerinde; çekirdek klavyeyle ulaşılan bir düğme", () => {
    render(<FirstStepLauncher firstName="Can" gradeLevel="11. sınıf" goalText="YKS hazırlık" />);
    expect(screen.getByRole("link", { name: /Kendi ders notunu/ }).getAttribute("href")).toBe(FIRST_STEP_UPLOAD_HREF);
    const core = screen.getByRole("button", { name: FIRST_STEP_CORE_TITLE });
    expect(core.tagName).toBe("BUTTON");
    expect(core.querySelector(".cx-scan-core")).not.toBeNull();
  });

  it("seçilen dosya sunucuya gitmez: tarayıcıda bekler, an bitince kuruluma gidilir", async () => {
    const { container } = render(<FirstStepLauncher firstName="Can" gradeLevel="11. sınıf" goalText="YKS hazırlık" />);
    const input = container.querySelector("input[data-first-step-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "Kimya notu.pdf", { type: "application/pdf" })] } });
    const core = screen.getByRole("button", { name: FIRST_STEP_CORE_TITLE });
    expect(core.querySelector(".cx-scan-core[data-playing]")).not.toBeNull();
    expect(container.querySelector("[data-scan-findings]")?.textContent).toContain("Kimya notu.pdf");
    // İşaret sekme oturumunda (dosya IndexedDB'de; jsdom'da yok, işaret yine yazılır).
    await waitFor(() => expect(window.sessionStorage.getItem("cp:guest-doc")).toContain("Kimya notu.pdf"));
    expect(clicks).toEqual([]);
    await act(nextFrame);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await waitFor(() => expect(clicks).toEqual([FIRST_STEP_UPLOAD_HREF]));
    expect(fetches).toEqual([]);
  });

  it("hareket azaltmada an yok; dosya saklanınca hemen gidilir", async () => {
    motion(true);
    const { container } = render(<FirstStepLauncher firstName="Can" gradeLevel="11. sınıf" goalText="YKS hazırlık" />);
    const input = container.querySelector("input[data-first-step-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["metin"], "not.txt", { type: "text/plain" })] } });
    expect(container.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    await waitFor(() => expect(clicks).toEqual([FIRST_STEP_UPLOAD_HREF]));
    expect(fetches).toEqual([]);
  });

  it("okunamayan dosya bekletilmez, nedeni söylenir, gidilmez", async () => {
    const { container } = render(<FirstStepLauncher firstName="Can" gradeLevel="11. sınıf" goalText="YKS hazırlık" />);
    const input = container.querySelector("input[data-first-step-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "program.exe", { type: "application/x-msdownload" })] } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("program.exe"));
    expect(window.sessionStorage.getItem("cp:guest-doc")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(clicks).toEqual([]);
  });

  it("kuruluma gelen dosyayı mevcut teklif kartı öğrencinin dokunuşuyla alır (köprü oturumdan bağımsız)", () => {
    const handoff = read("src/lib/documents/guest-handoff.ts");
    expect(handoff).not.toMatch(/supabase|getUser|fetch\(/);
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain('<GuestDocumentOffer variant="offer" disabled={uploading} onTake={(files) => takeFiles(files)} />');
  });
});

/* ---------- C3: turdan kayda süreklilik ---------- */

describe("C3 tur kaydı", () => {
  it("adım ve sekme kimlikleri turla aynı", () => {
    for (const step of JOURNEY_STEP_IDS) {
      window.sessionStorage.clear();
      writeTourProgress({ step, segment: "lise" });
      expect(readTourProgress()?.steps).toEqual([step]);
    }
    for (const segment of AUDIENCE_SEGMENT_IDS) {
      writeTourProgress({ step: "upload", segment });
      expect(readTourProgress()?.segment).toBe(segment);
    }
  });

  it("adımlar birleşir ve turun sırasıyla tutulur; geçersiz ya da 24 saatten eski kayıt yok sayılır", () => {
    const t0 = 1_800_000_000_000;
    writeTourProgress({ step: "lesson", segment: "yks-lgs" }, t0);
    writeTourProgress({ step: "upload", segment: "yks-lgs" }, t0 + 10);
    writeTourProgress({ step: "roadmap", segment: "lise" }, t0 + 20);
    writeTourProgress({ step: "bilinmeyen", segment: "lise" }, t0 + 30);
    expect(readTourProgress(t0 + 40)).toEqual({ steps: ["upload", "roadmap", "lesson"], segment: "lise", at: t0 + 20 });
    expect(readTourProgress(t0 + 20 + TOUR_PROGRESS_TTL_MS + 1)).toBeNull();
    window.sessionStorage.setItem(TOUR_PROGRESS_KEY, "{bozuk");
    expect(readTourProgress()).toBeNull();
    window.sessionStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify({ steps: ["roadmap"], segment: "uzay", at: Date.now() }));
    expect(readTourProgress()).toBeNull();
    writeTourProgress({ step: "roadmap", segment: "lise" });
    clearTourProgress();
    expect(readTourProgress()).toBeNull();
  });

  it("depolama kapalıysa sessiz", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("kota");
    });
    expect(() => writeTourProgress({ step: "roadmap", segment: "lise" })).not.toThrow();
    expect(readTourProgress()).toBeNull();
  });
});

describe("C3 kurulum hedefi", () => {
  it("önce hedef, sonra sınıf, en son tur sekmesi", () => {
    expect(tourResumeTarget({ segment: "lise", gradeLevel: "9. sınıf", goalText: "Okul sınavları" })).toEqual({ exam: "yks", alan: "tyt" });
    expect(tourResumeTarget({ segment: "yks-lgs", gradeLevel: "12. sınıf", goalText: "YKS hazırlık" })).toEqual({ exam: "yks", alan: "tyt" });
    expect(tourResumeTarget({ segment: "yks-lgs", gradeLevel: "8. sınıf", goalText: "" })).toEqual({ exam: "lgs", alan: null });
    expect(tourResumeTarget({ segment: "lise", goalText: "LGS hazırlık" })).toEqual({ exam: "lgs", alan: null });
    expect(tourResumeTarget({ segment: "akademik", gradeLevel: "Mezun", goalText: "" })).toEqual({ exam: "kpss", alan: null });
    expect(tourResumeTarget({ segment: "universite", goalText: "ALES hazırlık" })).toEqual({ exam: "ales", alan: null });
    expect(tourResumeTarget({ segment: "universite", gradeLevel: "Üniversite", goalText: "Üniversite vize ve final" })).toEqual({
      exam: "yks",
      alan: "tyt",
    });
    expect(tourResumeHref({ segment: "lise" })).toBe(`/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt&konu=${encodeURIComponent(TOUR_TOPIC_TERM)}`);
  });

  it("bekçi: hedeflenen her sınavın resmî ağacında konu var; kurulum yalnız eşleşen üniteleri seçer", () => {
    for (const exam of ["yks", "lgs", "kpss", "ales", "dgs"] as const) {
      const tree = buildSetupTree(exam);
      const focus = selectionForTopic(tree, TOUR_TOPIC_TERM);
      expect(focus, exam).not.toBeNull();
      const topics = plannedTopics(tree, focus!.selection);
      expect(topics.length, exam).toBeGreaterThan(0);
      for (const topic of topics) {
        const unit = tree.subjects.flatMap((s) => s.units).find((u) => u.id === topic.unitId)!;
        const kept = unit.outcomes.filter((o) => topic.codes.includes(o.code));
        const matches = (text: string) => text.toLocaleLowerCase("tr").includes(TOUR_TOPIC_TERM);
        expect(matches(unit.title) || kept.every((o) => matches(o.text)), `${exam} ${unit.title}`).toBe(true);
      }
    }
    // YKS'de yalnız TYT Temel Matematik; 9. sınıf kazanımı.
    const yks = buildSetupTree("yks");
    const topics = plannedTopics(yks, selectionForTopic(yks, TOUR_TOPIC_TERM)!.selection);
    expect(new Set(topics.map((t) => t.subjectKey))).toEqual(new Set(["tyt-matematik"]));
    expect(topics.every((t) => t.part === "TYT")).toBe(true);
    expect(selectionForTopic(yks, "zz")).toBeNull();
    expect(selectionForTopic(yks, "bulunmayan-sözcük")).toBeNull();
  });
});

describe("C3 ana ekran kartı", () => {
  it("tur kaydı yokken ya da yalnız ilk adımdayken kart yok", () => {
    const first = render(<FirstStepLauncher firstName="Can" gradeLevel="9. sınıf" goalText="Okul sınavları" />);
    expect(first.container.querySelector("[data-tour-resume]")).toBeNull();
    cleanup();
    writeTourProgress({ step: "upload", segment: "lise" });
    const second = render(<FirstStepLauncher firstName="Can" gradeLevel="9. sınıf" goalText="Okul sınavları" />);
    expect(second.container.querySelector("[data-tour-resume]")).toBeNull();
  });

  it("yol haritasına ulaşıldıysa başlatıcının üstünde tek kart; dokununca kayıt silinir", () => {
    writeTourProgress({ step: "upload", segment: "lise" });
    writeTourProgress({ step: "roadmap", segment: "lise" });
    const { container } = render(<FirstStepLauncher firstName="Can" gradeLevel="9. sınıf" goalText="Okul sınavları" />);
    const card = container.querySelector("[data-tour-resume]")!;
    expect(card).not.toBeNull();
    // Başlatıcının başlığından önce.
    expect(card.compareDocumentPosition(screen.getByRole("heading", { name: /Hoş geldin Can/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const link = screen.getByRole("link", { name: TOUR_RESUME_LINE });
    expect(link.getAttribute("href")).toBe(tourResumeHref({ segment: "lise", gradeLevel: "9. sınıf", goalText: "Okul sınavları" }));
    // Sahte yüzde ya da ölçüm yok: kartta sayı yazmaz.
    expect(card.textContent).not.toMatch(/%|\d/);
    fireEvent.click(link);
    expect(readTourProgress()).toBeNull();
  });

  it("'Şimdilik gizle' kartı kaldırır ve kaydı siler; başlatıcı kalır", () => {
    writeTourProgress({ step: "roadmap", segment: "akademik" });
    const { container } = render(<FirstStepLauncher firstName="Can" gradeLevel="Mezun" goalText="KPSS hazırlık" />);
    const card = container.querySelector("[data-tour-resume]") as HTMLElement;
    fireEvent.click(card.querySelector("button")!);
    expect(container.querySelector("[data-tour-resume]")).toBeNull();
    expect(readTourProgress()).toBeNull();
    expect(screen.getByRole("heading", { name: /Hoş geldin Can/ })).toBeTruthy();
  });

  it("yeni söz yalnız onaylı kart cümlesi", () => {
    expect(TOUR_RESUME_LINE).toBe("Turda denemiştin — Köklü Sayılar ile başla");
  });
});

describe("C3 resmî kurulum konu seçili açılır", () => {
  it("ağaç gelince yalnız eşleşen ünite seçili, adım Konular", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(buildSetupTree("yks")), { status: 200 })) as typeof fetch;
    render(<OfficialSetupFlow initialExam="yks" initialAlan="tyt" initialTopic={TOUR_TOPIC_TERM} />);
    expect(await screen.findByRole("heading", { name: "Ünite ünite resmî konuların" })).toBeTruthy();
    expect(screen.getByTestId("setup-summary").textContent).toBe("1 ders · 1 ünite · 1 kazanım");
    const yks = buildSetupTree("yks");
    expect(selectionCounts(plannedTopics(yks, selectionForTopic(yks, TOUR_TOPIC_TERM)!.selection))).toEqual({ subjects: 1, units: 1, outcomes: 1 });
    expect(screen.getByText(/Köklü ifadeleri içeren denklemleri çözer/)).toBeTruthy();
  });

  it("eşleşme yoksa kurulum bugünkü hâliyle (ders adımı, alan seçili)", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(buildSetupTree("yks")), { status: 200 })) as typeof fetch;
    render(<OfficialSetupFlow initialExam="yks" initialAlan="tyt" initialTopic="bulunmayan" />);
    expect(await screen.findByRole("heading", { name: "Alanını seç, derslerin gelsin" })).toBeTruthy();
  });

  it("sayfa konu sözcüğünü süzerek iletir", () => {
    const page = read("src/app/deneme-sinavlari/resmi/kurulum/page.tsx");
    expect(page).toContain("initialTopic={topic}");
    expect(page).toMatch(/\\p\{L\}/);
  });
});
