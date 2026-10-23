import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { podcastSystem, podcastVerifySystem } from "@/lib/learning/teacher-podcast";
import { TEXTBOOK_LINE, TEXTBOOK_MARKS, withoutTextbookLabel } from "@/lib/learning/podcast-textbook";
import { coercePodcastDraft } from "@/lib/learning/podcast-episode";

// 23 Ekim 2026 (ürün sahibi: "podcast'i Astra seviyesine taşımak için ne gerekiyorsa yap").
describe("podcast: ders kitabı nedeni", () => {
  it("yazar üç açılıştan birini kullanır; okuyucular üçünü ve eski etiketi tanır", () => {
    const system = podcastSystem("document", "diyalog");
    for (const mark of TEXTBOOK_MARKS) expect(system).toContain(mark);
    expect(system).toContain("Teknik ya da yabancı bir terimi ilk geçtiği yerde bir cümleyle açıkla");
    expect(system).toContain("'düzeltme' demez");
    expect(podcastVerifySystem("document")).toContain("bu açılışlarla toplam 5'ten fazla cümle");
    for (const mark of TEXTBOOK_MARKS) expect(TEXTBOOK_LINE.test(`${mark} örnek`)).toBe(true);
    expect(TEXTBOOK_LINE.test("Belgende geçmiyor ama bilmen iyi olur: x")).toBe(true);
    expect(TEXTBOOK_LINE.test("Kilo hızlı etkilenir.")).toBe(false);
  });

  it("etiket ekranda kalır, seste okunmaz", () => {
    expect(withoutTextbookLabel("Genel olarak şöyle açıklanır: beyin önce korunur.")).toBe("Beyin önce korunur.");
    expect(withoutTextbookLabel("Kilo önce düşer.")).toBe("Kilo önce düşer.");
    const episode = coercePodcastDraft(
      {
        title: "Büyüme",
        chapters: [0, 1, 2, 3, 4].map((index) => ({
          title: `Kilo ${index}`,
          lines: [
            { speaker: "ada", text: "Ders kitapları bunu şöyle açıklar: kıtlıkta vücut önce depolarını harcar." },
            { speaker: "kerem", text: "Kilo bu yüzden önce düşer." },
          ],
        })),
      },
      { length: "diyalog", topicLabel: "Büyüme" },
    );
    const line = episode!.chapters[0]!.lines[0]!;
    expect(line.text).toContain("Ders kitapları bunu şöyle açıklar:");
    expect(line.spoken).toBe("Kıtlıkta vücut önce depolarını harcar.");
    expect(episode!.chapters[0]!.lines[1]!.spoken).toBeUndefined();
  });
});
