import { describe, expect, it } from "vitest";
import { conceptCheck } from "@/lib/learning/lesson-coherence";
import {
  checkEchoes,
  criticalTeachingFailures,
  finishTaughtLesson,
  fluencyIssues,
} from "@/lib/learning/lesson-teach";
import { fluencyIssues as surfaceIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { retryStemBroken, reviewQuestionFor } from "@/lib/learning/teacher-brain";
import { auditQuantitative, quizClaimIssues, repairQuantitative } from "@/lib/learning/tutor-quant";
import { groundProseCalculations, variableUnitIssue, workedExampleIssues } from "@/lib/learning/worked-example";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const CHEM_SOURCE = [
  "[s.1] foto-3.jpg: 14 g azot ve 4 g hidrojen tepkimeye girer. N₂ + 3H₂ → 2NH₃. 14 / 28 = 0,5 mol azot ve 4 / 2 = 2 mol hidrojen vardır. Oluşan ürün 2 × 0,5 = 1 mol = 17 g olur. 14 + 4 = 17 + 1.",
  "[s.9] pdf-16.pdf: Yüzde verim, gerçek ürünün kuramsal ürüne oranıdır. Kuramsal ürün 17 g ve gerçek ürün 13,6 g ise 13,6 / 17 = 0,8 olur.",
].join("\n");

const HISTORY_SOURCE =
  "[s.2] hatt.pdf: Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.";

const BIO_SOURCE =
  "[s.1] hucre.pdf: Hücre, canlıların yapı ve işlev birimidir. Mitokondri enerji dönüşümünü yürütür. Çekirdek genetik bilgiyi taşır.";

const ECON_SOURCE =
  "[s.3] talep.pdf: Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler. Fiyat ve miktar birlikte okunur.";

function check(partial: Partial<SectionCheck> & Pick<SectionCheck, "prompt" | "type" | "options" | "answerIndex">): SectionCheck {
  return { explanation: "Kaynak, ayrımı verilen şarta bağlar ve ezber cümlesini tekrarlamaz.", ...partial };
}

describe("kesin hüküm her konuda kaynakla tutulur", () => {
  it("kimyada desteklenmeyen tekliği düşürür, kaynakla aynı her zamanı tutar", () => {
    const exclusivity = "Sınırlayıcı bileşen sadece tek bir madde olabilir.";
    const fixed = repairQuantitative(exclusivity, auditQuantitative(exclusivity, CHEM_SOURCE));
    expect(fixed).toMatch(/stokiyometrik orandaysa/);
    expect(fixed).not.toMatch(/tek bir madde/);

    const kept = "Her antlaşma her zaman yazılı olmalıdır.";
    expect(repairQuantitative(kept, auditQuantitative(kept, kept))).toBe(kept);
    expect(repairQuantitative(kept, auditQuantitative(kept, HISTORY_SOURCE))).not.toMatch(/her zaman/);
  });

  it("biyolojide tek bir hücreyi ve ekonomide yalnızca bir fiyatı ayırır", () => {
    const cell = "Canlının görünür hali tek bir hücrenin içinde bölünmüş işlere dayanır.";
    expect(auditQuantitative(cell, BIO_SOURCE).issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
    const price = "Piyasa yalnızca bir fiyat olabilir.";
    const dropped = repairQuantitative(price, auditQuantitative(price, ECON_SOURCE));
    expect(dropped).not.toMatch(/yalnızca bir/);
    const stated = "Fiyat yalnızca bir denge değerine oturur ve başka fiyat kalmaz.";
    expect(auditQuantitative(stated, stated).issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
  });

  it("İngilizcede always yumuşar, only one kaynakta yoksa çıkar", () => {
    const always = "Demand always falls when the price rises.";
    expect(repairQuantitative(always, auditQuantitative(always, ""))).not.toMatch(/\balways\b/i);
    expect(repairQuantitative(always, auditQuantitative(always, always))).toBe(always);
    const only = "A market has only one price.";
    expect(repairQuantitative(only, auditQuantitative(only, "Markets clear when buyers and sellers meet."))).not.toMatch(/only one/i);
    expect(auditQuantitative("This topic must be studied.").issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
  });

  it("kesin hükme dayanan soruyu düşürüp dersi açar", async () => {
    const lesson: LessonV2 = {
      title: "Talep",
      overview: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler ve alıcı ile satıcıyı aynı grafikte okur.",
      sections: [
        {
          heading: "Talep eğrisi",
          body: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler. Fiyat ve miktar birlikte okunur. Kaynak bu iki büyüklüğü ayırır.",
          check: check({
            type: "trueFalse",
            prompt: "Piyasa yalnızca bir fiyat olabilir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Piyasa yalnızca bir fiyat olabilir ve başka fiyat geçersizdir.",
          }),
        },
      ],
      summary: [
        "Talep, fiyat yükseldikçe istenen miktarın azalmasıdır.",
        "Uygulama, fiyat ile miktarı aynı eksende okumaktır.",
        "Sık hata, tek bir fiyatı zorunlu sanmaktır.",
      ],
    };
    const finished = await finishTaughtLesson(lesson, { source: ECON_SOURCE, topicLabel: "Talep" });
    const blob = JSON.stringify(finished.lesson);
    expect(blob).not.toMatch(/yalnızca bir fiyat olabilir/);
    expect(blob).toMatch(/Doğrulanamayan cümleler çıkarıldı/);
    expect(criticalTeachingFailures(finished.failures).map((failure) => failure.problem)).not.toContain(
      "absolute_check",
    );
  });
});

describe("çözümlü örnek ve verisi önce söylenen hesap", () => {
  it("kimyada birimsiz değişkeni, bilinmeyen çarpanı ve sarkan atamayı tutmaz", () => {
    const prompt = "g = 17 g ürün ve n = 17 g ürün verildiğine göre sonuç kaçtır?";
    const solution = "Gerçek ürün = 0,80 × 17 = 13,6 g ürün. g = 17 g";
    const issues = workedExampleIssues(prompt, solution, CHEM_SOURCE, true);
    expect(issues.some((issue) => issue.includes("büyüklüğ"))).toBe(true);
    expect(issues).toContain("unknown_operand");
    expect(issues).toContain("dangling");
    expect(variableUnitIssue("n", "g")).toMatch(/uymaz/);
    expect(variableUnitIssue("n", "mol")).toBeNull();
    expect(variableUnitIssue("m", "kg")).toBeNull();
  });

  it("kaynaktaki mol örneğini ve tarih anlatısını geçirir", () => {
    const solution = [
      "Verilen: 88 g, 44 g/mol.",
      "İstenen: mol sayısı.",
      "Bağıntı: n = m / M.",
      "Yerine koyma: n = 88 / 44 = 2 mol.",
      "Sonuç: 2 mol.",
    ].join("\n");
    expect(workedExampleIssues("88 g karbondioksit kaç mol eder?", solution, CHEM_SOURCE, true)).toEqual([]);
    const history = "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.";
    expect(workedExampleIssues("Vergi hangi şartla toplanacaktı?", history, HISTORY_SOURCE, false)).toEqual([]);
    expect(
      workedExampleIssues("Vergi hangi şartla toplanacaktı?", "Padişah orduyu dağıttı ve yeni bir vergi icat etti.", HISTORY_SOURCE, false),
    ).toContain("ungrounded_claim");
  });

  it("biyolojide olayı, ekonomide ve İngilizcede sayıyı kaynakta arar", () => {
    const cell = "Mitokondri enerji dönüşümünü yürütür.";
    expect(workedExampleIssues("Enerji dönüşümünü hangi organel yürütür?", cell, BIO_SOURCE, false)).toEqual([]);
    const price = "Yerine koyma: 20 / 4 = 5.\nSonuç: 5.";
    expect(workedExampleIssues("Sonuç kaçtır?", price, ECON_SOURCE, true)).toContain("unknown_operand");
    const english = "Given: 20 units and 4 units.\nSubstitution: 20 / 4 = 5.\nResult: 5.";
    expect(workedExampleIssues("What is the result?", english, "The table lists 20 units and 4 units.", true)).toEqual([]);
  });

  it("verisi söylenmemiş hesabı kaynaktan öne alır ya da çıkarır", () => {
    const bare = "Oluşan ürün 2 × 0,5 = 1 mol olur.";
    const grounded = groundProseCalculations(bare, CHEM_SOURCE);
    expect(grounded.length).toBeGreaterThan(bare.length);
    expect(grounded).toMatch(/2 × 0,5|2 x 0,5/i);
    const missing = groundProseCalculations("Sonuç 9 × 9 = 81 olur.", HISTORY_SOURCE);
    expect(missing).not.toMatch(/81/);
    const biology = groundProseCalculations("Mitokondri enerji dönüşümünü yürütür.", BIO_SOURCE);
    expect(biology).toMatch(/Mitokondri/);
  });

  it("bozuk örneği yayımlamaz, kaynağın zinciri varsa onu kurar", async () => {
    const source = [
      "[s.3] mekanik.pdf: İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler.",
      "[s.4] mekanik.pdf: Örnek: m = 0,5 kg ve V = 0,40 m³ için P = 0,5 × 0,287 × 300 / 0,40 = 107,6 kPa olur.",
    ].join("\n");
    const lesson: LessonV2 = {
      title: "İdeal gaz basıncı",
      overview: "Basınç, kütle sıcaklık ve hacim birlikte değişince okunur. Tek bir sayı basıncı anlatmaz ve üç büyüklük aynı eşitlikte durur.",
      sections: [
        {
          heading: "İdeal gaz basıncı",
          body: "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler.",
          note: { title: "Basınç", body: "Basınç, kütle sıcaklık ve hacimle kurulur.", tone: "info" },
        },
      ],
      example: {
        prompt: "n = 17 g verildiğine göre sonuç kaçtır?",
        solution: "Gerçek ürün = 0,80 × 17 = 13,6 g. g = 17 g",
      },
      summary: [
        "Basınç P = mRT/V ile kurulur çünkü üç büyüklük birlikte etki eder.",
        "Uygulama, kütle sıcaklık ve hacmi bağıntıda yerine koymaktır.",
        "Eksik bir büyüklük basıncı başka bir orana çevirir.",
      ],
    };
    const finished = await finishTaughtLesson(lesson, { source, topicLabel: "İdeal gaz basıncı" });
    const solution = finished.lesson.example?.solution ?? "";
    expect(solution).toMatch(/107,6/);
    expect(solution).not.toMatch(/0,80|g = 17/);
  });
});

describe("yankı, geri bildirim ve tekrar", () => {
  it("başka bölümdeki cümleyi tekrar eden soruyu yakalar, uygulamayı bırakır", () => {
    const lesson: LessonV2 = {
      title: "Talep",
      overview: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler.",
      sections: [
        {
          heading: "Grafik",
          body: "Fiyat ve miktar aynı eksende okunur. Eğri sağa yatık durur ve alıcı kararını fiyat üzerinden kurar.",
          check: check({
            type: "trueFalse",
            prompt: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
          }),
        },
      ],
    };
    const echoed = lesson.sections[0]?.check;
    expect(echoed && checkEchoes(echoed, lesson, lesson.sections[0]?.body ?? "")).toBe(true);
    const applied = check({
      type: "trueFalse",
      prompt: "Mol sayısı, kütle ile mol kütlesinin çarpımıdır.",
      options: ["Yanlış", "Doğru"],
      answerIndex: 0,
    });
    const host: LessonV2 = {
      title: "Mol",
      overview: "Kimyacılar tanecikleri mol denen paketlerle sayar ve kütleyi o paket üzerinden okur.",
      sections: [
        {
          heading: "Kütle ve mol",
          body: "Bir maddenin mol sayısı, kütlenin mol kütlesine bölünmesiyle bulunur. Bağıntı n = m / M şeklindedir.",
          check: applied,
        },
      ],
    };
    expect(checkEchoes(applied, host, host.sections[0]?.body ?? "")).toBe(false);
  });

  it("geri bildirimi tam cümle yapar ve kırık şablonu kapıdan geçirmez", () => {
    const concept = conceptCheck("Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır.");
    expect(concept?.explanation).not.toMatch(/ters çevrilirse cümle|kurulduğu anlama uyuyor/);
    expect(concept?.explanation).toMatch(/kaynağın kurduğu tanımla/);
    expect(fluencyIssues(concept?.explanation ?? "")).toEqual([]);
    const broken = "Kimyasal tepkimelerde hangi maddenin ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.";
    expect(surfaceIssues(broken)).toContain("spliced");
    const cell = "Mitokondri enerji dönüşümünü ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.";
    expect(surfaceIssues(cell)).toContain("spliced");
    const price = "The price cümlede kurulduğu anlama uyuyor; yüklem terimi başka bir büyüklüğe kaydırmıyor.";
    expect(surfaceIssues(price)).toContain("spliced");
  });

  it("tekrar sorusu yargısı doğru mudur eklemez", () => {
    expect(retryStemBroken("Talep artar yargısı doğru mudur?")).toBe(true);
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
        options: ["Yanlış", "Doğru"],
        answerIndex: 1,
        explanation: "Kurul onayı vergiden önce gelir.",
      },
      "tr",
      "",
    );
    expect(retry.prompt).not.toMatch(/yargısı doğru mudur/);
    expect(retry.prompt).not.toBe("Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.");
    const english = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: "Demand falls when the price rises.",
        options: ["False", "True"],
        answerIndex: 1,
        explanation: "The curve slopes down.",
      },
      "en",
      "",
    );
    expect(english.prompt).not.toMatch(/yargısı doğru mudur/);
  });
});

