import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { studentBottomTabs } from "@/components/parity/student-shell-nav";
import { WIZARD_STEP_ORDER } from "@/lib/learning/exam-wizard-copy";
import { TOOLS } from "@/lib/parity/tools";

/*
  3 Ekim 2026, ürün sahibi: "öğrenciye bütün yüklediği belgeleri tek bir
  yolda birleştirmiş … her yüklediği dökümanın yolu farklı". Canlıda "Çalış"
  sekmesi trigonometri programının altında zemin mekaniği ve pediatri
  tekrarlarını, son belgeleri tek ekranda gösteriyordu; kurulumun materyal
  adımı başka derslerin belgelerini seçtiriyordu; Belgeler'deki düğme aynı
  belgeye her basışta yeni hazırlık açıyordu (trigonometri ×3).
  kıyas ürünü: ders seç → tarih → hedef → yalnız o dersin materyali; her sınavın
  yolu kendi kartında; menü Sor · Sınavlar · Uygulamalar.
*/
describe("her hazırlığın kendi yolu", () => {
  it("menüde birleşik 'Çalış' ekranı yok; kıyas ürünü sırası", () => {
    expect(studentBottomTabs.map((tab) => tab.label)).toEqual(["Ana Sayfa", "Sınavlar", "Çalışma Stüdyosu", "Profil"]);
    expect(studentBottomTabs.some((tab) => tab.href === "/calisma-plani")).toBe(false);
    expect(TOOLS.some((tool) => tool.href === "/calisma-plani")).toBe(false);
    // 6 Kasım 2026 (Paket 3): yönlendirme sayfa dosyasından `next.config.ts`'e taşındı.
    expect(readFileSync("next.config.ts", "utf8")).toContain(
      '{ source: "/calisma-plani", destination: "/deneme-sinavlari", permanent: true }',
    );
  });

  it("kurulum dersle başlar; materyal adımı yalnız o dersin, eski belgeler listelenmez", () => {
    expect(WIZARD_STEP_ORDER[0]).toBe("subject");
    expect(WIZARD_STEP_ORDER.indexOf("material")).toBeGreaterThan(WIZARD_STEP_ORDER.indexOf("target"));
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).not.toContain("Daha önce yüklediklerin");
    expect(wizard).toContain("Yalnızca <strong>{subject}</strong> materyali");
    expect(wizard).toContain('useState<Step>("subject")');
  });

  it("Belgeler: yolu olan belge kendi yoluna gider, ikinci kopya açılmaz", () => {
    const page = readFileSync("src/app/dokumanlar/page.tsx", "utf8");
    expect(page).toContain("prepByDocument.get(document.id)");
    expect(page).toContain('"Yoluna devam et"');
  });
});

describe("yüklemede sayfa temizliği", () => {
  it("belge hazır olunca iki tamamlanma yolunda da arka plan temizliği başlar", () => {
    const route = readFileSync("src/app/api/documents/process/route.ts", "utf8");
    // Text-only completion, and the course map path (each file once it is saved).
    expect(route.match(/cleanAfterResponse\(service, \{ userId, documentId: doc\.id, startedAt \}\);/g)?.length).toBe(1);
    expect(route).toContain("if (topics) cleanAfterResponse(service, { userId, documentId: id, startedAt });");
    expect(route).toContain("after(() =>");
  });
});
