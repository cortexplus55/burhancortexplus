import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cardStructureIssues,
  cardsSystem,
  cardsVerifySystem,
  hardFirst,
  parseTeacherCards,
  teacherCardsLoop,
} from "@/lib/learning/teacher-cards";
import { issuesByItem, teacherItemLoop } from "@/lib/learning/teacher-item-loop";

/*
  Öğretmen kart motoru (2 Ekim 2026). Altın denemede KPSS s.5–9'dan 8/8 kart
  ilk taslakta geçti (2 çağrı, 0,002 $). Eski yol verifyFlashcard ile kart
  metnini "cilalıyordu"; burada kod metne dokunmaz.
*/
describe("öğe döngüsü", () => {
  it("temiz öğeler kalır; sorunlular düzeltmeye gider; sayı tamamlanınca durur", async () => {
    let fixCalls = 0;
    const loop = await teacherItemLoop<string>({
      count: 3,
      started: Date.now(),
      deadlineMs: 60_000,
      maxFixRounds: 2,
      draft: async () => ["a", "bad-b", "c", "bad-d"],
      review: async (items) => items.map((item) => (item.startsWith("bad") ? ["sorun"] : [])),
      fix: async (failing) => {
        fixCalls += 1;
        return failing.map((row) => row.item.replace("bad-", "fixed-"));
      },
    });
    expect(loop.items).toEqual(["a", "c", "fixed-b"]);
    expect(fixCalls).toBe(1);
  });

  it("denetçi cevabı öğe sırasına toplanır; düşük ve sınır dışı atlanır", () => {
    expect(issuesByItem({ issues: [{ item: 1, problem: "belirsiz", fix: "daralt" }, { item: 0, severity: "low", problem: "kolay" }, { item: 9, problem: "x" }] }, 2)).toEqual([[], ["belirsiz → daralt"]]);
  });
});

describe("öğretmen kart motoru", () => {
  it("kartlar oturur, zor olanlar başa gelir; metin değişmez", () => {
    const cards = parseTeacherCards({
      cards: [
        { front: "Kolay kart sorusu nedir?", back: "Kolay cevap.", difficulty: "easy" },
        { front: "Zor kart: yokluk ile butlanı ayıran ne?", back: "Kurucu unsur eksikliği.", difficulty: "hard" },
        { front: "x", back: "kısa ön yüz atılır" },
      ],
    })!;
    expect(cards).toHaveLength(2);
    expect(hardFirst(cards)[0].front).toBe("Zor kart: yokluk ile butlanı ayıran ne?");
  });

  it("cevabı sızdıran ön yüz, aynı yüzler ve kaynak notu yakalanır", () => {
    expect(cardStructureIssues({ front: "Yokluk nedir? (cevap: yokluk)", back: "Yokluk" }).join(" ")).toMatch(/cevabı içeriyor/);
    expect(cardStructureIssues({ front: "Aynı metin burada", back: "aynı metin burada" }).join(" ")).toMatch(/aynı/);
    expect(cardStructureIssues({ front: "Metne göre iptal nedir?", back: "İdari işlemin kaldırılması." }).join(" ")).toMatch(/metne göre/);
    expect(cardStructureIssues({ front: "Nikâh memuru olmadan yapılan evlilik?", back: "Yokluktur; işlem hiç doğmamıştır." })).toEqual([]);
  });

  it("istem ve denetim: hatırlatan ön yüz, kaynak kuralı, aralıklı tekrar, denetçi önce cevaplar", () => {
    expect(cardsSystem("document")).toContain("Ön yüz öğrenciyi hatırlamaya zorlar");
    expect(cardsSystem("document")).toContain("KAYNAK KURALI (kesin)");
    expect(cardsSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(cardsSystem("document", "spaced")).toContain("ARALIKLI TEKRAR");
    expect(cardsVerifySystem("document")).toContain("ön yüzünü önce kendin cevapla");
  });

  it("döngü: denetçinin elediği kart yerine yedek geçer", async () => {
    const draft = { cards: Array.from({ length: 10 }, (_, i) => ({ front: `Kart ${i} ön yüz sorusu?`, back: `Kart ${i} cevabı.`, difficulty: "medium" })) };
    const ask = vi.fn(async (system: string) => (system.includes("denetçisisin") ? { issues: [{ item: 3, problem: "kaynakta yok" }] } : draft));
    const loop = await teacherCardsLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "…" }], count: 8 });
    expect(loop.cards).toHaveLength(8);
    expect(loop.cards.map((card) => card.front)).not.toContain("Kart 3 ön yüz sorusu?");
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("rota kartları öğretmen motoruna yollar", () => {
  it("kartlar ve aralıklı tekrar yalnız öğretmen motorundan; çekirdek sayfa ya da belgesiz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('const TEACHER_CARD_KINDS = new Set<PlanNodeKind>(["flashcards", "spaced"]);');
    expect(route).toContain("return teacherCardsPayload(input, activity, core);");
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });
});

describe("kabuk", () => {
  it("ortak kabuk krediyi ayırır, iş kabul edilmezse iade eder", () => {
    const source = readFileSync("src/lib/learning/teacher-engine-run.ts", "utf8");
    expect(source).toContain("await reserveCredits(service, options.userId, options.actionCode, options.idempotencyKey)");
    expect(source).toContain("await refundCredits(service, reservation.reservationId)");
    expect(source).toContain("await commitCredits(service, reservation.reservationId)");
  });
});
