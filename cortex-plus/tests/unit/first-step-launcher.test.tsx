// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { firstStepGreeting, firstStepPlan } from "@/lib/student/first-step";

/*
  Kayıttan sonraki ilk ekran (7 Kasım 2026): hazırlığı olmayan öğrenci boş sohbet kutusu yerine kişiselleştirilmiş
  başlatıcı görür — üç kapı (notunu yükle, hazır müfredat, soru çöz), düzeyine göre ders çipleri. 19 Ekim'deki tek
  "İlk hazırlığını kur" kartının yerine geçti; yine yalnız hazırlık yokken görünür.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("ilk adım planı", () => {
  it("YKS hedefi: TYT çipleri dolu istemle kuruluma, ana düğme resmî kuruluma", () => {
    const plan = firstStepPlan({ gradeLevel: "12. sınıf", goalText: "YKS hazırlık" });
    expect(plan.targetLabel).toBe("YKS (TYT-AYT)");
    expect(plan.curriculumHref).toBe("/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt");
    expect(plan.chips.map((chip) => chip.label)).toEqual(["Türkçe", "Temel Matematik", "Fizik", "Biyoloji"]);
    expect(plan.chips[0]!.href).toMatch(/^\/deneme-sinavlari\/olustur\?ders=TYT\+T%C3%BCrk%C3%A7e&istem=/);
  });

  it("LGS, KPSS ve TUS kendi resmî kurulumuna; okul yazılısı sınıfın müfredatına; mezun YKS'ye", () => {
    expect(firstStepPlan({ goalText: "LGS hazırlık" }).curriculumHref).toBe("/deneme-sinavlari/resmi/kurulum?sinav=lgs");
    expect(firstStepPlan({ goalText: "KPSS hazırlık" }).chips.map((c) => c.label)).toEqual(["Türkçe", "Matematik", "Tarih", "Vatandaşlık"]);
    expect(firstStepPlan({ goalText: "TUS hazırlık" }).targetLabel).toBe("TUS");
    const school = firstStepPlan({ gradeLevel: "10. sınıf", goalText: "Okul sınavları" });
    expect(school.targetLabel).toBe("10. sınıf");
    expect(school.curriculumHref).toBe("/deneme-sinavlari/mufredat");
    expect(school.chips).toHaveLength(4);
    expect(school.chips[0]!.href).toContain("/deneme-sinavlari/olustur?ders=");
    expect(firstStepPlan({ gradeLevel: "Mezun", goalText: "" }).targetLabel).toBe("YKS (TYT-AYT)");
  });

  it("üniversite: ders listesi yok, dersin adı kurulumda yazılır; bilgi yoksa lise", () => {
    const uni = firstStepPlan({ gradeLevel: "Üniversite", goalText: "Üniversite vize ve final" });
    expect(uni.chips).toEqual([]);
    expect(uni.curriculumHref).toBe("/deneme-sinavlari/olustur");
    expect(firstStepPlan({}).targetLabel).toBe("Lise");
  });

  it("selam adla ve hedefle; ad yoksa düşmez", () => {
    expect(firstStepGreeting("Ayşe", "KPSS")).toBe("Hoş geldin Ayşe! 🎯 KPSS hedefin için ilk adımı 30 saniyede atalım.");
    expect(firstStepGreeting(null, "Lise")).toBe("Hoş geldin! 🎯 Lise hedefin için ilk adımı 30 saniyede atalım.");
  });
});

describe("başlatıcı kartı", () => {
  it("üç kapı, kişisel başlık ve ders çipleri", () => {
    render(<FirstStepLauncher firstName="Can" gradeLevel="11. sınıf" goalText="YKS hazırlık" />);
    expect(screen.getByRole("heading", { name: /Hoş geldin Can! 🎯 YKS \(TYT-AYT\) hedefin için/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Kendi ders notunu/ }).getAttribute("href")).toBe("/deneme-sinavlari/olustur");
    expect(screen.getByRole("link", { name: /Çözemediğin sorunun fotoğrafını çek/ }).getAttribute("href")).toBe("/soru-coz");
    expect(screen.getByRole("link", { name: "Müfredattan başla" }).getAttribute("href")).toContain("/deneme-sinavlari/resmi/kurulum?sinav=yks");
    expect(screen.getByRole("link", { name: "Fizik" }).getAttribute("href")).toContain("ders=TYT+Fizik");
  });

  it("'Şimdilik gizle' yalnız bu oturum için gizler", () => {
    render(<FirstStepLauncher firstName="Can" gradeLevel="9. sınıf" goalText="Okul sınavları" />);
    fireEvent.click(screen.getByRole("button", { name: "Şimdilik gizle" }));
    expect(screen.queryByRole("heading", { name: /Hoş geldin/ })).toBeNull();
    expect(sessionStorage.getItem("cp:first-step:hidden")).toBe("1");
  });

  it("ana sayfa yalnız hiç hazırlığı yokken gösterir; eski kart silindi", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain(`.neq("exam_type", "hedef")`);
    expect(page).toContain("<FirstStepLauncher firstName={firstName} gradeLevel={profile?.grade_level} goalText={goalText} />");
    expect(page).toContain("{prepCount === 0 ? (");
    // 8 Kasım 2026: stüdyolar herkese, ilk adımdan önce.
    expect(page.indexOf("<HomeStudios")).toBeLessThan(page.indexOf("<FirstStepLauncher"));
    expect(page).toContain("heroFooter={heroCards}");
    expect(page).not.toContain("FirstPrepCard");
  });
});
