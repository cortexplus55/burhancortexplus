// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Languages, Dna, GraduationCap } from "lucide-react";
import { PrepTicket, WizardHeader, WIZARD_PHASES, type TicketRow } from "@/components/parity/exam-wizard-chrome";
import { WIZARD_STEP_ORDER } from "@/lib/learning/exam-wizard-copy";
import { subjectLook } from "@/lib/ui/subject-look";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

afterEach(cleanup);
const ORDER = [...WIZARD_STEP_ORDER];

/**
 * Kurulum sihirbazının yeniden tasarımı (8 Kasım 2026; ürün sahibi: "daha premium, profesyonel, samimi").
 * Dört aşamalı üst çubuk, cevaplar geldikçe dolan "Hazırlığın" kartı, öğretmenin ağzından açıklama, ders simgeleri.
 */
describe("kurulum sihirbazı: üst çubuk", () => {
  it("dört aşama bütün adımları bir kez kapsar", () => {
    const covered = WIZARD_PHASES.flatMap((phase) => phase.steps);
    expect([...covered].sort()).toEqual([...ORDER].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("adım sayısı, etkin aşama, geçilen aşamada tik; geri yalnız verildiğinde", () => {
    const onBack = vi.fn();
    const { rerender } = render(<WizardHeader order={ORDER} current="material" onBack={onBack} />);
    expect(screen.getByLabelText("Adım 4 / 10")).toBeTruthy();
    const phases = screen.getAllByRole("listitem");
    expect(phases[0]!.className).toContain("apw-phase--done");
    expect(phases[1]!.getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: /Geri/ }));
    expect(onBack).toHaveBeenCalledOnce();
    rerender(<WizardHeader order={ORDER} current="subject" />);
    expect(screen.queryByRole("button", { name: /Geri/ })).toBeNull();
    expect(screen.getByText("Yeni sınav hazırlığı")).toBeTruthy();
  });
});

describe("kurulum sihirbazı: Hazırlığın kartı", () => {
  const rows: TicketRow[] = [
    { key: "exam", label: "Sınav", value: "TYT", step: "subject" },
    { key: "subject", label: "Ders", value: "Kimya", step: "subject" },
    { key: "date", label: "Tarih", value: "14 Aralık Pzt", detail: "35 gün kaldı", step: "date" },
    { key: "target", label: "Hedef", value: null, step: "target" },
  ];

  it("dolu satır geçilmiş adıma döner; boş satır ve gelecek adım düğme değildir", () => {
    const onJump = vi.fn();
    render(<PrepTicket subject="Kimya" rows={rows} order={ORDER} current="target" onJump={onJump} />);
    fireEvent.click(screen.getByRole("button", { name: "Tarih: 14 Aralık Pzt. Değiştir" }));
    expect(onJump).toHaveBeenCalledWith("date");
    expect(screen.queryByRole("button", { name: /Hedef/ })).toBeNull();
    expect(screen.getByText("35 gün kaldı")).toBeTruthy();
  });

  it("hazırlanıyor ekranlarında (onJump yok) satırlar düğme değildir", () => {
    render(<PrepTicket subject="Kimya" rows={rows} order={ORDER} current="plan" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("ders seçilmeden kart dersin rengini almaz", () => {
    const { container } = render(<PrepTicket subject="" rows={[]} order={ORDER} current="subject" />);
    expect(container.querySelector(".apw-ticket")!.className).not.toContain("apw-ticket--on");
    expect(screen.getByText("Ders seçilmedi")).toBeTruthy();
  });
});

describe("ders simgesi tek kaynaktan", () => {
  it("Türkçe büyük İ ile başlayan ders de eşleşir; bilinmeyen ders varsayılan simge", () => {
    expect(subjectLook("İngilizce").icon).toBe(Languages);
    expect(subjectLook("Biyoloji").icon).toBe(Dna);
    expect(subjectLook("Seramik Sanatı").icon).toBe(GraduationCap);
  });

  it("müfredat kartları da aynı kaynağı kullanır (ikinci liste yok)", () => {
    const catalog = read("src/components/parity/exam-catalog-pages.tsx");
    expect(catalog).toContain('from "@/lib/ui/subject-look"');
    expect(catalog).not.toContain("const SUBJECT_LOOK");
  });
});

describe("sihirbaz kaynağı ve stil katmanı", () => {
  const wizard = read("src/components/parity/exam-create-wizard.tsx");
  const css = read("src/styles/exam-create-wizard.css");
  const layer = css.slice(css.indexOf("Kurulum 2.0"));

  it("başlıklar korunur, açıklamalar öğretmenin ağzından", () => {
    expect(wizard).toContain("<h1>Hangi sınava, hangi derse?</h1>");
    expect(wizard).toContain("<TeacherSay>");
    expect(wizard).toContain("<WizardHeader");
    expect(wizard).toContain("<PrepTicket");
    expect(wizard).not.toContain('className="apw-progress"');
    // Bağlantı ve düğme metninde ok işareti yok; yön simgeyle.
    expect(wizard).not.toContain("belge yüklemeden başla →");
  });

  it("seçim mavi: yeni katmanda mor renk ve geçişli düğme yok", () => {
    expect(layer.length).toBeGreaterThan(1000);
    expect(layer).not.toMatch(/--c-ai\b/);
    expect(layer).not.toMatch(/124,\s*108,\s*247/);
    expect(layer).not.toMatch(/linear-gradient\(135deg/);
  });

  it("etiketler büyük harfle yazılmaz; yapışkan düğmenin devre dışı hâli saydam değil", () => {
    const labels = layer.slice(layer.indexOf(".apw .apw-sublabel"), layer.indexOf("--- Ders adımı ---"));
    expect(labels).toContain("text-transform: none");
    expect(layer).toContain(".apw .apw-step > .apw-cta {\n  position: sticky;");
    const disabled = layer.slice(layer.indexOf(".apw .apw-cta:disabled {"), layer.indexOf(".apw .apw-step > .apw-cta {"));
    expect(disabled).toContain("opacity: 1;");
  });

  it("telefonda yan boşluk ve şerit taşmaz", () => {
    expect(layer).toContain("padding: 0.75rem clamp(1rem, 4vw, 1.5rem) 5rem;");
    const strip = layer.slice(layer.indexOf("@media (max-width: 1099px)"));
    expect(strip).toMatch(/\.apw-ticket-row \{\n\s+position: relative;/);
  });
});
