import { describe, expect, it } from "vitest";
import {
  conceptGroups,
  readLessonV2,
  readLessonV3,
  screenCheck,
  screenChecksFirst,
  v2ToV3,
  v3ToV2,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/*
  LessonV3 (16 Ekim 2026): Ders → Ekran → Blok dizisi. Kayıtlı V2 dersler okunurken
  çevrilir; ekran i = bölüm i, ekran başına bir soru. Bu iki değişmez bozulursa
  yarım kalmış derslerin cevapları yanlış soruya yazılır.
*/

const legacy: LessonV2 = {
  title: "Büyüme Değerlendirmesi",
  objective: "Persentil eğrisini okuyabilmek.",
  overview: "Tek bir ölçüm normalse çocuk iyi mi büyüyor?",
  sections: [
    {
      heading: "Persentil Eğrisi",
      lead: "Tek ölçümü değil seyri oku.",
      body: "Boy ve kilo **persentil eğrisinde** izlenir; çocuğun kendi eğrisini koruması önemlidir.",
      source: { file: "pediatri.pdf", page: 3 },
      checkFirst: true,
      check: {
        type: "trueFalse",
        prompt: "Tek bir normal ölçüm büyümenin iyi olduğunu gösterir.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Seyir önemlidir; tek ölçüm yetmez.",
        corrected: "Büyümeyi ölçümlerin zaman içindeki seyri gösterir.",
      },
      cards: [
        { title: "Büyüme", body: "Ölçülerdeki niceliksel artış." },
        { title: "Gelişme", body: "Becerilerin olgunlaşması." },
      ],
      formula: { title: "Z-skoru", expression: "z = (x − ortalama) / SD" },
      procedure: { title: "Okuma", steps: [{ label: "Ölç", detail: "Boyu ölç." }, { label: "İşaretle", detail: "Eğriye işle." }] },
      table: { columns: ["Persentil", "SD"], rows: [["3", "−2"], ["50", "0"]] },
      note: { title: "Günlük hayattan: iki ölçüm", body: "Aynı boydaki iki çocuktan biri eğrisini korur, öteki düşer.", tone: "info" },
    },
    {
      heading: "Baş Çevresi",
      body: "Baş çevresi özellikle ilk iki yılda beyin büyümesi hakkında ipucu verir.",
      check: {
        type: "mcq",
        prompt: "İlk iki yılda beyin büyümesine en çok hangi ölçüm ipucu verir?",
        options: ["Boy", "Kilo", "Baş çevresi", "Göğüs çevresi"],
        answerIndex: 2,
        explanation: "Baş çevresi beyin büyümesini yansıtır.",
        optionWhy: ["Kronik süreç.", "Akut süreç.", "Beyin büyümesi.", "Ölçülmez."],
        review: { prompt: "Baş çevresi duran bir bebekte ne düşünürsün?" },
      },
    },
  ],
  example: { prompt: "Boyu 3. persentilde olan çocuk", solution: "−2 SD civarıdır." },
  commonMistake: { claim: "Tek ölçüm yeterlidir.", correction: "Seyir izlenir." },
  summary: ["Seyir önemlidir.", "Baş çevresi beyni yansıtır.", "Persentil eğrisi kullanılır."],
  nextFocus: [],
};

describe("LessonV3 çeviricileri", () => {
  it("V2 → V3 blokları V2'nin çizim sırasıyla dizer; checkFirst soruyu başa alır", () => {
    const lesson = v2ToV3(legacy);
    expect(lesson.format).toBe(3);
    expect(lesson.screens).toHaveLength(2);
    expect(lesson.screens[0]!.blocks.map((block) => block.type)).toEqual([
      "check",
      "text",
      "cards",
      "formula",
      "procedure",
      "table",
      "note",
    ]);
    expect(screenChecksFirst(lesson.screens[0]!)).toBe(true);
    expect(lesson.screens[1]!.blocks.map((block) => block.type)).toEqual(["text", "check"]);
    expect(screenChecksFirst(lesson.screens[1]!)).toBe(false);
  });

  it("V2 → V3 → V2 gidiş-dönüşü bölümü, soruyu ve cevap dizinini korur", () => {
    const back = v3ToV2(v2ToV3(legacy));
    expect(back.sections).toHaveLength(legacy.sections.length);
    legacy.sections.forEach((section, index) => {
      const got = back.sections[index]!;
      expect(got.heading).toBe(section.heading);
      expect(got.body).toBe(section.body);
      expect(got.check).toEqual(section.check);
      expect(Boolean(got.checkFirst)).toBe(Boolean(section.checkFirst));
      for (const key of ["lead", "source", "cards", "formula", "procedure", "table", "note"] as const) {
        expect(got[key]).toEqual(section[key]);
      }
    });
    expect(back.example).toEqual(legacy.example);
    expect(back.commonMistake).toEqual(legacy.commonMistake);
    expect(back.summary).toEqual(legacy.summary);
  });

  it("kayıtlı ders hangi biçimde gelirse gelsin okunur; bozuk olan null", () => {
    expect(readLessonV3(legacy)?.screens).toHaveLength(2);
    const v3 = v2ToV3(legacy);
    expect(readLessonV3(JSON.parse(JSON.stringify(v3)))?.screens[1]?.heading).toBe("Baş Çevresi");
    expect(readLessonV2(JSON.parse(JSON.stringify(v3)))?.sections[1]?.check?.answerIndex).toBe(2);
    expect(readLessonV2(legacy)?.sections).toHaveLength(2);
    expect(readLessonV3({ title: "x" })).toBeNull();
    expect(readLessonV2({ format: 3, title: "Bozuk", screens: [] })).toBeNull();
  });

  it("bozuk tek blok dersi düşürmez; yalnız o blok atılır", () => {
    const raw = {
      format: 3,
      title: "Z-skoru",
      screens: [
        {
          heading: "Z-skoru",
          blocks: [
            { type: "text", text: "Z-skoru bir ölçümün ortalamadan kaç standart sapma uzak olduğunu söyler." },
            { type: "formula", formula: { title: "" } },
            { type: "hologram", spin: true },
            { type: "formula", formula: { title: "Z-skoru", expression: "z = (x − ortalama) / SD" } },
          ],
        },
      ],
    };
    const lesson = readLessonV3(raw);
    expect(lesson?.screens[0]?.blocks.map((block) => block.type)).toEqual(["text", "formula"]);
    // Geçerli blok kalmayan ekran dersi kurtarmaz.
    expect(readLessonV3({ ...raw, screens: [{ heading: "Boş", blocks: [{ type: "hologram" }] }] })).toBeNull();
  });

  it("aynı türden ikinci blok V2 görünümünde kaybolmaz: gövdeye metin olarak eklenir", () => {
    const lesson: LessonV3 = {
      format: 3,
      title: "Hedef Boy",
      screens: [
        {
          heading: "Hedef boy: hesap",
          concept: "Hedef boy",
          blocks: [
            { type: "text", text: "Hedef boy anne ve babanın boyundan hesaplanır." },
            { type: "formula", formula: { title: "Erkek", expression: "(anne + baba + 13) / 2" } },
            { type: "formula", formula: { title: "Kız", expression: "(anne + baba − 13) / 2" } },
            {
              type: "example",
              example: {
                prompt: "Anne 160 cm, baba 176 cm, erkek çocuk.",
                solution: "(160 + 176 + 13) / 2 = 174,5 cm",
                result: "174,5 cm",
              },
            },
          ],
        },
      ],
    };
    const section = v3ToV2(lesson).sections[0]!;
    expect(section.formula?.title).toBe("Erkek");
    expect(section.body).toContain("Kız: (anne + baba − 13) / 2");
    expect(section.body).toContain("Örnek: Anne 160 cm, baba 176 cm, erkek çocuk.");
    expect(section.check).toBeUndefined();
  });

  it("ardışık aynı kavramlı ekranlar tek kavram sayılır; ekranın sorusu ilk check bloğudur", () => {
    const groups = conceptGroups([
      { heading: "Z-skoru", concept: "Z-skoru" },
      { heading: "Z-skoru: hesap", concept: "Z-skoru" },
      { heading: "Hedef boy" },
    ]);
    expect(groups).toEqual([
      { concept: "Z-skoru", screens: [0, 1] },
      { concept: "Hedef boy", screens: [2] },
    ]);
    const screen = v2ToV3(legacy).screens[1]!;
    expect(screenCheck(screen)?.type).toBe("mcq");
  });
});