describe("isim tamlaması ve özet", () => {
  it("yönelmeyi iyelik ekine çevirir, lisanslı eki ve İngilizce mastarı bırakır", () => {
    const raw = "Tepkime verimi, teorik ürün miktara ile deneyde elde edilen gerçek ürün miktara arasındaki orandır.";
    const fixed = repairTurkishSurface(raw);
    expect(fixed).toContain("ürün miktarı ile");
    expect(fixed).toContain("ürün miktarı arasındaki");
    expect(fixed).not.toMatch(/miktara/);
    expect(repairTurkishSurface("Sonuç miktara göre okunur.")).toBe("Sonuç miktara göre okunur.");
    expect(repairTurkishSurface("Hücre sayısına göre karar verilir.")).toContain("sayısına");
    expect(repairTurkishSurface("Toplantı sonra ile başladı.")).toContain("sonra");
    expect(repairTurkishSurface("Fiyat miktara ile karşılaştırılır.")).toContain("miktarı ile");
    expect(repairTurkishSurface("The amount to the total is the ratio.")).toContain("amount of the");
    expect(repairTurkishSurface("Use the amount to calculate the ratio.")).toContain("amount to calculate");
    expect(fluencyIssues(fixed)).not.toContain("typo");
  });

  it("kopya özeti ve bağlamsız diğer maddesini yeniden yazar", async () => {
    const lesson: LessonV2 = {
      title: "Hücre",
      overview: "Hücre, canlıların yapı ve işlev birimidir ve organeller işi bölüşür.",
      sections: [
        {
          heading: "Hücre",
          body: "Hücre, canlıların yapı ve işlev birimidir. Mitokondri enerji dönüşümünü yürütür. Çekirdek genetik bilgiyi taşır.",
          note: { title: "Hücre", body: "Hücre, canlıların yapı ve işlev birimidir.", tone: "info" },
          check: check({
            type: "mcq",
            prompt: "Enerji dönüşümünü hangi organel yürütür?",
            options: ["Mitokondri", "Çekirdek", "Zar", "Koful"],
            answerIndex: 0,
            explanation: "Mitokondri enerji dönüşümünü yürütür. Çekirdek genetik bilgiyi taşır.",
            optionWhy: [
              "Mitokondri enerji dönüşümünü yürütür.",
              "Çekirdek genetik bilgiyi taşır.",
              "Zar bu cümlede anılmaz.",
              "Koful kaynağın listesinde yoktur.",
            ],
          }),
        },
      ],
      summary: [
        "Hücre, canlıların yapı ve işlev birimidir.",
        "Mitokondri enerji dönüşümünü yürütür.",
        "Diğer madde veya maddeler ise artar.",
      ],
    };
    const finished = await finishTaughtLesson(lesson, { source: BIO_SOURCE, topicLabel: "Hücre" });
    const summary = (finished.lesson.summary ?? []).join(" ");
    expect(summary).not.toMatch(/^Diğer|Diğer madde veya maddeler ise artar/);
    expect(summary).not.toBe(lesson.summary?.join(" "));
    expect(finished.lesson.sections[0]?.body).toMatch(/Mitokondri/);
    expect(criticalTeachingFailures(finished.failures)).toEqual([]);
  });
});

describe("quiz kapısı yeni kesin hükmü de görür", () => {
  it("kaynak susunca only one sorusunu işaretler", () => {
    const issues = quizClaimIssues(
      [
        {
          text: "A market has only one price.",
          explanation: "A market has only one price and no other price clears.",
          correct: ["True"],
        },
      ],
      "Markets clear when buyers and sellers meet.",
    );
    expect(issues.some((issue) => /kesin hüküm/.test(issue))).toBe(true);
    expect(
      quizClaimIssues(
        [{ text: "Her antlaşma her zaman yazılı olmalıdır.", explanation: "Kaynak aynı cümleyi kurar.", correct: ["Evet"] }],
        "Her antlaşma her zaman yazılı olmalıdır.",
      ).some((issue) => /kesin hüküm/.test(issue)),
    ).toBe(false);
  });
});
