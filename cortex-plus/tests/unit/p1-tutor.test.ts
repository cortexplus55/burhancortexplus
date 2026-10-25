import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tutorSystemPrompt, teacherStyleLine } from "@/lib/ai/teacher-tutor";
import {
  answerFirstLine,
  bestSourcePage,
  hasOwnSolution,
  stuckPointIssue,
  wantsDirectAnswer,
} from "@/lib/learning/tutor-answer";
import { QA_TEACHER_PROMPT, TUTOR_ANSWER_DISCIPLINE, tutorStylePrompt } from "@/lib/learning/tutor-style";
import { splitTutorChrome } from "@/lib/learning/tutor-reply";

describe("P1-5 doğrudan cevap yüklemi", () => {
  it("kavram sorusu ve açık istek doğrudan cevap ister", () => {
    for (const message of [
      "Ozmoz nedir?",
      "Hangisi birincil kaynaktır, hangisidir yani?",
      "Bunu doğrudan söyle",
      "cevabı ver lütfen",
      "Çözünürlük ne demek?",
      "İki kavramın farkı ne?",
    ]) {
      expect(wantsDirectAnswer(message), message).toBe(true);
    }
  });

  it("Adım adım ve Doğrudan çöz tarzında her soru doğrudan cevaplanır; Sokratik problemde değil", () => {
    expect(wantsDirectAnswer("Bu problemi çözelim", "step_by_step")).toBe(true);
    expect(wantsDirectAnswer("Bu problemi çözelim", "direct_solve")).toBe(true);
    expect(wantsDirectAnswer("Bu problemi çözelim", "hints_first")).toBe(false);
    expect(wantsDirectAnswer("Bu kavram nedir?", "hints_first")).toBe(true);
  });

  it("kendi çözümünü yazan öğrencide önce o değerlendirilir", () => {
    expect(hasOwnSolution("Ben B şıkkını işaretledim, doğru mu?")).toBe(true);
    expect(hasOwnSolution("2x + 3 = 7 ise x = 2 buldum")).toBe(true);
    expect(hasOwnSolution("Şöyle çözdüm: önce payı aldım")).toBe(true);
    expect(hasOwnSolution("Ozmoz nedir?")).toBe(false);
    expect(wantsDirectAnswer("Bence cevap C, nedir doğrusu?")).toBe(false);
    expect(answerFirstLine("Bence cevap C")).toMatch(/kendi çözümünü yazdı/);
  });

  it("doğrudan soruda istem ilk cümlede tam cevap ister ve takıldığın nokta cümlesini yasaklar", () => {
    const line = answerFirstLine("Ozmoz nedir?");
    expect(line).toMatch(/İLK CÜMLE TAM CEVAP/);
    expect(line).toMatch(/Takıldığın nokta/);
  });

  it("takıldığın nokta cümlesi kendi çözümü yokken denetim sorunu sayılır", () => {
    expect(stuckPointIssue("Ozmoz nedir?", "Takıldığın nokta şu: ozmoz…")).not.toBeNull();
    expect(stuckPointIssue("Ozmoz nedir?", "Takıldığın özel bir nokta belirtilmedi.")).not.toBeNull();
    expect(stuckPointIssue("Bence B, doğru mu?", "Takıldığın nokta: B ile C'yi karıştırdın.")).toBeNull();
    expect(stuckPointIssue("Ozmoz nedir?", "Ozmoz, suyun yarı geçirgen zardan geçişidir.")).toBeNull();
  });
});

describe("P1-5 istemler cevabı saklamaz", () => {
  it("eski 'cevabı baştan yapıştırma' ve 'takılacağı yer' sırası kalktı", () => {
    expect(TUTOR_ANSWER_DISCIPLINE).not.toMatch(/Cevabı baştan yapıştırma/);
    expect(TUTOR_ANSWER_DISCIPLINE).toMatch(/ilk cümle tam cevaptır/);
    expect(QA_TEACHER_PROMPT).not.toMatch(/ilk kelimede yapıştırmaz/);
    expect(QA_TEACHER_PROMPT).toMatch(/ilk cümlesi doğru cevabı/);
    expect(tutorStylePrompt("direct_solve")).toMatch(/ilk cümlede sonucu ver/);
  });

  it("öğretmen tavrı doğrudan soruda ilk cümle cevabı ister; Sokratik mod kavram sorusunu saklamaz", () => {
    const prompt = tutorSystemPrompt({ passages: [] });
    expect(prompt).toMatch(/ilk cümle tam cevaptır/);
    expect(prompt).not.toMatch(/cevabı hemen verme/);
    expect(teacherStyleLine("hints_first")).toMatch(/Kavram sorusunda .* tanımı ilk cümlede ver/);
  });

  it("sohbet, sesli soru-cevap ve koç aynı yüklemi okur", () => {
    expect(readFileSync("src/lib/ai/teacher-tutor-run.ts", "utf8")).toMatch(/answerFirstLine\(input\.message, input\.style\)/);
    expect(readFileSync("src/app/api/ai/chat/route.ts", "utf8")).toMatch(/answerFirstLine\(message, tutorStyle\)/);
    expect(readFileSync("src/app/api/learning/exam-prep/coach/route.ts", "utf8")).toMatch(/answerFirstLine\(lastStudent\)/);
  });
});

describe("P1-5 kaynak işareti sunucuda", () => {
  const pages = [
    { page: 3, text: "Hücre zarı seçici geçirgendir; madde geçişini düzenler." },
    { page: 7, text: "Ozmoz, suyun yarı geçirgen zardan çok yoğun ortama geçişidir. Ozmotik basınç bu geçişi sağlar." },
  ];

  it("cevabın en çok dayandığı sayfa seçilir; örtüşme yoksa işaret yok", () => {
    expect(bestSourcePage("Ozmoz suyun yarı geçirgen zardan geçişidir.", pages)?.page).toBe(7);
    expect(bestSourcePage("Merhaba, başlayalım.", pages)).toBeNull();
  });

  it("sesli soru-cevap yanıtı işareti ayrı alanda taşır, ekran işareti çözer", () => {
    const voice = readFileSync("src/app/api/learning/exam-prep/voice/route.ts", "utf8");
    expect(voice).toMatch(/citationMarker\(/);
    expect(voice).toMatch(/source \? \{ source \}/);
    const marker = "[[kaynak:Biyoloji.pdf|7|sayfa|/dokumanlar/abc?page=7#belge-onizleme]]";
    expect(splitTutorChrome(marker).citations[0]).toMatchObject({ documentName: "Biyoloji.pdf", pageNumber: 7 });
  });
});
