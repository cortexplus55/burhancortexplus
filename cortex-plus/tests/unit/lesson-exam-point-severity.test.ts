import { describe, expect, it } from "vitest";
import { readSource } from "./helpers/node-sources";
import { examPointsVerifyBlock } from "@/lib/learning/exam-points";
import { isReviewIssue, verifySystem } from "@/lib/learning/teacher-lesson";

/*
  24 Ekim 2026 lansman testi (canlı kayıt, "Homeostazi ve Geri Bildirim Temelleri"): ilk kavramın adı konunun
  kendisiydi; denetçi SINAVDA SORULUR listesinin bütün maddelerini tek ekranlık ilk kavramda eksik saydı ('high').
  Dört tur, ardından ana üç kavram atıldı (257 sn, 21 çağrı). Ayrıca doğru/yanlış sorunun ikinci sorusunu
  "cevabı ana sorununkinden farklı" diye C saydı ve yeri "….check.check.review" yazdı; bu yer ikinci soru
  sorunu sayılmadığı için kavram tam düzeltme turuna giriyordu.
*/
describe("ders denetçisi: sınav maddesi ve ikinci soru", () => {
  it("eksik madde öğretim sorunu (medium), yanlış aktarılan madde ciddi (high)", () => {
    const block = examPointsVerifyBlock(["Homeostazide değerler dar sınırlar içinde tutulur"]);
    expect(block).toMatch(/hiç geçmiyorsa 'medium'/);
    expect(block).toMatch(/kaynaktan farklı aktarılmışsa 'high'/);
    expect(block).not.toMatch(/hiç geçmiyorsa ya da/);
    expect(block).toContain("ilk kavram tek ekrandır");
  });

  it("CALIBRATION medium'u sınav maddesi eksikliğine de açar", () => {
    expect(verifySystem("document")).toContain("SINAVDA SORULUR maddesinin eksikliği");
  });

  it("doğru/yanlış ikinci sorusunun farklı cevabı sorun değil", () => {
    for (const mode of ["document", "topic"] as const) {
      expect(verifySystem(mode)).toContain("cevabının ana sorunun cevabından farklı olması sorun değildir");
    }
  });

  it("denetçinin '….check.check.review' yeri de ikinci soru sorunudur", () => {
    for (const where of ["screens[1].blocks[2].review", "screens[1].blocks[2].check.review", "screens[1].blocks[2].check.check.review"]) {
      expect(isReviewIssue({ where, severity: "high", problem: "x" })).toBe(true);
    }
    expect(isReviewIssue({ where: "screens[1].blocks[2]", severity: "high", problem: "x" })).toBe(false);
  });
});

// 24 Ekim 2026: maddeler Word notunun analizinden geldi, ders PDF'in 1. sayfasından yazıldı; denetçi "kaynakta
// yer almıyor" diye tur açtı.
describe("sınav maddeleri dersin kendi kaynağına göre süzülür", () => {
  it("kaynakta geçen madde kalır, başka belgenin maddesi düşer", async () => {
    const { examPointsInSource } = await import("@/lib/learning/exam-points");
    const source = "Homeostazi iç ortamın dengede tutulmasıdır. Vücut sıcaklığı ve kan şekeri dar sınırlar içinde tutulur.";
    const points = [
      "Homeostazide vücut sıcaklığı ve kan şekeri dar sınırlar içinde tutulur",
      "Reseptör uyarıyı algılar, kontrol merkezi değerlendirir, efektör yanıt verir",
    ];
    expect(examPointsInSource(points, source)).toEqual([points[0]]);
    expect(examPointsInSource(points, "")).toEqual(points);
    expect(examPointsInSource(undefined, source)).toEqual([]);
  });

  it("rota yalnız belgeli derste süzer", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readSource("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("examPoints: core ? examPointsInSource(input.examPoints, lessonPages.map((page) => page.text).join(\"\\n\")) : input.examPoints,");
  });
});
