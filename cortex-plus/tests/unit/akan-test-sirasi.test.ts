import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alignToPublished, mergeStreamedQuestions } from "@/lib/learning/quiz-delivery";
import { activityTally, tallyScore } from "@/lib/learning/answer-tally";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  30 Ekim 2026, canlı (#429 yayındayken): akan "İkinci test" sonunda ekran 0/5, sunucu 1/5 dedi. Kayıtta cevaplar soru
  numarasıyla, ama ekranın listesi (yeni kökler sona eklenir) ile sunucunun son listesi (taslak sırası, çok cevaplı sona,
  elenen soru) farklı sıradaydı: öğrencinin bir soruya verdiği cevap başka bir sorunun cevabı diye notlanıyordu.
*/

const q = (text: string, correct: string, options: string[] = ["A1", "B1", "C1", "D1", "E1"]): QuizQuestion =>
  ({ text, options: options.includes(correct) ? options : [correct, ...options.slice(1)], correct: [correct], explanation: "", type: "single" }) as unknown as QuizQuestion;

const Q0 = q("Mitoz sonunda kaç hücre oluşur?", "2");
const Q1 = q("Mayozda krossing-over hangi evrede olur?", "Profaz I");
const Q2 = q("DNA eşlemesi hangi evrede olur?", "S evresi");
const Q3 = q("Sitokinez neyin bölünmesidir?", "Sitoplazma");
const QM = { ...q("Hangileri mitozda görülür?", "Kardeş kromatit ayrılması"), multi: true } as QuizQuestion;

/** Ekranın aldığı pencereler: denetimden önce geçen 3. soru önce gösterildi. */
const windows = [[Q2], [Q2, Q0], [Q2, Q0, Q1]];
const clientAfterWindows = () => windows.reduce<QuizQuestion[]>((shown, w) => mergeStreamedQuestions(shown, w), []);

describe("akan testte cevap ile soru aynı numarada", () => {
  it("son liste öğrencinin gördüğü sırayla başlar; kalanlar son liste sırasıyla", () => {
    const serverFinal = [Q0, Q1, Q2, Q3, QM]; // taslak sırası, çok cevaplı sonda
    const aligned = alignToPublished(serverFinal, [Q2, Q0, Q1], 5);
    expect(aligned.map((item) => item.text)).toEqual([Q2, Q0, Q1, Q3, QM].map((item) => item.text));
    const client = mergeStreamedQuestions(clientAfterWindows(), aligned);
    expect(client.map((item) => item.text)).toEqual(aligned.map((item) => item.text));
  });

  it("eski davranış: hizalanmamış son liste cevapları başka soruya bağlıyordu", () => {
    const serverFinal = [Q0, Q1, Q2, Q3, QM];
    const client = mergeStreamedQuestions(clientAfterWindows(), serverFinal);
    // Öğrenci ekrandaki her soruyu doğru cevapladı:
    const answers = Object.fromEntries(client.map((item, index) => [String(index), item.correct[0]]));
    expect(tallyScore(activityTally({ type: "quiz", questions: client }, answers)).score).toBe(5);
    // Sunucu aynı numaraları kendi sırasıyla notlardı:
    expect(tallyScore(activityTally({ type: "quiz", questions: serverFinal }, answers)).score).toBeLessThan(5);
    // Hizalanınca ikisi aynı:
    const aligned = alignToPublished(serverFinal, [Q2, Q0, Q1], 5);
    expect(tallyScore(activityTally({ type: "quiz", questions: aligned }, answers)).score).toBe(5);
  });

  it("gösterilen soru sonradan elenmiş olsa da yerinde kalır; sayı tutulur", () => {
    const aligned = alignToPublished([Q0, Q1, Q3, QM], [Q2, Q0], 4);
    expect(aligned.map((item) => item.text)).toEqual([Q2, Q0, Q1, Q3].map((item) => item.text));
    expect(alignToPublished([Q0, Q1], [], 2)).toEqual([Q0, Q1]);
  });

  it("test motoru gönderilenleri kaydeder ve son listeyi hizalar", () => {
    const run = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    expect(run).toContain("published.push(question);");
    expect(run).toContain("if (published.length) questions = alignToPublished(questions, published, input.count);");
  });
});
