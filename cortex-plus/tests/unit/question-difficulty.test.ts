import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessQuestionDifficulty } from "@/lib/ai/question-difficulty";
import { chatFallbackMessage } from "@/lib/ai/chat-fallback";
import { selectModel } from "@/lib/ai/model-router";

/*
  Zorluk ölçümü model çağırmıyor. Alternatifi her mesajı önce küçük bir
  modele puanlatmaktı: öğrencinin "merhaba"sı için bile fazladan bir çağrı,
  gecikme ve maliyet. Burada ölçülen şey metnin kendisi; isabeti tek başına
  yeterli değil ve olması gerekmiyor, çünkü arkasında kalite kapısı var.
*/

describe("assessQuestionDifficulty — kolay taraf", () => {
  it("nezaket için güçlü model açmıyor", () => {
    for (const message of ["Merhaba", "teşekkürler", "tamam", "sağ ol"]) {
      expect(assessQuestionDifficulty({ message }).level).toBe("easy");
    }
  });

  it("kısa bilgi sorusu kolay kalıyor", () => {
    expect(assessQuestionDifficulty({ message: "Mitoz nedir?" }).level).toBe("easy");
  });

  /* "çöz" geçen kısa mesaj nezaket sayılmamalı. */
  it("nezaket kelimesi zincir istemiyle birlikte gelirse kolay değil", () => {
    const verdict = assessQuestionDifficulty({
      message: "tamam şunu çöz: 2x+5=13",
    });
    expect(verdict.level).not.toBe("easy");
  });
});

describe("assessQuestionDifficulty — zor taraf", () => {
  it("matematik gösterimi + çözüm istemi zor", () => {
    const verdict = assessQuestionDifficulty({
      message: "f(x)=\\frac{x^2+1}{x-3} fonksiyonunun türevini al ve kritik noktaları bul",
    });
    expect(verdict.level).toBe("hard");
    expect(verdict.reasons).toContain("matematik_gosterimi");
  });

  it("çok parçalı soru zor", () => {
    const verdict = assessQuestionDifficulty({
      message: "Fotosentez nerede olur? Kloroplastın yapısı nasıldır? Işık bağımlı evre neden gerekli?",
    });
    expect(verdict.level).toBe("hard");
    expect(verdict.reasons).toContain("cok_parcali");
  });

  it("alt maddeli soru çok parçalı sayılıyor", () => {
    const verdict = assessQuestionDifficulty({
      message: "Şu soruyu çöz: a) hızı bul b) ivmeyi bul",
    });
    expect(verdict.reasons).toContain("cok_parcali");
  });

  it("uzun problem metni zor", () => {
    const verdict = assessQuestionDifficulty({ message: "A".repeat(420) + " çöz" });
    expect(verdict.level).toBe("hard");
    expect(verdict.reasons).toContain("uzun_metin");
  });

  it("görsel varsa doğrudan zor", () => {
    const verdict = assessQuestionDifficulty({ message: "bu ne", hasImage: true });
    expect(verdict.level).toBe("hard");
  });

  /*
    En güçlü sinyal bu ve tahmin değil ölçüm: ucuz modelin anlatımı bir kez
    denendi, öğrenci anlamadı.
  */
  it("üçüncü turda hâlâ anlaşılmadıysa zor", () => {
    expect(
      assessQuestionDifficulty({ message: "hâlâ anlamadım", turn: 3 }).level,
    ).toBe("hard");
  });

  it("ilk turdaki 'anlamadım' tek başına zor değil", () => {
    const verdict = assessQuestionDifficulty({ message: "anlamadım", turn: 1 });
    expect(verdict.level).not.toBe("hard");
  });
});

