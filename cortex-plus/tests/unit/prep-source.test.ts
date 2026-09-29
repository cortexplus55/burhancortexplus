import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  TOPIC_ONLY_NOTICE,
  materialKindLabel,
  prepSourceDocumentIds,
  resolvePrepSourceMode,
  shouldSearchSources,
  topicFence,
} from "@/lib/learning/prep-source";
import { subjectSuggestions } from "@/lib/learning/subjects";

/*
  Bu testler canlıda çıkmış somut bir hatanın bekçisi.

  Belgesiz kurulan sınav hazırlığında kaynak sınırı "documents_only"de
  kalıyordu; arama ise belge seçili olmadığı için öğrencinin BÜTÜN
  belgelerinde yapılıyordu. Sonuç: geçen ay biyoloji notu yüklemiş bir
  öğrenci belgesiz "Trigonometri" hazırlığı kurduğunda, o biyoloji notundan
  benzerlik eşiğini geçen bir parça yakalanırsa derse "YALNIZCA bu alıntılara
  dayan" talimatı gidiyordu. Hiçbir şey çökmüyor — ders sessizce yanlış
  kaynağa bağlanıyor.
*/

describe("resolvePrepSourceMode", () => {
  it("belge yoksa konudan çalışır", () => {
    expect(resolvePrepSourceMode({ documentId: null })).toBe("topic_only");
    expect(resolvePrepSourceMode({ documentId: undefined })).toBe("topic_only");
  });

  it("belge yokken belgenin ayarı sonucu değiştiremez", () => {
    for (const boundary of ["documents_only", "allow_supporting", null] as const) {
      expect(
        resolvePrepSourceMode({ documentId: null, documentBoundary: boundary }),
      ).toBe("topic_only");
    }
  });

  it("belge varsa belgenin kendi ayarı geçerli", () => {
    expect(
      resolvePrepSourceMode({
        documentId: "doc-1",
        documentBoundary: "allow_supporting",
      }),
    ).toBe("allow_supporting");
    expect(
      resolvePrepSourceMode({
        documentId: "doc-1",
        documentBoundary: "documents_only",
      }),
    ).toBe("documents_only");
  });

  it("belge varken ayar okunamazsa dar olan taraf seçilir", () => {
    expect(resolvePrepSourceMode({ documentId: "doc-1" })).toBe("documents_only");
    expect(
      resolvePrepSourceMode({ documentId: "doc-1", documentBoundary: null }),
    ).toBe("documents_only");
  });

  /* Değişmez kural: "yalnızca belgeye dayan" demek için belirli bir belge şart. */
  it("documents_only belgesiz asla dönmez", () => {
    expect(resolvePrepSourceMode({ documentId: null })).not.toBe("documents_only");
  });

  it("konudan çalışırken kaynak araması yapılmaz", () => {
    expect(shouldSearchSources("topic_only")).toBe(false);
    expect(shouldSearchSources("documents_only")).toBe(true);
    expect(shouldSearchSources("allow_supporting")).toBe(true);
  });
});

describe("topicFence", () => {
  const fence = topicFence({
    topic: "Radyan ve Derece Dönüşümü",
    examTitle: "Trigonometri Yazılısı",
    examType: "okul",
  });

  it("kapsamı konu başlığına bağlar", () => {
    expect(fence).toContain("Radyan ve Derece Dönüşümü");
    expect(fence).toContain("Trigonometri Yazılısı");
    expect(fence).toContain("okul");
  });

  it("belge olmadığını söyler", () => {
    expect(fence).toContain("belge");
    expect(fence).toContain("YOK");
  });

  /*
    Sohbetteki katı kural sayfa atfı İSTİYOR. Belgesiz derste sayfa atfı
    uydurma demektir: ortada sayfa yok.
  */
  it("sayfa atfını yasaklar", () => {
    expect(fence).toContain("[Sayfa N]");
    expect(fence.toLowerCase()).toContain("kullanma");
  });

  it("uydurma sayı ve tartışmalı iddiayı yasaklar", () => {
    expect(fence).toContain("uyduma");
    expect(fence).toContain("Tartışmalı");
  });

  it("sınav bilgisi yoksa da çalışır", () => {
    const bare = topicFence({ topic: "Fotosentez" });
    expect(bare).toContain("Fotosentez");
    expect(bare).not.toContain("(");
  });
});

describe("TOPIC_ONLY_NOTICE", () => {
  /* Öğrenciden gizlenirse "notumda bu varmış" yanılgısı doğuyor. */
  it("içeriğin belgeden gelmediğini açıkça söyler", () => {
    expect(TOPIC_ONLY_NOTICE).toContain("belge");
    expect(TOPIC_ONLY_NOTICE).toContain("genel bilgi");
  });
});

