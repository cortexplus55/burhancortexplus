import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { podcastScriptSystem, scriptToDraft, usesScriptWriter } from "@/lib/learning/podcast-script-writer";
import { parseTeacherPodcast, podcastSystem, podcastWriterSystem } from "@/lib/learning/teacher-podcast";
import { STUDENT_LEAK_BAN } from "@/lib/learning/teaching-rubric";

// 23 Ekim 2026 gecesi: iki sesli türler kısa senarist istemiyle düz senaryo yazar; kod bölümlere ayırır.
describe("podcast: senarist yazar", () => {
  it("yalnız iki sesli türler senarist yazarla; tek sesliler eski şemayla", () => {
    expect(usesScriptWriter("diyalog")).toBe(true);
    expect(usesScriptWriter("soru_cevap")).toBe(true);
    expect(usesScriptWriter("ozet")).toBe(false);
    expect(usesScriptWriter("basit")).toBe(false);
    expect(podcastWriterSystem("document", "diyalog")).toBe(podcastScriptSystem("document", "diyalog"));
    expect(podcastWriterSystem("document", "ozet")).toBe(podcastSystem("document", "ozet"));
  });

  it("istem kısa; doğruluk sınırları ve biçim yerinde", () => {
    const system = podcastScriptSystem("document", "diyalog");
    // Kişisel anı yasağı ve öğrenciye sızıntı yasağı (28 Ekim 2026) eklendi; istem yine kısa kalır
    // (eski onarım listesi ~8.000 karakterdi). Paket A (28 Ekim 2026): uzunluk satırı taban/tavanı anlatıyor.
    expect(system.length).toBeLessThan(5_400);
    expect(system).toContain("Uzunluğu konunun yoğunluğu belirler");
    expect(system).toContain(STUDENT_LEAK_BAN);
    expect(system).toContain("Sayı, eşik, yaş, süre, tarih, doz, formül, tanı ölçütü ve sınıflandırma yalnızca KAYNAK'tan");
    expect(system).toContain("kaynak 'ayrıntılı değerlendirme' diyorsa 'acil' deme");
    expect(system).toContain("SINAVDA SORULUR maddelerinin hepsi ve tablonun her satırı (en az ayırt edici bilgisiyle) konuşmada");
    expect(system).toContain("her birinden yalnız en ayırt edici, sınavda sorulan bir iki bilgiyi söyle");
    expect(system).toContain("Kerem en az iki kez 'neden?' diye sorar");
    expect(system).toContain("'Dur ve düşün:'");
    expect(system).toContain("'Cevap:'");
    expect(system).toContain('"script"');
    expect(podcastScriptSystem("topic", "diyalog")).toContain("Öğrencinin belgesi yok");
    expect(podcastScriptSystem("topic", "diyalog")).not.toContain("KAYNAK'tan");
    expect(podcastScriptSystem("document", "soru_cevap")).toContain("her bölümü sınavda çıkabilecek bir soruyla açar");
  });

  it("düz senaryo bölüm ve satırlara ayrılır", () => {
    const draft = scriptToDraft({
      title: "Büyüme",
      script: [
        "## Bölüm 1: Persentil eğrisi",
        "Kerem: Denemede tek ölçüme bakıp yanıldım.",
        "Ada: Tek nokta seyri göstermez.",
        "Eğri ise zaman içindeki yolu gösterir.",
        "",
        "## Gelişim basamakları",
        "**Ada:** Dur ve düşün: Desteksiz oturma kaç ayda?",
        "Kerem (öğrenci): Cevap: 9 ayda.",
      ].join("\n"),
    });
    expect(draft!.chapters.map((chapter) => chapter.title)).toEqual(["Persentil eğrisi", "Gelişim basamakları"]);
    expect(draft!.chapters[0]!.lines[1]).toEqual({ speaker: "ada", text: "Tek nokta seyri göstermez. Eğri ise zaman içindeki yolu gösterir." });
    expect(draft!.chapters[1]!.lines).toEqual([
      { speaker: "ada", text: "Dur ve düşün: Desteksiz oturma kaç ayda?" },
      { speaker: "kerem", text: "Cevap: 9 ayda." },
    ]);
    expect(scriptToDraft({ title: "x" })).toBeNull();
    expect(scriptToDraft({ script: "   " })).toBeNull();
  });

  it("senaryo bölümlü taslağa çevrilir; 'Dur ve düşün' ve 'Cevap' beat olur", () => {
    const script = [0, 1, 2, 3, 4]
      .map((index) =>
        [
          `## Kavram ${index}`,
          "Kerem: Kilo neden önce değişir?",
          "Ada: Kilo akut beslenmeden hızlı etkilenir; boy kronik süreci yansıtır.",
          index === 1 ? "Ada: Dur ve düşün: Hangisi önce değişir?\nKerem: Cevap: Kilo." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");
    const episode = parseTeacherPodcast({ title: "Büyüme", script }, { length: "diyalog", topicLabel: "Büyüme" });
    expect(episode!.chapters).toHaveLength(5);
    const beats = episode!.chapters[1]!.lines.map((line) => line.beat ?? "");
    expect(beats).toContain("ask");
    expect(beats).toContain("reveal");
    expect(episode!.chapters[1]!.lines.find((line) => line.beat === "ask")!.text).toBe("Hangisi önce değişir?");
  });
});