describe("yönlendirici — sistem kendi kararıyla yükseltirse kredi artmıyor", () => {
  const base = { hasImage: false, documentPages: 0 } as const;

  /*
    Öğrenci bir soru sordu, bir soruluk kredi öder. Modeli seçen biz
    olduğumuza göre maliyeti de bizim. Aksi hâlde öğrenci aynı görünen iki
    soruda farklı kredi harcadığını görür ve bunun anlaşılır bir açıklaması
    olmaz.
  */
  it("premium + zor soru güçlü modele gider ama eylem kodu standart kalır", () => {
    const out = selectModel({
      ...base,
      actionCode: "AI_CHAT_STANDARD",
      isPremium: true,
      difficulty: "hard",
    });
    expect(out.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("öğrenci düğmeye kendi basarsa gelişmiş eylem kodu yazılır", () => {
    const out = selectModel({
      ...base,
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: true,
      userSelectedAdvanced: true,
      difficulty: "easy",
    });
    expect(out.actionCode).toBe("AI_CHAT_ADVANCED");
  });

  it("ücretsiz hesap zor soruda da standart modelde kalıyor", () => {
    const out = selectModel({
      ...base,
      actionCode: "AI_CHAT_STANDARD",
      isPremium: false,
      difficulty: "hard",
    });
    expect(out.actionCode).toBe("AI_CHAT_STANDARD");
    expect(out.model).not.toBe("");
  });

  /*
    `difficulty` alanı bir kez devre dışı bırakılmıştı çünkü onu İSTEMCİ
    yazıyordu: `/api/learning/exam/generate` şeması "hard" kabul ediyor.
    Geri gelen dal yalnızca sohbette çalışıyor; sohbette zorluğu rota
    metinden kendisi ölçüyor.
  */
  it("sohbet dışı eylemler zorluk dalından etkilenmiyor", () => {
    const out = selectModel({
      ...base,
      actionCode: "PRACTICE_EXAM_GENERATE",
      isPremium: true,
      difficulty: "hard",
    });
    expect(out.actionCode).toBe("PRACTICE_EXAM_GENERATE");
  });
});

describe("chatFallbackMessage", () => {
  it("krediyi harcamadığımızı her hâlde söylüyor", () => {
    for (const isPremium of [true, false]) {
      for (const difficulty of ["easy", "medium", "hard"] as const) {
        expect(chatFallbackMessage({ isPremium, difficulty })).toContain(
          "Kredin harcanmadı",
        );
      }
    }
  });

  it("ücretsiz hesaba zor soruda Plus'tan söz ediyor", () => {
    expect(chatFallbackMessage({ isPremium: false, difficulty: "hard" })).toContain(
      "Plus",
    );
  });

  /* Ödeyen kullanıcıya abonelik önermek saygısızlık olur. */
  it("premium hesaba abonelik önermiyor", () => {
    expect(chatFallbackMessage({ isPremium: true, difficulty: "hard" })).not.toContain(
      "Plus",
    );
  });

  it("zor olmayan soruda ücretsiz hesaba da satış yapmıyor", () => {
    expect(chatFallbackMessage({ isPremium: false, difficulty: "easy" })).not.toContain(
      "Plus",
    );
  });
});

/*
  Zorluk istemciden GELMEMELİ. Bu, alanın bir kez devre dışı bırakılmasına
  yol açan hatanın tam kendisiydi.
*/
describe("sohbet rotası zorluğu kendisi ölçüyor", () => {
  const src = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  it("istek şeması difficulty kabul etmiyor", () => {
    const schema = src.slice(src.indexOf("const bodySchema"), src.indexOf("export async function POST"));
    expect(schema).not.toContain("difficulty");
  });

  it("zorluk sunucuda ölçülüyor", () => {
    expect(src).toContain("assessQuestionDifficulty");
  });

  it("tur sayısı kullanıcıya bağlı sayılıyor", () => {
    const block = src.slice(src.indexOf("priorUserTurns"), src.indexOf("const difficulty ="));
    expect(block).toContain('.eq("user_id", userId)');
  });

  it("iki kez başarısız olursa kredi iade edilip öğrenciye söyleniyor", () => {
    expect(src).toContain("chatFallbackMessage");
    expect(src).toContain("EducationalVerificationError");
  });
});