describe("subjectSuggestions", () => {
  it("öğrencinin kendi dersleri başa geçer", () => {
    expect(subjectSuggestions(["Geometri", "Fizik"])[0]).toBe("Geometri");
  });

  it("aynı ders iki kez görünmez", () => {
    const out = subjectSuggestions(["Fizik", "fizik", "FİZİK"]);
    expect(out.filter((s) => s.toLocaleLowerCase("tr") === "fizik")).toHaveLength(1);
  });

  it("boş girdileri eler ve sınırı aşmaz", () => {
    const out = subjectSuggestions(["", "   ", "Kimya"], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("Kimya");
  });

  it("yeni öğrenciye de öneri kalır", () => {
    expect(subjectSuggestions([]).length).toBeGreaterThan(0);
  });
});

/*
  Rotalar gerçekten bu karara mı bakıyor? Eski kod belge yokken
  `sourceBoundaryMode ?? "documents_only"` diyordu; o kalıbın geri
  sızmadığını burada tutuyoruz.
*/
describe("rotalar kaynak kararını tek yerden alıyor", () => {
  const routes = [
    "src/app/api/learning/exam-prep/lesson/route.ts",
    "src/app/api/learning/exam-prep/node/route.ts",
    "src/app/api/learning/exam-prep/intro/route.ts",
  ];

  for (const route of routes) {
    it(`${route} resolvePrepSourceMode kullanıyor`, () => {
      const src = readFileSync(route, "utf8");
      expect(src).toContain("resolvePrepSourceMode");
      expect(src).toContain("shouldSearchSources");
    });

    it(`${route} belgesizken documents_only'ye düşmüyor`, () => {
      const src = readFileSync(route, "utf8");
      expect(src).not.toContain('sourceBoundaryMode ?? "documents_only"');
    });
  }

  /*
    29 Eylül 2026: "Belgem yok, konudan çalışayım" ile kurulan hazırlıkta
    giriş dersi hiç üretilmiyordu. Düğüm rotası dersi koşulsuz birleşik
    çözücüye gönderiyordu; çözücü belge listesi boşken her zaman
    "no_prep_documents" dönüyor. Belgesiz ders çözücüden ÖNCE ayrılmalı.
  */
  /*
    Kavramsal çift doğruya (ör. "çarpmada üsler toplanır" + "bölmede üsler
    çıkarılır" aynı soruda) karşı önlem ortak istemde. "Tek doğru cevap"
    gözden geçirmesi (verifyOptionReasoning) tanışma, belgesiz quiz ve
    Studio yollarına eklenince canlıda tanışma testi iki denemede de
    açılmadı (29 Eylül 2026); geri alındı. Bu test onun geri sızmasını da
    tutuyor: o yollarda şık gerekçesi olmadan gözden geçirme her taslağı
    reddediyor.
  */
  it("iki doğru şıkkı istem önlüyor; gözden geçirme bu yollarda kapalı", () => {
    expect(readFileSync("src/lib/learning/exam-quiz-generate.ts", "utf8")).toContain(
      "iki doğru kuralı yan yana şık yapma",
    );
    for (const route of [
      "src/app/api/learning/exam-prep/intro/route.ts",
      "src/app/api/learning/exam-prep/node/route.ts",
      "src/app/api/learning/quiz/generate/route.ts",
    ]) {
      expect(readFileSync(route, "utf8")).not.toMatch(/verifyOptionReasoning:/);
    }
  });

  it("düğüm dersi belgesizken kaynak çözücüye gitmeden konu çitine geçiyor", () => {
    const src = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    const gate = src.indexOf("if (topicOnlyLesson)");
    const resolver = src.indexOf("await resolveLessonSource(");
    expect(gate).toBeGreaterThan(-1);
    expect(resolver).toBeGreaterThan(gate);
    expect(src).toMatch(/if \(topicOnlyLesson\) \{\s*source = EMPTY_SOURCE_CONTEXT;/);
    expect(src).toMatch(/sourceMode === "topic_only"\s*\n?\s*\? topicFence\(/);
  });
});

describe("hazırlık belgeleri", () => {
  it("dolu dizi varsa onu kullanır, boşsa tek belgeye düşer", () => {
    expect(
      prepSourceDocumentIds({
        documentId: "legacy",
        sourceDocumentIds: ["a", "b", "a"],
      }),
    ).toEqual(["a", "b"]);
    expect(
      prepSourceDocumentIds({ documentId: "legacy", sourceDocumentIds: [] }),
    ).toEqual(["legacy"]);
    expect(prepSourceDocumentIds({ documentId: null, sourceDocumentIds: null })).toEqual(
      [],
    );
  });

  it("tür ve sayfa sayısını tek satırda yazar", () => {
    expect(materialKindLabel({ mimeType: "application/pdf", pageCount: 10 })).toBe(
      "PDF · 10 sayfa",
    );
    expect(materialKindLabel({ mimeType: "application/pdf", pageCount: null })).toBe("PDF");
    expect(
      materialKindLabel({
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pageCount: 0,
      }),
    ).toBe("Word");
  });
});
