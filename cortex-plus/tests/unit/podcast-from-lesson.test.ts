import { describe, expect, it } from "vitest";
import {
  lessonPodcastBrief,
  podcastNumbersOutsideLesson,
} from "@/lib/learning/podcast-from-lesson";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const lesson: LessonV2 = {
  title: "Dane Boyu Dağılımı ve Zemin Sınıflandırması",
  objective: "No.200 eleğinden geçen orana bakarak zemini kaba/ince ayırabileceksin.",
  overview:
    "Zemini sınıflandırmanın ilk adımı dane boyudur; eşik No.200 eleğinden geçen orandır.",
  sections: [
    {
      heading: "No.200 Eleği Eşiği",
      body: "No.200 eleğinden geçen oran %50'yi aşıyorsa zemin ince danelidir; aşmıyorsa kaba danelidir.",
    },
    {
      heading: "Atterberg Limitleri",
      body: "LL = 52 ve PL = 24 olan bir kilde plastisite indisi PI = 28 olur.",
    },
    {
      heading: "Derecelendirme Katsayıları",
      body: "Cu ve Cc birlikte dengeli derecelendirmeyi gösterir.",
    },
  ],
  example: {
    prompt: "No.200 eleğinden geçeni %8 olan, kaba kısmının çoğu kum olan zemin hangi sınıftadır?",
    solution: "%8 < %50 olduğu için zemin kaba danelidir; kaba kısmın çoğu kum olduğundan kum grubundadır.",
  },
  commonMistake: {
    claim: "%8 geçen zemin ince danelidir.",
    correction: "Eşik %50'dir; %8 eşiğin altında kaldığı için zemin kaba danelidir.",
  },
  infoCheck: {
    prompt: "İnce daneli eşiği nedir?",
    answer: "No.200'den geçen %50",
  },
  summary: ["Eşik No.200'den geçen %50", "PI = LL − PL"],
  nextFocus: ["Permeabilite"],
};

describe("lessonPodcastBrief", () => {
  it("carries the facts a podcast would otherwise have to re-derive", () => {
    const brief = lessonPodcastBrief(lesson);
    expect(brief).toContain("No.200 Eleği Eşiği");
    expect(brief).toContain("%50'yi aşıyorsa");
    // Ters çevirmenin yaşandığı yer: örneğin sonucu da brief'te olmalı.
    expect(brief).toContain("kaba danelidir");
    expect(brief).toContain("PI = 28");
  });
});

describe("podcastNumbersOutsideLesson", () => {
  const brief = lessonPodcastBrief(lesson);

  it("accepts a podcast that only reuses the lesson's quantities", () => {
    const podcast =
      "No.200 eleğinden geçen %50'yi aşarsa ince danelidir. %8 geçen zemin kaba danelidir. LL 52 ve PL 24 ile PI 28 bulunur.";
    expect(podcastNumbersOutsideLesson(podcast, brief)).toEqual([]);
  });

  it("catches a quantity the lesson never mentions", () => {
    const podcast = "No.200 eleğinden geçen %35 ise zemin ince danelidir.";
    expect(podcastNumbersOutsideLesson(podcast, brief)).toEqual(["35"]);
  });

  it("ignores incidental single digits from the narration itself", () => {
    // "üç fazlı", "2 sunucu" gibi anlatı sayıları boşuna taslak reddi
    // doğurmasın; yüzde işaretli olan her zaman sayılır.
    expect(podcastNumbersOutsideLesson("Bu derste 3 başlık var.", brief)).toEqual([]);
    expect(podcastNumbersOutsideLesson("Oran %3 olursa.", brief)).toEqual(["3"]);
  });

  it("treats comma and period decimals as the same number", () => {
    expect(podcastNumbersOutsideLesson("9,81 kN", "birim ağırlık 9.81 kN")).toEqual([]);
  });
});

describe("lessonPodcastBrief and scaffold headings", () => {
  it("does not hand the podcast a heading its own validator forbids", () => {
    // Canlıda kilitlenme buydu: dersin bölümü "Kontrol Noktası" adını
    // taşıyordu, podcast onu kopyaladı, doğrulayıcı reddetti ve üretim
    // 32 denemede de tamamlanamadı.
    const withScaffold: LessonV2 = {
      ...lesson,
      sections: [
        { heading: "Kontrol Noktası", body: "48. ayda DaBT-İPA rapeli yapılır." },
        ...lesson.sections.slice(1),
      ],
    };
    const brief = lessonPodcastBrief(withScaffold);
    expect(brief).not.toContain("Kontrol Noktası");
    expect(brief).toContain("sen adlandır");
    // Bölümün içeriği duruyor; kaybolan yalnızca şablon adı.
    expect(brief).toContain("DaBT-İPA rapeli");
  });

  it("keeps a conceptual heading as it is", () => {
    expect(lessonPodcastBrief(lesson)).toContain("No.200 Eleği Eşiği");
  });

  it("does not label fields with words that become chapter titles", () => {
    const brief = lessonPodcastBrief(lesson);
    expect(brief).not.toMatch(/^Özet:/m);
    expect(brief).not.toMatch(/^Yaygın hata:/m);
  });
});
